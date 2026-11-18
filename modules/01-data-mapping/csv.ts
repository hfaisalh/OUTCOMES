/**
 * csv.ts
 *
 * What it does: turns CSV text into rows, and rows into records keyed by column name.
 * Who calls it: gifts.ts and, later, the mapping screen when a file is loaded.
 * Depends on: nothing (pure functions, no files, no database, no screen).
 */

// A table is a list of rows, each row a list of cell texts.
export type Table = string[][];

// A record is one row with its cells named by the header row.
export type RawRecord = Record<string, string>;

/**
 * Rule: follow standard CSV quoting. A cell in double quotes may contain commas,
 * line breaks and doubled quotes ("" means one quote). Salesforce exports need this
 * because the designation JSON contains commas and quotes.
 */
export function parseCsv(text: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  // Section: ignore a byte order mark that Excel and Google Sheets can add at the start.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"'; // doubled quote inside quotes is one quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++; // treat Windows line ends as one
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  // Section: keep the last row if the file does not end with a line break.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Rule: skip fully empty rows (a blank line at the end of a file).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Rule: the first row is the header. Each later row becomes a record keyed by header text.
 * Repeated header names (the code book has several columns called "Id") keep the
 * first one under its own name and later ones as "Id (2)", "Id (3)" so none is lost.
 */
export function toRecords(table: Table): { headers: string[]; records: RawRecord[] } {
  const [headerRow, ...body] = table;
  if (!headerRow) return { headers: [], records: [] };

  const seen = new Map<string, number>();
  const headers = headerRow.map((h) => {
    const name = h.trim();
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name} (${count})`;
  });

  const records = body.map((cells) => {
    const rec: RawRecord = {};
    headers.forEach((h, idx) => {
      rec[h] = cells[idx] ?? "";
    });
    return rec;
  });
  return { headers, records };
}
