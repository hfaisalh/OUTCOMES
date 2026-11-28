/**
 * costs-card.ts
 *
 * What it does: the "Partner costs" card under the staff Dashboard (DECISIONS 280): what partners recorded as spent on running their work, added up by partner and by category, with one total for each currency, and the latest entries. Record only: nothing here is paid or approved.
 * Who calls it: app/main.ts. Depends on: the cost rules (modules/15-partner-costs/costs.ts) and esc and View from pages.ts. Pure: it takes a View and returns HTML.
 * Data flow: the staff reply carries every partner's costs (partnerCosts) and the partners' names (projects). A partner never sees this card, only its own list.
 */

import { costRows, totalText, type CostRow } from "../modules/15-partner-costs/costs";
import { esc, type View } from "./pages";

const MAX_LATEST = 10;
const figures = (r: CostRow): string => esc(totalText(r.totals));

export function costsCard(v: View): string {
  const costs = v.partnerCosts ?? [];
  const item = (id: string): string => v.flaggedItems?.find((i) => i.id === id)?.name ?? id;
  const name = (id: string): string => v.projects?.find((p) => p.id === id)?.name ?? id;
  const table = (title: string, rows: CostRow[], label: (k: string) => string): string => `<div><h3>${title}</h3><div class="tablewrap"><table><thead><tr><th>${title.replace("By ", "")}</th><th class="num">Costs</th><th class="num">Total</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(label(r.key))}</td><td class="num">${r.count}</td><td class="num">${figures(r)}</td></tr>`).join("")}</tbody></table></div></div>`;
  const latest = [...costs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, MAX_LATEST);
  return `<section class="card cs-card" aria-labelledby="cs-h"><h2 id="cs-h">Partner costs</h2>
    <p class="muted">What partners recorded as spent on running their work, beyond the work orders. For reporting only: nothing is paid or approved here, and each currency has its own total.</p>
    ${costs.length === 0 ? `<div class="empty">No partner has recorded a cost yet.</div>` : `<div class="metrics"><div class="metric"><b>${costs.length}</b><span>Costs recorded</span></div><div class="metric"><b>${new Set(costs.map((c) => c.partnerId)).size}</b><span>Partners reporting</span></div><div class="metric wide"><b class="cs-total">${esc(totalText(costs))}</b><span>Total</span></div></div>
    <div class="cs-grid">${table("By partner", costRows(costs, "partner"), name)}${table("By category", costRows(costs, "category"), (k) => k)}${table("By benefit", costRows(costs, "benefit"), (k) => (k === "" ? "Not for one benefit" : item(k)))}</div>
    <h3>Latest</h3><div class="tablewrap"><table><thead><tr><th>Date</th><th>Partner</th><th>Category</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>${latest.map((c) => `<tr><td>${esc(c.date)}</td><td>${esc(name(c.partnerId))}</td><td>${esc(c.category)}</td><td class="muted">${esc(c.note)}</td><td class="num">${esc(c.currency)} ${c.amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join("")}</tbody></table></div>`}</section>`;
}
