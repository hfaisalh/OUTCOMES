/**
 * sample.ts
 *
 * What it does: loads the invented CRM feed sample for the tests (samples/crm-feed-sample.csv).
 * Who calls it: the test files in this folder. Not used by the product.
 * Depends on: Module 1's csv.ts.
 */

import { readFileSync } from "node:fs";
import { parseCsv, toRecords } from "../01-data-mapping/csv";
import type { FeedRow } from "./feed";

export const sampleRows = (): FeedRow[] => toRecords(parseCsv(readFileSync(new URL("../../samples/crm-feed-sample.csv", import.meta.url), "utf8"))).records;
// The first sample row, which always exists.
export const firstRow = (): FeedRow => sampleRows()[0] as FeedRow;
