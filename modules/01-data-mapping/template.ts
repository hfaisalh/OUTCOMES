/**
 * template.ts
 *
 * What it does: describes the Upload file format MWF expects, as a table (for the screen)
 * and as a downloadable CSV template (header row plus one invented example row).
 * Who calls it: the mapping page ("Expected format" guide and "Download template").
 * Depends on: standard-fields.ts and field-hints.ts (pure functions, no database, no screen).
 *
 * Rule: a file that uses the template's column names matches automatically, every column.
 * Files with other names are matched as far as possible and staff fix the rest.
 */

import { EXAMPLES, REQUIRED_FIELDS } from "./field-hints";
import { STANDARD_FIELDS, type FieldGroup } from "./standard-fields";

export interface ExpectedColumn {
  column: string; // the column name to use in the file
  field: string; // standard field key it feeds
  label: string; // plain English field label
  group: FieldGroup;
  required: boolean;
  example: string; // invented example value
  note: string; // one short line of guidance
}

// Short guidance for fields that need it. Dates are always YYYY-MM-DD.
const NOTES: Record<string, string> = {
  orderReference: "Unique per gift. EVO- means an event donation",
  receivedDate: "YYYY-MM-DD",
  donationDate: "YYYY-MM-DD",
  donorId: "Salesforce donor ID. A centre has its own ID",
  designationLines: "JSON list, one entry per line of the gift",
  startDate: "YYYY-MM-DD. Needed for recurring and instalment gifts",
  endDate: "YYYY-MM-DD. Optional, blank means it runs until stopped",
  instalmentCount: "Optional. Blank on a commitment means Indefinitely",
  frequency: "One-off, recurring or instalment",
  platform: "Optional, blank if unknown",
  merchant: "Optional, blank if unknown",
  type: "Optional, blank if unknown",
  mode: "Optional, blank if unknown",
};

/** The expected columns: required ones first, then the rest in the standard order. */
export function expectedColumns(): ExpectedColumn[] {
  const all = STANDARD_FIELDS.map((f): ExpectedColumn => ({
    column: f.salesforceColumns[0] ?? f.label,
    field: f.key,
    label: f.label,
    group: f.group,
    required: REQUIRED_FIELDS.has(f.key),
    example: EXAMPLES[f.key] ?? "",
    note: NOTES[f.key] ?? "",
  }));
  return [...all.filter((c) => c.required), ...all.filter((c) => !c.required)];
}

// Quote a cell when it has a comma, a quote or a line break.
const cell = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** The template as CSV text: a header row and one invented example row. */
export function templateCsv(): string {
  const cols = expectedColumns();
  return [cols.map((c) => cell(c.column)).join(","), cols.map((c) => cell(c.example)).join(",")].join("\n") + "\n";
}
