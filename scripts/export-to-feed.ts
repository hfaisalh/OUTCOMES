/**
 * export-to-feed.ts
 *
 * What it does: reads the three CRM Export Centre files from real-data/crm-exports/ and writes one
 * feed file, real-data/crm-feed.csv, in the shape of docs/CRM-FEED-SPEC.md. Prints counts only,
 * never donor rows.
 * Who calls it: you, with `npm run feed:from-exports`.
 * Depends on: modules/01e-crm-export-adapter and Module 1's csv.ts.
 *
 * real-data/ is ignored by git (.gitignore), so real exports and the feed never reach the repository.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { adaptExports } from "../modules/01e-crm-export-adapter/export-adapter.ts";
import { parseCsv, toRecords } from "../modules/01-data-mapping/csv.ts";

const dir = new URL("../real-data/", import.meta.url);
const load = (name: string) => toRecords(parseCsv(readFileSync(new URL(`crm-exports/${name}`, dir), "utf8"))).records;

const result = adaptExports(load("donation-lines.csv"), load("catalogue-items.csv"), load("recurring-plans.csv"));

// Section: write the feed as CSV (quote every cell that needs it).
const columns = Object.keys(result.rows[0] ?? {});
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = [columns.join(","), ...result.rows.map((r) => columns.map((c) => cell(r[c] ?? "")).join(","))].join("\n") + "\n";
writeFileSync(new URL("crm-feed.csv", dir), csv);

console.log(`Wrote real-data/crm-feed.csv: ${result.counts.lines} lines.`);
console.log(`Lines whose item needs feedback: ${result.counts.feedbackLines}`);
console.log(`Recurring lines: ${result.counts.recurringLines} (${result.counts.recurringWithoutPlan} with no plan row, shown as Indefinitely)`);
console.log(`Issues: ${result.issues.length}`);
for (const i of result.issues.slice(0, 20)) console.log(`  - ${i.message}`);
