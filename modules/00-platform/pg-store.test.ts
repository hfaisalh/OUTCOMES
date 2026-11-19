/**
 * pg-store.test.ts
 *
 * What it does: tests pg-store.ts with a fake database function that records each query. It checks
 * that every query is limited to one organisation and that a launch id is accepted only once.
 */

import { describe, expect, it } from "vitest";
import { pgStore, type Query } from "./pg-store";
import { defaultConfig } from "./store";

function fake() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const used = new Set<string>();
  const query: Query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT INTO used_launch")) return used.has(params[0] as string) ? [] : (used.add(params[0] as string), [{ jti: params[0] }]);
    if (sql.startsWith("SELECT config")) return [{ config: defaultConfig() }];
    return [];
  };
  return { query, calls };
}

describe("pgStore", () => {
  it("limits every organisation query to that organisation", async () => {
    const { query, calls } = fake();
    const s = pgStore(query);
    await s.getConfig("mwf");
    await s.listWorkOrders("mwf");
    await s.getReview("mwf");
    await s.getRun("mwf");
    await s.putConfig("mwf", defaultConfig());
    await s.saveWorkOrders("mwf", [{ key: "T:L" } as never]);
    for (const c of calls) {
      expect(c.sql).toMatch(/\$1/);
      expect(c.params[0]).toBe("mwf");
      if (c.sql.startsWith("SELECT")) expect(c.sql).toContain("WHERE org = $1");
    }
  });

  it("returns what the database holds", async () => {
    expect((await pgStore(fake().query).getConfig("mwf"))?.usesFrameworks).toBe(true);
  });

  it("accepts a launch id once and refuses a repeat", async () => {
    const s = pgStore(fake().query);
    expect(await s.useLaunchId("j1", 200, 100)).toBe(true);
    expect(await s.useLaunchId("j1", 200, 101)).toBe(false);
  });
});
