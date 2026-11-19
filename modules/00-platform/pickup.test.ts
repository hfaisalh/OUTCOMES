/**
 * pickup.test.ts
 *
 * What it does: tests pickup.ts on the invented CRM feed sample: first run, running again, a failure,
 * review kept between runs, and report back. The tests double as examples.
 */

import { describe, expect, it } from "vitest";
import { ConnectorError, rowsReader, type CrmReader, type CrmReporter } from "../01c-crm-connector/reader";
import type { ReportBackItem } from "../01c-crm-connector/report-back";
import { sampleRows } from "../01c-crm-connector/sample";
import { mergeReview, runPickup } from "./pickup";
import { defaultConfig, memoryStore, type OrgConfig } from "./store";

const config = (): OrgConfig => ({ ...defaultConfig(), itemMap: { I10: "orphan", I11: "water", I13: "hifz" }, crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
const sent: ReportBackItem[] = [];
const reporter: CrmReporter = { send: async (items) => void sent.push(...items) };

async function setup() {
  const store = memoryStore();
  await store.putConfig("mwf", config());
  return store;
}

describe("runPickup", () => {
  it("creates work orders for flagged lines and records the run", async () => {
    const store = await setup();
    const run = await runPickup("mwf", { store, reader: rowsReader(sampleRows()), reporter, nowIso: "2026-11-19T09:00:00Z" });
    expect([run.ok, run.rows, run.created, run.skipped]).toEqual([true, 8, 4, 3]);
    expect((await store.listWorkOrders("mwf")).map((w) => [w.key, w.status])).toEqual([["T1001:L001", "ready"], ["T1002:L002", "ready"], ["T1003:L004", "ready"], ["T1008:L008", "unrouted"]]);
    expect((await store.getRun("mwf"))?.lastSuccessAt).toBe("2026-11-19T09:00:00Z");
  });

  it("is safe to run again: nothing new is made", async () => {
    const store = await setup();
    const deps = { store, reader: rowsReader(sampleRows()), reporter, nowIso: "2026-11-19T09:00:00Z" };
    await runPickup("mwf", deps);
    const again = await runPickup("mwf", { ...deps, nowIso: "2026-11-19T10:00:00Z" });
    expect([again.created, again.unchanged]).toEqual([0, 4]);
    expect(await store.listWorkOrders("mwf")).toHaveLength(4);
  });

  it("routes an unrouted work order after the item is mapped", async () => {
    const store = await setup();
    const deps = { store, reader: rowsReader(sampleRows()), reporter, nowIso: "2026-11-19T09:00:00Z" };
    await runPickup("mwf", deps);
    await store.putConfig("mwf", { ...config(), itemMap: { ...config().itemMap, I14: "qurbani" } });
    const again = await runPickup("mwf", { ...deps, nowIso: "2026-11-19T10:00:00Z" });
    expect(again.rerouted).toBe(1);
    expect((await store.listWorkOrders("mwf")).find((w) => w.lineId === "L008")?.status).toBe("ready");
  });

  it("records a failure in plain English and does not move the last good time", async () => {
    const store = await setup();
    await runPickup("mwf", { store, reader: rowsReader(sampleRows()), reporter, nowIso: "2026-11-19T09:00:00Z" });
    const broken: CrmReader = { readFeed: () => Promise.reject(new ConnectorError("The CRM refused the connection. Check the access token in the connector settings.")) };
    const run = await runPickup("mwf", { store, reader: broken, reporter, nowIso: "2026-11-19T10:00:00Z" });
    expect([run.ok, run.error, run.lastSuccessAt]).toEqual([false, "The CRM refused the connection. Check the access token in the connector settings.", "2026-11-19T09:00:00Z"]);
    expect(await store.listWorkOrders("mwf")).toHaveLength(4); // earlier work is kept
  });

  it("says so when the organisation has no setup", async () => {
    const run = await runPickup("nobody", { store: memoryStore(), reader: rowsReader([]), reporter, nowIso: "x" });
    expect([run.ok, run.error]).toEqual([false, "This organisation has no setup yet."]);
  });

  it("reports delivered work back once, and not again", async () => {
    const store = await setup();
    const deps = { store, reader: rowsReader(sampleRows()), reporter, nowIso: "2026-11-19T09:00:00Z" };
    await runPickup("mwf", deps);
    const [first] = await store.listWorkOrders("mwf");
    await store.saveWorkOrders("mwf", [{ ...(first as NonNullable<typeof first>), status: "delivered" }]);
    sent.length = 0;
    const a = await runPickup("mwf", { ...deps, nowIso: "2026-11-19T10:00:00Z" });
    expect([a.reportedSent, sent.map((s) => s.status)]).toEqual([1, ["delivered"]]);
    const b = await runPickup("mwf", { ...deps, nowIso: "2026-11-19T11:00:00Z" });
    expect(b.reportedSent).toBe(0);
  });
});

describe("mergeReview", () => {
  const item = (key: string, reason: "changed" | "missing_from_feed" = "changed") => ({ key, reason, message: key });
  it("keeps older review items for lines not in this feed and replaces those that are", () => {
    const merged = mergeReview([item("a"), item("b")], [item("b", "missing_from_feed")], new Set(["b", "c"]));
    expect(merged.map((m) => [m.key, m.reason])).toEqual([["a", "changed"], ["b", "missing_from_feed"]]);
  });
});
