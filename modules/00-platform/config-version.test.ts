/**
 * config-version.test.ts
 *
 * What it does: shows the rule of DECISIONS 235 on the memory store and the retry: two people saving the setup at the same moment never overwrite each other silently.
 */

import { describe, expect, it } from "vitest";
import { json, withConflictRetry } from "./http";
import { ConflictError, defaultConfig, memoryStore } from "./store";

describe("saved setup versions", () => {
  it("refuses a save made from an out-of-date read", async () => {
    const s = memoryStore();
    await s.putConfig("o", defaultConfig());
    const a = (await s.getConfig("o"))!;
    const b = (await s.getConfig("o"))!;
    await s.putConfig("o", { ...a, requireRef: true });
    await expect(s.putConfig("o", { ...b, graceDays: 5 })).rejects.toBeInstanceOf(ConflictError);
    const now = (await s.getConfig("o"))!;
    expect(now.requireRef).toBe(true); // the first change survived
    expect(now.graceDays).toBeUndefined();
  });

  it("runs the request again on the fresh setup, so the person never sees the clash", async () => {
    const s = memoryStore();
    await s.putConfig("o", defaultConfig());
    let tries = 0;
    const handler = async () => {
      tries++;
      const c = (await s.getConfig("o"))!;
      if (tries === 1) await s.putConfig("o", { ...(await s.getConfig("o"))!, requireRef: true }); // someone else saves in between
      await s.putConfig("o", { ...c, graceDays: 5 });
      return json(200, {});
    };
    const r = await withConflictRetry(handler, {} as never, {} as never);
    expect(r.status).toBe(200);
    expect(tries).toBe(2);
    const now = (await s.getConfig("o"))!;
    expect([now.requireRef, now.graceDays]).toEqual([true, 5]); // both changes kept
  });

  it("gives up with a plain 409 after three clashes", async () => {
    const r = await withConflictRetry(async () => { throw new ConflictError(); }, {} as never, {} as never);
    expect(r.status).toBe(409);
  });
});
