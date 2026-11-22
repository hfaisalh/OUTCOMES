/**
 * gifts.ts
 *
 * What it does: turns work orders (one per paid line) into gifts for one list (DECISIONS 77). A gift is a subscription with all its payments, or a single
 * payment, or a recurring line the CRM did not link to a subscription, or an excluded payment. The list shows one row for each, with the payments inside it.
 * Who calls it: the Gifts page (app/gifts-page.ts). Depends on: commitments.ts and the work order type. Pure functions: no database, no screen.
 *
 * Rules:
 * - A gift is the work orders with the same subscription id. A payment with no subscription and no instalment count is a one-off gift. A recurring line with no
 *   subscription is shown on its own, flagged, with the commitments it may belong to (a suggestion only, nothing is linked).
 * - Excluded payments are shown one to a row, so they can be restored. They are never part of a gift.
 * - A gift needs a look when its commitment does (a gap, a late start, differing parts, lines that disagree), or when it is a recurring line with no subscription.
 * - A row is shown when any of its payments is in the list given (after the filters), but it always carries all of its live payments.
 */

import type { WorkOrder } from "../01c-crm-connector/work-orders.js";
import { partsOf, sentPartsOf } from "../01c-crm-connector/work-orders.js";
import { suggestCatchUps, suggestPartFixes, type CatchUp, type PartFix } from "./catch-up.js";
import { buildCommitments, needsLook, ONCE_PREFIX, type Commitment, type Suggestion } from "./commitments.js";

export type GiftKind = "recurring" | "one_off" | "unlinked" | "excluded";

export interface GiftRow {
  key: string; // the subscription id, "once-<line>" for a one-off, "line-<line>" for an unlinked recurring line, "x-<line>" for an excluded payment
  kind: GiftKind;
  allocationKey: string; // the key a gift is allocated under, "" when it is not allocated (an unlinked line or an excluded payment)
  supporterId: string;
  supporterName: string;
  itemId: string;
  itemName: string;
  categoryId: string;
  frameworkId: string;
  projectName: string;
  parts: number; // per instalment, or in the one payment
  paid: number; // real payments held (legacy uploads left out)
  planned: number | null; // null when the plan runs until cancelled or the count is unknown
  firstPaid: string;
  lastPaid: string;
  planStatus: string;
  nextDue: string;
  periodCount: number; // months a one-off payment covers, 0 when not given
  payments: WorkOrder[]; // every live payment of the gift, oldest first
  notes: { text: string; title?: string; resolved?: boolean }[]; // what needs a look, in words. A resolved note was fixed (by a catch-up) or checked by a person (DECISIONS 86)
  lookSignature: string; // the open notes joined, which a person's check is kept against. "" when there is nothing to check
  adjustments: string[]; // what a person changed manually on this gift, which the CRM does not know about (DECISIONS 88)
  manual: string; // why the gift is allocated manually, "" when it is not (DECISIONS 113)
  checked: boolean; // a person has checked the notes as they are now
  needsLook: boolean;
  inReview: boolean; // a payment is held for review
  unrouted: boolean; // a payment is waiting for a category
  suggestions: Suggestion[]; // for an unlinked recurring line
  partFixes: PartFix[]; // payments whose quantity looks wrong, not yet checked by a person (DECISIONS 87)
  catchUps: CatchUp[]; // payments that look like they cover more than one instalment, not yet checked by a person (DECISIONS 84)
  commitment?: Commitment;
}

const byDate = (a: WorkOrder, b: WorkOrder) => Number(a.legacyUpload === true) - Number(b.legacyUpload === true) || a.paidDate.localeCompare(b.paidDate) || a.key.localeCompare(b.key);

const notesOf = (c: Commitment, catchUpFixedParts: boolean): GiftRow["notes"] =>
  ([
    c.gaps.length ? { text: `Missing instalment ${c.gaps.join(", ")}` } : null,
    c.legacyOpening ? { text: "Legacy opening", title: "The first record was loaded from the old website. Instalments paid there are not in our data and are not counted." } : null,
    c.startsLate && !c.legacyOpening ? { text: `Starts at ${c.numbers[0]}`, title: "Earlier instalments are not in our data." } : null,
    c.partsVary ? { text: "Parts differ between instalments" } : catchUpFixedParts ? { text: "Parts differ between instalments", title: "Resolved: a payment was marked as covering more than one instalment.", resolved: true } : null,
    c.conflict ? { text: "Lines disagree on supporter or item" } : null,
  ] as (GiftRow["notes"][number] | null)[]).filter((x): x is GiftRow["notes"][number] => x !== null);

/**
 * Rule: the rows for a list. `shown` is the payments the list has after its filters, `all` is every work order (so a gift's totals are right whatever the
 * filter), and `reviewKeys` the payments held for review. Rows needing a look come first, then the most recently paid.
 */
export function giftRows(shown: WorkOrder[], all: WorkOrder[], reviewKeys: Set<string> = new Set()): GiftRow[] {
  const live = all.filter((w) => w.status !== "excluded");
  const view = buildCommitments(live);
  const byId = new Map(view.commitments.map((c) => [c.subscriptionId, c]));
  const unlinked = new Map(view.unlinked.map((u) => [u.key, u]));
  const groupOf = (w: WorkOrder): string => (w.status === "excluded" ? `x-${w.key}` : w.subscriptionId !== "" ? w.subscriptionId : w.instalmentCount === "" ? `${ONCE_PREFIX}${w.key}` : `line-${w.key}`);
  const groups = new Set(shown.map(groupOf));

  const rows: GiftRow[] = [];
  for (const key of groups) {
    const payments = live.filter((w) => groupOf(w) === key).sort(byDate);
    const first = payments[0] ?? shown.find((w) => groupOf(w) === key);
    if (!first) continue;
    const c = byId.get(key);
    const kind: GiftKind = key.startsWith("x-") ? "excluded" : first.subscriptionId !== "" ? "recurring" : first.instalmentCount === "" ? "one_off" : "unlinked";
    const own = kind === "excluded" ? [first] : payments;
    const real = own.filter((w) => w.legacyUpload !== true);
    const lastReal = real[real.length - 1];
    const sug = unlinked.get(first.key);
    const base = {
      key,
      kind,
      supporterId: first.supporterId,
      supporterName: first.supporterName,
      itemId: first.itemId,
      itemName: first.itemName,
      categoryId: first.categoryId,
      frameworkId: first.frameworkId ?? "",
      projectName: first.projectName ?? "",
      payments: own,
      inReview: own.some((w) => reviewKeys.has(w.key)),
      unrouted: own.some((w) => w.status === "unrouted"),
    };
    if (kind === "recurring" && c) {
      const catchUps = suggestCatchUps(own);
      const partFixes = suggestPartFixes(own).filter((f) => !catchUps.some((c) => c.key === f.key)); // a likely catch-up is asked about first
      // Rule (DECISIONS 86): parts that differ only until a catch-up is applied are shown as resolved, not hidden.
      const realOwn = own.filter((w) => w.legacyUpload !== true);
      const rawVary = realOwn.some((w) => sentPartsOf(w) !== sentPartsOf(realOwn[0] as WorkOrder));
      const notes = [...notesOf(c, !c.partsVary && rawVary && realOwn.some((w) => (w.covers ?? 1) > 1 || w.partsFixed !== undefined)), ...(catchUps.length ? [{ text: "Possible catch-up payment", title: catchUps.map((x) => x.reason).join(". ") }] : []), ...(partFixes.length ? [{ text: "Quantity looks wrong", title: partFixes.map((x) => x.reason).join(". ") }] : [])];
      // Rule: a person's check holds while the open notes are exactly what they checked. A new problem makes the text differ and reopens it.
      const open = notes.filter((n) => !n.resolved);
      const lookSignature = open.map((n) => n.text).join("|");
      const checked = lookSignature !== "" && realOwn.some((w) => w.looked === lookSignature);
      const looking = needsLook(c) || catchUps.length > 0 || partFixes.length > 0;
      // Rule (DECISIONS 88): every change a person made manually is listed, so it can be seen that the gift no longer matches the CRM exactly.
      const adjustments = [
        ...realOwn.filter((w) => (w.covers ?? 1) > 1).map((w) => `Payment ${w.transactionRef || w.key} marked as covering ${w.covers} instalments`),
        ...realOwn.filter((w) => w.partsFixed !== undefined && w.partsFixed !== sentPartsOf(w)).map((w) => `Payment ${w.transactionRef || w.key} set to ${w.partsFixed} part${w.partsFixed === 1 ? "" : "s"} (the CRM says ${sentPartsOf(w)})`),
        ...(realOwn.some((w) => w.looked !== undefined) ? ["Notes marked as checked"] : []),
      ];
      rows.push({ ...base, allocationKey: key, parts: c.partsPerInstalment, paid: c.paid, planned: c.planned, firstPaid: c.firstPaid, lastPaid: c.lastPaid, planStatus: c.planStatus, nextDue: c.nextDue, periodCount: 0, notes: checked ? notes.map((n) => ({ ...n, resolved: true })) : notes, lookSignature, adjustments, manual: c.manual, checked, needsLook: looking && !checked, suggestions: [], partFixes: checked ? [] : partFixes, catchUps: checked ? [] : catchUps, commitment: c });
    } else if (kind === "one_off") {
      rows.push({ ...base, allocationKey: key, parts: partsOf(first), paid: 1, planned: 1, firstPaid: first.paidDate.slice(0, 10), lastPaid: first.paidDate.slice(0, 10), planStatus: "", nextDue: "", periodCount: first.periodCount ?? 0, notes: [], lookSignature: "", adjustments: [], manual: first.partsFixed === undefined ? (first.partsManual ?? "") : "", checked: false, needsLook: false, suggestions: [], partFixes: [], catchUps: [] });
    } else {
      rows.push({ ...base, allocationKey: "", parts: partsOf(first), paid: real.length, planned: Number.isInteger(Number(first.instalmentCount)) && Number(first.instalmentCount) > 0 ? Number(first.instalmentCount) : null, firstPaid: real[0]?.paidDate.slice(0, 10) ?? first.paidDate.slice(0, 10), lastPaid: lastReal?.paidDate.slice(0, 10) ?? first.paidDate.slice(0, 10), planStatus: first.planStatus ?? "", nextDue: first.planNextDue ?? "", periodCount: 0, notes: kind === "unlinked" ? [{ text: "Recurring line with no subscription", title: "The CRM did not link this line to a subscription. The suggestion is only a hint. Check it in the CRM. Nothing is linked here." }] : [], lookSignature: "", adjustments: [], manual: "", checked: false, needsLook: kind === "unlinked", suggestions: sug?.suggestions ?? [], partFixes: [], catchUps: [] });
    }
  }
  return rows.sort((a, b) => Number(b.needsLook) - Number(a.needsLook) || b.lastPaid.localeCompare(a.lastPaid) || a.key.localeCompare(b.key));
}
