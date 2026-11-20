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
import { mergeReview, reapplyFrameworks, rekeyLegacy, runPickup } from "./pickup";
import type { WorkOrder } from "../01c-crm-connector/work-orders";
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
    expect((await store.listWorkOrders("mwf")).map((w) => [w.key, w.status])).toEqual([["L001", "ready"], ["L002", "ready"], ["L004", "ready"], ["L008", "unrouted"]]);
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

describe("work orders are keyed by the line id (DECISIONS 46)", () => {
  const old = (ref: string, id: string, over = {}) => ({ key: `${ref}:${id}`, lineId: id, transactionRef: ref, paidDate: "2026-06-10", supporterId: "D1", supporterName: "S", group: "", itemId: "I11", itemName: "Water Pump", amount: 150, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "water", status: "ready" as const, ...over });

  it("moves work orders saved under the old key to the line id, keeping their category and status, and their review entries", () => {
    const r = rekeyLegacy([old("T1", "L1", { status: "delivered" }), old("", "L2"), { ...old("", "L3"), key: "L3" }], [{ key: "T1:L1", reason: "changed", message: "m" }]);
    expect(r.orders.map((w) => [w.key, w.status, w.categoryId]).sort()).toEqual([["L1", "delivered", "water"], ["L2", "ready", "water"], ["L3", "ready", "water"]]);
    expect(r.oldKeys.sort()).toEqual([":L2", "T1:L1"]);
    expect(r.review[0]?.key).toBe("L1");
  });

  it("does nothing when everything is already keyed by line id", () => {
    expect(rekeyLegacy([{ ...old("", "L3"), key: "L3" }], []).oldKeys).toEqual([]);
  });

  it("migrates on the next pick-up without making duplicates, and a reference that appears later changes nothing", async () => {
    const store = await setup();
    const rows = sampleRows();
    await runPickup("mwf", { store, reader: rowsReader(rows), reporter, nowIso: "2026-11-19T09:00:00Z" });
    // Simulate work orders saved by the older version: key = reference:line id.
    const saved = await store.listWorkOrders("mwf");
    await store.deleteWorkOrders("mwf", saved.map((w) => w.key));
    await store.saveWorkOrders("mwf", saved.map((w) => ({ ...w, key: `${w.transactionRef}:${w.lineId}` })));
    // The same lines come again, one with its reference now filled in differently.
    const changedRef = rows.map((r) => (r["line_id"] === "L001" ? { ...r, transaction_ref: "NEW-REF" } : r));
    const run = await runPickup("mwf", { store, reader: rowsReader(changedRef), reporter, nowIso: "2026-11-20T09:00:00Z" });
    expect(run.created).toBe(0);
    expect((await store.listWorkOrders("mwf")).map((w) => w.key).sort()).toEqual(["L001", "L002", "L004", "L008"]);
  });
});

describe("reapplyFrameworks (DECISIONS 64)", () => {
  const cfg = (): OrgConfig => ({ ...config(), frameworks: [
    { id: "old", name: "Old", unit: "x", cycle: "quarterly", reportType: "Q", unitsPerBeneficiary: 1 },
    { id: "shared", name: "Shared", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 },
  ], categories: [{ id: "orphan", name: "Orphan", keywords: [], frameworkId: "shared" }] });
  const order = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({ key, lineId: key, transactionRef: "T", paidDate: "2026-06-10", supporterId: "D1", supporterName: "S", group: "", itemId: "I10", itemName: "Orphan", amount: 1, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "orphan", status: "ready", frameworkId: "old", ...over });

  it("moves work orders to the framework that now applies, and leaves excluded and unchanged ones", () => {
    const moved = reapplyFrameworks([order("1"), order("2", { frameworkId: "shared" }), order("3", { status: "excluded" }), order("4", { itemId: "I99" })], cfg());
    expect(moved.map((w) => [w.key, w.frameworkId])).toEqual([["1", "shared"]]);
  });
});
