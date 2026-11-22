/**
 * gifts-page.ts
 *
 * What it does: draws the Gifts page (DECISIONS 77): one list, one row for each gift. A gift is a subscription with all its payments, a single payment, a
 * recurring line the CRM did not link, or an excluded payment. A row shows the donor, the item and parts, the plan (paid of planned, units), the dates and plan
 * status, where the gift is allocated, and what needs a look, with the payments inside it to open. Filters, tabs and bulk exclude and restore are as before.
 * The list is compact (DECISIONS 78): one line per gift, with symbols for what a gift is and what needs attention, and a window (giftDetailHtml) that opens
 * on a click and holds everything else: the plan, the units, the dates, the payments and the notes.
 * Who calls it: app/main.ts. Depends on: Modules 4b and 5 and 6, and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { filterWorkOrders, isFiltering } from "../modules/01c-crm-connector/filter";
import { lineValue } from "../modules/01c-crm-connector/work-orders";
import { plusMonths } from "../modules/04b-commitments/catch-up";
import { allocatable, type Commitment } from "../modules/04b-commitments/commitments";
import { giftRows, type GiftRow } from "../modules/04b-commitments/gifts";
import { allocationShape, unitsForCommitment } from "../modules/02-project-rules/categories";
import { perPeriodRule, takesCapacity } from "../modules/05-outcomes/outcomes";
import { categoryName, creditLine, criteriaFor, esc, filterBar, listBase, liveBar, loadCard, MAX_ROWS, metric, ownerCard, picker, type Filter, type View } from "./pages";

const num = (n: number) => String(Math.round(n * 100) / 100);
// Rule: a value is for reference only (OUTCOMES does not manage money). The CRM feed gives no currency, so none is shown.
const money = (n: number, currency = "") => (Number.isFinite(n) ? `${currency ? currency + " " : ""}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const currencyOf = (g: GiftRow): string => g.payments.find((w) => w.currency)?.currency ?? "";
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

// Units as a row of small pies (DECISIONS 85): one pie for each instalment of the plan, coloured by what has happened to it.
// green = paid, blue = filled by a catch-up payment, orange = upcoming (expected, this month or later), red = missed, grey = a slice that is not this gift's.
// Each pie has a slice for each part of a beneficiary and the gift's own parts are coloured. How the parts are shared out belongs to Allocation, not here.
function unitsVisual(g: GiftRow, v: View): string {
  const c = g.commitment;
  const fw = c ? (v.frameworks ?? []).find((x) => x.id === c.frameworkId) : undefined;
  if (!c || !fw || fw.instalment === undefined) return unitsCell(g, v);
  if (fw.instalment === "share_of_whole") {
    const u = unitsForCommitment(fw.instalment, { parts: c.partsPerInstalment, paid: c.paid, planned: c.planned });
    const pct = u.target ? Math.min(100, Math.round((u.units / u.target) * 100)) : 0;
    return `${u.target ? `<div class="ubar"><span style="width:${pct}%"></span><b>${num(u.units)} / ${num(u.target)}</b></div>` : ""}<div class="muted small">${unitsCell(g, v)}</div>`;
  }
  const now = (v.today ?? "2026-01-01").slice(0, 7);
  const slots = Math.max(1, fw.unitsPerBeneficiary);
  const held = Math.min(slots, Math.max(1, c.partsPerInstalment));
  const start = c.paidMonths[0] ?? now;
  const count = Math.min(24, c.planned ?? Math.max(12, c.paid + 3));
  const paid = new Set(c.paidMonths), caught = new Set(c.catchUpMonths);
  const pie = (cls: string, tip: string): string => {
    const R = 14, C = 2 * Math.PI * R, len = C / slots;
    const arcs = Array.from({ length: slots }, (_, i) => `<circle class="seg ${i < held ? cls : "f"}" cx="18" cy="18" r="${R}" fill="none" stroke-width="9" stroke-dasharray="${slots === 1 ? C : Math.max(len - 2, 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 18 18)"/>`).join("");
    return `<svg class="upie" viewBox="0 0 36 36" width="22" height="22" role="img" aria-label="${esc(tip)}"><title>${esc(tip)}</title>${arcs}</svg>`;
  };
  const pies = Array.from({ length: count }, (_, i) => {
    const m = plusMonths(start, i);
    if (caught.has(m)) return pie("c", `Instalment ${i + 1}, ${m}: filled by a catch-up payment`);
    if (paid.has(m)) return pie("p", `Instalment ${i + 1}, ${m}: paid`);
    if (m < now) return pie("m", `Instalment ${i + 1}, ${m}: missed`);
    // Rule (DECISIONS 85, as in the Allocation month view): orange is expected. A month not paid yet, this month or later, is expected.
    return pie("e", `Instalment ${i + 1}, ${m}: ${m === now ? "due this month" : "upcoming"}`);
  }).join("");
  const key = `<div class="ukey muted"><i class="p"></i>paid <i class="c"></i>catch-up <i class="e"></i>upcoming <i class="m"></i>missed <i class="f"></i>not this gift\u2019s parts</div>`;
  return `<div class="upies">${pies}</div>${key}`;
}

// The payments of a gift, as a small table: the lines the CRM sent, each of which can be excluded or restored, or sorted into a category.
function paymentsTable(g: GiftRow, v: View): string {
  const reviewKeys = new Set(v.review.map((r) => r.key));
  return `<table class="subtable"><thead><tr><th>Reference</th><th>Paid</th><th>Instalment</th><th>Covers</th><th>Value</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>${g.payments.map((w) => `<tr><td>${esc(w.transactionRef) || `<span class="muted">no reference</span>`}<div class="muted">Line ${esc(w.key)}</div></td>
    <td>${w.legacyUpload ? `${esc(w.paidDate.slice(0, 10))} <span class="pill review" title="Uploaded from the old system. This date is the day it was loaded, not the day it was paid.">Legacy upload</span>` : esc(w.paidDate.slice(0, 10))}</td>
    <td>${w.instalmentNumber === "" ? `<span class="muted">One-off</span>` : `${esc(w.instalmentNumber)} of ${esc(w.instalmentCount)}`}</td>
    <td>${w.status === "unrouted" || w.status === "ready" ? `<select data-covers-key="${esc(w.key)}" title="How many instalments this payment covers">${[1, 2, 3, 4].map((n) => `<option value="${n}"${(w.covers ?? 1) === n ? " selected" : ""}>${n}</option>`).join("")}</select>${w.covers && w.covers > 1 ? ` <span class="pill review" title="A person marked this as a catch-up payment">catch-up</span>` : ""}` : `<span class="muted">${w.covers ?? 1}</span>`}</td>
    <td class="num">${money(lineValue(w), w.currency)}</td>
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

// Everything about where gifts are allocated, worked out once for the list and for the window.
function allocationContext(v: View) {
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  // The gifts that hold a place: they are allocated, or waiting for one. Others (no framework, cancelled, fully paid) are not given to a beneficiary.
  const keys = new Set(allocatable(v.workOrders, perPeriodRule(fws), today).filter((c) => takesCapacity(c, fws)).map((x) => x.subscriptionId));
  const outcomeById = new Map((v.outcomes ?? []).map((o) => [o.id, o]));
  const allocationOf = new Map((v.allocations ?? []).map((a) => [a.commitmentKey, a]));
  const partnerName = (id: string | undefined) => (v.projects ?? []).find((p) => p.id === id)?.name ?? "";
  // Where a gift is allocated: the beneficiary and its partner, or why it is not.
  return (g: GiftRow): { state: "placed" | "waiting" | "none" | "n/a"; who: string; partner: string; parts: number | null; why: string } => {
    if (g.allocationKey === "") return { state: "n/a", who: "", partner: "", parts: null, why: "" };
    if (keys.has(g.allocationKey)) {
      const a = allocationOf.get(g.allocationKey);
      const o = a ? outcomeById.get(a.outcomeId) : undefined;
      return o ? { state: "placed", who: o.name, partner: partnerName(o.projectId) || "No partner", parts: a && a.parts !== g.parts ? a.parts : null, why: "" } : { state: "waiting", who: "", partner: "", parts: null, why: "Waiting for a place" };
    }
    return { state: "none", who: "", partner: "", parts: null, why: g.frameworkId === "" ? "No framework yet" : "Not given to a beneficiary" };
  };
}

// Symbols (DECISIONS 78). Each has a plain-words tooltip, and the window says it all in words.
const SYMBOL = { recurring: "\u21BB", one: "\u2460", unlinked: "\u21BB?", excluded: "\u26D4", ok: "\u2714", unrouted: "\u2298", look: "\u26A0", review: "\u2691", waiting: "\u23F3", info: "\u24D8" };
const icon = (cls: string, glyph: string, tip: string) => `<span class="gi ${cls}" title="${esc(tip)}" aria-label="${esc(tip)}">${glyph}</span>`;
const PLAN_ICON: Record<string, [string, string]> = { paused: ["\u23F8", "Plan paused"], cancelled: ["\u2715", "Plan cancelled"], past_due: ["\u23F0", "Plan past due"], pending: ["\u2026", "Plan pending"], completed: ["\u25A0", "Plan completed"] };

const kindIcon = (g: GiftRow): string =>
  g.kind === "recurring" ? icon("rec", SYMBOL.recurring, "Recurring gift")
  : g.kind === "unlinked" ? icon("rec warn", SYMBOL.unlinked, "Recurring, but the CRM did not link it to a subscription")
  : g.kind === "excluded" ? icon("off", SYMBOL.excluded, "Excluded payment")
  : icon("one", SYMBOL.one, "One payment");

// The status symbols of one gift: only what is not normal is shown, so a clean row has just a tick.
function statusIcons(g: GiftRow): string {
  if (g.kind === "excluded") return "";
  const out: string[] = [];
  if (g.unrouted) out.push(icon("warn", SYMBOL.unrouted, "Unrouted: choose its category"));
  if (g.inReview) out.push(icon("warn", SYMBOL.review, "Held for review: it changed in the CRM"));
  if (g.needsLook) out.push(icon("warn", SYMBOL.look, g.notes.filter((n) => !n.resolved).map((n) => n.text).join(". ") || "Needs a look"));
  const p = PLAN_ICON[g.planStatus];
  if (p) out.push(icon("muted", p[0], p[1]));
  return out.length > 0 ? out.join("") : icon("good", SYMBOL.ok, g.notes.some((n) => n.resolved) ? "Ready. What needed a look is resolved." : "Ready");
}

// The list itself (the part that is redrawn as you type or tick): the count, the bulk bar, the key to the symbols and the table.
export function giftListHtml(v: View): string {
  const { base, c, rows } = listData(v);
  const shown = rows.slice(0, MAX_ROWS);
  const picked = new Set(v.selected ?? []);
  const where = allocationContext(v);
  const allTicked = shown.length > 0 && shown.every((g) => g.payments.every((w) => picked.has(w.key)));

  const bulk = `<div class="bulkbar"><span><b>${picked.size}</b> selected</span>
    <button data-bulk="exclude"${picked.size ? "" : " disabled"}>Exclude selected</button><button data-bulk="restore"${picked.size ? "" : " disabled"}>Restore selected</button><button data-bulk="clear"${picked.size ? "" : " disabled"}>Clear selection</button></div>`;
  const note = `${isFiltering(c) ? `<p class="muted">Showing ${rows.length} gift${rows.length === 1 ? "" : "s"} from ${filterWorkOrders(base, c).length} of ${base.length} payments.</p>` : ""}${rows.length > MAX_ROWS ? `<p class="muted">Only the first ${MAX_ROWS} are drawn. Narrow the list with the filter boxes.</p>` : ""}`;
  if (base.length === 0) return `<div class="empty">No gifts in this list.</div>`;
  const key = `<p class="symbolkey muted">${SYMBOL.recurring} recurring &nbsp; ${SYMBOL.one} one payment &nbsp; ${SYMBOL.waiting} waiting for a place &nbsp; ${SYMBOL.ok} ready &nbsp; ${SYMBOL.look} needs a look &nbsp; ${SYMBOL.review} held for review &nbsp; ${SYMBOL.unrouted} unrouted &nbsp; ${SYMBOL.excluded} excluded &nbsp; Click a row for the details.</p>`;

  // Rule: the plan column is the short form: paid/planned for a subscription, the months covered for a single payment.
  const planCell = (g: GiftRow): string => {
    if (g.kind === "excluded") return "";
    if (g.kind === "one_off") return g.periodCount > 1 ? `${g.periodCount} mo` : "";
    const pct = g.planned ? Math.min(100, Math.round((g.paid / g.planned) * 100)) : 0;
    return `${g.paid}/${g.planned ?? "\u221E"}${g.planned ? `<div class="bar"><span style="width:${pct}%"></span></div>` : ""}`;
  };
  const allocCell = (g: GiftRow): string => {
    const a = where(g);
    if (a.state === "placed") return `<span title="${esc(a.who)} at ${esc(a.partner)}">${esc(a.who)} <span class="muted">${esc(a.partner)}</span></span>`;
    if (a.state === "waiting") return icon("warn", SYMBOL.waiting, "Waiting for a place");
    return a.state === "none" ? `<span class="muted" title="${esc(a.why)}">\u2013</span>` : "";
  };

  const row = (g: GiftRow): string => {
    const first = g.payments[0];
    const ticked = g.payments.length > 0 && g.payments.every((w) => picked.has(w.key));
    const paid = g.kind === "excluded" ? (g.payments[0]?.paidDate ?? "").slice(0, 10) : g.lastPaid || g.firstPaid;
    const reason = g.kind === "excluded" ? g.payments[0]?.exclusion?.reason ?? "" : "";
    return `<tr class="grow${g.kind === "excluded" ? " off" : ""}" data-gift-open="${esc(g.key)}"><td><input type="checkbox" data-sel-gift="${esc(g.key)}" data-keys="${esc(g.payments.map((w) => w.key).join(" "))}" title="Tick every payment of this gift"${ticked ? " checked" : ""}></td>
      <td class="c">${kindIcon(g)}</td>
      <td class="num muted">${g.kind === "recurring" ? esc(g.key) : ""}</td>
      <td class="clip" title="${esc(g.supporterName)} ${esc(g.supporterId)}">${esc(g.supporterName)} <span class="muted">${esc(g.supporterId)}</span></td>
      <td class="clip" title="${esc(g.itemName)}">${esc(g.itemName)}${g.parts > 1 ? ` <span class="muted">\u00D7${g.parts}</span>` : ""}${g.unrouted && first ? ` ${picker(v.categories, first.itemId, "")}` : ""}</td>
      <td class="num">${planCell(g)}</td>
      <td class="num muted" title="Total of its payments, for reference">${money(g.payments.reduce((t, w) => t + (Number.isFinite(lineValue(w)) ? lineValue(w) : 0), 0), currencyOf(g))}</td>
      <td class="num">${esc(paid)}</td>
      <td class="num muted">${esc(g.nextDue)}</td>
      <td class="clip">${allocCell(g)}</td>
      <td class="c st">${statusIcons(g)}${g.kind === "excluded" && first ? `<button data-excl="${esc(first.key)}" data-excl-action="restore" title="${esc(reason || "Excluded")}">Restore</button>` : ""}</td>
      <td class="c"><button class="gi-open" data-gift-open="${esc(g.key)}" title="Open the details" aria-label="Open the details">${SYMBOL.info}</button></td></tr>`;
  };
  return `${bulk}${note}${rows.length === 0 ? `<div class="empty">No gifts match the filters.</div>` : `${key}<div class="tablewrap"><table class="giftlist"><thead><tr><th><input type="checkbox" data-selall="main" title="Tick all shown"${allTicked ? " checked" : ""}></th><th></th><th>Rec. ID</th><th>Donor</th><th>Item</th><th>Plan</th><th>Value</th><th>Paid</th><th>Next</th><th>Allocated to</th><th>Status</th><th></th></tr></thead><tbody>${shown.map(row).join("")}</tbody></table></div>`}`;
}

// The window for one gift: everything the list leaves out (DECISIONS 78). Returns "" when the gift is not in the data, so the caller closes the window.
export function giftDetailHtml(v: View, giftKey: string): string {
  const g = giftRows(v.workOrders, v.workOrders, new Set(v.review.map((r) => r.key))).find((r) => r.key === giftKey);
  if (!g) return "";
  const first = g.payments[0];
  const a = allocationContext(v)(g);
  const kindName = g.kind === "recurring" ? "Recurring gift" : g.kind === "unlinked" ? "Recurring payment the CRM did not link to a subscription" : g.kind === "excluded" ? "Excluded payment" : "One payment";
  const row = (label: string, value: string, wide = false) => value === "" ? "" : `<div class="f${wide ? " w" : ""}"><span>${label}</span><div>${value}</div></div>`;
  const progress = g.kind === "recurring" || g.kind === "unlinked" ? `${g.paid} of ${g.planned ?? "ongoing"}${g.planned ? `<div class="bar"><span style="width:${Math.min(100, Math.round((g.paid / g.planned) * 100))}%"></span></div>` : ""}` : g.periodCount > 0 ? `covers ${g.periodCount} month${g.periodCount === 1 ? "" : "s"}` : "";
  const allocation = a.state === "placed" ? `${esc(a.who)}<div class="muted">${esc(a.partner)}${a.parts !== null ? ` · ${a.parts} part${a.parts === 1 ? "" : "s"}` : ""}</div>` : a.state === "waiting" ? `<span class="pill review">Waiting for a place</span>` : a.why ? `<span class="muted">${esc(a.why)}</span>` : "";
  const status = [
    g.kind === "excluded" ? "" : g.unrouted ? `<span class="pill unrouted">Unrouted</span>` : `<span class="pill ready">Ready</span>`,
    g.inReview ? `<span class="pill review">Review</span>` : "",
    ...g.notes.map((n) => n.resolved ? `<span class="pill done" title="${esc(n.title ?? (g.checked ? "Checked by a person" : "Resolved"))}"><s>${esc(n.text)}</s> resolved</span>` : `<span class="pill review"${n.title ? ` title="${esc(n.title)}"` : ""}>${esc(n.text)}</span>`),
  ].filter((x) => x !== "").join(" ");
  const first0 = g.payments.find((w) => w.legacyUpload !== true) ?? g.payments[0];
  // A person can say they have checked what the notes say. It holds until the notes change.
  const checkBtn = !first0 || g.kind !== "recurring" ? "" : g.checked ? `<button data-looked="${esc(first0.key)}" data-text="">Reopen</button>` : g.lookSignature !== "" && g.needsLook ? `<button data-looked="${esc(first0.key)}" data-text="${esc(g.lookSignature)}" title="Use this when you have looked at it and it is fine as it is, for example when the CRM data is wrong and is being fixed there.">Mark as checked</button>` : "";
  const link = g.kind !== "unlinked" ? "" : g.suggestions.length === 0 ? `<div class="muted">No commitment for the same supporter and item</div>` : g.suggestions.map((s) => `<div class="muted">Possibly subscription <b>${esc(s.subscriptionId)}</b> (${s.daysApart === null ? "legacy upload, date not comparable" : s.daysApart === 0 ? "same day" : `${Math.abs(s.daysApart)} day${Math.abs(s.daysApart) === 1 ? "" : "s"} ${s.daysApart < 0 ? "before its first instalment" : "after its first instalment"}`})</div>`).join("");
  // The suggestion for a payment that looks like a catch-up: what it would cover, with one click to agree or to say it is normal.
  const monthName = (m: string) => m;
  const catchUp = g.catchUps.map((x) => `<div class="suggest-box"><b>Possible catch-up payment.</b> ${esc(x.reason)}. If it covers ${x.covers} instalments, it also fills ${x.fills.map(monthName).map(esc).join(", ")}.
      <div class="actions"><button class="primary" data-covers-set="${esc(x.key)}" data-n="${x.covers}">Yes, it covers ${x.covers}</button><button data-covers-set="${esc(x.key)}" data-n="1">No, it is a normal payment</button></div></div>`).join("");
  return `<div class="pf-overlay" data-gift-close="overlay"><div class="pf-box" role="dialog" aria-label="Gift details">
    <header><h2>${esc(g.supporterName)} <span class="muted">${esc(g.itemName)}</span></h2><button data-gift-close="x" aria-label="Close">Close</button></header>
    <div class="pf-body compact">${catchUp}<div class="fgrid">
        ${row("Donor", `${esc(g.supporterName)} <span class="muted">${esc(g.supporterId)}</span>${first && first.group ? ` <span class="muted">· ${esc(first.group)}</span>` : ""}`)}
        ${row("Item", `${esc(g.itemName)}${g.parts > 1 ? ` <span class="muted">\u00D7${g.parts}</span>` : ""}${g.unrouted && first ? ` ${picker(v.categories, first.itemId, "")}` : `<div class="muted">${esc(categoryName(v.categories, g.categoryId))}${first && first.bundleQty && first.bundleQty > 1 && g.kind !== "recurring" ? ` \u00B7 bundle of ${first.bundleQty}${first.quantity > 1 ? ` x ${first.quantity}` : ""}` : ""}</div>`}`)}
        ${row("Type", esc(kindName))}
        ${row("Recurring ID", g.kind === "recurring" ? `<b>${esc(g.key)}</b>` : "")}
        ${row("Value (reference)", money(g.payments.reduce((t, w) => t + (Number.isFinite(lineValue(w)) ? lineValue(w) : 0), 0), currencyOf(g)))}
        ${row("Paid", progress)}
        ${row("Dates", `${esc(g.firstPaid)}${g.lastPaid && g.lastPaid !== g.firstPaid ? ` \u2192 ${esc(g.lastPaid)}` : ""}${g.nextDue ? `<div class="muted">next due ${esc(g.nextDue)}</div>` : ""}`)}
        ${row("Plan status", g.planStatus ? `<span class="pill ${g.planStatus === "active" ? "ready" : "review"}">${esc(g.planStatus)}</span>` : "")}
        ${row("Project chosen", esc(g.projectName))}
        ${row("Units", g.kind === "recurring" ? unitsVisual(g, v) : "", true)}
        ${row("Allocated to", allocation)}
        ${row("Status", `${status}${checkBtn ? `<div class="actions">${checkBtn}</div>` : ""}`)}
        ${first ? row("Credit", creditLine(first), true) : ""}
        ${row("Could belong to", link, true)}
      </div>
      <section><h3>Payments (${g.payments.length})</h3>${paymentsTable(g, v)}</section>
    </div></div></div>`;
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

