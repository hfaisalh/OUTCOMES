/**
 * pipeline.ts
 *
 * What it does: runs a source file through the whole Module 1 pipeline for one setup: maps the
 * columns, builds the lines, fills in names from the lookup lists, applies value maps and custom
 * fields, and collects everything staff should look at into one issues list.
 * Who calls it: the import step (Module 4), the batch feed (DECISIONS 20) and the mapping page.
 * Depends on: csv.ts, fields.ts, lines.ts, mapping.ts, presets, setup.ts (pure functions, no
 * database, no screen).
 *
 * Rule: issues never block an import. Every transaction and line is still returned. Staff fix the
 * exceptions afterwards (DECISIONS 16).
 */

import type { RawRecord } from "./csv";
import { labelFor } from "./fields";
import { decodeLines, finishLines, lineFromValues, type Line, type PartialLine } from "./lines";
import { applyMapping, type StandardTransaction } from "./mapping";
import { getPreset } from "./presets";
import { applySetupToTransaction, type Setup } from "./setup";

export type IssueCode =
  | "missing_reference"
  | "duplicate_reference"
  | "bad_date"
  | "future_date"
  | "missing_supporter"
  | "amount_mismatch"
  | "line_problem"
  | "unknown_id"
  | "missing_required"
  | "missing_start_date"
  | "end_before_start"
  | "inconsistent_rows";

export interface Issue {
  row: number; // row in the source, counting the header as row 1, so the first data row is row 2
  reference: string; // "" when the transaction has none
  lineNumber?: number; // set when the issue is about one line of the transaction
  code: IssueCode;
  message: string;
}

export interface ImportResult {
  transactions: StandardTransaction[]; // one per transaction (rows with the same reference are one in "one-row-per-line")
  lines: Line[]; // every line, with names filled in where known
  issues: Issue[];
}

export interface ImportOptions {
  today?: string; // YYYY-MM-DD, for the future-date check. Defaults to today.
}

// Rule: dates must be written YYYY-MM-DD and be a real calendar day.
export function isValidIsoDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

interface MappedRow {
  row: number;
  values: StandardTransaction;
}

// Fields handled by their own checks, so the general "required" check skips them.
const OWN_CHECKS = new Set(["reference", "receivedDate", "supporterId", "linesData", "lineFund", "lineOutcome"]);
// Transaction fields that must agree across the rows of one transaction in "one-row-per-line".
const MUST_AGREE = ["supporterId", "receivedDate", "group", "currency", "supporterName"];

export function runImport(rows: RawRecord[], setup: Setup, options: ImportOptions = {}): ImportResult {
  const preset = getPreset(setup.presetId);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const required = new Set(setup.requiredFields);
  const label = (key: string) => labelFor(key, setup.labels);

  const issues: Issue[] = [];
  const transactions: StandardTransaction[] = [];
  const allLines: Line[] = [];
  const mapped: MappedRow[] = rows.map((raw, i) => ({ row: i + 2, values: applyMapping(raw, setup.mapping) }));

  // Section: group the rows into transactions.
  // Rule: with one row per line, rows sharing a reference are one transaction. A row with no
  // reference stays on its own and is reported.
  const groups: MappedRow[][] = [];
  if (setup.layout === "one-row-per-line") {
    const byReference = new Map<string, MappedRow[]>();
    for (const m of mapped) {
      const ref = m.values["reference"] ?? "";
      const existing = ref === "" ? undefined : byReference.get(ref);
      if (existing) existing.push(m);
      else {
        const g = [m];
        groups.push(g);
        if (ref !== "") byReference.set(ref, g);
      }
    }
  } else {
    for (const m of mapped) groups.push([m]);
  }

  const seenReferences = new Map<string, number>();

  for (const group of groups) {
    const first = group[0]!;
    const base = first.values;
    const reference = base["reference"] ?? "";
    const add = (code: IssueCode, message: string, row = first.row) => void issues.push({ row, reference, code, message });

    // Section: build the lines.
    let parts: PartialLine[] = [];
    if (setup.layout === "lines-column") {
      if (!preset?.parseLinesColumn) {
        add("line_problem", "This source has no reader for a lines column. Choose another lines layout.");
      } else {
        const result = preset.parseLinesColumn(base["linesData"] ?? "");
        parts = result.lines.map((l) => ({ ...l, row: first.row }));
        for (const p of result.problems) add("line_problem", p);
        const declared = base["lineCount"] ?? "";
        // Rule: if the line count column disagrees with the lines found, report it (the lines are kept).
        if (declared !== "" && result.problems.length === 0 && Number(declared) !== parts.length) {
          add("line_problem", `Line count says ${declared} but ${parts.length} lines were found`);
        }
      }
    } else {
      parts = group.map((m) => lineFromValues(m.values, m.row));
    }

    // Section: fill in fund and outcome names from the lookup lists.
    const decoded = decodeLines(finishLines(reference, parts), setup.lookups, {
      fund: { required: required.has("lineFund"), label: label("lineFund") },
      outcome: { required: required.has("lineOutcome"), label: label("lineOutcome") },
    });
    for (const i of decoded.issues) {
      issues.push({ row: i.row, reference: i.reference, lineNumber: i.lineNumber, code: "unknown_id", message: i.message });
    }
    allLines.push(...decoded.lines);

    // Section: reference. Required always, and unique across the file.
    if (reference === "") add("missing_reference", `No ${label("reference").toLowerCase()}`);
    else {
      const firstRow = seenReferences.get(reference);
      if (firstRow !== undefined) add("duplicate_reference", `${label("reference")} ${reference} already used on row ${firstRow}`);
      else seenReferences.set(reference, first.row);
    }

    // Section: rows of one transaction must agree (one row per line only).
    if (group.length > 1) {
      for (const key of MUST_AGREE) {
        const values = new Set(group.map((m) => m.values[key] ?? "").filter((v) => v !== ""));
        if (values.size > 1) add("inconsistent_rows", `Rows for ${reference} disagree on ${label(key)}`);
      }
    }

    // Section: dates.
    const received = base["receivedDate"] ?? "";
    if (received === "") {
      if (required.has("receivedDate")) add("bad_date", `No ${label("receivedDate").toLowerCase()}`);
    } else if (!isValidIsoDate(received)) add("bad_date", `${label("receivedDate")} "${received}" is not a date in YYYY-MM-DD form`);
    else if (received > today) add("future_date", `${label("receivedDate")} ${received} is in the future`);

    const made = base["transactionDate"] ?? "";
    if (made !== "" && !isValidIsoDate(made)) add("bad_date", `${label("transactionDate")} "${made}" is not a date in YYYY-MM-DD form`);

    // Section: supporter and other required fields.
    if (required.has("supporterId") && (base["supporterId"] ?? "") === "") add("missing_supporter", `No ${label("supporterId")}`);
    for (const key of required) {
      if (OWN_CHECKS.has(key) || key.startsWith("line")) continue;
      if ((base[key] ?? "") === "") add("missing_required", `${label(key)} is required and is blank`);
    }

    // Section: amounts. Only where the total and the lines are separate columns, and only when the
    // upload holds every line of each transaction.
    const total = base["totalAmount"] ?? "";
    if (setup.layout === "lines-column" && !setup.feedbackItemsOnly && total !== "" && decoded.lines.length > 0 && Number.isFinite(Number(total))) {
      const sum = decoded.lines.reduce((s, l) => s + l.amount, 0);
      if (Math.abs(sum - Number(total)) > 0.005) add("amount_mismatch", `Lines add up to ${sum} but the total is ${Number(total)}`);
    }

    // Section: commitment dates.
    // Rule: a transaction with a schedule type or a commitment amount is a commitment (recurring or
    // instalments). It needs a valid start date. An end date is optional, because some commitments
    // run until stopped. If given it must be a real date and not before the start date.
    if ((base["scheduleType"] ?? "") !== "" || (base["commitmentAmount"] ?? "") !== "") {
      const start = base["commitmentStart"] ?? "";
      const end = base["commitmentEnd"] ?? "";
      const startOk = isValidIsoDate(start);
      const endOk = isValidIsoDate(end);
      if (start === "") add("missing_start_date", "Commitment has no start date");
      else if (!startOk) add("bad_date", `Commitment start date "${start}" is not a date in YYYY-MM-DD form`);
      if (end !== "" && !endOk) add("bad_date", `Commitment end date "${end}" is not a date in YYYY-MM-DD form`);
      if (startOk && endOk && end < start) add("end_before_start", `Commitment ends (${end}) before it starts (${start})`);
    }

    // Section: value maps and custom fields, then required custom fields.
    const finished = applySetupToTransaction(base, setup);
    for (const c of setup.customFields) {
      if (c.required && (finished[c.key] ?? "") === "") add("missing_required", `${c.label} is required and is blank`);
    }
    transactions.push(finished);
  }

  return { transactions, lines: allLines, issues };
}
