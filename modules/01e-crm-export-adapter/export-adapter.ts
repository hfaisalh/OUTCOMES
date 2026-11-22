/**
 * export-adapter.ts
 *
 * What it does: turns the CRM Export Centre's files (Donation lines, Catalogue items, Recurring
 * plans) into feed rows in the shape of docs/CRM-FEED-SPEC.md, so OUTCOMES can run on a CRM export
 * until the CRM has a feed view or API (DECISIONS 42).
 * Who calls it: scripts/export-to-feed.ts and the tests.
 * Depends on: only the FeedRow type from Module 1c. Pure functions: no files, no database, no screen.
 *
 * The three files are joined like this:
 *   - Donation lines carry the item code, which equals the catalogue's Item SKU.
 *   - Catalogue items carry the feedback trigger ("Feedback type") per item.
 *   - Recurring plans carry the instalment count, joined on the line's Subscription ID = Plan ID.
 * Contact, address, Gift Aid and card columns are never read, even if present. Only the donor id and
 * a display name (billing first and last name) go on.
 */

import type { FeedRow } from "../01c-crm-connector/feed.js";

export type ExportRow = Record<string, string>;

export type AdaptIssueCode = "missing_column" | "item_not_in_catalogue" | "catalogue_conflict" | "bad_date" | "recurring_count_unknown" | "recurring_count_guessed" | "bundle_not_in_catalogue" | "bundle_without_prices" | "missing_order_reference";

export interface AdaptIssue {
  code: AdaptIssueCode;
  message: string;
}

export interface AdaptResult {
  rows: FeedRow[];
  issues: AdaptIssue[]; // problems a person may need to look at
  info?: string[]; // things that were done on purpose, shown once when loading but not listed as problems
  // Plain counts for a summary, no donor data.
  counts: { lines: number; feedbackLines: number; recurringLines: number; recurringWithoutPlan: number; recurringCountUnknown: number };
}

// Columns the Donation lines export must have. Names are the Export Centre's own labels.
export const REQUIRED_LINE_COLUMNS = ["Line ID", "Item Code", "Order Reference", "Order Status", "Payment Date"];
export const REQUIRED_CATALOGUE_COLUMNS = ["Item SKU", "Feedback type"];

const norm = (s: string) => s.trim().toLowerCase();

// Reads a column by its label, ignoring case and spaces around the label. Missing gives "".
function pick(row: ExportRow, label: string): string {
  const want = norm(label);
  for (const key of Object.keys(row)) if (norm(key) === want) return (row[key] ?? "").trim();
  return "";
}

const hasColumn = (rows: ExportRow[], label: string): boolean => rows.length === 0 || Object.keys(rows[0] as ExportRow).some((k) => norm(k) === norm(label));

// Rule: the CRM exports dates as "dd/mm/yyyy hh:mm". The feed wants "YYYY-MM-DD hh:mm:ss".
// An already-ISO date passes through. Anything that is not a real date gives "".
export function toFeedDate(text: string): string {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t);
  const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  let y: number, mo: number, d: number, h: number, mi: number, s: number;
  if (iso) [y, mo, d, h, mi, s] = [Number(iso[1]), Number(iso[2]), Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0)];
  else if (uk) [y, mo, d, h, mi, s] = [Number(uk[3]), Number(uk[2]), Number(uk[1]), Number(uk[4] ?? 0), Number(uk[5] ?? 0), Number(uk[6] ?? 0)];
  else return "";
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(y, 4)}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}:${p(s)}`;
}

// Rule: "Feedback report" (or the CRM's own code 2) means the item needs feedback. Anything else is "1".
const feedbackCode = (text: string): "1" | "2" => (["feedback report", "2"].includes(norm(text)) ? "2" : "1");

const isYes = (text: string) => ["yes", "y", "1", "true"].includes(norm(text));

/**
 * Rules:
 * - The trigger comes from the catalogue, by item code = Item SKU. If an item code appears with
 *   different feedback types, one issue is raised and "Feedback report" wins, so a report is not
 *   missed. An item code not in the catalogue is not flagged for feedback and is reported once.
 * - A line is recurring when it has a subscription id (not blank or 0) or its Period is not "One-time".
 * - The instalment count comes from the plan (Plan ID = the line's Subscription ID): empty when the
 *   plan runs until cancelled, the planned number otherwise (DECISIONS 18, 41).
 * - With no plan row, the line itself says: Period "Monthly" is a plan until cancelled (the CRM stores
 *   frequency 1), so empty is right. Period "Recurring" is a limited plan, whose count is the line's
 *   Frequency when that column is in the export (it is not always offered). Failing that, the count
 *   comes from the catalogue when the item has exactly one limited plan length (for example every
 *   limited variation of the item is 12 instalments). Otherwise the count is unknown, shown as
 *   "Indefinitely" and counted.
 * - The export holds paid lines and has no deleted or replaced markers, so those stay empty. This is
 *   a known limit of the export (replaced orders cannot be detected).
 */
export function adaptExports(lines: ExportRow[], catalogue: ExportRow[], plans: ExportRow[], prices: ExportRow[] = []): AdaptResult {
  const issues: AdaptIssue[] = [];

  for (const label of REQUIRED_LINE_COLUMNS)
    if (!hasColumn(lines, label)) issues.push({ code: "missing_column", message: `The Donation lines file has no "${label}" column.` });
  for (const label of REQUIRED_CATALOGUE_COLUMNS)
    if (!hasColumn(catalogue, label)) issues.push({ code: "missing_column", message: `The Catalogue items file has no "${label}" column.` });
  if (issues.length > 0) return { rows: [], issues, counts: { lines: 0, feedbackLines: 0, recurringLines: 0, recurringWithoutPlan: 0, recurringCountUnknown: 0 } };

  // Section: the trigger per item code.
  const trigger = new Map<string, "1" | "2">();
  const conflicted = new Set<string>();
  for (const r of catalogue) {
    const sku = pick(r, "Item SKU");
    if (sku === "") continue;
    const code = feedbackCode(pick(r, "Feedback type"));
    const seen = trigger.get(sku);
    if (seen !== undefined && seen !== code) conflicted.add(sku);
    trigger.set(sku, seen === "2" || code === "2" ? "2" : "1");
  }
  for (const sku of conflicted) issues.push({ code: "catalogue_conflict", message: `Item ${sku} has different feedback types in the catalogue. Treated as needing feedback.` });

  // Section: the one limited plan length of each item, when it has exactly one (a fallback for lines with no plan row).
  const limited = new Map<string, Set<string>>();
  for (const r of catalogue) {
    const sku = pick(r, "Item SKU");
    const n = pick(r, "Instalments");
    if (sku !== "" && Number(n) > 0 && !isYes(pick(r, "Continues until cancelled"))) limited.set(sku, (limited.get(sku) ?? new Set<string>()).add(String(Number(n))));
  }
  const onlyLength = (sku: string): string => {
    const set = limited.get(sku);
    return set && set.size === 1 ? ([...set][0] as string) : "";
  };

  // Section: the bundle quantities, from the Catalogue prices file (DECISIONS 51). Key: item code and bundle name.
  // A bundle is a fixed number of parts of the item, such as "Sponsor an Orphan" = 3. No bundle means the item on its own, which is 1.
  const bundleQty = new Map<string, string>();
  for (const r of prices) {
    const sku = pick(r, "Item SKU");
    const name = pick(r, "Bundle");
    const q = pick(r, "Quantity");
    if (sku !== "" && name !== "" && Number.isInteger(Number(q)) && Number(q) > 0 && !bundleQty.has(`${sku}|${name}`)) bundleQty.set(`${sku}|${name}`, q);
  }
  // Section: the months a one-off payment covers (DECISIONS 64). A single payment buys the whole plan at once, so it covers as many
  // periods as the item's instalment plan has (480 once = 12 payments of 40 = 12 months). Key: item code and bundle name.
  // An item that continues until cancelled has no such length, so a single payment of it is one period.
  const planLength = new Map<string, string>();
  for (const r of prices) {
    const sku = pick(r, "Item SKU");
    const n = pick(r, "Payments");
    if (sku !== "" && pick(r, "Way of giving") === "Instalments" && Number.isInteger(Number(n)) && Number(n) > 1 && !planLength.has(`${sku}|${pick(r, "Bundle")}`)) planLength.set(`${sku}|${pick(r, "Bundle")}`, n);
  }
  const customItems = customAmountItems(catalogue); // items the donor chooses the amount of (DECISIONS 129)
  const unknownBundles = new Set<string>();
  let bundleLines = 0;

  // Section: the plans by id.
  const planById = new Map<string, { untilCancelled: boolean; planned: string; status: string; nextDue: string; paid: string }>();
  for (const r of plans) {
    const id = pick(r, "Plan ID");
    if (id !== "") planById.set(id, { untilCancelled: isYes(pick(r, "Until cancelled")), planned: pick(r, "Instalments planned"), status: norm(pick(r, "Plan status")), nextDue: toFeedDate(pick(r, "Next due")).slice(0, 10), paid: pick(r, "Instalments paid") });
  }

  // Section: opening orders (DECISIONS 56). A plan's Opening order ID is the donation that started it, which the lines file
  // shows as Donation ID. Some opening lines have no Subscription ID of their own (the legacy ARCHIVE ones, and some test orders),
  // so the plan is found this way. Only when exactly one plan has that opening order, and exactly one recurring line without a
  // subscription id shares that Donation ID, so a donation holding several lines never guesses.
  const openingPlans = new Map<string, string[]>();
  for (const r of plans) {
    const open = pick(r, "Opening order ID");
    const id = pick(r, "Plan ID");
    if (open !== "" && open !== "0" && id !== "") openingPlans.set(open, [...(openingPlans.get(open) ?? []), id]);
  }
  const unlinkedPerDonation = new Map<string, number>();
  const isRecurringRow = (r: ExportRow) => {
    const sub = pick(r, "Subscription ID");
    const per = norm(pick(r, "Period"));
    return (sub !== "" && sub !== "0") || (per !== "" && per !== "one-time");
  };
  for (const r of lines) {
    const sub = pick(r, "Subscription ID");
    const don = pick(r, "Donation ID");
    if ((sub === "" || sub === "0") && don !== "" && isRecurringRow(r)) unlinkedPerDonation.set(don, (unlinkedPerDonation.get(don) ?? 0) + 1);
  }
  let linkedOpening = 0;

  const missingItems = new Set<string>();
  const rows: FeedRow[] = [];
  let feedbackLines = 0;
  let recurringLines = 0;
  let recurringWithoutPlan = 0;
  let recurringCountUnknown = 0;
  let recurringCountGuessed = 0;
  const guessedIds: string[] = []; // example line ids for the notes, so a person can find them (DECISIONS 48)
  const unknownIds: string[] = [];
  let badDates = 0;
  let blankReferences = 0;
  let donationRefs = 0;

  for (const r of lines) {
    const code = pick(r, "Item Code");
    const subRaw = pick(r, "Subscription ID");
    let subscriptionId = subRaw === "0" ? "" : subRaw;
    if (subscriptionId === "" && isRecurringRow(r)) {
      const don = pick(r, "Donation ID");
      const candidates = openingPlans.get(don) ?? [];
      if (candidates.length === 1 && unlinkedPerDonation.get(don) === 1) {
        subscriptionId = candidates[0] as string;
        linkedOpening++;
      }
    }
    const period = norm(pick(r, "Period"));
    const recurring = subscriptionId !== "" || (period !== "" && period !== "one-time");

    const feedback = trigger.get(code) ?? ""; // read first: the count notes below only matter for lines that become work orders
    const plan = subscriptionId !== "" ? planById.get(subscriptionId) : undefined;
    if (recurring && !plan) recurringWithoutPlan++;
    // Rule: with no plan row, read the line itself (see above). A limited plan whose count is unknown is counted.
    const lineFrequency = Number(pick(r, "Frequency"));
    let instalmentCount = "";
    if (recurring && plan && !plan.untilCancelled) instalmentCount = plan.planned;
    else if (recurring && !plan) {
      if (Number.isInteger(lineFrequency) && lineFrequency > 1) instalmentCount = String(lineFrequency);
      else if (period === "recurring") {
        instalmentCount = onlyLength(code);
        if (feedback !== "2") { /* acknowledgement only: no work order, so nothing to check */ }
        else if (instalmentCount === "") { recurringCountUnknown++; unknownIds.push(pick(r, "Line ID")); }
        else { recurringCountGuessed++; guessedIds.push(pick(r, "Line ID")); } // Rule: a count taken from the catalogue is a guess, so it is reported (DECISIONS 47)
      }
    }

    if (code !== "" && !trigger.has(code)) missingItems.add(code);
    if (feedback === "2") feedbackLines++;
    if (recurring) recurringLines++;

    // Rule: a line with no Order Reference shows its Donation ID as the reference, so every line has one (DECISIONS 57).
    let reference = pick(r, "Order Reference");
    if (reference === "" && pick(r, "Donation ID") !== "" && pick(r, "Donation ID") !== "0") {
      reference = `Donation ${pick(r, "Donation ID")}`;
      donationRefs++;
    }
    if (reference === "") blankReferences++;
    const paidAt = toFeedDate(pick(r, "Payment Date"));
    if (paidAt === "") badDates++;

    // Rule: the line's bundle name gives its parts. Not read from the amount, because prices change but parts do not (DECISIONS 51).
    const bundleName = pick(r, "Item Bundle");
    let bundleQuantity = "";
    if (bundleName !== "") {
      bundleLines++;
      bundleQuantity = bundleQty.get(`${code}|${bundleName}`) ?? "";
      if (bundleQuantity === "") unknownBundles.add(`${code} / ${bundleName}`);
    }

    rows.push({
      line_id: pick(r, "Line ID"),
      transaction_ref: reference,
      status: pick(r, "Order Status"),
      is_deleted: "",
      superseded_by: "",
      paid_at: paidAt,
      supporter_id: pick(r, "Donor ID"),
      supporter_name: [pick(r, "First Name (Billing)"), pick(r, "Last Name (Billing)")].filter((x) => x !== "").join(" "),
      group_name: "",
      channel: pick(r, "Source"),
      merchant: pick(r, "Merchant"),
      payment_mode: pick(r, "Payment Gateway"),
      item_id: code,
      item_name: pick(r, "Item Name"),
      item_feedback: feedback,
      is_recurring: recurring ? "1" : "0",
      instalment_count: instalmentCount,
      plan_status: plan?.status ?? "", // the plan's own status, next due date and instalments paid, for the forecast (DECISIONS 62)
      plan_next_due: plan?.nextDue ?? "",
      plan_paid: plan?.paid ?? "",
      subscription_id: subscriptionId,
      instalment_number: subscriptionId !== "" ? pick(r, "Instalment no") : "",
      amount: pick(r, "Item Cost"),
      // Rule: the currency the line was paid in, as the CRM gives it. Never converted. Blank when the export has no Currency column (DECISIONS 81).
      currency: pick(r, "Currency"),
      // Rule: the CRM's own total for the whole line, kept beside the unit price in `amount`. Never worked out here; blank when the export has no Total Amount column (DECISIONS 83).
      line_total: pick(r, "Total Amount"),
      quantity: pick(r, "Order Quantity"),
      bundle_qty: bundleQuantity,
      project_name: pick(r, "Project"), // the project the donor chose (DECISIONS 66)
      cause: pick(r, "Cause"), // the cause the gift was given to, shown when there is no named project (DECISIONS 109)
      custom_amount: customItems.has(pick(r, "Item Code")) ? "1" : "", // the donor chose the amount (DECISIONS 129)
      period_count: !recurring ? (planLength.get(`${code}|${bundleName}`) ?? "") : "", // months a one-off covers
      intention: pick(r, "Intention"),
    });
  }

  for (const code of missingItems) issues.push({ code: "item_not_in_catalogue", message: `Item code ${code} is not in the Catalogue items file, so it is not flagged for feedback.` });
  if (unknownBundles.size > 0) issues.push({ code: prices.length === 0 ? "bundle_without_prices" : "bundle_not_in_catalogue", message: prices.length === 0 ? `${bundleLines} line(s) were bought as a bundle but no Catalogue prices file was given, so their number of parts is taken as 1. Add the Catalogue prices export.` : `${unknownBundles.size} bundle(s) on the lines are not in the Catalogue prices file, so their number of parts is taken as 1: ${[...unknownBundles].slice(0, 5).join("; ")}.` });
  const info: string[] = [];
  if (linkedOpening > 0) info.push(`${linkedOpening} recurring line(s) had no Subscription ID but are the opening order of a plan, so they were linked to that plan.`);
  if (donationRefs > 0) info.push(`${donationRefs} line(s) had no Order Reference, so their Donation ID is shown as the reference.`);
  const eg = (ids: string[]) => ids.slice(0, 30).join(", ") + (ids.length > 30 ? ` and ${ids.length - 30} more` : "");
  if (recurringCountGuessed > 0) issues.push({ code: "recurring_count_guessed", message: `${recurringCountGuessed} recurring feedback line(s) have no plan row, so their instalment count was guessed from the catalogue and may be wrong. A count from a real plan is always used when there is one. Lines: ${eg(guessedIds)}.` });
  if (recurringCountUnknown > 0) issues.push({ code: "recurring_count_unknown", message: `${recurringCountUnknown} limited recurring feedback line(s) have no plan row, no Frequency and no single plan length in the catalogue, so their instalment count is unknown (shown as Indefinitely). Lines: ${eg(unknownIds)}.` });
  if (blankReferences > 0) issues.push({ code: "missing_order_reference", message: `${blankReferences} of ${rows.length} lines have no Order Reference and no Donation ID in the export. Each is still identified by its Line ID, so work orders are made. Tick Donation ID in the Donation lines export to give every line a reference.` });
  if (badDates > 0) issues.push({ code: "bad_date", message: `${badDates} line(s) have a Payment Date that is not a real date.` });

  return { rows, issues, info, counts: { lines: rows.length, feedbackLines, recurringLines, recurringWithoutPlan, recurringCountUnknown } };
}

// ---- Picking the files ----

// Rule (DECISIONS 129): an item is a custom amount item when its catalogue price is not a figure, such as "Donor chooses the amount". The price column is named for the
// currency ("Price GBP"), so any column that starts with "Price" is read. Returns the item codes.
export function customAmountItems(catalogue: ExportRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of catalogue) {
    const sku = pick(r, "Item SKU");
    if (sku === "") continue;
    for (const key of Object.keys(r)) {
      if (!/^price\b/i.test(key)) continue;
      const v = (r[key] ?? "").toString().trim();
      if (v !== "" && !Number.isFinite(Number(v.replace(/,/g, ""))) && /choos|any amount|custom|open/i.test(v)) out.add(sku);
    }
  }
  return out;
}

export type ExportKind = "lines" | "catalogue" | "plans" | "prices" | "feed" | "unknown";

// Rule: a file is recognised by its column names, not its file name, so renamed downloads still work.
export function classifyExport(rows: ExportRow[]): ExportKind {
  const first = rows[0];
  if (!first) return "unknown";
  const has = (label: string) => hasColumn(rows, label);
  if (has("line_id") && has("item_feedback")) return "feed"; // already in the feed shape
  if (has("Line ID") && has("Item Code")) return "lines";
  if (has("Item SKU") && has("Feedback type")) return "catalogue";
  if (has("Item SKU") && has("Bundle") && has("Quantity")) return "prices"; // the Catalogue prices file
  if (has("Plan ID") && has("Until cancelled")) return "plans";
  return "unknown";
}

export interface AdaptFilesResult extends AdaptResult {
  used: ExportKind[]; // which kinds of file were recognised, for the on-screen message
}

/**
 * What the screen calls: any mix of the exported files, in any order. A ready feed file is used as it
 * is. Otherwise Donation lines and Catalogue items are both needed, Recurring plans and Catalogue prices are optional (without prices, bundles count as 1 part and a note says so).
 */
export function adaptFiles(files: ExportRow[][]): AdaptFilesResult {
  const kinds = files.map(classifyExport);
  const pickFile = (k: ExportKind) => files[kinds.indexOf(k)] ?? [];
  const used = [...new Set(kinds.filter((k) => k !== "unknown"))];
  const none = { lines: 0, feedbackLines: 0, recurringLines: 0, recurringWithoutPlan: 0, recurringCountUnknown: 0 };

  if (kinds.includes("feed")) {
    const rows = pickFile("feed");
    return { rows, issues: [], counts: { ...none, lines: rows.length, feedbackLines: rows.filter((r) => r["item_feedback"] === "2").length }, used };
  }
  const issues: AdaptIssue[] = [];
  if (!kinds.includes("lines")) issues.push({ code: "missing_column", message: "No Donation lines file was recognised. It needs the columns Line ID and Item Code." });
  if (!kinds.includes("catalogue")) issues.push({ code: "missing_column", message: "No Catalogue items file was recognised. It needs the columns Item SKU and Feedback type." });
  if (issues.length > 0) return { rows: [], issues, counts: none, used };
  return { ...adaptExports(pickFile("lines"), pickFile("catalogue"), pickFile("plans"), pickFile("prices")), used };
}
