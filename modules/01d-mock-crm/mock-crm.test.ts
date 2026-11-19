/**
 * mock-crm.test.ts
 *
 * What it does: checks the pretend CRM gives a valid feed, grows with time, and changes some gifts
 * later. Doubles as an example of how the feed looks. Invented data only.
 * Who calls it: `npm test`. Depends on: mock-crm.ts and the feed reader of Module 1c.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG, readFeed } from "../01c-crm-connector/feed";
import { planWorkOrders } from "../01c-crm-connector/work-orders";
import { EPOCH_MS, INTERVAL_MS, MAX_LINES, mockFeed, mockLine } from "./mock-crm";

const at = (gifts: number, extraMs = 0) => EPOCH_MS + gifts * INTERVAL_MS + extraMs;

describe("mock CRM feed", () => {
  it("is empty before it starts and gains a gift every interval", () => {
    expect(mockFeed(EPOCH_MS - 1)).toHaveLength(0);
    expect(mockFeed(at(0))).toHaveLength(1);
    expect(mockFeed(at(9))).toHaveLength(10);
    expect(mockFeed(at(9, INTERVAL_MS - 1))).toHaveLength(10); // not yet the next one
    expect(mockFeed(at(10))).toHaveLength(11);
  });

  it("gives the same feed for the same moment", () => {
    expect(mockFeed(at(40))).toEqual(mockFeed(at(40)));
  });

  it("keeps only the newest lines so it never grows without limit", () => {
    const rows = mockFeed(at(MAX_LINES + 500));
    expect(rows).toHaveLength(MAX_LINES);
    expect(rows[0]?.line_id).toBe("ML00501");
  });

  it("has the columns of the feed specification and no contact details", () => {
    const row = mockLine(3, at(3));
    for (const col of ["line_id", "transaction_ref", "status", "is_deleted", "superseded_by", "paid_at", "supporter_id", "supporter_name", "group_name", "channel", "merchant", "payment_mode", "item_id", "item_name", "item_recurring", "item_frequency", "needs_feedback", "subscription_id", "instalment_number", "amount", "quantity", "intention"]) {
      expect(Object.keys(row)).toContain(col);
    }
    expect(Object.keys(row).some((k) => /email|phone|address/.test(k))).toBe(false);
  });

  it("has unique line ids and is read without problems by the real feed reader", () => {
    const rows = mockFeed(at(200));
    expect(new Set(rows.map((r) => r.line_id)).size).toBe(rows.length);
    const feed = readFeed(rows, MWF_CRM_CONFIG);
    expect(feed.issues).toEqual([]);
    // Lines that are not paid, deleted or replaced are skipped by the reader. Nothing else is.
    expect(feed.skipped.every((x) => ["not_paid", "deleted", "superseded"].includes(x.reason))).toBe(true);
    expect(feed.lines.some((l) => l.needsFeedback)).toBe(true);
    expect(feed.lines.some((l) => !l.needsFeedback)).toBe(true); // general gifts are in the feed but need no feedback
  });

  it("shows a pending gift first, then paid a few minutes later", () => {
    // Gift 7 is made pending-eligible (7 % 7 === 0) and is not a failed one (7 % 10 !== 3).
    expect(mockLine(7, at(7, 60_000)).status).toBe("pending");
    expect(mockLine(7, at(7, 7 * 60_000)).status).toBe("paid");
  });

  it("makes later changes to some gifts, so the review list gets exercised", () => {
    expect(mockLine(28, at(28, 20 * 60_000)).is_deleted).toBe("1"); // 28 % 23 === 5
    expect(mockLine(28, at(28, 60_000)).is_deleted).toBe("0");
    const early = Number(mockLine(4, at(4, 60_000)).amount);
    expect(Number(mockLine(4, at(4, 20 * 60_000)).amount)).toBe(early + 10); // 4 % 19 === 4
    expect(mockLine(9, at(9, 20 * 60_000)).superseded_by).not.toBe(""); // 9 % 29 === 9
    expect(mockLine(3, at(3, 60_000)).status).toBe("failed"); // 3 % 10 === 3
  });

  it("turns into work orders, and a feed read twice makes no duplicates", () => {
    const opts = { categoryByItem: {}, usesFrameworks: true, feedIsComplete: true };
    const first = planWorkOrders(readFeed(mockFeed(at(120)), MWF_CRM_CONFIG).lines, [], opts);
    expect(first.created.length).toBeGreaterThan(20);
    expect(first.created.every((w) => w.status === "unrouted")).toBe(true); // nothing is sorted yet
    const again = planWorkOrders(readFeed(mockFeed(at(120)), MWF_CRM_CONFIG).lines, first.created, opts);
    expect(again.created).toHaveLength(0);
  });
});
