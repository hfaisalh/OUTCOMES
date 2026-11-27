/**
 * feed.ts
 *
 * What it does: reads the CRM feed (one row per line, see docs/CRM-FEED-SPEC.md) into clean
 * "feed lines", and says which rows were left out and why.
 * Who calls it: work-orders.ts, the pick-up job (DECISIONS 20) and the connector readers (reader.ts).
 * Depends on: nothing (pure functions, no database, no screen).
 *
 * The feed is the same shape whether it comes from a database view or an API (DECISIONS 30), so
 * the rules below do not care how the rows arrived. Money is not managed here (CLAUDE.md), amounts
 * are carried for reference only. Contact details are not part of the feed.
 */

import { readCredits, supporterKindOf, type Credit } from "./credits.js";

export type FeedRow = Record<string, string>;

// How this organisation's CRM spells the trigger and the paid status.
export interface FeedConfig {
  triggerColumn: string; // the item-level "needs feedback" column. Set by the organisation (DECISIONS 30)
  yesValues: string[]; // values in that column that mean yes, compared ignoring case
  paidValues: string[]; // values of the status column that mean paid, compared ignoring case
  legacyRefPrefixes?: string[]; // order reference prefixes of lines uploaded from an old system, whose paid date is the upload date (DECISIONS 55)
}

// MWF CRM settings. The CRM item has `item_feedback` (1 = Acknowledgement only, 2 = Feedback report,
// migration 074), so "2" is the only yes. Everything else, including the default 1, means no.
export const MWF_CRM_CONFIG: FeedConfig = {
  triggerColumn: "item_feedback",
  yesValues: ["2"],
  paidValues: ["paid", "2"],
  legacyRefPrefixes: ["ARCHIVE"], // the migration from the previous website names its orders ARCHIVE-SUB-<number>
};

// The first guess, before the CRM added its column (19 Nov 2026). A setup saved with exactly this is
// moved to the real settings, so an older saved setup keeps working.
export const isOldMwfGuess = (c: FeedConfig): boolean =>
  c.triggerColumn === "needs_feedback" && c.yesValues.join(",") === "1,yes,true,y";
export function currentFeedConfig(c: FeedConfig): FeedConfig {
  if (isOldMwfGuess(c)) return { ...MWF_CRM_CONFIG, paidValues: c.paidValues };
  // A setup saved before legacy uploads were known gets MWF's prefixes when it is MWF's own trigger.
  return c.legacyRefPrefixes === undefined && c.triggerColumn === MWF_CRM_CONFIG.triggerColumn ? { ...c, legacyRefPrefixes: MWF_CRM_CONFIG.legacyRefPrefixes ?? [] } : c;
}

// One line of a paid transaction, in OUTCOMES' own terms.
export interface FeedLine {
  row: number; // position in the feed, the first row is 1
  lineId: string; // the CRM's unique id of the line
  transactionRef: string;
  paidDate: string; // YYYY-MM-DD
  supporterId: string;
  supporterName: string; // display name only
  group: string; // centre or branch, "" when none
  supporterKind: string; // "individual", "organisation" or "group", from the optional supporter_kind column (DECISIONS 44)
  credits: Credit[]; // the optional credit chain, nearest first, [] when the feed has none (DECISIONS 44)
  channel: string;
  merchant: string;
  method: string;
  itemId: string;
  itemName: string;
  amount: number; // the price of one unit, for reference only (DECISIONS 81)
  lineTotal: number | null; // optional: what the whole line cost, when the CRM sends it. Null when not given (DECISIONS 82)
  currency: string; // the currency code of the amount (for example GBP), "" when the feed has none
  quantity: number;
  bundleQty: number; // parts of the item in the bundle the line was bought as, 1 when none (DECISIONS 51)
  customAmount: boolean; // the line is of the CRM's Custom Amount item: the donor chose the amount (DECISIONS 129)
  cause: string; // the cause the gift was given to, such as Water for All, "" when the feed has none (DECISIONS 109)
  tribute: string; // the donor's tribute or dedication for the gift, as the CRM holds it. For an outcome with a plaque, what the plaque says. "" when none (DECISIONS 247)
  projectName: string; // the project the donor chose on the line, as the CRM names it. Blank or "Where Needed Most" means a general gift (DECISIONS 66)
  periodCount: number; // months a one-off payment covers (the item's plan length), 0 when not given (DECISIONS 64)
  intention: string;
  subscriptionId: string; // "" for a one-off
  instalmentNumber: string; // "" for a one-off
  planStatus: string; // the plan's own status in the CRM (active, paused, cancelled, completed...), "" when the line has no plan row (DECISIONS 62)
  planNextDue: string; // the plan's next due date, YYYY-MM-DD, "" when unknown
  planPaid: number | null; // instalments the CRM says are paid, null when unknown
  instalmentCount: string; // a number, "Indefinitely" for recurring with no count, "" for a one-off (DECISIONS 18)
  needsFeedback: boolean;
  legacyUpload: boolean; // uploaded from an old system: the paid date is the upload date, not the real payment date (DECISIONS 55)
}

export interface SkippedRow {
  row: number;
  lineId: string;
  reason: "not_paid" | "deleted" | "superseded";
}

export type FeedIssueCode = "trigger_column_missing" | "missing_line_id" | "missing_transaction_ref" | "bad_date" | "bad_amount";

export interface FeedIssue {
  row: number; // 0 when the issue is about the whole feed
  lineId: string;
  code: FeedIssueCode;
  message: string;
}

export interface FeedResult {
  lines: FeedLine[];
  skipped: SkippedRow[];
  issues: FeedIssue[];
}

const INDEFINITELY = "Indefinitely";
const lower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const isYes = (value: string | undefined, yes: string[]) => yes.map(lower).includes(lower(value));

// Rule: dates come from the CRM as "YYYY-MM-DD" or "YYYY-MM-DD hh:mm:ss". Keep the day only.
function dayOf(text: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const real = d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  return real ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

const num = (text: string | undefined): number | null => {
  const t = (text ?? "").replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Rule: the bundle quantity is a whole number of 1 or more. Blank or anything else means the item on its own, which is 1.
const bundleOf = (text: string | undefined): number => {
  const n = num(text);
  return n !== null && Number.isInteger(n) && n >= 1 ? n : 1;
};

// Rule: the months a one-off payment covers is a whole number of 2 or more. Blank or anything else is 0, which means one period.
const periodsOf = (text: string | undefined): number => {
  const n = num(text);
  return n !== null && Number.isInteger(n) && n >= 2 ? n : 0;
};

/**
 * Rules for which rows count:
 * - Only paid lines count (status in `paidValues`). Anything else is skipped as not_paid.
 * - A deleted line is skipped. A line whose transaction was replaced (superseded_by filled) is
 *   skipped, because the replacement carries it.
 * - The trigger is read from the item. If the trigger column is missing from the feed altogether,
 *   no line is treated as needing feedback and one issue says so, so nothing is created by accident.
 * Issues never stop a row being returned (DECISIONS 16), except a row with no line id, which cannot
 * be told apart later, so it is reported and left out.
 */
export function readFeed(rows: FeedRow[], config: FeedConfig = MWF_CRM_CONFIG): FeedResult {
  const lines: FeedLine[] = [];
  const skipped: SkippedRow[] = [];
  const issues: FeedIssue[] = [];

  if (rows.length > 0 && !(config.triggerColumn in (rows[0] as FeedRow))) {
    issues.push({
      row: 0,
      lineId: "",
      code: "trigger_column_missing",
      message: `The feed has no "${config.triggerColumn}" column, so no line is treated as needing feedback. Check the trigger column name in the connector settings.`,
    });
  }

  rows.forEach((r, i) => {
    const row = i + 1;
    const lineId = (r["line_id"] ?? "").trim();
    if (lineId === "") {
      issues.push({ row, lineId, code: "missing_line_id", message: "The row has no line_id, so it was left out." });
      return;
    }
    if (!config.paidValues.map(lower).includes(lower(r["status"]))) return void skipped.push({ row, lineId, reason: "not_paid" });
    if (isYes(r["is_deleted"], ["1", "yes", "true", "y"])) return void skipped.push({ row, lineId, reason: "deleted" });
    if ((r["superseded_by"] ?? "").trim() !== "") return void skipped.push({ row, lineId, reason: "superseded" });

    const transactionRef = (r["transaction_ref"] ?? "").trim();
    if (transactionRef === "") issues.push({ row, lineId, code: "missing_transaction_ref", message: "The line has no transaction_ref." });

    const paidDate = dayOf(r["paid_at"] ?? "");
    if (paidDate === "") issues.push({ row, lineId, code: "bad_date", message: "paid_at is missing or not a real date." });

    const amount = num(r["amount"]);
    if (amount === null) issues.push({ row, lineId, code: "bad_amount", message: "amount is missing or not a number." });

    // Rule: price and instalments are set on the catalogue line the supporter chose, not on the item
    // (DECISIONS 18, 41). The feed carries them per line: `is_recurring` and `instalment_count` (the
    // subscription's limit, or the line's own count when it is limited). Recurring with no count, or a
    // plan that runs until cancelled, is "Indefinitely". A one-off stays blank.
    const recurring = isYes(r["is_recurring"], ["1", "yes", "true", "y"]) || (r["subscription_id"] ?? "").trim() !== "";
    const count = num(r["instalment_count"]);
    const instalmentCount = !recurring ? "" : count !== null && count > 0 ? String(count) : INDEFINITELY;

    lines.push({
      row,
      lineId,
      transactionRef,
      paidDate,
      supporterId: (r["supporter_id"] ?? "").trim(),
      supporterName: (r["supporter_name"] ?? "").trim(),
      group: (r["group_name"] ?? "").trim(),
      supporterKind: supporterKindOf(r["supporter_kind"]),
      credits: readCredits(r),
      channel: (r["channel"] ?? "").trim(),
      merchant: (r["merchant"] ?? "").trim(),
      method: (r["payment_mode"] ?? "").trim(),
      itemId: (r["item_id"] ?? "").trim(),
      itemName: (r["item_name"] ?? "").trim(),
      amount: amount ?? 0,
      lineTotal: num(r["line_total"]),
      currency: (r["currency"] ?? "").trim().toUpperCase(),
      quantity: num(r["quantity"]) ?? 1,
      bundleQty: bundleOf(r["bundle_qty"]),
      periodCount: periodsOf(r["period_count"]),
      projectName: (r["project_name"] ?? "").trim(),
      cause: (r["cause"] ?? "").trim(),
      tribute: (r["tribute"] ?? "").trim().slice(0, 500),
      customAmount: isYes(r["custom_amount"], ["1", "yes", "true", "y"]),
      intention: (r["intention"] ?? "").trim(),
      subscriptionId: (r["subscription_id"] ?? "").trim(),
      instalmentNumber: (r["instalment_number"] ?? "").trim(),
      instalmentCount,
      planStatus: (r["plan_status"] ?? "").trim().toLowerCase(),
      planNextDue: dayOf(r["plan_next_due"] ?? ""),
      planPaid: num(r["plan_paid"]),
      needsFeedback: isYes(r[config.triggerColumn], config.yesValues),
      legacyUpload: (config.legacyRefPrefixes ?? []).some((p) => p !== "" && lower(transactionRef).startsWith(lower(p))),
    });
  });

  return { lines, skipped, issues };
}

/**
 * Rule: a big feed can raise the same problem thousands of times. People see it once, with a count.
 * Groups the issues by kind and gives one plain sentence each, most common first.
 */
export function summariseIssues(issues: FeedIssue[]): string[] {
  const groups = new Map<FeedIssueCode, { count: number; first: FeedIssue }>();
  for (const i of issues) {
    const g = groups.get(i.code);
    if (g) g.count++;
    else groups.set(i.code, { count: 1, first: i });
  }
  const sentence = (code: FeedIssueCode, count: number, first: FeedIssue): string => {
    const n = count === 1 ? "1 line has" : `${count} lines have`;
    switch (code) {
      case "missing_transaction_ref": return `${n} no transaction_ref (order reference). The line id alone identifies ${count === 1 ? "it" : "them"}, so work orders are still made.`;
      case "bad_date": return `${n} a paid_at that is missing or not a real date.`;
      case "bad_amount": return `${n} an amount that is missing or not a number.`;
      case "missing_line_id": return `${n} no line_id and ${count === 1 ? "was" : "were"} left out.`;
      default: return count === 1 ? first.message : `${first.message} (${count} times)`;
    }
  };
  return [...groups.entries()].sort((a, b) => b[1].count - a[1].count).map(([code, g]) => sentence(code, g.count, g.first));
}
