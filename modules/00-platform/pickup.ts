/**
 * pickup.ts
 *
 * What it does: one pick-up for one organisation. It reads the CRM feed, creates work orders for
 * lines whose item needs feedback, saves them, holds changes for review, tells the CRM about work
 * that has been delivered or reported, and records what it did.
 * Who calls it: handlers.ts (the scheduled job, and "Run pickup now" on the Settings page).
 * Depends on: store.ts, and the connector (Module 1c) and frameworks (Module 2) logic.
 *
 * Rules: running it again is safe, because a line already seen never makes a second work order.
 * A failure is recorded in plain English and never loses earlier work. The time of the last good
 * run only moves forward when a run succeeds, so nothing is skipped after a failure.
 */

import { readFeed } from "../01c-crm-connector/feed";
import { buildReportBack, REPORTABLE } from "../01c-crm-connector/report-back";
import type { CrmReader, CrmReporter } from "../01c-crm-connector/reader";
import { planWorkOrders, type ReviewItem, type WorkOrder } from "../01c-crm-connector/work-orders";
import type { OrgConfig, RunInfo, Store } from "./store";

export interface PickupDeps {
  store: Store;
  reader: CrmReader;
  reporter: CrmReporter;
  nowIso: string;
  reportUrlFor?: (w: WorkOrder) => string; // supplied by the reporting module later. Blank means no report yet
}

const blankRun = (at: string, last: string): RunInfo => ({ at, lastSuccessAt: last, ok: false, error: "", rows: 0, created: 0, rerouted: 0, unchanged: 0, skipped: 0, issues: [], reportedSent: 0, reported: {} });

// Rule: review items for lines in this feed replace the old ones for those lines. Others are kept.
export function mergeReview(previous: ReviewItem[], fresh: ReviewItem[], seenKeys: Set<string>): ReviewItem[] {
  return [...previous.filter((r) => !seenKeys.has(r.key) && !fresh.some((f) => f.key === r.key)), ...fresh];
}

// Rule: when staff sort an item into a framework, its unrouted work orders are routed straight away.
// Work orders that already have a framework are never changed here.
export function rerouteUnrouted(orders: WorkOrder[], config: OrgConfig): WorkOrder[] {
  const out: WorkOrder[] = [];
  for (const w of orders) {
    const fw = config.itemMap[w.itemId] ?? "";
    if (w.status === "unrouted" && fw !== "" && config.frameworks.some((f) => f.id === fw)) out.push({ ...w, frameworkId: fw, status: "ready" });
  }
  return out;
}

export async function runPickup(org: string, deps: PickupDeps): Promise<RunInfo> {
  const { store, reader, reporter, nowIso } = deps;
  const before = await store.getRun(org);
  const run = blankRun(nowIso, before?.lastSuccessAt ?? "");
  run.reported = { ...(before?.reported ?? {}) };
  try {
    const config = await store.getConfig(org);
    if (!config) throw new Error("This organisation has no setup yet.");

    // Read. With no earlier good run the whole feed is read, so lines missing from it can be spotted.
    const since = before?.lastSuccessAt || undefined;
    const rows = await reader.readFeed(since);
    const feed = readFeed(rows, config.feed);
    run.rows = rows.length;
    run.skipped = feed.skipped.length;
    run.issues = feed.issues.map((i) => i.message);

    // Plan and save.
    const existing = await store.listWorkOrders(org);
    const plan = planWorkOrders(feed.lines, existing, { frameworkByItem: config.itemMap, usesFrameworks: config.usesFrameworks, feedIsComplete: since === undefined });
    await store.saveWorkOrders(org, [...plan.created, ...plan.rerouted]);
    run.created = plan.created.length;
    run.rerouted = plan.rerouted.length;
    run.unchanged = plan.unchanged.length;
    await store.putReview(org, mergeReview(await store.getReview(org), plan.review, new Set(feed.lines.map((l) => `${l.transactionRef}:${l.lineId}`))));

    // Report back: only work orders whose status the CRM has not heard yet.
    const all = await store.listWorkOrders(org);
    const due = all.filter((w) => REPORTABLE.includes(w.status) && run.reported[w.key] !== w.status);
    const back = buildReportBack(due.map((w) => ({ workOrder: w, reportUrl: deps.reportUrlFor?.(w) ?? "" })), nowIso);
    run.issues.push(...back.problems);
    await reporter.send(back.items);
    for (const item of back.items) run.reported[item.workOrderKey] = item.status;
    run.reportedSent = back.items.length;

    run.ok = true;
    run.lastSuccessAt = nowIso;
  } catch (e) {
    run.error = e instanceof Error ? e.message : "The pick-up failed.";
  }
  await store.putRun(org, run);
  return run;
}
