/**
 * mapping.ts
 *
 * What it does: suggests which standard field each file column belongs to, and applies
 * a mapping to a gift to produce a standard record.
 * Who calls it: the mapping screen (suggestions), the import step (apply).
 * Depends on: standard-fields.ts and csv.ts types (pure functions, no database, no screen).
 *
 * Rule: suggest first, staff correct the exceptions (drag and drop on the screen).
 */

import type { RawRecord } from "./csv";
import { ALIASES, CONTACT_ALIASES } from "./field-hints";
import { DEFAULT_DROPS, INDEFINITELY, STANDARD_FIELDS } from "./standard-fields";

// What to do with one file column.
export type ColumnAction =
  | { action: "field"; field: string; confidence?: "likely" } // map onto a standard field. "likely" = matched by name, not by Salesforce column
  | { action: "drop"; reason: string } // ignore this column
  | { action: "unmapped" }; // no suggestion, staff decide

// A mapping is one action per column name. This is what gets saved per data source.
export type Mapping = Record<string, ColumnAction>;

// A gift in standard form: every standard field has a value, "" when nothing fits.
export type StandardGift = Record<string, string>;

// Lower case and trim so "channel__c " matches "Channel__c".
const norm = (s: string) => s.trim().toLowerCase();

// Reduce a column name to plain words: lower case, no Salesforce suffixes, punctuation as spaces.
// "Pay_Meth__c", "PAY METH" and "pay-meth" all become "pay meth".
const words = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/__c$|__r\.name$|__r$/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Rule: auto-match as much as possible, in three passes, and never guess loosely.
 * 1. Exact: the column is a known Salesforce name (ignoring case).
 * 2. Likely: the column's name, ignoring case, spaces and punctuation, equals a field's
 *    label, key or one of its known aliases (for example "PAY METH" is Method). These get
 *    confidence "likely" so staff can see they were matched by name, not by Salesforce.
 * 3. Drop: known contact and bank columns are dropped with a reason.
 * Anything else is "unmapped" for staff. If two columns fit the same field, only the first
 * is suggested. There is no partial or sounds-like matching, so a wrong match is rare.
 */
export function suggestMapping(headers: string[]): Mapping {
  const exact = new Map<string, string>();
  const likely = new Map<string, string>();
  for (const f of STANDARD_FIELDS) {
    for (const col of f.salesforceColumns) exact.set(norm(col), f.key);
    for (const name of [f.label, f.key, ...(ALIASES[f.key] ?? [])]) {
      if (!likely.has(words(name))) likely.set(words(name), f.key);
    }
  }
  const drops = new Map(Object.entries(DEFAULT_DROPS).map(([k, v]) => [norm(k), v]));
  const contact = new Set(CONTACT_ALIASES.map(words));

  const mapping: Mapping = {};
  const used = new Set<string>();

  // Pass 1: exact Salesforce names.
  for (const header of headers) {
    const field = exact.get(norm(header));
    if (field && !used.has(field)) {
      mapping[header] = { action: "field", field };
      used.add(field);
    }
  }
  // Passes 2 and 3 for the rest, in file order.
  for (const header of headers) {
    if (header in mapping) continue;
    const drop = drops.get(norm(header));
    const field = likely.get(words(header));
    if (drop) mapping[header] = { action: "drop", reason: drop };
    else if (field && !used.has(field)) {
      mapping[header] = { action: "field", field, confidence: "likely" };
      used.add(field);
    } else if (contact.has(words(header))) mapping[header] = { action: "drop", reason: "Contact detail, stays in Salesforce" };
    else mapping[header] = { action: "unmapped" };
  }
  return mapping;
}

/**
 * Rule: every standard field is present on the result, blank when no column feeds it.
 * This keeps the 8 classification fields always available (DECISIONS 16).
 * Rule: if two columns feed one field, the first non-empty value wins.
 * Rule: dropped and unmapped columns are not copied, so contact details never get through.
 * Rule (DECISIONS 18): a commitment (a gift with a schedule type or recurring amount) that has
 * no number of instalments is set to "Indefinitely". One-off gifts keep it blank.
 */
export function applyMapping(gift: RawRecord, mapping: Mapping): StandardGift {
  const result: StandardGift = {};
  for (const f of STANDARD_FIELDS) result[f.key] = "";

  for (const [column, action] of Object.entries(mapping)) {
    if (action.action !== "field") continue;
    const value = (gift[column] ?? "").trim();
    if (value !== "" && result[action.field] === "") result[action.field] = value;
  }

  const isCommitment = result["scheduleType"] !== "" || result["recurringAmount"] !== "";
  if (isCommitment && result["instalmentCount"] === "") result["instalmentCount"] = INDEFINITELY;
  return result;
}
