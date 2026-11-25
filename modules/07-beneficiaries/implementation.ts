/**
 * implementation.ts
 *
 * What it does: builds the "implementation of gifts" view of the Beneficiaries list (DECISIONS 190). For each enrolment (a beneficiary in a cluster for a benefit) it works out the units that make one whole
 * beneficiary, how many of them live gifts fill, and for every month a slot per unit with the status of the gift that fills it: paid, expected, missed, or nothing expected.
 * Who calls it: app/register-page.ts. Depends on: placement.ts (the Placement type), enrolments.ts, outcomes.ts (monthStatus) and commitments.ts (the Commitment type).
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: one row per active enrolment, so a child with two benefits has two rows. A beneficiary with no active enrolment has one row with no months.
 * - Rule: a unit is filled by an active placement of a gift. An ended placement holds nothing (it stays in the history window).
 * - Rule: a slot takes the status of its gift in each month (monthStatus). A unit with no gift is a gap, shown so it stands out.
 * - Rule: the donors, plan statuses and partners are those of the gifts that fill the units, so a gap or a failed payment can be found by searching.
 */

import type { Commitment } from "../04b-commitments/commitments.js";
import { monthStatus, type UnitStatus } from "../05-outcomes/outcomes.js";
import type { Placement } from "../09-placement/placement.js";
import type { Enrolment } from "./enrolments.js";

export type SlotStatus = UnitStatus | "g"; // g: the unit has no gift (a gap)
export interface Slot { status: SlotStatus; commitmentKey: string } // "" key when no gift fills the unit
export interface MonthCell { month: string; slots: Slot[] }
export interface ImplRow {
  beneficiaryId: string;
  enrolmentId: string; // "" when the beneficiary is not enrolled
  giftProjectId: string;
  clusterId: string;
  itemId: string;
  whole: number; // the units that make one whole beneficiary
  filled: number; // the units live gifts fill
  donors: string[]; // the donors whose gifts fill the units, once each
  plans: string[]; // the plan status of those gifts (active, paused, cancelled, completed), once each, or "one-off"
  partnerIds: string[]; // the partners the gifts are assigned to
  missed: number; // the months shown in which a unit was missed
  cells: MonthCell[];
}

// Rule: a placement key names a gift: "sub:<id>" is a subscription, anything else is a one-off payment line.
export function commitmentOfKey(commitments: Commitment[], key: string): Commitment | undefined {
  const id = key.startsWith("sub:") ? key.slice(4) : `once-${key}`;
  return commitments.find((c) => c.subscriptionId === id);
}

export function implementationRows(a: { beneficiaryIds: string[]; enrolments: Enrolment[]; placements: Placement[]; commitments: Commitment[]; whole: (itemId: string) => number; partnerOf?: (key: string) => string; months: string[]; today: string }): ImplRow[] {
  const rows: ImplRow[] = [];
  for (const id of a.beneficiaryIds) {
    const mine = a.enrolments.filter((e) => e.beneficiaryId === id && e.status === "active");
    if (mine.length === 0) { rows.push({ beneficiaryId: id, enrolmentId: "", giftProjectId: "", clusterId: "", itemId: "", whole: 0, filled: 0, donors: [], plans: [], partnerIds: [], missed: 0, cells: [] }); continue; }
    for (const e of mine) {
      const whole = Math.max(1, a.whole(e.itemId));
      // Rule: each active placement fills as many units as its parts, in the order placed.
      const gifts: (Commitment | undefined)[] = [];
      const donors = new Set<string>(), plans = new Set<string>(), partners = new Set<string>();
      for (const p of a.placements.filter((x) => x.to === undefined && x.enrolmentId === e.id)) {
        const c = commitmentOfKey(a.commitments, p.key);
        if (c) { donors.add(c.supporterName); plans.add(c.once ? "one-off" : c.planStatus || "active"); }
        const pid = a.partnerOf?.(p.key) ?? ""; if (pid !== "") partners.add(pid);
        for (let i = 0; i < p.parts; i++) gifts.push(c);
      }
      const filled = Math.min(gifts.length, whole);
      const cells = a.months.map((month) => ({ month, slots: Array.from({ length: whole }, (_, i): Slot => { const c = gifts[i]; return c ? { status: monthStatus(c, month, a.today), commitmentKey: c.subscriptionId } : { status: "g", commitmentKey: "" }; }) }));
      const missed = cells.filter((m) => m.slots.some((x) => x.status === "m")).length;
      rows.push({ beneficiaryId: id, enrolmentId: e.id, giftProjectId: e.giftProjectId, clusterId: e.clusterId, itemId: e.itemId, whole, filled, donors: [...donors], plans: [...plans], partnerIds: [...partners], missed, cells });
    }
  }
  return rows;
}
