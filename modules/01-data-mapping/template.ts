/**
 * template.ts
 *
 * What it does: describes the file format a source is expected to have, as a table (for the page)
 * and as a downloadable CSV template (header row plus one invented example row).
 * Who calls it: the mapping page ("Expected format" guide and "Download template").
 * Depends on: fields.ts, field-hints.ts and presets/types.ts (pure functions, no database, no screen).
 *
 * Rule: a file that uses the template's column names matches automatically, every column. Files
 * with other names are matched as far as possible and staff fix the rest.
 */

import { DEFAULT_REQUIRED, EXAMPLES } from "./field-hints";
import { FIELDS, labelFor, type FieldGroup } from "./fields";
import type { LinesLayout } from "./lines";
import type { Preset } from "./presets/types";

export interface ExpectedColumn {
  column: string; // the column name to use in the file
  field: string; // generic field key it feeds
  label: string; // plain English field label
  group: FieldGroup;
  required: boolean;
  example: string; // invented example value
  note: string; // one short line of guidance
}

export interface TemplateOptions {
  preset?: Preset | null; // use the preset's own column names
  layout?: LinesLayout;
  labels?: Record<string, string>; // the organisation's own wording
  required?: string[]; // fields the source must supply
}

// Short guidance for fields that need it. Dates are always YYYY-MM-DD.
const NOTES: Record<string, string> = {
  reference: "Unique per transaction",
  receivedDate: "YYYY-MM-DD",
  transactionDate: "YYYY-MM-DD",
  supporterId: "The supporter's ID in your system",
  linesData: "The lines of the transaction, in the format your source uses",
  commitmentStart: "YYYY-MM-DD. Needed for recurring and instalment transactions",
  commitmentEnd: "YYYY-MM-DD. Optional, blank means it runs until stopped",
  instalmentCount: "Optional. Blank on a commitment means Indefinitely",
  frequency: "One-off, recurring or instalment",
  lineOutcome: "What is delivered. This decides where the transaction goes",
  platform: "Optional, blank if unknown",
  merchant: "Optional, blank if unknown",
  type: "Optional, blank if unknown",
  mode: "Optional, blank if unknown",
};

/** The expected columns: required ones first, then the rest in the standard order. */
export function expectedColumns(opts: TemplateOptions = {}): ExpectedColumn[] {
  const preset = opts.preset ?? null;
  const layout = opts.layout ?? preset?.layout ?? "one-line-per-transaction";
  const labels = opts.labels ?? preset?.labels ?? {};
  const required = new Set(opts.required ?? preset?.requiredFields ?? DEFAULT_REQUIRED);
  if (layout === "lines-column") required.add("linesData");

  // Rule: only the fields that fit how this source carries lines.
  const fits = (group: FieldGroup) => (layout === "lines-column" ? group !== "line" : group !== "lines");

  const all = FIELDS.filter((f) => fits(f.group)).map((f): ExpectedColumn => ({
    column: preset?.columns[f.key]?.[0] ?? labelFor(f.key, labels),
    field: f.key,
    label: labelFor(f.key, labels),
    group: f.group,
    required: required.has(f.key),
    example: preset?.examples?.[f.key] ?? EXAMPLES[f.key] ?? "",
    note: NOTES[f.key] ?? "",
  }));
  return [...all.filter((c) => c.required), ...all.filter((c) => !c.required)];
}

// Quote a cell when it has a comma, a quote or a line break.
const cell = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** The template as CSV text: a header row and one invented example row. */
export function templateCsv(opts: TemplateOptions = {}): string {
  const cols = expectedColumns(opts);
  return [cols.map((c) => cell(c.column)).join(","), cols.map((c) => cell(c.example)).join(",")].join("\n") + "\n";
}
