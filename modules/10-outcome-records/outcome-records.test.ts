/**
 * outcome-records.test.ts
 *
 * What it does: tests the Outcomes list rows (DECISIONS 197) on invented gifts: one row for each outcome a gift created, how far funded, the month cells, and an ended outcome. These tests double as examples.
 * Who calls it: vitest. Depends on: outcome-records.ts.
 */

import { describe, expect, it } from "vitest";
import { outcomeRows } from "./outcome-records";
import type { Commitment } from "../04b-commitments/commitments";
import type { Placement } from "../09-placement/placement";

const sub = { subscriptionId: "SUB1", supporterName: "Invented Donor", planStatus: "active", state: "open", paidMonths: ["2026-10"], nextDue: "2026-11-05", planned: null, paid: 1, planPaid: 1, conflict: false, partsVary: false, gaps: [], startsLate: false, legacyOpening: false } as unknown as Commitment;
const out = (over: Partial<Placement> = {}): Placement => ({ key: "sub:SUB1", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "gp", itemId: "I1", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z", ...over });
const base = { placements: [out()], commitments: [sub], partnerOf: () => "trust", whole: () => 1, months: ["2026-10", "2026-12"], today: "2026-11-24" };

describe("outcomeRows", () => {
  it("makes one row for each outcome placement, and none for a child's place", () => {
    const rows = outcomeRows({ ...base, placements: [out(), out({ kind: "place", outcomeRef: "", enrolmentId: "E1" })] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ref: "OUT-0001", partnerId: "trust", live: true, funded: 100, since: "2026-11-02" });
    expect(rows[0]?.gift?.donor).toBe("Invented Donor");
  });
  it("shows the gift's month: paid in October, expected in December, and scores the months funded", () => {
    const r = outcomeRows(base)[0]!;
    expect(r.cells.map((c) => c.slots[0]?.status)).toEqual(["p", "e"]);
    expect(r.pct).toBe(100);
  });
  it("says how far funded it is when the gift holds fewer units than the whole outcome", () => {
    const r = outcomeRows({ ...base, whole: () => 4, placements: [out({ parts: 1 })] })[0]!;
    expect(r.funded).toBe(25);
    expect(r.cells[0]?.slots.map((s) => s.status)).toEqual(["p", "g", "g", "g"]); // the other three units have no gift
  });
  it("keeps an ended outcome with the date and the reason, and it holds nothing", () => {
    const r = outcomeRows({ ...base, placements: [out({ to: "2026-11-20", endReason: "cancelled" })] })[0]!;
    expect(r).toMatchObject({ live: false, endedOn: "2026-11-20", why: "The plan was cancelled" });
    expect(r.cells[0]?.slots[0]?.status).toBe("f");
    expect(r.pct).toBe(0);
  });
  it("sorts by reference", () => {
    const rows = outcomeRows({ ...base, placements: [out({ outcomeRef: "OUT-0002" }), out({ outcomeRef: "OUT-0001", key: "sub:SUB1" })] });
    expect(rows.map((r) => r.ref)).toEqual(["OUT-0001", "OUT-0002"]);
  });
});
