/**
 * compact.ts
 *
 * What it does: packs feed rows into a small table for sending to the server, and unpacks them. It
 * also keeps the data to what the server needs (DECISIONS 43): only the columns the feed reader
 * uses, and no supporter name on lines whose item does not need feedback, because no work order
 * is made for those.
 * Who calls it: the page (pack) and the import endpoint (unpack).
 * Depends on: the FeedRow type only. Pure functions.
 *
 * Why compact: a serverless function accepts a request of about 4.5 MB at most. A year of lines
 * as plain JSON objects is too big, as a table of values it is about a quarter of the size.
 */

import type { FeedRow } from "../01c-crm-connector/feed.js";

// The columns that leave the browser. Channel, merchant and payment mode are not kept in work orders, so they stay behind.
// The credit chain columns are optional in the feed (DECISIONS 44), up to four levels of role, id and name.
const CREDIT_COLUMNS = [1, 2, 3, 4].flatMap((n) => [`credit_${n}_role`, `credit_${n}_id`, `credit_${n}_name`]);
export const SEND_COLUMNS = [
  "line_id", "transaction_ref", "status", "is_deleted", "superseded_by", "paid_at", "supporter_id", "supporter_name", "supporter_kind", "group_name", "item_id", "item_name",
  "item_feedback", "is_recurring", "instalment_count", "plan_status", "plan_next_due", "plan_paid", "subscription_id", "instalment_number", "amount", "currency", "site", "line_total", "quantity", "bundle_qty", "period_count", "project_name", "cause", "tribute", "custom_amount", "intention", ...CREDIT_COLUMNS,
] as const;

export interface CompactFeed {
  columns: string[];
  rows: string[][];
}

export const MAX_ROWS = 100_000;

// Rule: a supporter's name, and the names in the credit chain, are sent only for lines that will become work orders (item_feedback = 2).
export function packFeed(rows: FeedRow[], feedbackColumn = "item_feedback", yes: string[] = ["2"]): CompactFeed {
  const columns = [...SEND_COLUMNS];
  const nameAts = columns.map((c, i) => (c === "supporter_name" || /^credit_\d_name$/.test(c) ? i : -1)).filter((i) => i >= 0);
  return {
    columns,
    rows: rows.map((r) => {
      const cells = columns.map((c) => r[c] ?? "");
      if (!yes.includes((r[feedbackColumn] ?? "").trim())) for (const i of nameAts) cells[i] = "";
      return cells;
    }),
  };
}

// Checks a packed feed from the outside and unpacks it, or says in plain words what is wrong.
export function unpackFeed(input: unknown): { rows: FeedRow[] } | { error: string } {
  const c = input as Partial<CompactFeed> | null;
  if (!c || !Array.isArray(c.columns) || !Array.isArray(c.rows)) return { error: "The import has no table of lines." };
  if (c.rows.length > MAX_ROWS) return { error: `The import has more than ${MAX_ROWS} lines.` };
  if (!c.columns.every((x) => typeof x === "string" && (SEND_COLUMNS as readonly string[]).includes(x))) return { error: "The import has a column the server does not accept." };
  if (!c.rows.every((r) => Array.isArray(r) && r.length === c.columns!.length && r.every((v) => typeof v === "string"))) return { error: "A line in the import does not match its columns." };
  return { rows: (c.rows as string[][]).map((r) => Object.fromEntries((c.columns as string[]).map((col, i) => [col, r[i] as string]))) };
}
