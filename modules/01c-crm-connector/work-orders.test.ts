/**
 * work-orders.test.ts
 *
 * What it does: tests work-orders.ts: routing, idempotence, unrouted items, and what is held for
 * review. The tests double as examples.
 */

import { describe, expect, it } from "vitest";
import { readFeed, type FeedLine } from "./feed";
import { sampleRows } from "./sample";
import { DEFAULT_CATEGORY, excludeWorkOrder, partsOf, planWorkOrders, restoreWorkOrder, type PlanOptions, type WorkOrder } from "./work-orders";

const feed = readFeed(sampleRows()).lines;
// Set in OUTCOMES (DECISIONS 31). The item I14 (Animal Sacrifice) is deliberately not mapped yet.
const options: PlanOptions = { usesFrameworks: true, categoryByItem: { I10: "orphan", I11: "water", I13: "hifz" } };

describe("planWorkOrders", () => {
  const plan = planWorkOrders(feed, [], options);

  it("creates one work order for each paid line whose item needs feedback", () => {
    expect(plan.created.map((w) => w.key)).toEqual(["L001", "L002", "L004", "L008"]);
  });

  it("routes by the framework set in OUTCOMES, and leaves an unmapped item unrouted", () => {
    const by = Object.fromEntries(plan.created.map((w) => [w.lineId, [w.categoryId, w.status]]));
    expect(by).toEqual({ L001: ["orphan", "ready"], L002: ["water", "ready"], L004: ["hifz", "ready"], L008: ["", "unrouted"] });
  });

  it("links a recurring instalment to its subscription and carries the count", () => {
    const w = plan.created[0] as WorkOrder;
    expect([w.subscriptionId, w.instalmentNumber, w.instalmentCount]).toEqual(["S50", "1", "12"]);
  });

  it("is idempotent: the same feed again creates nothing", () => {
    const again = planWorkOrders(feed, plan.created, options);
    expect(again.created).toEqual([]);
    expect(again.unchanged).toHaveLength(4);
    expect(again.review).toEqual([]);
  });

  it("reroutes an unrouted work order once its item is mapped", () => {
    const later = planWorkOrders(feed, plan.created, { ...options, categoryByItem: { ...options.categoryByItem, I14: "qurbani" } });
    expect(later.rerouted.map((w) => [w.key, w.categoryId, w.status])).toEqual([["L008", "qurbani", "ready"]]);
  });

  it("uses the default journey when the organisation has no frameworks", () => {
    const p = planWorkOrders(feed, [], { usesFrameworks: false, categoryByItem: {} });
    expect(p.created.every((w) => w.categoryId === DEFAULT_CATEGORY && w.status === "ready")).toBe(true);
  });
});

describe("planWorkOrders review list", () => {
  const made = planWorkOrders(feed, [], options).created;

  it("holds a changed amount for review and does not change the work order", () => {
    const changed = feed.map((l) => (l.lineId === "L002" ? { ...l, amount: 99 } : l));
    const p = planWorkOrders(changed, made, options);
    expect(p.review).toEqual([expect.objectContaining({ key: "L002", reason: "changed" })]);
    expect(p.unchanged.find((w) => w.key === "L002")?.amount).toBe(150);
  });

  it("holds a line whose item stopped needing feedback", () => {
    const off = feed.map((l) => (l.lineId === "L001" ? { ...l, needsFeedback: false } : l));
    expect(planWorkOrders(off, made, options).review.map((r) => r.reason)).toEqual(["no_longer_needs_feedback"]);
  });

  it("spots a vanished line only when the feed is complete", () => {
    const fewer = feed.filter((l) => l.lineId !== "L004");
    expect(planWorkOrders(fewer, made, options).review).toEqual([]);
    expect(planWorkOrders(fewer, made, { ...options, feedIsComplete: true }).review.map((r) => r.reason)).toEqual(["missing_from_feed"]);
  });

  it("keeps the credit chain and the donor kind on the work order when the feed has them, and adds nothing when it does not", () => {
    const chain = [{ role: "agent", id: "A1", name: "Sample Rep" }, { role: "group", id: "G1", name: "Sample Branch" }];
    const one = { ...(feed[0] as FeedLine), supporterKind: "group", credits: chain };
    const made1 = planWorkOrders([one], [], options).created[0]!;
    expect(made1.credits).toEqual(chain);
    expect(made1.supporterKind).toBe("group");
    const plain = planWorkOrders([feed[0] as FeedLine], [], options).created[0]!;
    expect("credits" in plain).toBe(false);
    expect("supporterKind" in plain).toBe(false);
  });

  it("judges a vanished line only inside the dates the feed covers", () => {
    const fewer = feed.filter((l) => l.lineId !== "L004");
    const outside = { from: "2020-01-01", to: "2020-12-31" };
    expect(planWorkOrders(fewer, made, { ...options, feedIsComplete: true, coverage: outside }).review).toEqual([]);
  });

  it("does not create a second work order for a line repeated in one feed", () => {
    expect(planWorkOrders([...feed, feed[0] as FeedLine], [], options).created).toHaveLength(4);
  });
});

describe("excluding a work order (DECISIONS 47)", () => {
  const opts: PlanOptions = { categoryByItem: {}, usesFrameworks: false, feedIsComplete: true };
  const lines = feed;
  const made = planWorkOrders(lines, [], opts).created;

  it("needs a reason and refuses started work", () => {
    const w = made[0] as WorkOrder;
    expect("error" in excludeWorkOrder(w, " ", "A", "2026-11-19")).toBe(true);
    expect("error" in excludeWorkOrder({ ...w, status: "delivered" }, "test", "A", "2026-11-19")).toBe(true);
  });

  it("keeps it on file, and a re-import neither recreates nor reviews it", () => {
    const w = made[0] as WorkOrder;
    const r = excludeWorkOrder(w, "Made during bug fixing", "Owner", "2026-11-19T10:00:00Z");
    if (!("order" in r)) throw new Error("expected an order");
    expect(r.order.status).toBe("excluded");
    const again = planWorkOrders(lines, [r.order, ...made.slice(1)], opts);
    expect(again.created).toHaveLength(0);
    expect(again.review).toHaveLength(0);
    const gone = planWorkOrders([], [r.order], opts);
    expect(gone.review).toHaveLength(0);
  });

  it("restores to where it was", () => {
    const w = made[0] as WorkOrder;
    const r = excludeWorkOrder(w, "test", "Owner", "2026-11-19");
    if (!("order" in r)) throw new Error("expected an order");
    const back = restoreWorkOrder(r.order);
    if (!("order" in back)) throw new Error("expected an order");
    expect(back.order.status).toBe(w.status);
    expect(back.order.exclusion).toBeUndefined();
  });
});

describe("parts (DECISIONS 51)", () => {
  const opts: PlanOptions = { categoryByItem: {}, usesFrameworks: false, feedIsComplete: true };
  const bundled = feed.map((l, i) => (i === 0 ? { ...l, bundleQty: 3, quantity: 2 } : l));

  it("is the bundle quantity times the order quantity, and 1 for a plain line", () => {
    const made = planWorkOrders(bundled, [], opts).created;
    expect(partsOf(made[0] as WorkOrder)).toBe(6);
    expect(made[0]?.bundleQty).toBe(3);
    expect(partsOf(made[1] as WorkOrder)).toBe(made[1]?.quantity);
    expect(made[1]?.bundleQty).toBeUndefined();
  });

  it("quietly gives an existing work order the bundle quantity it was missing, without a review entry", () => {
    const before = planWorkOrders(feed, [], opts).created;
    const again = planWorkOrders(bundled, before, opts);
    expect(again.created).toHaveLength(0);
    expect(again.updated).toHaveLength(1);
    expect(again.updated[0]?.bundleQty).toBe(3);
    expect(again.review.filter((r) => r.reason !== "changed")).toHaveLength(0);
  });
});

describe("legacy uploads (DECISIONS 55)", () => {
  const opts: PlanOptions = { categoryByItem: {}, usesFrameworks: false, feedIsComplete: true };
  const legacy = feed.map((l, i) => (i === 0 ? { ...l, legacyUpload: true } : l));

  it("marks the work order, and gives the mark quietly to one made before it was known", () => {
    const made = planWorkOrders(legacy, [], opts).created;
    expect(made[0]?.legacyUpload).toBe(true);
    expect(made[1]?.legacyUpload).toBeUndefined();
    const before = planWorkOrders(feed, [], opts).created;
    const again = planWorkOrders(legacy, before, opts);
    expect(again.updated).toHaveLength(1);
    expect(again.updated[0]?.legacyUpload).toBe(true);
    expect(again.review).toHaveLength(0);
  });

  it("never judges a legacy upload as missing from the feed", () => {
    const made = planWorkOrders(legacy, [], opts).created;
    const plan = planWorkOrders([], made, opts);
    expect(plan.review.map((r) => r.key)).not.toContain(made[0]?.key);
  });
});

describe("plan link completed later (DECISIONS 56)", () => {
  const opts: PlanOptions = { categoryByItem: {}, usesFrameworks: false, feedIsComplete: true };
  it("quietly gives an existing work order its subscription and count, without a review entry", () => {
    const before = planWorkOrders(feed, [], opts).created;
    const linked = feed.map((l, i) => (i === 0 ? { ...l, subscriptionId: "S5", instalmentNumber: "", instalmentCount: "10" } : l));
    const again = planWorkOrders(linked, before, opts);
    expect(again.updated).toHaveLength(1);
    expect([again.updated[0]?.subscriptionId, again.updated[0]?.instalmentCount]).toEqual(["S5", "10"]);
    expect(again.review).toHaveLength(0);
    expect(planWorkOrders(linked, again.updated.concat(before.slice(1)), opts).updated).toHaveLength(0); // settled: nothing more to do
  });
  it("fills in a blank order reference from the feed", () => {
    const before = planWorkOrders(feed, [], opts).created.map((w, i) => (i === 0 ? { ...w, transactionRef: "" } : w));
    const again = planWorkOrders(feed, before, opts);
    expect(again.updated).toHaveLength(1);
    expect(again.updated[0]?.transactionRef).not.toBe("");
  });
  it("leaves an excluded work order alone", () => {
    const before = planWorkOrders(feed, [], opts).created.map((w, i) => (i === 0 ? { ...w, status: "excluded" as const } : w));
    const linked = feed.map((l, i) => (i === 0 ? { ...l, subscriptionId: "S5" } : l));
    expect(planWorkOrders(linked, before, opts).updated).toHaveLength(0);
  });
});
