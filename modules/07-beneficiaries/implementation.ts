/**
 * implementation.ts
 *
 * What it does: builds the "implementation of gifts" view of the Beneficiaries list (DECISIONS 190). For each enrolment (a beneficiary in a cluster for a benefit) it works out the units that make one whole
 * beneficiary, how many of them live gifts fill, and for every month a slot per unit with the status of the gift that fills it: paid, expected, missed, or nothing expected.
 * Who calls it: app/beneficiaries/register-page.ts. Depends on: allocation.ts (the Allocation type), enrolments.ts, outcomes.ts (monthStatus) and commitments.ts (the Commitment type).
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: one row per active enrolment, so a child with two benefits has two rows. A beneficiary with no active enrolment has one row with no months.
 * - Rule: a unit is filled by an active allocation of a gift. An ended allocation holds nothing (it stays in the history window).
 * - Rule: a slot takes the status of its gift in each month (monthStatus). A unit with no gift is a gap, shown so it stands out.
 * - Rule: the allocation score is the share of unit-months in the months shown that are paid or expected by a gift. A gap, a missed month and a month with nothing expected all lower it.
 * - Rule: the donors, plan statuses and partners are those of the gifts that fill the units, so a gap or a failed payment can be found by searching.
 */

import { allocatable, needsLook, oneOffCommitments, type Commitment } from "../04b-commitments/commitments.js";
import type { WorkOrder } from "../01c-crm-connector/work-orders.js";
import { monthStatus, type UnitStatus } from "../05-outcomes/outcomes.js";
import type { Allocation } from "../09-allocation/allocation.js";
import type { Enrolment } from "./enrolments.js";

export type SlotStatus = UnitStatus | "g"; // g: the unit has no gift, or none is expected from it that month (a gap)
// Rule (DECISIONS 213): a month in which a gift expects nothing (before it started, after it ended, paused) is unfilled for that period, the same as a unit with no gift. There is one white state, not two.
export const slotOf = (s: UnitStatus): SlotStatus => (s === "f" ? "g" : s);
export interface Slot { status: SlotStatus; commitmentKey: string } // "" key when no gift fills the unit
export interface MonthCell { month: string; slots: Slot[] }
// Rule: what the list says about each gift that fills a unit: who gave, one-off or recurring, how far the plan is, and whether it needs a look.
export interface GiftInfo { donor: string; once: boolean; paid: number; planned: number | null; planStatus: string; look: boolean }
export interface ImplRow {
  beneficiaryId: string;
  enrolmentId: string; // "" when the beneficiary is not enrolled
  giftProjectId: string;
  clusterId: string;
  itemId: string;
  whole: number; // the units that make one whole beneficiary
  filled: number; // the units live gifts fill
  gifts: GiftInfo[]; // each gift that fills a unit, once
  donors: string[]; // the donors whose gifts fill the units, once each
  plans: string[]; // the plan status of those gifts (active, paused, cancelled, completed), once each, or "one-off"
  partnerIds: string[]; // the partners the gifts are assigned to
  pct: number; // Rule: the allocation score. The share of the unit-months shown that a gift fills and has paid or expects, 0 to 100
  missed: number; // the months shown in which a unit was missed
  cells: MonthCell[];
}

// Rule: an allocation key names a gift: "sub:<id>" is a subscription, anything else is a one-off payment line.
export function commitmentOfKey(commitments: Commitment[], key: string): Commitment | undefined {
  return commitments.find((c) => c.subscriptionId === giftKeyOfAllocationKey(key));
}

// Rule: the key of the gift an allocation belongs to, as the Gifts list names it: the subscription id, or "once-" and the line id for a one-off payment.
// A line id can look exactly like a subscription id (both can be 104), so a one-off must never be passed on without its "once-".
export const giftKeyOfAllocationKey = (key: string): string => (key.startsWith("sub:") ? key.slice(4) : `once-${key}`);

// Rule: every allocated gift has a plan. A single payment the allocation rules do not count per period (a scholarship, a pump) is still shown, as a plan of the months it covers (one when the CRM gives no length).
export function commitmentsFor(workOrders: WorkOrder[], isPerPeriod: (frameworkId: string) => boolean, today: string): Commitment[] {
  const base = allocatable(workOrders, isPerPeriod, today);
  const have = new Set(base.map((c) => c.subscriptionId));
  return [...base, ...oneOffCommitments(workOrders, () => true, today).filter((c) => !have.has(c.subscriptionId))];
}

export function implementationRows(a: { beneficiaryIds: string[]; enrolments: Enrolment[]; allocations: Allocation[]; commitments: Commitment[]; whole: (itemId: string) => number; partnerOf?: (key: string) => string; months: string[]; today: string }): ImplRow[] {
  const rows: ImplRow[] = [];
  for (const id of a.beneficiaryIds) {
    const mine = a.enrolments.filter((e) => e.beneficiaryId === id && e.status === "active");
    if (mine.length === 0) { rows.push({ beneficiaryId: id, enrolmentId: "", giftProjectId: "", clusterId: "", itemId: "", whole: 0, filled: 0, gifts: [], donors: [], plans: [], partnerIds: [], pct: 0, missed: 0, cells: [] }); continue; }
    for (const e of mine) {
      const whole = Math.max(1, a.whole(e.itemId));
      // Rule: each active allocation fills as many units as its parts, in the order allocated.
      const gifts: (Commitment | undefined)[] = [];
      const info = new Map<string, GiftInfo>();
      const donors = new Set<string>(), plans = new Set<string>(), partners = new Set<string>();
      for (const p of a.allocations.filter((x) => x.to === undefined && x.enrolmentId === e.id)) {
        const c = commitmentOfKey(a.commitments, p.key);
        if (c) { info.set(c.subscriptionId, { donor: c.supporterName, once: c.once === true, paid: c.paid, planned: c.planned, planStatus: c.planStatus || "active", look: needsLook(c) }); donors.add(c.supporterName); plans.add(c.once ? "one-off" : c.planStatus || "active"); }
        const pid = a.partnerOf?.(p.key) ?? ""; if (pid !== "") partners.add(pid);
        for (let i = 0; i < p.parts; i++) gifts.push(c);
      }
      const filled = Math.min(gifts.filter((g) => g !== undefined).length, whole); // a gift the CRM view cannot find fills nothing it can show
      const cells = a.months.map((month) => ({ month, slots: Array.from({ length: whole }, (_, i): Slot => { const c = gifts[i]; return c ? { status: slotOf(monthStatus(c, month, a.today)), commitmentKey: c.subscriptionId } : { status: "g", commitmentKey: "" }; }) }));
      const funded = cells.reduce((n, m) => n + m.slots.filter((x) => x.status === "p" || x.status === "e").length, 0);
      const pct = cells.length === 0 ? 0 : Math.round((100 * funded) / (whole * cells.length));
      const missed = cells.filter((m) => m.slots.some((x) => x.status === "m")).length;
      rows.push({ beneficiaryId: id, enrolmentId: e.id, giftProjectId: e.giftProjectId, clusterId: e.clusterId, itemId: e.itemId, whole, filled, gifts: [...info.values()], pct, donors: [...donors], plans: [...plans], partnerIds: [...partners], missed, cells });
    }
  }
  return rows;
}
