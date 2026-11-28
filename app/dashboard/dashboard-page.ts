/**
 * dashboard-page.ts
 *
 * What it does: draws the Dashboard (DECISIONS 301): the journey of a gift from payment to delivered outcome with one fulfilment score and how much is late at each stage, figure tiles grouped by what they are about (gifts, beneficiaries, partners), and six splits as donuts with their numbers beside them. Under it, the map card and the partner costs card.
 * Who calls it: app/main.ts. Depends on: the gathered figures (dashboard-data.ts) and the pieces (dash-charts.ts). Pure: it takes a View and returns HTML.
 * Data flow: View -> dashboardData -> HTML. Every stage and every tile that has a page behind it is a button with data-page, so the one navigation handler in main.ts takes the person there.
 * UX: one idea per block, the journey first because it answers "is the work getting done"; every number has its words; a late count is a pill with an icon and the word, never colour alone; a stage with nothing to measure says so instead of showing 0%; 2D grids that add columns as the room allows and fall to one column on a phone.
 */

import type { DashData } from "./dashboard-data";
import { dashboardData } from "./dashboard-data";
import { donutHtml, dashIcon, kpiHtml, paint, ringHtml, type Kpi } from "./dash-charts";
import type { Stage } from "../../modules/17-dashboard/facts";
import { esc, type View } from "../shared/pages";

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const pctOf = (n: number, of: number): string => (of <= 0 ? "" : `${Math.round((n / of) * 100)}% of ${of.toLocaleString("en-GB")}`);

// --- The journey ---
function stageHtml(s: Stage, n: number, in30: number): string {
  const head = s.id === "in" ? `<b class="dash-stage-big">${in30.toLocaleString("en-GB")}</b>` : ringHtml(s.pct, 76, `${s.title}: ${s.pct === null ? "no data yet" : `${s.pct} percent`}`);
  const line = s.id === "in" ? "in the last 30 days" : s.pct === null ? "no data yet" : `${s.done.toLocaleString("en-GB")} of ${s.of.toLocaleString("en-GB")}`;
  return `<button type="button" class="dash-stage dash-link" data-page="${esc(s.page)}"><span class="dash-stage-n">${n}</span>${head}<b class="dash-stage-t">${esc(s.title)}</b><span class="dash-stage-r">${esc(s.rule)}</span><span class="dash-stage-c">${esc(line)}</span>${s.late > 0 ? `<span class="dash-pill dash-pill-bad">${dashIcon("clock", 12)}${s.late} late</span>` : ""}</button>`;
}
function journeyCard(d: DashData): string {
  const score = d.score === null ? "–" : `${d.score}%`;
  const hasData = d.stages.some((s) => s.pct !== null);
  return `<section class="dash-card dash-journey" aria-labelledby="dj-h"><h2 id="dj-h" class="dash-h2">Gift journey: payment to delivered outcome</h2>
    <p class="muted dash-intro">${hasData ? "How much of each promise to donors and beneficiaries is done, stage by stage. Click a stage to see the work behind it." : "Nothing has reached the first stage yet. Bring gifts in and assign them, and the stages fill in."}</p>
    <div class="dash-journey-body"><div class="dash-score" title="The average of the stages that have something to measure">${ringHtml(d.score, 150, `Fulfilment score ${score}`)}<span class="dash-score-t">fulfilment score</span></div>
    <div class="dash-stages">${d.stages.map((s, i) => stageHtml(s, i + 1, d.counts.paymentsIn30)).join("")}</div></div></section>`;
}

// --- The figure tiles ---
function groups(d: DashData): { title: string; tiles: Kpi[] }[] {
  return [
    { title: "Gifts", tiles: [
      { label: "Value", value: d.value, sub: plural(d.counts.paymentsIn30, "payment", "payments") + " in 30 days", icon: "coins", hue: 0, page: "work-orders" },
      { label: "Active recurring plans", value: String(d.recurringActive), sub: "paid by the month or year", icon: "heart", hue: 4, page: "work-orders" },
      { label: "Gifts to fulfil", value: String(d.counts.gifts), sub: `${d.counts.assigned} assigned to a partner`, icon: "gift", hue: 1, page: "assignment" },
      { label: "Confirmed, to allocate", value: String(d.unallocated), sub: "waiting for a place", icon: "alert", hue: 3, page: "allocate", ...(d.unallocated > 0 ? { pill: { text: "Review", tone: "warn" as const } } : {}) },
      { label: "Plans stopped", value: String(d.plansStopped), sub: "cancelled, paused or completed", icon: "clock", hue: 6, page: "work-orders" },
      { label: "Needs attention", value: String(d.needAttention), sub: "unrouted, held or to look at", icon: "shield", hue: 7, page: "attention", ...(d.needAttention > 0 ? { pill: { text: "Review", tone: "bad" as const } } : {}) },
    ] },
    { title: "Beneficiaries", tiles: [
      { label: "Beneficiaries", value: String(d.beneficiaries), sub: `${d.enrolled} enrolled`, icon: "people", hue: 0, page: "beneficiaries" },
      { label: "Waiting for a vacancy", value: String(d.waiting), sub: "complete and ready", icon: "clock", hue: 3, page: "beneficiaries" },
      { label: "Need details", value: String(d.needDetails), sub: "date of birth, guardian or ID missing", icon: "doc", hue: 4, page: "beneficiaries" },
      { label: "Not funded yet", value: String(d.unfunded), sub: pctOf(d.unfunded, d.enrolled) || "of those enrolled", icon: "alert", hue: 7, page: "allocate" },
      { label: "Partly funded", value: String(d.partlyFunded), sub: pctOf(d.partlyFunded, d.enrolled) || "of those enrolled", icon: "heart", hue: 3, page: "allocate" },
      { label: "Fully funded", value: String(d.fully), sub: pctOf(d.fully, d.enrolled) || "of those enrolled", icon: "star", hue: 2, page: "allocate" },
    ] },
    { title: "Partners and delivery", tiles: [
      { label: "Active partners", value: String(d.partnersActive), icon: "partner", hue: 0, page: "partners", sub: "approved and in good standing" },
      { label: "Batches waiting", value: String(d.batchesWaiting), sub: "for the partner's answer", icon: "mail", hue: 1, page: "confirmation", ...(d.counts.lateAnswers > 0 ? { pill: { text: `${d.counts.lateAnswers} late`, tone: "bad" as const } } : {}) },
      { label: "Late in delivery", value: String(d.counts.lateDelivery), sub: "a step past its due day", icon: "clock", hue: 7, page: "progress" },
      { label: "Partner costs", value: d.costCount === 0 ? "None" : d.costs, sub: plural(d.costCount, "cost", "costs") + " recorded", icon: "coins", hue: 5, page: "dashboard" },
    ] },
  ];
}
function tilesHtml(d: DashData): string {
  return groups(d).map((g) => `<section class="dash-group" aria-label="${esc(g.title)}"><h2 class="dash-h2">${esc(g.title)}</h2><div class="dash-grid">${g.tiles.map(kpiHtml).join("")}</div></section>`).join("");
}

// --- The splits ---
function splitsHtml(d: DashData): string {
  const sum = (ps: { value: number }[]): number => ps.reduce((t, p) => t + p.value, 0);
  const s = d.splits;
  return `<section class="dash-group" aria-label="Splits"><h2 class="dash-h2">How it divides</h2><div class="dash-grid dash-grid-wide">
    ${donutHtml({ title: "Funding level", centre: String(sum(s.funding)), centreLabel: "enrolled", parts: paint(s.funding, "ordered") })}
    ${donutHtml({ title: "Where gifts are", centre: String(sum(s.where)), centreLabel: "gifts", parts: paint(s.where, "ordered") })}
    ${donutHtml({ title: "By cluster", centre: String(sum(s.clusters)), centreLabel: "enrolled", parts: paint(s.clusters, "categorical") })}
    ${donutHtml({ title: "By age", centre: String(sum(s.ages)), centreLabel: "beneficiaries", parts: paint(s.ages, "ordered") })}
    ${donutHtml({ title: "Recurring plans", centre: String(sum(s.plans)), centreLabel: "plans", parts: paint(s.plans, "categorical") })}
    ${donutHtml({ title: "By partner", centre: String(sum(s.partners)), centreLabel: "enrolled", parts: paint(s.partners, "categorical") })}</div></section>`;
}

export function dashboardPage(v: View): string {
  return dashboardHtml(dashboardData(v));
}

// The page from its figures, so it can be tested and looked at with any numbers.
export function dashboardHtml(d: DashData): string {
  return `<h1>Dashboard</h1><p class="sub">The work at a glance: where gifts are on their way to an outcome, who and what is funded, and what needs a person.</p>${journeyCard(d)}${tilesHtml(d)}${splitsHtml(d)}`;
}
