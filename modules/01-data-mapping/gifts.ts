/**
 * gifts.ts
 *
 * What it does: reads a Salesforce gift export and splits each gift into order lines.
 * Who calls it: the import step (Module 4) and, later, the mapping screen preview.
 * Depends on: csv.ts only (pure functions, no database, no screen).
 *
 * Terms follow Salesforce: Designation (the fund), Outcome Activity (what the
 * money is for), Gift Commitment (a recurring or custom schedule).
 */

import { parseCsv, toRecords, type RawRecord } from "./csv";

// One line of a gift, taken from the GiftTranxDesignationInfo__c JSON.
// IDs are kept as they are; decoding them to names is a later step.
export interface OrderLine {
  giftReference: string; // Legacy_Reference_No__c of the gift this line belongs to
  lineNumber: number; // 1, 2, 3... within the gift
  amount: number; // in pounds, as exported (money handling stays in Salesforce)
  unitPrice: number;
  quantity: number;
  designationId: string; // Gift_Designation__c
  outcomeActivityId: string; // Outcome_Activity__c (the routing key, see DECISIONS 5)
  intention: string; // for example Sadqah, Zakat
  plateName: string; // GiftPlateName__c
  description: string; // Description__c on the line
}

// Something staff should look at. Issues never stop the import.
export interface LineIssue {
  giftReference: string;
  message: string;
}

export interface SplitResult {
  lines: OrderLine[];
  issues: LineIssue[];
}

// Column names used here. They are Salesforce field names from the export.
const COL_REFERENCE = "Legacy_Reference_No__c";
const COL_DESIGNATIONS = "GiftTranxDesignationInfo__c";
const COL_COUNT = "Designation Count";

/** Reads a gift export (CSV text) into records, one per gift. */
export function readGiftExport(csvText: string): { headers: string[]; gifts: RawRecord[] } {
  const { headers, records } = toRecords(parseCsv(csvText));
  return { headers, gifts: records };
}

// Turns a JSON value into a number, or 0 when it is missing or not a number.
function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Turns a JSON value into text, or "" when it is missing.
function toText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * Rule: one gift can carry several lines. Each entry in allTrnxDesignations
 * becomes one order line, numbered from 1 in file order.
 *
 * Rule: bad data is reported, not thrown. A gift with empty or broken JSON
 * returns no lines and one issue, so the rest of the file still loads.
 *
 * Rule: if the "Designation Count" column disagrees with the number of lines
 * found, report it (the lines are still kept).
 */
export function splitDesignationLines(gift: RawRecord): SplitResult {
  const giftReference = (gift[COL_REFERENCE] ?? "").trim();
  const issues: LineIssue[] = [];
  const raw = (gift[COL_DESIGNATIONS] ?? "").trim();

  if (raw === "") {
    return { lines: [], issues: [{ giftReference, message: "No designation lines in this gift" }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { lines: [], issues: [{ giftReference, message: "Designation lines are not valid JSON" }] };
  }

  const list = (parsed as { allTrnxDesignations?: unknown }).allTrnxDesignations;
  if (!Array.isArray(list)) {
    return { lines: [], issues: [{ giftReference, message: "Designation JSON has no allTrnxDesignations list" }] };
  }

  const lines: OrderLine[] = list.map((entry, index) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      giftReference,
      lineNumber: index + 1,
      amount: toNumber(e["Amount"]),
      unitPrice: toNumber(e["Unit_Price__c"]),
      quantity: toNumber(e["Quantity__c"]),
      designationId: toText(e["Gift_Designation__c"]),
      outcomeActivityId: toText(e["Outcome_Activity__c"]),
      intention: toText(e["Intention__c"]),
      plateName: toText(e["GiftPlateName__c"]),
      description: toText(e["Description__c"]),
    };
  });

  // Rule: compare with the declared count when the column has a value.
  const declared = (gift[COL_COUNT] ?? "").trim();
  if (declared !== "" && Number(declared) !== lines.length) {
    issues.push({
      giftReference,
      message: `Designation Count says ${declared} but ${lines.length} lines were found`,
    });
  }

  return { lines, issues };
}

/** Splits every gift in a list and joins the results. */
export function splitAllGifts(gifts: RawRecord[]): SplitResult {
  const lines: OrderLine[] = [];
  const issues: LineIssue[] = [];
  for (const gift of gifts) {
    const result = splitDesignationLines(gift);
    lines.push(...result.lines);
    issues.push(...result.issues);
  }
  return { lines, issues };
}
