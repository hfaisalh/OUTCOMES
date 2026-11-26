/**
 * outcome-records.ts
 *
 * What it does: builds the Outcomes list (DECISIONS 197): one row for each outcome a gift has created (OUT-0001 and so on), for the benefits where the gift comes first (a pump, a camp) or that have no
 * beneficiary (a mosque). For each it says what was funded, for which project, who delivers it, who gave, how far funded it is, and what the gift did in each of the months shown.
 * Who calls it: app/outcome-records-page.ts. Depends on: placement.ts (the Placement type), implementation.ts (the gift lookup and the month cells), outcomes.ts (monthStatus) and commitments.ts (the Commitment type).
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: one row for each outcome placement. A gift for a gift-first or no-beneficiary type creates one outcome (decision 175). One that has ended stays in the list, marked ended, with the reason.
 * - Rule: funded is the units the gift holds out of the units that make one whole outcome (a pump is 1, a house may be more), at most 100. A gift paid in a fixed number of instalments counts only the share paid so far (decision 199).
 * - Rule: the months show what the gift did each month (paid, expected, missed, nothing expected), one slice for each unit of the whole outcome, as on the Beneficiaries list.
 * - Rule: stages after allocation (delivered, confirmed by the partner, reported) are not built yet, so a live outcome says "Allocated".
 * Not built yet: gifts that together fund one outcome (each gift makes its own for now), and recipients (households or lists) for the types that need them.
 */

import type { Commitment } from "../04b-commitments/commitments.js";
import { monthStatus } from "../05-outcomes/outcomes.js";
import { END_LABEL, isActive, type EndReason, type Placement } from "../09-placement/placement.js";
import { commitmentOfKey, slotOf, type GiftInfo, type MonthCell, type Slot } from "../07-beneficiaries/implementation.js";
import { needsLook } from "../04b-commitments/commitments.js";

export interface OutcomeRow {
  ref: string; // OUT-0001
  stockId: string; // the parked outcome it took, "" when it was made new from the gift (DECISIONS 209)
  key: string; // the gift (assignment) it came from
  itemId: string;
  giftProjectId: string;
  partnerId: string;
  gift: GiftInfo | undefined;
  parts: number; // the units the gift holds
  whole: number; // the units that make one whole outcome
  funded: number; // 0 to 100
  live: boolean; // false once the placement has ended
  since: string; // YYYY-MM-DD
  endedOn: string; // "" while live
  why: string; // why it ended, "" while live
  pct: number; // the allocation score: the share of unit-months shown that are paid or expected
  missed: number; // the months shown in which a unit was missed
  cells: MonthCell[];
}

export function outcomeRows(a: { placements: Placement[]; commitments: Commitment[]; partnerOf: (key: string) => string; whole: (itemId: string) => number; months: string[]; today: string }): OutcomeRow[] {
  const rows: OutcomeRow[] = [];
  for (const p of a.placements.filter((x) => x.kind === "outcome")) {
    const whole = Math.max(1, a.whole(p.itemId));
    const c = commitmentOfKey(a.commitments, p.key);
    const live = isActive(p);
    // Rule: an ended outcome holds nothing, so its months show nothing expected.
    const held = live && c ? Math.min(p.parts, whole) : 0;
    const cells = a.months.map((month) => ({ month, slots: Array.from({ length: whole }, (_, i): Slot => (i < held && c ? { status: slotOf(monthStatus(c, month, a.today)), commitmentKey: c.subscriptionId } : { status: "g", commitmentKey: "" })) }));
    // Rule (decision 199): a gift paid in a fixed number of instalments funds the outcome as the instalments arrive, so funded is the share paid out of planned. A single payment, or a plan that runs until cancelled, counts as fully funded.
    const instalmentShare = c && c.once !== true && c.planned !== null && c.planned > 0 ? Math.min(1, c.paid / c.planned) : 1;
    const funded = Math.min(100, Math.round((100 * p.parts * instalmentShare) / whole));
    const fundedUnits = cells.reduce((n, m) => n + m.slots.filter((x) => x.status === "p" || x.status === "e").length, 0);
    rows.push({
      ref: p.outcomeRef, stockId: p.stockId ?? "", key: p.key, itemId: p.itemId, giftProjectId: p.giftProjectId, partnerId: a.partnerOf(p.key),
      gift: c ? { donor: c.supporterName, once: c.once === true, paid: c.paid, planned: c.planned, planStatus: c.planStatus || "active", look: needsLook(c) } : undefined,
      parts: p.parts, whole, funded, live, since: p.at.slice(0, 10), endedOn: p.to ?? "", why: p.to === undefined ? "" : p.endReason ? END_LABEL[p.endReason as EndReason] : "Ended",
      pct: cells.length === 0 ? 0 : Math.round((100 * fundedUnits) / (whole * cells.length)),
      missed: cells.filter((m) => m.slots.some((x) => x.status === "m")).length, cells,
    });
  }
  return rows.sort((x, y) => x.ref.localeCompare(y.ref));
}
