/**
 * implementation.test.ts
 *
 * What it does: tests the implementation rows of the Beneficiaries list (DECISIONS 190) on invented data: a row per enrolment, units filled by active placements, month status from the gift, and no row for
 * an ended placement. These tests double as examples. Who calls it: vitest. Depends on: implementation.ts.
 */

import { describe, expect, it } from "vitest";
import { commitmentOfKey, implementationRows } from "./implementation";
import type { Commitment } from "../04b-commitments/commitments";
import type { Enrolment } from "./enrolments";
import type { Placement } from "../09-placement/placement";

const c = { subscriptionId: "SUB1", planStatus: "active", state: "open", paidMonths: ["2026-10"], nextDue: "2026-11-05", planned: 12, paid: 1, planPaid: 1 } as unknown as Commitment;
const e = (id: string, itemId: string): Enrolment => ({ id, beneficiaryId: "B1", giftProjectId: "p", clusterId: "c", itemId, role: "", status: "active", since: "2026-09-01" });
const pl = (over: Partial<Placement> = {}): Placement => ({ key: "sub:SUB1", kind: "place", enrolmentId: "E1", outcomeRef: "", giftProjectId: "p", itemId: "I1", parts: 2, how: "auto", at: "x", ...over });
const base = { beneficiaryIds: ["B1"], enrolments: [e("E1", "I1")], placements: [pl()], commitments: [c], whole: () => 3, months: ["2026-10", "2026-12"], today: "2026-11-24" };

describe("implementationRows", () => {
  it("fills as many units as the placement has parts, and takes each month's status from the gift", () => {
    const [r] = implementationRows(base);
    expect(r?.filled).toBe(2);
    expect(r?.whole).toBe(3);
    expect(r?.cells[0]?.slots.map((s) => s.status)).toEqual(["p", "p", "f"]); // October was paid, the third unit has no gift
    expect(r?.cells[1]?.slots[0]?.status).toBe("e"); // December is expected
    expect(r?.cells[1]?.slots[2]?.commitmentKey).toBe("");
  });
  it("gives a beneficiary with two benefits two rows, and one who is not enrolled a single row with no months", () => {
    expect(implementationRows({ ...base, enrolments: [e("E1", "I1"), e("E2", "I2")] }).length).toBe(2);
    const none = implementationRows({ ...base, beneficiaryIds: ["B9"] });
    expect(none).toHaveLength(1);
    expect(none[0]?.cells).toEqual([]);
  });
  it("ignores an ended placement, and finds a gift by its key", () => {
    expect(implementationRows({ ...base, placements: [pl({ to: "2026-11-01", endReason: "paused" })] })[0]?.filled).toBe(0);
    expect(commitmentOfKey([c], "sub:SUB1")).toBe(c);
    expect(commitmentOfKey([c], "nope")).toBeUndefined();
  });
});
