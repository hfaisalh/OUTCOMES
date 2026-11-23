/**
 * pickup.ts
 *
 * What it does: one pick-up for one organisation. It reads the CRM feed, creates work orders for
 * lines whose item needs feedback, saves them, holds changes for review, tells the CRM about work
 * that has been delivered or reported, and records what it did.
 * Who calls it: handlers.ts (the scheduled job, and "Run pickup now" on the Settings page).
 * Depends on: store.ts, and the connector (Module 1c) and categories (Module 2) logic.
 *
 * Rules: running it again is safe, because a line already seen never makes a second work order.
 * A failure is recorded in plain English and never loses earlier work. The time of the last good
 * run only moves forward when a run succeeds, so nothing is skipped after a failure.
 */

import { currentFeedConfig, readFeed, summariseIssues } from "../01c-crm-connector/feed.js";
import { buildReportBack, REPORTABLE } from "../01c-crm-connector/report-back.js";
import type { CrmReader, CrmReporter } from "../01c-crm-connector/reader.js";
import { auditFeed, auditRecord } from "../01f-batch-audit/audit.js";
import { planWorkOrders, type ReviewItem, type WorkOrder } from "../01c-crm-connector/work-orders.js";
import { frameworkByItem } from "../02-project-rules/categories.js";
import { markCustomAmounts } from "../04b-commitments/parts.js";
import { autoCreateProjects } from "../06-projects/projects.js";
import { setupOf, type OrgConfig, type RunInfo, type Store } from "./store.js";

export interface PickupDeps {
  store: Store;
  reader: CrmReader;
  reporter: CrmReporter;
  nowIso: string;
  reportUrlFor?: (w: WorkOrder) => string; // supplied by the reporting module later. Blank means no report yet
  complete?: boolean; // true when the feed is the whole picture for its dates (an import), so missing lines can be judged. Default: only the first full read
  source?: string; // plain description of where the lines came from, kept with the audit
  newId?: () => string; // id for the audit record
  notes?: string[]; // problems found while converting the files, kept with the audit
}

const blankRun = (at: string, last: string): RunInfo => ({ at, lastSuccessAt: last, ok: false, error: "", rows: 0, created: 0, rerouted: 0, unchanged: 0, skipped: 0, issues: [], reportedSent: 0, reported: {} });

// Rule: review items for lines in this feed replace the old ones for those lines. Others are kept.
export function mergeReview(previous: ReviewItem[], fresh: ReviewItem[], seenKeys: Set<string>): ReviewItem[] {
  return [...previous.filter((r) => !seenKeys.has(r.key) && !fresh.some((f) => f.key === r.key)), ...fresh];
}

/**
 * Rule (DECISIONS 46): a work order's key is its CRM line id. Work orders saved under the older key
 * ("order reference:line id") are moved to the new one, keeping their category, status and everything
 * else, and the review entries that named them follow. Returns the updated lists and the old keys to delete.
 * Safe to run every time: once moved there is nothing left to do.
 */
export function rekeyLegacy(orders: WorkOrder[], review: ReviewItem[]): { orders: WorkOrder[]; review: ReviewItem[]; moved: WorkOrder[]; oldKeys: string[] } {
  const have = new Set(orders.filter((w) => w.key === w.lineId).map((w) => w.key));
  const moved: WorkOrder[] = [];
  const oldKeys: string[] = [];
  const renamed = new Map<string, string>();
  for (const w of orders) {
    if (w.key === w.lineId) continue;
    oldKeys.push(w.key);
    renamed.set(w.key, w.lineId);
    if (!have.has(w.lineId)) {
      have.add(w.lineId);
      moved.push({ ...w, key: w.lineId });
    }
  }
  const kept = orders.filter((w) => w.key === w.lineId);
  return { orders: [...kept, ...moved], review: review.map((r) => (renamed.has(r.key) ? { ...r, key: renamed.get(r.key) as string } : r)), moved, oldKeys };
}

// Rule: when staff sort an item into a category, its unrouted work orders are routed straight away, under the framework that applies to the item.
// Work orders that already have a category are never changed here.
export function rerouteUnrouted(orders: WorkOrder[], config: OrgConfig): WorkOrder[] {
  const setup = setupOf(config);
  const fw = frameworkByItem(setup);
  const out: WorkOrder[] = [];
  for (const w of orders) {
    const cat = config.itemMap[w.itemId] ?? "";
    if (w.status === "unrouted" && cat !== "" && config.categories.some((c) => c.id === cat)) out.push({ ...w, categoryId: cat, status: "ready", ...(w.frameworkId === undefined && fw[w.itemId] ? { frameworkId: fw[w.itemId] as string } : {}) });
  }
  return out;
}

// Rule (DECISIONS 59): a work order made before frameworks existed is given the framework that applies to its item, once. One that has a framework keeps it,
// so changing an item's framework later never moves work already made. Excluded work orders are left alone.
export function backfillFrameworks(orders: WorkOrder[], config: OrgConfig): WorkOrder[] {
  const fw = frameworkByItem(setupOf(config));
  return orders.filter((w) => w.status !== "excluded" && w.frameworkId === undefined && fw[w.itemId] !== undefined).map((w) => ({ ...w, frameworkId: fw[w.itemId] as string }));
}

// Rule (DECISIONS 129): marks the gifts of the CRM's Custom Amount item for manual allocation. Returns only what changed.
export function deriveParts(orders: WorkOrder[], _config: OrgConfig): WorkOrder[] {
  return markCustomAmounts(orders);
}

// Rule (DECISIONS 64): when a person asks for it, every work order is moved to the framework that now applies to its item, so a changed
// category or item framework reaches work already made. Only on request: it is never done by itself. Excluded work orders are left alone.
export function reapplyFrameworks(orders: WorkOrder[], config: OrgConfig): WorkOrder[] {
  const fw = frameworkByItem(setupOf(config));
  return orders.filter((w) => w.status !== "excluded" && fw[w.itemId] !== undefined && w.frameworkId !== fw[w.itemId]).map((w) => ({ ...w, frameworkId: fw[w.itemId] as string }));
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
    const feed = readFeed(rows, currentFeedConfig(config.feed));
    run.rows = rows.length;
    run.skipped = feed.skipped.length;
    run.issues = summariseIssues(feed.issues);

    // Plan and save.
    let existing = await store.listWorkOrders(org);
    if (existing.some((w) => w.key !== w.lineId)) {
      const moved = rekeyLegacy(existing, await store.getReview(org));
      await store.saveWorkOrders(org, moved.moved);
      await store.deleteWorkOrders(org, moved.oldKeys);
      await store.putReview(org, moved.review);
      existing = moved.orders;
      run.reported = {}; // report-back statuses were kept under the old keys, so the CRM is told once more
    }
    const complete = deps.complete ?? since === undefined;
    // Batch audit (DECISIONS 21, 43): compare this import with what is saved and keep the report. It changes nothing.
    const audit = auditFeed(feed.lines, existing, { complete });
    await store.addAudit(org, auditRecord(deps.newId?.() ?? nowIso, nowIso, deps.source ?? (since === undefined ? "Full read of the CRM" : "Pick-up since the last one"), feed.lines.length, complete, audit, deps.notes));
    const plan = planWorkOrders(feed.lines, existing, { categoryByItem: config.itemMap, frameworkByItem: frameworkByItem(setupOf(config)), usesFrameworks: config.usesFrameworks, feedIsComplete: complete, coverage: audit.coverage });
    await store.saveWorkOrders(org, [...plan.created, ...plan.updated, ...plan.rerouted]);
    // Parts from the price of one part, for new work orders (DECISIONS 113).
    const parted = deriveParts(await store.listWorkOrders(org), config);
    if (parted.length > 0) await store.saveWorkOrders(org, parted);
    run.created = plan.created.length;
    run.rerouted = plan.rerouted.length;
    run.unchanged = plan.unchanged.length;
    await store.putReview(org, mergeReview(await store.getReview(org), plan.review, new Set(feed.lines.map((l) => l.lineId))));

    // Rule (DECISIONS 155): a gift that carries a project creates that project, the way an item appears with its first gift.
    const all = await store.listWorkOrders(org);
    const made = autoCreateProjects(config.giftProjects ?? [], all);
    if (made.added.length > 0) await store.putConfig(org, { ...config, giftProjects: made.projects });

    // Report back: only work orders whose status the CRM has not heard yet.
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
