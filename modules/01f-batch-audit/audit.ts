/**
 * audit.ts
 *
 * What it does: the batch audit (DECISIONS 21, 43). It compares a feed (one import, one batch of
 * lines) with the work orders already saved, line by line, and says what was added, changed, moved
 * or removed since the last time. Nothing is changed by the audit, it only reports.
 * Who calls it: the pick-up (modules/00-platform/pickup.ts) on every import, and the Audit page.
 * Depends on: Module 1c types only. Pure functions: no database, no screen.
 *
 * In the CRM world a "batch" is one import of lines (an upload of export files, or one scheduled
 * pick-up). Each line has its own key, so one changed line is found without re-reading the whole batch.
 */

import type { FeedLine } from "../01c-crm-connector/feed.js";
import { workOrderKey, type WorkOrder } from "../01c-crm-connector/work-orders.js";

export type FindingKind = "added" | "changed" | "moved" | "no_longer_needs_feedback" | "removed";

export interface Finding {
  key: string;
  kind: FindingKind;
  message: string;
}

export interface Coverage {
  from: string; // earliest paid date in the feed, YYYY-MM-DD, "" when the feed has no dated line
  to: string;
}

export interface AuditCounts {
  added: number;
  changed: number;
  moved: number;
  no_longer_needs_feedback: number;
  removed: number;
  unchanged: number;
}

// What is saved for each import. "added" lines are only counted and sampled, because a first import adds hundreds.
export interface AuditRecord {
  id: string;
  at: string; // ISO time of the import
  source: string; // plain description, for example the file names
  lines: number; // lines in the feed
  coverage: Coverage;
  complete: boolean; // true when missing lines could be judged
  counts: AuditCounts;
  findings: Finding[]; // everything except added lines (changed, moved, removed...), plus up to ADDED_SAMPLE added keys
  addedSample: string[];
  notes?: string[]; // problems found while converting the files (for example an unknown instalment count), shown in Needs attention
}

export const ADDED_SAMPLE = 25;
export const MAX_FINDINGS = 500; // a safety cap so one odd import cannot fill the database

export const emptyCounts = (): AuditCounts => ({ added: 0, changed: 0, moved: 0, no_longer_needs_feedback: 0, removed: 0, unchanged: 0 });

// Rule: the dates a feed covers decide which saved work orders can be judged missing. An import of
// 1 Feb to 31 Oct says nothing about a work order paid in November.
export function coverageOf(lines: FeedLine[]): Coverage {
  const dates = lines.map((l) => l.paidDate).filter((d) => d !== "").sort();
  return { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" };
}

export const inCoverage = (date: string, c: Coverage): boolean => c.from !== "" && date !== "" && date >= c.from && date <= c.to;

/**
 * Rules:
 * - added: a line whose item needs feedback and that has no work order yet.
 * - changed: same line, but the amount or the supporter is different.
 * - moved: same line, but it is now on a different item.
 * - no_longer_needs_feedback: the item no longer asks for feedback.
 * - removed: a saved work order whose line is not in the feed, judged only when the feed is
 *   complete and only for work orders paid inside the dates the feed covers (refunded, deleted or replaced).
 * A work order the audit reports is never changed or deleted by the audit (DECISIONS 21).
 */
export function auditFeed(lines: FeedLine[], stored: WorkOrder[], options: { complete: boolean }): { coverage: Coverage; counts: AuditCounts; findings: Finding[]; addedSample: string[] } {
  const byKey = new Map(stored.map((w) => [w.key, w]));
  const counts = emptyCounts();
  const findings: Finding[] = [];
  const addedSample: string[] = [];
  const seen = new Set<string>();
  const coverage = coverageOf(lines);
  const add = (f: Finding) => {
    counts[f.kind]++;
    if (findings.length < MAX_FINDINGS) findings.push(f);
  };

  for (const line of lines) {
    const key = workOrderKey(line);
    seen.add(key);
    const had = byKey.get(key);
    if (!had) {
      if (!line.needsFeedback) continue;
      counts.added++;
      if (addedSample.length < ADDED_SAMPLE) addedSample.push(key);
      continue;
    }
    if (!line.needsFeedback) add({ key, kind: "no_longer_needs_feedback", message: "The item no longer says it needs feedback. The work order was kept." });
    else if (had.itemId !== line.itemId) add({ key, kind: "moved", message: `The line is now on item ${line.itemName || line.itemId} (was ${had.itemName || had.itemId}). The work order was kept.` });
    else if (had.amount !== line.amount || had.supporterId !== line.supporterId) add({ key, kind: "changed", message: "The amount or supporter changed in the CRM after the work order was made. The work order was kept." });
    else counts.unchanged++;
  }

  if (options.complete) {
    for (const w of stored) {
      if (!seen.has(w.key) && inCoverage(w.paidDate, coverage)) add({ key: w.key, kind: "removed", message: "The line is no longer in the CRM (refunded, deleted or replaced). The work order was kept." });
    }
  }
  return { coverage, counts, findings, addedSample };
}

// Builds the record to save from an audit result.
export function auditRecord(id: string, at: string, source: string, lines: number, complete: boolean, r: ReturnType<typeof auditFeed>, notes: string[] = []): AuditRecord {
  return { id, at, source, lines, coverage: r.coverage, complete, counts: r.counts, findings: r.findings, addedSample: r.addedSample, ...(notes.length ? { notes } : {}) };
}
