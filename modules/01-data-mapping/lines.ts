/**
 * lines.ts
 *
 * What it does: the generic transaction line, how lines are built from a source row or a source's
 * lines column, and how fund and outcome names are filled in from lookup lists.
 * Who calls it: pipeline.ts and the presets.
 * Depends on: nothing (pure functions, no database, no screen).
 *
 * A transaction has one or more lines. Each line says what the money is for: a fund (where it
 * goes) and an outcome (what is delivered). The outcome is the routing key (DECISIONS 5).
 */

// How a source carries lines (DECISIONS 26).
export type LinesLayout =
  | "lines-column" // one row per transaction, lines packed in one structured column (read by the preset)
  | "one-row-per-line" // one row per line, rows with the same reference are one transaction
  | "one-line-per-transaction"; // one row per transaction, with its single line's fields on the row

export interface Line {
  reference: string; // reference of the transaction this line belongs to
  row: number; // file row the line came from, the header is row 1
  lineNumber: number; // 1, 2, 3 within the transaction
  amount: number; // as supplied, for reference only (money is not managed here)
  unitPrice: number;
  quantity: number;
  fundId: string;
  fundName: string; // "" until supplied by the source or filled in from a lookup list
  outcomeId: string;
  outcomeName: string;
  intention: string; // for example Sadaqah, Zakat
  label: string; // for example a plaque or dedication text
  note: string;
}

// What a source or preset gives before the line is numbered and tied to a transaction.
export type PartialLine = Partial<Omit<Line, "reference" | "lineNumber">>;

// A preset's reader for a lines column returns the lines it found and anything staff should know.
export interface LinesParseResult {
  lines: PartialLine[];
  problems: string[];
}

// Names looked up by source ID. Plain objects, so they can be saved inside a setup.
export interface Lookups {
  funds: Record<string, string>;
  outcomes: Record<string, string>;
}
export const emptyLookups = (): Lookups => ({ funds: {}, outcomes: {} });

const has = (obj: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

// Text to a number, 0 when empty or not a number.
export const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Rule: a line built from one source row. The amount falls back to the transaction's total when
 * the row has no line amount (a source with one amount column). Quantity defaults to 1.
 */
export function lineFromValues(values: Record<string, string>, row: number): PartialLine {
  const quantity = (values["lineQuantity"] ?? "") === "" ? 1 : toNumber(values["lineQuantity"]);
  const amount = toNumber((values["lineAmount"] ?? "") !== "" ? values["lineAmount"] : values["totalAmount"]);
  return {
    row,
    amount,
    quantity,
    unitPrice: (values["lineUnitPrice"] ?? "") !== "" ? toNumber(values["lineUnitPrice"]) : quantity > 0 ? amount / quantity : amount,
    fundId: values["lineFundId"] ?? "",
    fundName: values["lineFund"] ?? "",
    outcomeId: values["lineOutcomeId"] ?? "",
    outcomeName: values["lineOutcome"] ?? "",
    intention: values["lineIntention"] ?? "",
    label: values["lineLabel"] ?? "",
    note: values["lineNote"] ?? "",
  };
}

/** Rule: number the lines from 1 in order and fill in every field, so a line is always complete. */
export function finishLines(reference: string, parts: PartialLine[]): Line[] {
  return parts.map((p, index) => ({
    reference,
    row: p.row ?? 0,
    lineNumber: index + 1,
    amount: p.amount ?? 0,
    unitPrice: p.unitPrice ?? 0,
    quantity: p.quantity ?? 0,
    fundId: p.fundId ?? "",
    fundName: p.fundName ?? "",
    outcomeId: p.outcomeId ?? "",
    outcomeName: p.outcomeName ?? "",
    intention: p.intention ?? "",
    label: p.label ?? "",
    note: p.note ?? "",
  }));
}

export interface DecodeIssue {
  reference: string;
  row: number;
  lineNumber: number;
  message: string;
}

// For each of fund and outcome: is it required on every line, and what the organisation calls it.
export interface DecodeRule {
  required: boolean;
  label: string;
}

/**
 * Rule: a name given by the source is kept as it is. Otherwise the name is looked up from the ID.
 * An ID that is not in the lookup list leaves the name empty and reports an issue. A line with
 * neither a name nor an ID reports an issue only where that field is required. The line is
 * always kept, so staff can fix the lookup list or the data later.
 */
export function decodeLines(
  lines: Line[],
  lookups: Lookups,
  rules: { fund: DecodeRule; outcome: DecodeRule },
): { lines: Line[]; issues: DecodeIssue[] } {
  const issues: DecodeIssue[] = [];

  const resolve = (line: Line, name: string, id: string, map: Record<string, string>, rule: DecodeRule): string => {
    const report = (message: string) => issues.push({ reference: line.reference, row: line.row, lineNumber: line.lineNumber, message });
    if (name !== "") return name;
    if (id === "") {
      if (rule.required) report(`No ${rule.label} on this line`);
      return "";
    }
    if (!has(map, id)) {
      report(`${rule.label} ID ${id} is not in the lookup list`);
      return "";
    }
    return map[id] ?? "";
  };

  const decoded = lines.map((line) => ({
    ...line,
    fundName: resolve(line, line.fundName, line.fundId, lookups.funds, rules.fund),
    outcomeName: resolve(line, line.outcomeName, line.outcomeId, lookups.outcomes, rules.outcome),
  }));
  return { lines: decoded, issues };
}
