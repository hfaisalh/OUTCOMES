/**
 * mapping.ts
 *
 * What it does: suggests which generic field each source column belongs to, and applies a mapping
 * to one source row to produce a standard transaction.
 * Who calls it: setup.ts (new setups), pipeline.ts (applying), the page (suggestions).
 * Depends on: fields.ts, field-hints.ts and presets/types.ts (pure functions, no database, no screen).
 *
 * Rule: suggest first, staff correct the exceptions (drag and drop on the page).
 */

import type { RawRecord } from "./csv";
import { ALIASES, CONTACT_ALIASES } from "./field-hints";
import { FIELDS, INDEFINITELY } from "./fields";
import type { Preset } from "./presets/types";

// What to do with one source column.
export type ColumnAction =
  | { action: "field"; field: string; confidence?: "likely" } // map onto a field. "likely" = matched by name, not exactly
  | { action: "drop"; reason: string } // ignore this column
  | { action: "unmapped" }; // no suggestion, staff decide

// A mapping is one action per column name. This is what gets saved with a setup.
export type Mapping = Record<string, ColumnAction>;

// A transaction in standard form: every field has a value, "" when nothing fits.
export type StandardTransaction = Record<string, string>;

// Lower case and trim so "channel__c " matches "Channel__c".
const norm = (s: string) => s.trim().toLowerCase();

// Reduce a column name to plain words: lower case, no Salesforce-style suffixes, punctuation as spaces.
// "Pay_Meth__c", "PAY METH" and "pay-meth" all become "pay meth".
const words = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/__c$|__r\.name$|__r$/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Rule: auto-match as much as possible, in passes, and never guess loosely.
 * 1. Exact: the column is one of the preset's known column names (ignoring case), if a preset is used.
 * 2. Likely: the column's name, ignoring case, spaces and punctuation, equals a field's label, key or
 *    a known alias (for example "PAY METH" is Method). These get confidence "likely" so staff can see
 *    they were matched by name.
 * 3. Drop: contact and bank columns are dropped with a reason (the preset's list, plus common names).
 * Anything else is "unmapped" for staff. If two columns fit the same field, only the first is
 * suggested. There is no partial or sounds-like matching, so a wrong match is rare.
 */
export function suggestMapping(headers: string[], preset?: Preset | null): Mapping {
  const exact = new Map<string, string>();
  for (const [field, names] of Object.entries(preset?.columns ?? {})) for (const n of names) exact.set(norm(n), field);
  const drops = new Map(Object.entries(preset?.drops ?? {}).map(([k, v]) => [norm(k), v]));

  const likely = new Map<string, string>();
  for (const f of FIELDS) {
    for (const name of [f.label, f.key, ...(ALIASES[f.key] ?? [])]) {
      if (!likely.has(words(name))) likely.set(words(name), f.key);
    }
  }
  const contact = new Set(CONTACT_ALIASES.map(words));

  const mapping: Mapping = {};
  const used = new Set<string>();

  // Pass 1: the preset's exact column names.
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
    } else if (contact.has(words(header))) mapping[header] = { action: "drop", reason: "Contact detail, never stored" };
    else mapping[header] = { action: "unmapped" };
  }
  return mapping;
}

/**
 * Rule: every field is present on the result, blank when no column feeds it. This keeps the 8
 * classification fields always available (DECISIONS 16).
 * Rule: if two columns feed one field, the first non-empty value wins.
 * Rule: dropped and unmapped columns are not copied, so contact details never get through.
 * Rule (DECISIONS 18): a commitment (a row with a schedule type or commitment amount) that has no
 * number of instalments is set to "Indefinitely". One-off transactions keep it blank.
 */
export function applyMapping(row: RawRecord, mapping: Mapping): StandardTransaction {
  const result: StandardTransaction = {};
  for (const f of FIELDS) result[f.key] = "";

  for (const [column, action] of Object.entries(mapping)) {
    if (action.action !== "field") continue;
    const value = (row[column] ?? "").trim();
    if (value !== "" && result[action.field] === "") result[action.field] = value;
  }

  const isCommitment = result["scheduleType"] !== "" || result["commitmentAmount"] !== "";
  if (isCommitment && result["instalmentCount"] === "") result["instalmentCount"] = INDEFINITELY;
  return result;
}
