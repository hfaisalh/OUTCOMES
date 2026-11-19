/**
 * work-orders.test.ts
 *
 * What it does: tests work-orders.ts: routing, idempotence, unrouted items, and what is held for
 * review. The tests double as examples.
 */

import { describe, expect, it } from "vitest";
import { readFeed, type FeedLine } from "./feed";
import { sampleRows } from "./sample";
import { DEFAULT_FRAMEWORK, planWorkOrders, type PlanOptions, type WorkOrder } from "./work-orders";

const feed = readFeed(sampleRows()).lines;
// Set in OUTCOMES (DECISIONS 31). The item I14 (Animal Sacrifice) is deliberately not mapped yet.
const options: PlanOptions = { usesFrameworks: true, frameworkByItem: { I10: "orphan", I11: "water", I13: "hifz" } };

describe("planWorkOrders", () => {
  const plan = planWorkOrders(feed, [], options);

  it("creates one work order for each paid line whose item needs feedback", () => {
    expect(plan.created.map((w) => w.key)).toEqual(["T1001:L001", "T1002:L002", "T1003:L004", "T1008:L008"]);
  });

  it("routes by the framework set in OUTCOMES, and leaves an unmapped item unrouted", () => {
    const by = Object.fromEntries(plan.created.map((w) => [w.lineId, [w.frameworkId, w.status]]));
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
    const later = planWorkOrders(feed, plan.created, { ...options, frameworkByItem: { ...options.frameworkByItem, I14: "qurbani" } });
    expect(later.rerouted.map((w) => [w.key, w.frameworkId, w.status])).toEqual([["T1008:L008", "qurbani", "ready"]]);
  });

  it("uses the default journey when the organisation has no frameworks", () => {
    const p = planWorkOrders(feed, [], { usesFrameworks: false, frameworkByItem: {} });
    expect(p.created.every((w) => w.frameworkId === DEFAULT_FRAMEWORK && w.status === "ready")).toBe(true);
  });
});

describe("planWorkOrders review list", () => {
  const made = planWorkOrders(feed, [], options).created;

  it("holds a changed amount for review and does not change the work order", () => {
    const changed = feed.map((l) => (l.lineId === "L002" ? { ...l, amount: 99 } : l));
    const p = planWorkOrders(changed, made, options);
    expect(p.review).toEqual([expect.objectContaining({ key: "T1002:L002", reason: "changed" })]);
    expect(p.unchanged.find((w) => w.key === "T1002:L002")?.amount).toBe(150);
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

  it("does not create a second work order for a line repeated in one feed", () => {
    expect(planWorkOrders([...feed, feed[0] as FeedLine], [], options).created).toHaveLength(4);
  });
});
