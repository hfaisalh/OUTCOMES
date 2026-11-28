/**
 * trends-card.ts
 *
 * What it does: the "Is delivery improving?" part of the Dashboard (DECISIONS 304): what changed since last month in five measures, and four monthly charts (the fulfilment score, gifts in and completed, how fast each step is taken, partner answers on time), for all benefits or for one.
 * Who calls it: app/dashboard/dashboard-page.ts. Depends on: the gathered trends (trends-data.ts), the line chart and the pieces in dash-charts.ts. Pure: figures in, HTML out.
 * Data flow: the benefit and the range are in a small state (trends-session.ts); changing either draws the card again from the data.
 * UX: the answer comes first (the change tiles, each with an arrow, the number and the words better, worse or no change, never colour alone), then the charts that explain it; the benefit and the range are controls above, with names.
 */

import type { Improvement, MonthPoint } from "../../modules/17-dashboard/trends";
import { CATEGORICAL, dashIcon } from "./dash-charts";
import { lineChartHtml } from "./line-chart";
import { trendsData, type TrendsData } from "./trends-data";
import { esc, type View } from "../shared/pages";

export interface TrendsView { benefit: string; months: 6 | 12 }
export const noTrendsView = (): TrendsView => ({ benefit: "", months: 12 });

// --- What changed ---
const show = (n: number | null, unit: Improvement["unit"]): string => (n === null ? "–" : unit === "days" ? `${n} ${n === 1 ? "day" : "days"}` : unit === "gifts" ? String(n) : `${n}%`);
const ARROW = { better: "check", worse: "cross", same: "flat", none: "flat" } as const;
const unitWord = (u: Improvement["unit"], n: number): string => { const one = n === 1; return u === "days" ? (one ? "day" : "days") : u === "gifts" ? (one ? "gift" : "gifts") : one ? "point" : "points"; };
function changeTile(i: Improvement): string {
  const dir = i.direction;
  const words = i.change === null ? "No earlier month to compare" : dir === "same" ? "No change since last month" : `${i.change > 0 ? "Up" : "Down"} ${Math.abs(i.change)} ${unitWord(i.unit, Math.abs(i.change))} on last month`;
  const pill = dir === "better" ? "Better" : dir === "worse" ? "Worse" : dir === "same" ? "No change" : "";
  return `<div class="dash-kpi tr-tile"><span class="dash-kpi-label">${esc(i.label)}</span><b class="dash-kpi-val">${esc(show(i.now, i.unit))}</b><span class="dash-kpi-sub">${i.change !== null && dir !== "same" ? dashIcon(i.change > 0 ? "up" : "down", 13) + " " : ""}${esc(words)}</span>${pill ? `<span class="dash-pill dash-pill-${dir === "better" ? "good" : dir === "worse" ? "bad" : "warn"}">${dashIcon(ARROW[dir], 12)}${pill}</span>` : ""}</div>`;
}

// --- The charts ---
function charts(points: MonthPoint[]): string {
  const months = points.map((p) => p.month.label);
  const col = (f: (p: MonthPoint) => number | null): (number | null)[] => points.map(f);
  return `<div class="dash-grid dash-grid-wide tr-charts">
    ${lineChartHtml({ id: "score", title: "Fulfilment score", hint: "How far gifts had got, as it stood at the end of each month.", months, series: [{ name: "Fulfilment score", color: CATEGORICAL[0] as string, values: col((p) => p.score) }], unit: "%", max: 100 })}
    ${lineChartHtml({ id: "flow", title: "Gifts in and gifts completed", hint: "Each month's payments in, against gifts reaching Complete.", months, series: [{ name: "Gifts in", color: CATEGORICAL[0] as string, values: col((p) => p.paidIn) }, { name: "Completed", color: CATEGORICAL[2] as string, values: col((p) => p.completed) }] })}
    ${lineChartHtml({ id: "speed", title: "How fast: median days at each step", hint: "Fewer days is better. For the gifts that took the step that month.", months, series: [{ name: "Payment to assigned", color: CATEGORICAL[0] as string, values: col((p) => p.daysToAssign) }, { name: "Assigned to partner's answer", color: CATEGORICAL[1] as string, values: col((p) => p.daysToAnswer) }, { name: "Allocated to complete", color: CATEGORICAL[2] as string, values: col((p) => p.daysToComplete) }], unit: " days" })}
    ${lineChartHtml({ id: "ontime", title: "Partner answers on time", hint: "The share of answers made within the days the workflow allows.", months, series: [{ name: "On time", color: CATEGORICAL[0] as string, values: col((p) => p.onTime) }], unit: "%", max: 100 })}</div>`;
}

export function trendsHtml(d: TrendsData, view: TrendsView): string {
  const seg = (n: 6 | 12): string => `<button type="button" class="ar-seg" data-action="tr-range" data-n="${n}" aria-pressed="${view.months === n}">${n} months</button>`;
  const controls = `<div class="ar-controls"><label class="ar-proj"><span class="muted">Benefit</span><select id="tr-benefit" aria-label="Benefit"><option value="">All benefits</option>${d.benefits.map((b) => `<option value="${esc(b.id)}"${b.id === view.benefit ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</select></label><div class="ar-segs" role="group" aria-label="Range">${seg(6)}${seg(12)}</div></div>`;
  const body = d.gifts === 0
    ? `<div class="ar-empty"><span class="dash-badge" style="--hue:#2a78d6">${dashIcon("clock", 20)}</span><div><b>No gifts to chart yet</b><p class="muted">The trends are built from the dates on every step of a gift. Once gifts are routed, assigned and moving, each month appears here, with what improved.</p></div></div>`
    : `<div class="dash-grid tr-tiles">${d.improvements.map(changeTile).join("")}</div>${charts(d.points)}<p class="muted dash-note">Each month is rebuilt from the dates on the steps, so there is nothing to switch on and the past does not change. A speed is the middle number of days for the gifts that took the step that month; a month with none shows a gap, not zero.</p>`;
  return `<section class="dash-group tr-section" aria-labelledby="tr-h"><h2 id="tr-h" class="dash-h2">Is delivery improving?</h2>${controls}${body}</section>`;
}

export const trendsCard = (v: View, view: TrendsView): string => trendsHtml(trendsData(v, view.benefit, view.months), view);
