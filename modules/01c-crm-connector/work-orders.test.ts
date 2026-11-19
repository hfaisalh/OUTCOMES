/**
 * work-orders.test.ts
 *
 * What it does: tests work-orders.ts: routing, idempotence, unrouted items, and what is held for
 * review. The tests double as examples.
 */

import { describe, expect, it } from "vitest";
import { readFeed, type FeedLine } from "./feed";
import { sampleRows } from "./sample";
import { DEFAULT_CATEGORY, planWorkOrders, type PlanOptions, type WorkOrder } from "./work-orders";

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
