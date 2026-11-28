/**
 * scatter-chart.ts
 *
 * What it does: "Gift age against stage" on the Dashboard (DECISIONS 311): a scatter of numbers. Down the side are the stages a gift passes through, across the bottom its age in quarters of one target (days to complete), and each bubble says how many gifts sit there. A dashed line is the pace a gift should keep to; bubbles under it are behind.
 * Who calls it: app/dashboard/trends-card.ts and the tests. Depends on: the counts (modules/17-dashboard/age.ts) and the palette tones. Pure: counts in, HTML out.
 * Data flow: gifts with dates + a target -> counts per stage and age band -> one SVG, a summary and a table view.
 *
 * Rules (data visualisation method): bubble area follows the count; every bubble carries its number (so nothing rests on size or colour alone); the four tones have words in the legend and in the summary; the zones behind the bubbles are a faint tint; a table view holds every figure.
 */

import { ageScatter, bandLabel, BANDS, STAGES, TARGETS, toneOf, TONES, type Tone } from "../../modules/17-dashboard/age";
import type { GiftLife } from "../../modules/17-dashboard/trends";
import { esc } from "../shared/pages";

const W = 640, H = 300, L = 84, R = 14, T = 12, B = 44;
const FILL: Record<Tone, string> = { ok: "#2a78d6", behind: "#eda100", over: "#e34948", late: "#a8a7a0" };
const INK: Record<Tone, string> = { ok: "#fff", behind: "#1f2937", over: "#fff", late: "#1f2937" };

// `own` is the partner's own view (DECISIONS 327): no days-to-fulfil box (each gift brings its own days), no click through to the staff Gifts list, and its own words.
export interface ScatterOptions { own?: boolean }
export function scatterHtml(gifts: GiftLife[], today: string, target: number, opts: ScatterOptions = {}): string {
  const head = `<div class="sc-head"><div><h3 class="dash-h">${opts.own ? "Your gifts: age against stage" : "Gift age against stage"}</h3><p class="muted dash-note lc-hint">${opts.own ? "Each bubble is the number of your gifts at that stage and age, counted from the day each was assigned to you. A bubble below the dashed line is behind pace; a red one is past its time." : "Each bubble is the number of gifts at that stage and age. Age is counted from the start of the journey and read against the days each benefit has to be fulfilled, so every benefit reads the same way: a quarter of the way through its time a gift should be a quarter of the way to its fulfilled stage, and a gift past its time should be fulfilled."}</p></div>
    ${opts.own ? "" : `<label class="ar-proj"><span class="muted">Default days to fulfil</span><select id="tr-target" aria-label="Days to fulfil, for benefits that set none">${TARGETS.map((d) => `<option value="${d}"${d === target ? " selected" : ""}>${d} days</option>`).join("")}</select></label>`}</div>`;
  if (gifts.length === 0) return `<section class="dash-card dash-line tr-scatter" aria-label="Gift age against stage">${head}<div class="lc-empty muted">${opts.own ? "No gift has been assigned to you yet. This fills in as gifts are assigned to you and move through the steps." : "No gifts yet. This fills in as gifts are paid and move through the steps."}</div></section>`;
  const r = ageScatter(gifts, today, target);
  const tgt = r.target; // the days, when every gift shares one time; otherwise the chart reads in percent only
  const iw = W - L - R, ih = H - T - B, cw = iw / BANDS, rh = ih / STAGES.length;
  const cx = (b: number): number => L + cw * b + cw / 2;
  const cy = (s: number): number => T + rh * (STAGES.length - 1 - s) + rh / 2;
  const max = Math.max(...r.cells.map((c) => c.count));
  const radius = (n: number): number => 10 + Math.sqrt(n / max) * (Math.min(cw, rh) / 2 - 13);
  // Zones: the tint of the tone a gift would have in that cell, so the eye sees where "behind" starts.
  const zones = STAGES.flatMap((_, s) => Array.from({ length: BANDS }, (_, b) => { const t = r.cells.find((c) => c.stage === s && c.band === b)?.tone ?? zoneTone(s, b); return `<rect x="${(L + cw * b).toFixed(1)}" y="${(cy(s) - rh / 2).toFixed(1)}" width="${cw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${FILL[t]}" opacity=".07"/>`; })).join("");
  const ylab = STAGES.map((s, i) => `<text x="${L - 10}" y="${(cy(i) + 4).toFixed(1)}" text-anchor="end" class="lc-tick">${s}</text>`).join("");
  const xlab = Array.from({ length: BANDS }, (_, b) => `<text x="${cx(b).toFixed(1)}" y="${H - 22}" text-anchor="middle" class="lc-tick">${b === BANDS - 1 ? "Over target" : `${b * 25} to ${(b + 1) * 25}%`}</text>${tgt ? `<text x="${cx(b).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="lc-tick sc-days">${esc(bandLabel(b, tgt).replace(" days", ""))}</text>` : ""}`).join("");
  const pace = `<line x1="${L}" y1="${cy(0).toFixed(1)}" x2="${(L + cw * 4).toFixed(1)}" y2="${cy(r.paceTo).toFixed(1)}" class="sc-pace"/>`;
  const dots = r.cells.map((c) => `<g class="sc-dot"${opts.own ? "" : ` data-scatter="${c.stage}|${c.band}" role="button" tabindex="0"`} aria-label="Open the ${c.count} ${c.count === 1 ? "gift" : "gifts"}: ${STAGES[c.stage]}, ${tgt ? bandLabel(c.band, tgt) : bandPct(c.band)}"><circle cx="${cx(c.band).toFixed(1)}" cy="${cy(c.stage).toFixed(1)}" r="${radius(c.count).toFixed(1)}" fill="${FILL[c.tone]}" stroke="var(--card)" stroke-width="2"><title>${STAGES[c.stage]}, ${tgt ? bandLabel(c.band, tgt) : bandPct(c.band)}: ${c.count} ${c.count === 1 ? "gift" : "gifts"} (${TONES.find((t) => t.id === c.tone)?.label.toLowerCase()})</title></circle><text x="${cx(c.band).toFixed(1)}" y="${(cy(c.stage) + 4).toFixed(1)}" text-anchor="middle" class="sc-n" fill="${INK[c.tone]}">${c.count}</text></g>`).join("");
  // Rule (DECISIONS 314): gifts the chart cannot place are counted here in words, so none go missing: one waiting for full payment has not started, and an ongoing one has no end to measure against.
  const apart = r.notStarted ? `${r.notStarted} not started (waiting for full payment)` : "";
  const summary = `Gift age against stage: ${r.total} gifts, ${TONES.map((t) => `${r.byTone[t.id]} ${t.label.toLowerCase()}`).join(", ")}.`;
  const stats = `<ul class="sc-stats">${TONES.map((t) => `<li class="sc-stat"><span class="dash-sw" style="background:${FILL[t.id]}" aria-hidden="true"></span><b>${r.byTone[t.id]}</b><span>${t.label}</span></li>`).join("")}</ul>`;
  const rows = STAGES.map((s, i) => `<tr><th scope="row">${s}</th>${Array.from({ length: BANDS }, (_, b) => `<td class="num">${r.cells.find((c) => c.stage === i && c.band === b)?.count ?? 0}</td>`).join("")}</tr>`).reverse().join("");
  const table = `<details class="dash-tbl"><summary>View as a table</summary><table><thead><tr><th>Stage</th>${Array.from({ length: BANDS }, (_, b) => `<th class="num">${esc(tgt ? bandLabel(b, tgt) : bandPct(b))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></details>`;
  return `<section class="dash-card dash-line tr-scatter" aria-label="Gift age against stage">${head}<div class="sc-body"><div><svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(summary)}">${zones}${pace}${ylab}${xlab}${dots}</svg><p class="muted dash-note"><span class="sc-key" aria-hidden="true"></span> The dashed line is the pace to keep, from Paid at the start to the fulfilled stage at the end of the time.${apart ? ` Not on the chart: ${apart}. Whether a journey starts at the first or the full payment is set on the workflow, and the days to fulfil on the Benefits page.` : ""}</p></div>${stats}</div>${table}</section>`;
}
const bandPct = (b: number): string => (b === BANDS - 1 ? "Over its time" : `${b * 25} to ${(b + 1) * 25}% of its time`);
// The tone an empty cell would have, for the faint zone colour.
const zoneTone = (s: number, b: number): Tone => toneOf(s, b, 5);
