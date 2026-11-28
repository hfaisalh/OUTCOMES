/**
 * line-chart.ts
 *
 * What it does: a line chart for the Dashboard's trends (DECISIONS 304), drawn as SVG with no library: one or more lines over months, with a hairline grid, a value at the end of each line, a hover line with a tooltip for every month, a legend and a "View as a table" fallback.
 * Who calls it: app/dashboard/trends-card.ts and the tests. Depends on: esc and the palette in dash-charts.ts. Pure: values in, HTML out.
 * Data flow: months and series of numbers (a gap is null) -> one SVG. A gap in the data is a gap in the line, never a zero.
 *
 * Rules, from the data visualisation method in use:
 * - Lines are 2px with round joins; one axis only (two measures of a different scale are two charts); the grid is a hairline, solid and quiet.
 * - The end of each line has a dot with a 2px ring in the surface colour; values are labelled sparingly, at the end of the line, never on every point.
 * - Two or more lines always have a legend, so identity never rests on colour alone; every month has a tooltip and the whole chart has a table view.
 * - Text is always in the text colours; the colour is on the line and the swatch.
 */

import { esc } from "../shared/pages";

export interface LineSeries { name: string; color: string; values: (number | null)[] }
export interface LineChart { id: string; title: string; hint?: string; months: string[]; series: LineSeries[]; unit?: "" | "%" | " days"; max?: number }

const W = 640, H = 240, L = 42, R = 78, T = 16, B = 30;

// A round top for the axis: 1, 2, 2.5, 5 or 10 times a power of ten, at or above the largest value.
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const f = v / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}
const fmt = (n: number, unit: string): string => `${Number.isInteger(n) ? n : n.toFixed(1)}${unit === " days" && n === 1 ? " day" : unit}`;

export function lineChartHtml(c: LineChart): string {
  const unit = c.unit ?? "";
  const n = c.months.length;
  const real = c.series.flatMap((s) => s.values).filter((x): x is number => x !== null);
  const head = `<h3 class="dash-h">${esc(c.title)}</h3>${c.hint ? `<p class="muted dash-note lc-hint">${esc(c.hint)}</p>` : ""}`;
  if (real.length === 0) return `<section class="dash-card dash-line" aria-label="${esc(c.title)}">${head}<div class="lc-empty muted">Nothing to show yet. This fills in as gifts move through these steps.</div></section>`;
  const top = c.max ?? niceMax(Math.max(...real));
  const iw = W - L - R, ih = H - T - B;
  const x = (i: number): number => (n === 1 ? L + iw / 2 : L + (i * iw) / (n - 1));
  const y = (v: number): number => T + ih - (Math.min(v, top) / top) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => (top * k) / 4);
  const every = Math.ceil(n / 7);
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="lc-grid"/><text x="${L - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" class="lc-tick">${fmt(t, unit === " days" ? "" : unit)}</text>`).join("");
  const xl = c.months.map((m, i) => (i % every === 0 || i === n - 1 ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="lc-tick">${esc(m)}</text>` : "")).join("");
  // End labels: only where they do not sit on top of another (13px apart at least); the legend and the tooltips carry the rest.
  const endY = c.series.map((s) => { const l = s.values.map((v, i) => ({ v, i })).filter((p) => p.v !== null).pop(); return l ? y(l.v as number) : null; });
  const labelled = endY.map((yy, k) => yy !== null && endY.every((o, j) => j === k || o === null || Math.abs(o - yy) >= 13 || j > k));
  const lines = c.series.map((s, si) => {
    const segs: string[] = [];
    let cur: string[] = [];
    s.values.forEach((v, i) => { if (v === null) { if (cur.length) segs.push(cur.join(" ")); cur = []; } else cur.push(`${cur.length ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`); });
    if (cur.length) segs.push(cur.join(" "));
    const last = s.values.map((v, i) => ({ v, i })).filter((p) => p.v !== null).pop();
    const wash = c.series.length === 1 && segs.length === 1 && s.values.every((v) => v !== null) ? `<path d="${segs[0]} L${x(n - 1).toFixed(1)} ${(T + ih).toFixed(1)} L${x(0).toFixed(1)} ${(T + ih).toFixed(1)} Z" fill="${s.color}" fill-opacity=".1"/>` : "";
    const lone = s.values.map((v, i) => ({ v, i })).filter((p) => p.v !== null && s.values[p.i - 1] === null && (p.i === n - 1 || s.values[p.i + 1] === null || s.values[p.i + 1] === undefined));
    return `${wash}<path d="${segs.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${lone.map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v as number).toFixed(1)}" r="3.5" fill="${s.color}"/>`).join("")}${last ? `<circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v as number).toFixed(1)}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>` : ""}${last && c.series.length <= 3 && labelled[si] ? `<text x="${(x(last.i) + 9).toFixed(1)}" y="${(y(last.v as number) + 4).toFixed(1)}" class="lc-end">${fmt(last.v as number, unit)}</text>` : ""}`;
  }).join("");
  const step = n === 1 ? iw : iw / (n - 1);
  const hits = c.months.map((m, i) => `<g class="lc-hit"><line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${T}" y2="${T + ih}" class="lc-cross"/><rect x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${ih}" fill="transparent"><title>${esc(m)}: ${c.series.map((s) => `${s.name} ${s.values[i] === null || s.values[i] === undefined ? "no data" : fmt(s.values[i] as number, unit)}`).map(esc).join(", ")}</title></rect></g>`).join("");
  const summary = `${c.title}: ${c.series.map((s) => { const l = s.values.filter((v) => v !== null).pop(); return `${s.name} ${l === undefined ? "no data" : fmt(l as number, unit)} in ${c.months[s.values.lastIndexOf(l ?? null)] ?? c.months[n - 1]}`; }).join(", ")}`;
  const legend = c.series.length > 1 ? `<ul class="dash-legend lc-legend">${c.series.map((s) => `<li><span class="dash-sw" style="background:${s.color}" aria-hidden="true"></span><span class="dash-lname">${esc(s.name)}</span></li>`).join("")}</ul>` : "";
  const table = `<details class="dash-tbl"><summary>View as a table</summary><table><thead><tr><th>Month</th>${c.series.map((s) => `<th class="num">${esc(s.name)}</th>`).join("")}</tr></thead><tbody>${c.months.map((m, i) => `<tr><td>${esc(m)}</td>${c.series.map((s) => `<td class="num">${s.values[i] === null || s.values[i] === undefined ? "–" : fmt(s.values[i] as number, unit)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  return `<section class="dash-card dash-line" aria-label="${esc(c.title)}">${head}${legend}<svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${grid}<line x1="${L}" x2="${W - R}" y1="${T + ih}" y2="${T + ih}" class="lc-base"/>${xl}${lines}${hits}</svg>${table}</section>`;
}
