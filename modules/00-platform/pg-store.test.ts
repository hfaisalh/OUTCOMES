/**
 * pg-store.test.ts
 *
 * What it does: tests pg-store.ts with a fake database function that records each query. It checks
 * that every query is limited to one organisation and that a launch id is accepted only once.
 */

import { describe, expect, it } from "vitest";
import { pgStore, type Query } from "./pg-store";
import { ConflictError, defaultConfig } from "./store";

function fake() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const used = new Set<string>();
  const query: Query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("INSERT INTO used_launch")) return used.has(params[0] as string) ? [] : (used.add(params[0] as string), [{ jti: params[0] }]);
    if (sql.startsWith("SELECT config")) return [{ config: defaultConfig(), version: 3 }];
    if (sql.includes("RETURNING version")) return [{ version: 4 }];
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

  it("saves work orders in batches and keeps audits per organisation", async () => {
    const { query, calls } = fake();
    const s = pgStore(query);
    await s.saveWorkOrders("mwf", Array.from({ length: 450 }, (_, i) => ({ key: `T:${i}` }) as never));
    expect(calls.filter((c) => c.sql.startsWith("INSERT INTO work_orders"))).toHaveLength(3); // 200 + 200 + 50
    await s.listAudits("mwf");
    await s.addAudit("mwf", { id: "a1", at: "2026-11-19T10:00:00Z" } as never);
    for (const c of calls.filter((x) => x.sql.includes("audits"))) {
      expect(c.params[0]).toBe("mwf");
      expect(c.sql).toContain("org = $1".slice(0, 0) + "$1");
    }
  });

  it("saves a setup only at the version it was read at, and refuses a stale one (DECISIONS 235)", async () => {
    const { query, calls } = fake();
    const s = pgStore(query);
    const read = (await s.getConfig("mwf"))!;
    expect(read.version).toBe(3);
    await s.putConfig("mwf", read);
    const update = calls.find((c) => c.sql.includes("UPDATE org_config"))!;
    expect(update.sql).toContain("version = $3");
    expect(update.params[2]).toBe(3);
    expect(update.params[1]).not.toContain("version"); // kept in its own column, not in the document
    expect(read.version).toBe(4);
    const stale = pgStore(async () => []); // the database matched no row: someone saved first
    await expect(stale.putConfig("mwf", { ...defaultConfig(), version: 3 })).rejects.toBeInstanceOf(ConflictError);
    await expect(stale.putConfig("mwf", defaultConfig())).rejects.toBeInstanceOf(ConflictError); // a first save when a row already exists
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
