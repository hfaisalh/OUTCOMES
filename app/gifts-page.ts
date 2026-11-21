/**
 * gifts-page.ts
 *
 * What it does: draws the Gifts page (DECISIONS 77): one list, one row for each gift. A gift is a subscription with all its payments, a single payment, a
 * recurring line the CRM did not link, or an excluded payment. A row shows the donor, the item and parts, the plan (paid of planned, units), the dates and plan
 * status, where the gift is allocated, and what needs a look, with the payments inside it to open. Filters, tabs and bulk exclude and restore are as before.
 * Who calls it: app/main.ts. Depends on: Modules 4b and 5 and 6, and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { filterWorkOrders, isFiltering } from "../modules/01c-crm-connector/filter";
import { allocatable, type Commitment } from "../modules/04b-commitments/commitments";
import { giftRows, type GiftRow } from "../modules/04b-commitments/gifts";
import { allocationShape, unitsForCommitment } from "../modules/02-project-rules/categories";
import { perPeriodRule, takesCapacity } from "../modules/05-outcomes/outcomes";
import { categoryName, creditLine, criteriaFor, esc, filterBar, listBase, liveBar, loadCard, MAX_ROWS, metric, ownerCard, picker, type Filter, type View } from "./pages";

const num = (n: number) => String(Math.round(n * 100) / 100);
const TABS: [Filter, string][] = [["all", "All"], ["unrouted", "Unrouted"], ["review", "To review"], ["look", "Needs a look"]];

// Units, from the framework's rule for how an instalment counts (DECISIONS 52, 58). No rule set, no guess.
function unitsCell(g: GiftRow, v: View): string {
  const c: Commitment | undefined = g.commitment;
  if (!c) return "";
  const fw = (v.frameworks ?? []).find((x) => x.id === c.frameworkId);
  if (fw === undefined) return `<span class="muted">${c.categoryId === "" ? "Not in a category" : "No framework chosen for this item or its category"}</span>`;
  const rule = fw.instalment;
  if (rule === undefined) return `<span class="muted">Set how an instalment counts in the framework ${esc(fw.name)}</span>`;
  const u = unitsForCommitment(rule, { parts: c.partsPerInstalment, paid: c.paid, planned: c.planned });
  if (rule === "share_of_whole") return u.target === null ? `<span class="muted">Count unknown</span>` : `${num(u.units)} of ${num(u.target)}${u.complete ? ` <span class="pill ready">Complete, can be delivered</span>` : ` <span class="muted">(whole item not paid yet)</span>`}`;
  // Who the units go to: whole beneficiaries (dedicated) and a shared remainder, from the framework's units per beneficiary.
  const shape = allocationShape(c.partsPerInstalment, fw.unitsPerBeneficiary);
  const who = fw.unitsPerBeneficiary <= 1 ? "" : shape.dedicated > 0 ? `<div class="muted">${shape.dedicated} dedicated ${esc(fw.unit || "beneficiary")}${shape.dedicated === 1 ? "" : "s"}${shape.shared ? ` and ${shape.shared} shared part${shape.shared === 1 ? "" : "s"}` : ""} each month</div>` : `<div class="muted">${shape.shared} of ${fw.unitsPerBeneficiary} parts: shared with other donors</div>`;
  return `${num(u.units)}${u.target === null ? "" : ` of ${num(u.target)}`} <span class="muted">${c.partsPerInstalment === 1 ? "month" : "part-months"}</span>${who}`;
}

// The payments of a gift, as a small table: the lines the CRM sent, each of which can be excluded or restored, or sorted into a category.
function paymentsTable(g: GiftRow, v: View, picked: Set<string>): string {
  const reviewKeys = new Set(v.review.map((r) => r.key));
  return `<table class="subtable"><thead><tr><th></th><th>Reference</th><th>Paid</th><th>Instalment</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>${g.payments.map((w) => `<tr><td><input type="checkbox" data-sel="${esc(w.key)}"${picked.has(w.key) ? " checked" : ""}></td>
    <td>${esc(w.transactionRef) || `<span class="muted">no reference</span>`}<div class="muted">Line ${esc(w.key)}</div></td>
    <td>${w.legacyUpload ? `${esc(w.paidDate.slice(0, 10))} <span class="pill review" title="Uploaded from the old system. This date is the day it was loaded, not the day it was paid.">Legacy upload</span>` : esc(w.paidDate.slice(0, 10))}</td>
    <td>${w.instalmentNumber === "" ? `<span class="muted">One-off</span>` : `${esc(w.instalmentNumber)} of ${esc(w.instalmentCount)}`}</td>
    <td>${w.status === "unrouted" ? picker(v.categories, w.itemId, "") : esc(categoryName(v.categories, w.categoryId))}</td>
    <td>${w.status === "excluded" ? `<span class="pill unrouted">Excluded</span>${w.exclusion ? `<div class="muted">${esc(w.exclusion.reason)}</div>` : ""}` : `<span class="pill ${w.status === "unrouted" ? "unrouted" : "ready"}">${w.status === "unrouted" ? "Unrouted" : "Ready"}</span>`}${reviewKeys.has(w.key) ? ` <span class="pill review">Review</span>` : ""}</td>
    <td>${w.status === "excluded" ? `<button data-excl="${esc(w.key)}" data-excl-action="restore">Restore</button>` : w.status === "unrouted" || w.status === "ready" ? `<button data-excl="${esc(w.key)}" data-excl-action="exclude">Exclude</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
}

// Everything the list needs, worked out once: the gifts after the filters, and where each is allocated.
function listData(v: View) {
  const base = listBase(v, "main");
  const c = criteriaFor(v, "main");
  const payments = filterWorkOrders(base, c);
  let rows = giftRows(payments, v.workOrders, new Set(v.review.map((r) => r.key)));
  if (v.filter === "look") rows = rows.filter((r) => r.needsLook);
  return { base, c, rows };
}

// The payment keys of the gifts the list is showing now, for "tick all".
export function shownGiftKeys(v: View): string[] {
  return listData(v).rows.slice(0, MAX_ROWS).flatMap((r) => r.payments.map((w) => w.key));
}

// The list itself (the part that is redrawn as you type or tick): the count, the bulk bar and the table.
export function giftListHtml(v: View): string {
  const { base, c, rows } = listData(v);
  const shown = rows.slice(0, MAX_ROWS);
  const picked = new Set(v.selected ?? []);
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  // The gifts that hold a place: they are allocated, or waiting for one. Others (no framework, cancelled, fully paid) are not given to a beneficiary.
  const keys = new Set(allocatable(v.workOrders, perPeriodRule(fws), today).filter((c) => takesCapacity(c, fws)).map((x) => x.subscriptionId));
  const outcomeById = new Map((v.outcomes ?? []).map((o) => [o.id, o]));
  const partnerName = (id: string | undefined) => (v.projects ?? []).find((p) => p.id === id)?.name ?? "";
  const allocationOf = new Map((v.allocations ?? []).map((a) => [a.commitmentKey, a]));
  const allTicked = shown.length > 0 && shown.every((g) => g.payments.every((w) => picked.has(w.key)));

  const bulk = `<div class="bulkbar"><span><b>${picked.size}</b> selected</span>
    <button data-bulk="exclude"${picked.size ? "" : " disabled"}>Exclude selected</button><button data-bulk="restore"${picked.size ? "" : " disabled"}>Restore selected</button><button data-bulk="clear"${picked.size ? "" : " disabled"}>Clear selection</button></div>`;
  const note = `${isFiltering(c) ? `<p class="muted">Showing ${rows.length} gift${rows.length === 1 ? "" : "s"} from ${filterWorkOrders(base, c).length} of ${base.length} payments.</p>` : ""}${rows.length > MAX_ROWS ? `<p class="muted">Only the first ${MAX_ROWS} are drawn. Narrow the list with the filter boxes.</p>` : ""}`;
  if (base.length === 0) return `<div class="empty">No gifts in this list.</div>`;

  // Where a gift is allocated: the beneficiary and its partner, or why it is not.
  const allocatedCell = (g: GiftRow): string => {
    if (g.allocationKey === "") return "";
    if (keys.has(g.allocationKey)) {
      const a = allocationOf.get(g.allocationKey);
      const o = a ? outcomeById.get(a.outcomeId) : undefined;
      return o ? `${esc(o.name)}<div class="muted">${esc(partnerName(o.projectId)) || "No partner"}${a && a.parts !== g.parts ? ` · ${a.parts} part${a.parts === 1 ? "" : "s"}` : ""}</div>` : `<span class="pill review">Waiting for a place</span>`;
    }
    return g.frameworkId === "" ? `<span class="muted">No framework yet</span>` : `<span class="muted">Not given to a beneficiary</span>`;
  };
  const typeCell = (g: GiftRow): string => {
    if (g.kind === "one_off") return `One payment${g.periodCount > 0 ? `<div class="muted">covers ${g.periodCount} months</div>` : ""}`;
    if (g.kind === "excluded") return `<span class="muted">Excluded</span>`;
    const progress = `${g.paid} of ${g.planned ?? "ongoing"}${g.planned ? `<div class="bar"><span style="width:${Math.min(100, Math.round((g.paid / g.planned) * 100))}%"></span></div>` : ""}`;
    return `${g.kind === "unlinked" ? "Recurring, no subscription" : "Recurring"}<div>${progress}</div>${g.kind === "recurring" ? `<div>${unitsCell(g, v)}</div>` : ""}`;
  };
  const datesCell = (g: GiftRow): string => `${g.firstPaid ? `${esc(g.firstPaid)}${g.lastPaid && g.lastPaid !== g.firstPaid ? `<div class="muted">to ${esc(g.lastPaid)}</div>` : ""}` : `<span class="muted">none since the load</span>`}${g.nextDue ? `<div class="muted">next due ${esc(g.nextDue)}</div>` : ""}${g.planStatus ? `<div><span class="pill ${g.planStatus === "active" ? "ready" : "review"}">${esc(g.planStatus)}</span></div>` : ""}`;
  const statusCell = (g: GiftRow): string => [
    g.kind === "excluded" ? "" : g.unrouted ? `<span class="pill unrouted">Unrouted</span>` : `<span class="pill ready">Ready</span>`,
    g.inReview ? `<span class="pill review">Review</span>` : "",
    ...g.notes.map((n) => `<span class="pill review"${n.title ? ` title="${esc(n.title)}"` : ""}>${esc(n.text)}</span>`),
    g.needsLook && g.kind === "recurring" ? `<span class="pill review">Needs a look</span>` : "",
  ].filter((x) => x !== "").join(" ");
  const link = (g: GiftRow): string => g.kind !== "unlinked" ? "" : g.suggestions.length === 0 ? `<div class="muted">No commitment for the same supporter and item</div>` : g.suggestions.map((s) => `<div class="muted">Possibly subscription <b>${esc(s.subscriptionId)}</b> (${s.daysApart === null ? "legacy upload, date not comparable" : s.daysApart === 0 ? "same day" : `${Math.abs(s.daysApart)} day${Math.abs(s.daysApart) === 1 ? "" : "s"} ${s.daysApart < 0 ? "before its first instalment" : "after its first instalment"}`})</div>`).join("");

  const row = (g: GiftRow): string => {
    const first = g.payments[0];
    const ticked = g.payments.length > 0 && g.payments.every((w) => picked.has(w.key));
    return `<tr><td><input type="checkbox" data-sel-gift="${esc(g.key)}" data-keys="${esc(g.payments.map((w) => w.key).join(" "))}" title="Tick every payment of this gift"${ticked ? " checked" : ""}></td>
      <td>${esc(g.supporterName)}<div class="muted">${esc(g.supporterId)}${first && first.group ? " · " + esc(first.group) : ""}</div>${first ? creditLine(first) : ""}
        <details><summary>Payments (${g.payments.length})</summary>${paymentsTable(g, v, picked)}</details></td>
      <td>${esc(g.itemName)}<div class="muted">${g.parts} part${g.parts === 1 ? "" : "s"}${first && first.bundleQty && first.bundleQty > 1 && g.kind !== "recurring" ? ` (bundle of ${first.bundleQty}${first.quantity > 1 ? ` x ${first.quantity}` : ""})` : ""}${g.projectName ? ` · ${esc(g.projectName)}` : ""}</div>${g.unrouted && first ? `<div>${picker(v.categories, first.itemId, "")}</div>` : `<div class="muted">${esc(categoryName(v.categories, g.categoryId))}</div>`}</td>
      <td>${typeCell(g)}</td><td>${datesCell(g)}</td><td>${allocatedCell(g)}</td><td>${statusCell(g)}${link(g)}</td></tr>`;
  };
  return `${bulk}${note}${rows.length === 0 ? `<div class="empty">No gifts match the filters.</div>` : `<table class="giftlist"><thead><tr><th><input type="checkbox" data-selall="main" title="Tick all shown"${allTicked ? " checked" : ""}></th><th>Donor</th><th>Item</th><th>Gift</th><th>Dates</th><th>Allocated to</th><th>Status</th></tr></thead><tbody>${shown.map(row).join("")}</tbody></table>`}`;
}

export function giftsPage(v: View): string {
  const live = v.workOrders.filter((w) => w.status !== "excluded");
  const count = (s: string) => v.workOrders.filter((w) => w.status === s).length;
  const all = giftRows(live, v.workOrders, new Set(v.review.map((r) => r.key)));
  const tab = (id: Filter, label: string) => `<button data-filter="${id}" class="${v.filter === id ? "on" : ""}">${label}</button>`;
  const base = listBase(v, "main");
  return `
    <h1>Gifts</h1>
    <p class="sub">Every gift in one list. A subscription is one row with its payments inside it, and a single payment is one row. Gifts arrive from the CRM feed. Only items the CRM marks as needing feedback appear here, so nothing is imported by hand.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(all.length, "Gifts")}${metric(live.length, "Payments")}${metric(count("unrouted"), "Unrouted", count("unrouted") ? "warn" : "")}${metric(all.filter((g) => g.needsLook).length, "Need a look", all.some((g) => g.needsLook) ? "warn" : "")}${metric(v.review.length, "To review", v.review.length ? "warn" : "")}</div>
    ${v.live ? liveBar(v) : ""}
    <div class="actions">
      <button class="primary" data-action="refresh">${v.live ? "Reload" : "Refresh from CRM"}</button>
      ${v.live ? (v.canPickup ? `<button data-action="pickup-now">Run pickup now</button>` : "") : `<button data-action="demo-new">Demo: a new paid line arrives in the CRM</button>
      <button data-action="demo-change">Demo: the CRM changes an amount</button>`}
    </div>
    ${v.live ? "" : ownerCard(v)}
    ${v.live && !v.upload ? "" : loadCard(v)}
    <div class="tabs">${TABS.map(([id, label]) => tab(id, label)).join("")}${tab("excluded", `Excluded (${count("excluded")})`)}</div>
    ${filterBar(v, "main", base)}<div class="card" data-list="main">${giftListHtml(v)}</div>
    ${v.review.length ? `<div class="card"><h2>Held for review</h2><p class="muted">These changed in the CRM after the work order was made. Nothing was changed automatically.</p><table><tbody>${v.review.map((r) => `<tr><td>${esc(r.key)}</td><td>${esc(r.message)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
}

