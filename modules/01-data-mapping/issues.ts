/**
 * issues.ts
 *
 * What it does: runs a gift file through reading, mapping, line splitting and ID decoding,
 * and collects everything staff should look at into one issues list.
 * Who calls it: the import step (Module 4) and the mapping screen preview.
 * Depends on: csv.ts, gifts.ts, codebook.ts, mapping.ts (pure functions, no database, no screen).
 *
 * Rule: issues never block an import. Every gift and line is still returned. Staff fix
 * the exceptions afterwards (DECISIONS 16).
 */

import type { RawRecord } from "./csv";
import { decodeLines, type CodeBook, type DecodedLine } from "./codebook";
import { splitDesignationLines } from "./gifts";
import { applyMapping, type Mapping, type StandardGift } from "./mapping";

export type IssueCode =
  | "missing_reference"
  | "duplicate_reference"
  | "bad_date"
  | "missing_donor"
  | "amount_mismatch"
  | "line_problem"
  | "unknown_id";

export interface Issue {
  row: number; // row in the file, counting the header as row 1, so the first gift is row 2
  giftReference: string; // "" when the gift has none
  lineNumber?: number; // set when the issue is about one line of the gift
  code: IssueCode;
  message: string;
}

export interface ImportResult {
  gifts: StandardGift[]; // one per file row
  lines: DecodedLine[]; // every order line with names
  issues: Issue[];
}

// Rule: dates must be written YYYY-MM-DD and be a real calendar day.
export function isValidIsoDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Rule: check the gift-level things. One issue per problem per gift.
 * - Every gift needs an order reference, and it must be unique in the file.
 * - The received date is required and must be valid. The donation date is checked only if filled.
 * - Every gift needs a Salesforce donor ID (a centre has its own ID).
 * - The line amounts should add up to the gift amount (money is not managed here, so this
 *   only catches a wrongly split gift).
 */
export function checkGift(
  gift: StandardGift,
  row: number,
  lines: DecodedLine[],
  seenReferences: Map<string, number>,
): Issue[] {
  const issues: Issue[] = [];
  const ref = gift["orderReference"] ?? "";
  const add = (code: IssueCode, message: string) => issues.push({ row, giftReference: ref, code, message });

  if (ref === "") {
    add("missing_reference", "No order reference");
  } else {
    const firstRow = seenReferences.get(ref);
    if (firstRow !== undefined) add("duplicate_reference", `Order reference ${ref} already used on row ${firstRow}`);
    else seenReferences.set(ref, row);
  }

  const received = gift["receivedDate"] ?? "";
  if (received === "") add("bad_date", "No received date");
  else if (!isValidIsoDate(received)) add("bad_date", `Received date "${received}" is not a date in YYYY-MM-DD form`);

  const donation = gift["donationDate"] ?? "";
  if (donation !== "" && !isValidIsoDate(donation)) {
    add("bad_date", `Donation date "${donation}" is not a date in YYYY-MM-DD form`);
  }

  if ((gift["donorId"] ?? "") === "") add("missing_donor", "No Salesforce donor ID");

  const amount = Number(gift["giftAmount"] ?? "");
  if (lines.length > 0 && Number.isFinite(amount) && (gift["giftAmount"] ?? "") !== "") {
    const total = lines.reduce((sum, l) => sum + l.amount, 0);
    if (Math.abs(total - amount) > 0.005) {
      add("amount_mismatch", `Lines add up to ${total} but the gift amount is ${amount}`);
    }
  }
  return issues;
}

/**
 * Runs the whole Module 1 pipeline for a list of raw gifts and returns everything:
 * standard gifts, decoded order lines and one issues list.
 */
export function runImport(rawGifts: RawRecord[], mapping: Mapping, codeBook: CodeBook): ImportResult {
  const gifts: StandardGift[] = [];
  const allLines: DecodedLine[] = [];
  const issues: Issue[] = [];
  const seenReferences = new Map<string, number>();

  rawGifts.forEach((raw, index) => {
    const row = index + 2; // header is row 1
    const gift = applyMapping(raw, mapping);
    gifts.push(gift);

    // Section: split and decode the lines, turning their problems into issues with a row.
    // The splitter reads Salesforce column names, so we give it the mapped values under those names.
    const split = splitDesignationLines({
      Legacy_Reference_No__c: gift["orderReference"] ?? "",
      GiftTranxDesignationInfo__c: gift["designationLines"] ?? "",
      "Designation Count": gift["designationCount"] ?? "",
    });
    const decoded = decodeLines(split.lines, codeBook);
    allLines.push(...decoded.lines);

    const ref = gift["orderReference"] ?? "";
    for (const i of split.issues) issues.push({ row, giftReference: ref, code: "line_problem", message: i.message });
    for (const i of decoded.issues) {
      issues.push({ row, giftReference: ref, lineNumber: i.lineNumber, code: "unknown_id", message: i.message });
    }
    issues.push(...checkGift(gift, row, decoded.lines, seenReferences));
  });

  return { gifts, lines: allLines, issues };
}
