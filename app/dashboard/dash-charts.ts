/**
 * dash-charts.ts
 *
 * What it does: the small pieces the Dashboard is made of (DECISIONS 301): a progress ring, a donut with its legend and a table view, a figure tile with an icon, and the icons. Plain HTML and SVG strings, no library.
 * Who calls it: app/dashboard/dashboard-page.ts and the tests. Depends on: esc from app/shared/pages.ts. Pure: values in, HTML out.
 * Data flow: the page works out the numbers (facts.ts); these draw them. Nothing here fetches or changes anything.
 *
 * Rules, from the data visualisation method in use (a validated palette, fixed hue order, thin marks):
 * - Colour carries identity only through the legend: every donut has a legend with the number beside each name, and a "View as a table" fallback, so nothing depends on telling two colours apart.
 * - Parts with an order (ages, funding level, the stages of a gift) take one hue stepped light to dark; parts without an order (clusters, partners) take the categorical hues in a fixed order, never cycled. At most six parts, the rest folded into "Other".
 * - A 2px gap in the surface colour separates touching segments; a ring is a thin mark on a lighter track of its own hue.
 * - Text is always in the text colours; the colour sits on the swatch beside it.
 */

import { esc } from "../shared/pages";

// --- Colours (the reference palette, light surface) ---
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const ORDINAL = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"]; // blue, light to dark: steps 250, 350, 450, 550, 650, 700
export const NEUTRAL = "#a8a7a0"; // "Other" and "not known"
export const RING_FILL = "#2a78d6", RING_TRACK = "#cde2fb";

// --- Icons: 24 pixel, stroke, no fill, so they take the colour of their badge ---
const ICONS: Record<string, string> = {
  gift: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M12 9v11M4 13.5h16M12 9C9.5 9 8 8 8 6.6S9.4 4.5 12 9zm0 0c2.5 0 4-1 4-2.4S14.6 4.5 12 9z"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16 14.6c2.6-.3 4.2 1 4.6 3.9"/>',
  heart: '<path d="M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 1.9c0 5.2-7 9.6-7 9.6z"/>',
  star: '<path d="m12 4 2.4 5 5.5.7-4 3.8 1 5.5L12 16.4 7.1 19l1-5.5-4-3.8 5.5-.7z"/>',
  doc: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5"/>',
  mail: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m4 7.5 8 6 8-6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4-3 7.3-7 9-4-1.7-7-5-7-9V6z"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2M12 16v.1"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.4 2.5 2.5 4.8-5.2"/>',
  partner: '<path d="M4.5 20.5v-12l7.5-4 7.5 4v12M4 20.5h16M9 20.5v-5h6v5M9 11h.1M15 11h.1"/>',
  pin: '<path d="M12 20.5s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="10.5" r="2.2"/>',
  coins: '<circle cx="9.5" cy="9.5" r="5"/><path d="M14.5 13.5a5 5 0 1 0 0-8M9.5 7.5v4M8 9.5h3"/>',
  plus: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  cross: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
};
export const dashIcon = (name: keyof typeof ICONS | string, size = 18): string => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ICONS["check"]}</svg>`;

// --- A figure tile: a label, one number, a line under it, an icon badge, and an optional status pill ---
export interface Kpi { label: string; value: string; sub?: string; icon: string; hue?: number; page?: string; pill?: { text: string; tone: "bad" | "warn" | "good" } }
const PILL_ICON = { bad: "cross", warn: "alert", good: "check" } as const;
export function kpiHtml(k: Kpi): string {
  const body = `<span class="dash-kpi-top"><span class="dash-kpi-label">${esc(k.label)}</span><span class="dash-badge${(k.hue ?? 0) % CATEGORICAL.length === 3 ? " dash-badge-dark" : ""}" style="--hue:${CATEGORICAL[(k.hue ?? 0) % CATEGORICAL.length]}">${dashIcon(k.icon)}</span></span>
    <b class="dash-kpi-val${k.value.length > 11 ? " dash-kpi-long" : ""}">${esc(k.value)}</b>
    <span class="dash-kpi-sub">${k.sub ? esc(k.sub) : ""}${k.pill ? ` <span class="dash-pill dash-pill-${k.pill.tone}">${dashIcon(PILL_ICON[k.pill.tone], 12)}${esc(k.pill.text)}</span>` : ""}</span>`;
  return k.page ? `<button type="button" class="dash-kpi dash-link" data-page="${esc(k.page)}">${body}</button>` : `<div class="dash-kpi">${body}</div>`;
}

// --- A ring: one ratio against its whole, on a lighter track of its own hue ---
export function ringHtml(pct: number | null, size = 84, label = ""): string {
  const r = 36, c = 2 * Math.PI * r;
  const arc = pct === null ? "" : `<circle cx="44" cy="44" r="${r}" fill="none" stroke="${RING_FILL}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${((pct / 100) * c).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 44 44)"/>`;
  return `<svg class="dash-ring" viewBox="0 0 88 88" width="${size}" height="${size}" role="img" aria-label="${esc(label || (pct === null ? "No data yet" : `${pct} percent`))}"><circle cx="44" cy="44" r="${r}" fill="none" stroke="${RING_TRACK}" stroke-width="8"/>${arc}<text x="44" y="49" text-anchor="middle" class="dash-ring-text">${pct === null ? "–" : `${pct}%`}</text></svg>`;
}

// --- A donut with its legend and a table view ---
export interface DonutPart { label: string; value: number; color: string }
const GAP = 0.9; // the 2px gap between segments, as a share of 100
export function donutHtml(o: { title: string; centre: string; centreLabel: string; parts: DonutPart[]; unit?: string }): string {
  const parts = o.parts.filter((p) => p.value > 0);
  const total = parts.reduce((t, p) => t + p.value, 0);
  const r = 40;
  let at = 0;
  const segs = total === 0 ? `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${RING_TRACK}" stroke-width="14"/>` : parts.map((p) => {
    const share = (p.value / total) * 100;
    const gap = parts.length > 1 ? GAP : 0;
    const seg = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${p.color}" stroke-width="14" pathLength="100" stroke-dasharray="${Math.max(0.1, share - gap).toFixed(2)} ${(100 - share + gap).toFixed(2)}" stroke-dashoffset="${(-at).toFixed(2)}" transform="rotate(-90 50 50)"><title>${esc(p.label)}: ${p.value} (${Math.round(share)}%)</title></circle>`;
    at += share;
    return seg;
  }).join("");
  const summary = total === 0 ? `${o.title}: nothing to show yet` : `${o.title}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`;
  const unit = o.unit ?? "";
  return `<section class="dash-card dash-donut" aria-label="${esc(o.title)}"><h3 class="dash-h">${esc(o.title)}</h3>
    <div class="dash-donut-body"><svg viewBox="0 0 100 100" class="dash-donut-svg" role="img" aria-label="${esc(summary)}">${segs}<text x="50" y="49" text-anchor="middle" class="dash-donut-num">${esc(o.centre)}</text><text x="50" y="62" text-anchor="middle" class="dash-donut-lab">${esc(o.centreLabel)}</text></svg>
      <ul class="dash-legend">${(total === 0 ? o.parts : parts).map((p) => `<li><span class="dash-sw" style="background:${p.color}" aria-hidden="true"></span><span class="dash-lname">${esc(p.label)}</span><b class="dash-lval">${p.value}${unit}</b></li>`).join("")}</ul></div>
    <details class="dash-tbl"><summary>View as a table</summary><table><thead><tr><th>${esc(o.title)}</th><th class="num">Number</th><th class="num">Share</th></tr></thead><tbody>${o.parts.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${p.value}</td><td class="num">${total === 0 ? "–" : `${Math.round((p.value / total) * 100)}%`}</td></tr>`).join("")}</tbody></table></details></section>`;
}

// --- Colouring a list of parts (DECISIONS 301) ---
// "ordered": one hue stepped light to dark, spread over the ramp. "categorical": the hues in fixed order. A part called Other or "not known" is always the neutral grey, so it never takes a hue from a real part.
const NEUTRAL_LABELS = new Set(["Other", "Not known", "Age not known", "No cluster", "No partner"]);
export function paint(parts: { label: string; value: number }[], kind: "ordered" | "categorical"): DonutPart[] {
  const real = parts.filter((p) => !NEUTRAL_LABELS.has(p.label));
  const pick = (i: number): string => (kind === "categorical" ? CATEGORICAL[i % CATEGORICAL.length] as string : ORDINAL[real.length <= 1 ? 2 : Math.round((i * (ORDINAL.length - 1)) / (real.length - 1))] as string);
  let i = 0;
  return parts.map((p) => ({ ...p, color: NEUTRAL_LABELS.has(p.label) ? NEUTRAL : pick(i++) }));
}
