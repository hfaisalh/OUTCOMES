/**
 * codebook.ts
 *
 * What it does: reads the Salesforce code book (SF META tab) and uses it to turn
 * Designation and Outcome Activity IDs on order lines into names.
 * Who calls it: the import step (Module 4) and the mapping screen preview.
 * Depends on: csv.ts and the OrderLine type in gifts.ts (pure functions only).
 */

import { parseCsv } from "./csv";
import type { OrderLine } from "./gifts";

// Names looked up by Salesforce ID.
export interface CodeBook {
  designations: Map<string, string>; // Gift Designation ID to name, e.g. GENERAL AID
  outcomeActivities: Map<string, string>; // Outcome Activity ID to name
}

// An order line with the names added next to the IDs.
export interface DecodedLine extends OrderLine {
  designationName: string; // "" when the ID is missing or unknown
  outcomeActivityName: string; // "" when the ID is missing or unknown
}

export interface DecodeIssue {
  giftReference: string;
  lineNumber: number;
  message: string;
}

// Header texts in the SF META tab. Each name column has its ID column directly to its right.
const OUTCOME_ACTIVITY_NAME_HEADER = "Unique Outcome Activity Name";
const DESIGNATION_NAME_HEADER = "Unique Gift Designation";

/**
 * Rule: in the code book, every column headed "Id" sits directly to the right of
 * its name column. So we find the name column by its header and read the cell
 * one place to the right. (The tab has several "Id" columns, so we never look
 * them up by header name.)
 *
 * Rule: if the same ID appears twice with different names, keep the first and
 * report a problem, so a bad code book is noticed.
 */
export function buildCodeBook(csvText: string): { codeBook: CodeBook; problems: string[] } {
  const table = parseCsv(csvText);
  const headerRow = (table[0] ?? []).map((h) => h.trim());
  const problems: string[] = [];

  const codeBook: CodeBook = { designations: new Map(), outcomeActivities: new Map() };

  const read = (header: string, target: Map<string, string>, label: string) => {
    const nameCol = headerRow.indexOf(header);
    if (nameCol === -1) {
      problems.push(`Code book has no "${header}" column`);
      return;
    }
    for (const row of table.slice(1)) {
      const name = (row[nameCol] ?? "").trim();
      const id = (row[nameCol + 1] ?? "").trim();
      if (name === "" || id === "") continue; // Rule: skip rows where either half is empty
      const existing = target.get(id);
      if (existing !== undefined && existing !== name) {
        problems.push(`${label} ID ${id} has two names: "${existing}" and "${name}"`);
        continue;
      }
      target.set(id, name);
    }
  };

  read(DESIGNATION_NAME_HEADER, codeBook.designations, "Designation");
  read(OUTCOME_ACTIVITY_NAME_HEADER, codeBook.outcomeActivities, "Outcome Activity");
  return { codeBook, problems };
}

/**
 * Rule: add the names to each line. An empty ID or an ID not in the code book
 * leaves the name empty and reports an issue. The line is still kept, because
 * staff can fix the code book or the gift later.
 */
export function decodeLines(
  lines: OrderLine[],
  codeBook: CodeBook,
): { lines: DecodedLine[]; issues: DecodeIssue[] } {
  const issues: DecodeIssue[] = [];

  const lookup = (line: OrderLine, id: string, map: Map<string, string>, label: string): string => {
    if (id === "") {
      issues.push({ giftReference: line.giftReference, lineNumber: line.lineNumber, message: `No ${label} ID on this line` });
      return "";
    }
    const name = map.get(id);
    if (name === undefined) {
      issues.push({ giftReference: line.giftReference, lineNumber: line.lineNumber, message: `${label} ID ${id} is not in the code book` });
      return "";
    }
    return name;
  };

  const decoded = lines.map((line) => ({
    ...line,
    designationName: lookup(line, line.designationId, codeBook.designations, "Designation"),
    outcomeActivityName: lookup(line, line.outcomeActivityId, codeBook.outcomeActivities, "Outcome Activity"),
  }));
  return { lines: decoded, issues };
}
