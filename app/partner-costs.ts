/**
 * partner-costs.ts
 *
 * What it does: the partner's "Your costs" card and the pop-up form to record one (DECISIONS 280). Costs are what the partner spent on running its work beyond the work orders: administration, marketing, media and so on. They are kept for reporting only; nothing is paid or approved here.
 * Who calls it: app/partner-home.ts draws the card; app/partner-cost-session.ts handles the buttons. Depends on: the partner slice, the cost rules (modules/15-partner-costs/costs.ts) and the shared pieces in partner-outcomes.ts. Pure: it takes the slice and the form and returns HTML.
 * Data flow: the slice holds only this partner's own costs. Save sends { action: "cost-add" | "cost-set", ... } and the server answers with the fresh slice.
 * UX: a modal dialog like the beneficiary form (role="dialog", aria-modal, Close, Esc, Tab kept inside); every field has a visible label; required ones are marked; the error is announced and shown under the form; the amount is a numeric keypad on a phone; 44px fields on touch; Cancel is always there.
 */

import { COST_CATEGORIES, costRows, totalText } from "../modules/15-partner-costs/costs";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { esc, type PartnerUi } from "./partner-outcomes";

export interface CostForm { id: string; values: Record<string, string>; error: string; fresh?: boolean }
export const CURRENCIES = ["GBP", "USD", "NOK", "PKR", "EUR"]; // suggestions only: any 3 letters are accepted

// --- The form ---
const val = (f: CostForm, k: string): string => f.values[k] ?? "";
export function costFormHtml(f: CostForm, projects: { id: string; name: string }[], today: string): string {
  const v = (k: string, fallback = ""): string => esc(val(f, k) || fallback);
  const opt = (value: string, text: string, now: string): string => `<option value="${esc(value)}"${now === value ? " selected" : ""}>${esc(text)}</option>`;
  return `<div class="pf-overlay${f.fresh ? " pe-in" : ""}" role="dialog" aria-modal="true" aria-labelledby="pk-title"><div class="pf-box">
    <header class="gw-head"><div><h2 id="pk-title">${f.id ? "Change this cost" : "Record a cost"}</h2><div class="gw-sub muted">What you spent on running your work, beyond the work orders. It is kept for reporting only.</div></div><button type="button" data-action="pt-cost-cancel" aria-label="Close">Close</button></header>
    <form class="pf-body gw pe" id="pk-form" novalidate><div class="pe-grid">
      <label class="pe-f"><span class="pe-l">Date <abbr title="required" aria-hidden="true">*</abbr></span><input id="pk-date" type="date" value="${v("date", today)}" required></label>
      <label class="pe-f"><span class="pe-l">Category <abbr title="required" aria-hidden="true">*</abbr></span><select id="pk-category" required><option value="">Choose a category</option>${COST_CATEGORIES.map((c) => opt(c, c, val(f, "category"))).join("")}</select></label>
      <label class="pe-f"><span class="pe-l">Amount <abbr title="required" aria-hidden="true">*</abbr></span><input id="pk-amount" inputmode="decimal" autocomplete="off" value="${v("amount")}" required><span class="muted pe-hint">For example 1250.50</span></label>
      <label class="pe-f"><span class="pe-l">Currency <abbr title="required" aria-hidden="true">*</abbr></span><input id="pk-currency" list="pk-currencies" maxlength="3" autocomplete="off" value="${v("currency", "GBP")}" required><datalist id="pk-currencies">${CURRENCIES.map((c) => `<option value="${c}">`).join("")}</datalist><span class="muted pe-hint">3 letters, for example GBP or PKR</span></label>
      <label class="pe-f"><span class="pe-l">For project</span><select id="pk-projectId">${opt("", "Our work in general", val(f, "projectId"))}${projects.map((p) => opt(p.id, p.name, val(f, "projectId"))).join("")}</select></label>
      <label class="pe-f"><span class="pe-l">Note</span><input id="pk-note" maxlength="200" autocomplete="off" value="${v("note")}"><span class="muted pe-hint">A few words, for example what it was for.</span></label>
    </div></form>
    <footer><span id="pk-error" class="pf-error" role="alert" tabindex="-1">${esc(f.error)}</span><button type="button" data-action="pt-cost-cancel">Cancel</button><button type="button" class="primary" data-action="pt-cost-save">${f.id ? "Save" : "Record cost"}</button></footer>
  </div></div>`;
}

// --- The card ---
export function costsCardHtml(slice: PartnerSlice, ui: PartnerUi, today: string): string {
  const costs = [...(slice.costs ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const projectName = (id: string): string => (id === "" ? "General" : slice.giftProjects.find((g) => g.id === id)?.name ?? id);
  const rows = costs.map((c) => `<tr><td>${esc(c.date)}</td><td>${esc(c.category)}</td><td>${esc(projectName(c.projectId))}${c.note ? `<div class="muted">${esc(c.note)}</div>` : ""}</td><td class="num">${esc(c.currency)} ${c.amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td class="num"><button type="button" data-action="pt-cost-edit" data-id="${esc(c.id)}" aria-label="Change cost ${esc(c.id)}">Edit</button> <button type="button" data-action="pt-cost-remove" data-id="${esc(c.id)}" aria-label="Remove cost ${esc(c.id)}">Remove</button></td></tr>`).join("");
  const byCategory = costRows(costs, "category").map((r) => `${esc(r.key)} ${esc(totalText(r.totals.map((t) => ({ currency: t.currency, amount: t.amount }))))}`).join("; ");
  return `<section class="card" aria-label="Your costs"><div class="pe-head"><h2>Your costs</h2><span class="pe-btns"><button class="primary" data-action="pt-cost-add">Record a cost</button></span></div>
    <p class="muted">What you spend on running your work, beyond the work orders: administration, marketing, media and so on. MWF uses it for reporting. Nothing is paid from here.</p>
    ${ui.message && !ui.cost ? `<div class="note" role="status">${esc(ui.message)}</div>` : ""}${ui.cost ? costFormHtml(ui.cost, slice.giftProjects, today) : ""}
    ${rows ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Category</th><th>For</th><th class="num">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted">Total: <b>${esc(totalText(costs))}</b>. By category: ${byCategory}.</p>` : `<div class="empty">No costs recorded yet.</div>`}</section>`;
}
