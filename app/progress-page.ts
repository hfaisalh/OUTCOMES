/**
 * progress-page.ts
 *
 * What it does: draws the Progress page (DECISIONS 232), the step after Allocate where each allocated gift moves through its partner's implementation phases, then Review, Report, Complete and Feedback. Four tiles (with the partner, late, in review and report, complete) that filter the list, and a list with the gift, partner and batch, the stage it has reached, the next step with its due day, and the buttons for a person to take the next step or take the latest one back. A late phase is advised, never acted on.
 * Who calls it: app/main.ts. Also exports standingsOf, the one place the pages read where each gift stands. Depends on: modules/12-progress (the rules), modules/08-assignment, and View and esc from app/pages.ts. Pure: it takes a View and returns HTML.
 */

import { siteBadge } from "./site-chip";
import { assignables, contextFrom } from "../modules/08-assignment/assignment";
import { batchSizeOf } from "../modules/08-assignment/batches";
import { standings, type GiftStanding } from "../modules/12-progress/context";
import { STAGE_LABELS, STAGE_VERBS, type StageId } from "../modules/12-progress/progress";
import { shortDate } from "./dates";
import { SYM } from "./symbols";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
export type ProgressFilter = "all" | "partner" | "late" | "review" | "complete";

// --- Where every assigned gift stands, read once per page ---
export function standingsOf(v: View): GiftStanding[] {
  const today = v.today ?? "2026-01-01";
  const partners = v.projects ?? [];
  const ctx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z` });
  const fwOf = new Map(assignables(ctx).map((u) => [u.key, u.w.frameworkId ?? ""]));
  return standings({ assignments: v.assignments?.records ?? [], allocations: v.allocations?.records ?? [], frameworkOf: (k) => fwOf.get(k) ?? "", frameworks: v.frameworks ?? [], sizeOf: (id) => batchSizeOf(partners.find((p) => p.id === id)), today }, v.progress?.records ?? []);
}

// Rule: a gift still with the partner is in its phases. Otherwise it is at the last stage taken. Late is the next step past its due day.
const stageName = (s: GiftStanding): string => (s.stage === "allocation" ? "With the partner" : STAGE_LABELS[s.stage as StageId]);
const isLate = (s: GiftStanding): boolean => (s.next?.lateDays ?? 0) > 0;
const matches = (s: GiftStanding, f: ProgressFilter): boolean => f === "all" || (f === "partner" ? s.stage === "allocation" : f === "late" ? isLate(s) : f === "review" ? s.stage === "review" || s.stage === "report" : s.complete);

export function progressPage(v: View): string {
  const allocated = standingsOf(v).filter((s) => s.allocated);
  const filter = (v.prgFilter ?? "all") as ProgressFilter;
  const partners = v.projects ?? [];
  const ctx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today: v.today ?? "2026-01-01", now: `${v.today ?? "2026-01-01"}T00:00:00Z` });
  const units = new Map(assignables(ctx).map((u) => [u.key, u]));
  const count = (f: ProgressFilter): number => allocated.filter((s) => matches(s, f)).length;
  const tile = (f: ProgressFilter, label: string, cls = ""): string => `<button type="button" class="metric tile${cls}" data-tile="prg:${f}" aria-pressed="${filter === f ? "true" : "false"}"><b>${count(f)}</b><span>${label}</span></button>`;
  const shown = allocated.filter((s) => matches(s, filter)).sort((x, y) => Number(isLate(y)) - Number(isLate(x)) || (x.next?.due || "9").localeCompare(y.next?.due || "9"));
  const rows = shown.slice(0, MAX_ROWS).map((s) => {
    const u = units.get(s.key);
    const next = s.next
      ? `<span class="muted">${esc(s.next.label)}</span>${s.next.lateDays > 0 ? ` <span class="pill unrouted" title="Past its due day. This is only advice: nothing moves by itself.">${SYM.pastDue} Late ${s.next.lateDays} day${s.next.lateDays === 1 ? "" : "s"}</span>` : ""}`
      : `<span class="pill ready">${SYM.ok} All steps taken</span>`;
    const any = s.steps.some((x) => x.done);
    const acts = `${s.next ? `<button type="button" class="primary" data-prg="next" data-key="${esc(s.key)}">${esc(s.next.kind === "phase" ? `Done: ${s.next.label}` : STAGE_VERBS[s.next.id as StageId])}</button>` : ""}${any ? ` <button type="button" data-prg="undo" data-key="${esc(s.key)}" title="Take the latest step back">Undo</button>` : ""}`;
    return `<tr><td class="clip" title="${esc(u ? `${u.w.supporterName} · ${u.w.itemName}` : s.key)}">${u ? siteBadge(u.w.site, u.w.currency) : ""}${esc(u ? `${u.w.supporterName} · ${u.w.itemName}` : s.key)}</td><td class="clip">${esc(partners.find((p) => p.id === s.partnerId)?.name ?? s.partnerId)}</td><td class="num">${s.batch ?? ""}</td><td>${s.complete ? `<span class="pill ready">${SYM.completed} ${esc(stageName(s))}</span>` : `<span class="pill">${esc(stageName(s))}</span>`}</td><td>${next}</td><td class="num">${esc(shortDate(s.next?.due ?? ""))}</td><td class="acts">${acts}</td></tr>`;
  }).join("");
  return `<h1>Progress</h1>
    <p class="sub">After a gift is allocated, the partner works through the phases of its workflow. Then it is reviewed, reported, completed and, where the workflow asks, the donor gives feedback. A person takes each step here for now. A phase past its due day is flagged, never moved by itself. A batch closes, on the Assignment page, once every gift in it is complete.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${tile("partner", "With the partner")}${tile("late", "Late", count("late") ? " warn" : "")}${tile("review", "In review and report")}${tile("complete", "Complete")}</div>
    <div class="card"><h2>Allocated gifts <span class="muted">(${shown.length})</span></h2>
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Partner</th><th class="num">Batch</th><th>Stage</th><th>Next step</th><th class="num">Due</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown. Use the tiles to narrow the list.</p>` : ""}` : `<div class="empty">${allocated.length === 0 ? "No gift is allocated yet. A gift appears here once Allocate gives it a beneficiary to fund or an outcome." : "Nothing matches this tile."}</div>`}</div>`;
}
