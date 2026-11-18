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
import { DEFAULT_DROPS, INDEFINITELY, STANDARD_FIELDS } from "./standard-fields";

// What to do with one file column.
export type ColumnAction =
  | { action: "field"; field: string } // map onto a standard field
  | { action: "drop"; reason: string } // ignore this column
  | { action: "unmapped" }; // no suggestion, staff decide

// A mapping is one action per column name. This is what gets saved per data source.
export type Mapping = Record<string, ColumnAction>;

// A gift in standard form: every standard field has a value, "" when nothing fits.
export type StandardGift = Record<string, string>;

// Lower case and trim so "channel__c " matches "Channel__c".
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Rule: match a column to a standard field by its known Salesforce name.
 * Known contact and bank columns are dropped with a reason. Anything else is left
 * "unmapped" for staff. If two columns fit the same field, only the first is suggested.
 */
export function suggestMapping(headers: string[]): Mapping {
  const byColumn = new Map<string, string>();
  for (const f of STANDARD_FIELDS) {
    for (const col of f.salesforceColumns) byColumn.set(norm(col), f.key);
  }
  const drops = new Map(Object.entries(DEFAULT_DROPS).map(([k, v]) => [norm(k), v]));

  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const header of headers) {
    const field = byColumn.get(norm(header));
    const drop = drops.get(norm(header));
    if (field && !used.has(field)) {
      mapping[header] = { action: "field", field };
      used.add(field);
    } else if (drop) {
      mapping[header] = { action: "drop", reason: drop };
    } else {
      mapping[header] = { action: "unmapped" };
    }
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
