/**
 * api.test.ts
 *
 * What it does: checks that fetchMe only treats a real session as signed in.
 * Who calls it: Vitest only.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMe } from "./api";

const answer = (ok: boolean, body: unknown) => vi.stubGlobal("fetch", async () => ({ ok, status: ok ? 200 : 401, json: async () => { if (body === undefined) throw new Error("not json"); return body; } }));

afterEach(() => vi.unstubAllGlobals());

describe("fetchMe", () => {
  it("returns the session when the server sends one", async () => {
    answer(true, { name: "A", org: "O", perms: ["x"], expiresAt: 1, storage: "memory" });
    expect((await fetchMe())?.name).toBe("A");
  });
  it("is demo mode when nobody is signed in (401)", async () => {
    answer(false, { error: "no" });
    expect(await fetchMe()).toBeNull();
  });
  it("is demo mode when the local dev server answers with a plain page (200, not JSON)", async () => {
    answer(true, undefined);
    expect(await fetchMe()).toBeNull();
  });
  it("is demo mode when the answer has no permissions", async () => {
    answer(true, {});
    expect(await fetchMe()).toBeNull();
  });
});
