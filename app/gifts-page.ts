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
import { lineValue, partsOf, periodsOf, sentPartsOf, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { shortDate, shortDateTime } from "./dates";
import { iconHtml, itemIcon } from "./icons";
import { plusMonths } from "../modules/04b-commitments/catch-up";
import { allocatable, type Commitment } from "../modules/04b-commitments/commitments";
import { giftRows, type GiftRow } from "../modules/04b-commitments/gifts";
import { giftStage, STAGE_TITLES, type StageResult } from "../modules/04b-commitments/stage";
import { allocationShape, unitsForCommitment } from "../modules/02-project-rules/categories";
import { perPeriodRule, takesCapacity } from "../modules/05-outcomes/outcomes";
import { creditLine, criteriaFor, esc, filterBar, listBase, MAX_ROWS, metric, workflowPicker, type Filter, type View } from "./pages";

const num = (n: number) => String(Math.round(n * 100) / 100);
// Rule: a value is for reference only (OUTCOMES does not manage money). The CRM feed gives no currency, so none is shown.
const SYMBOLS: Record<string, string> = { GBP: "\u00A3", USD: "$", EUR: "\u20AC", CAD: "CA$", AUD: "A$", INR: "\u20B9", PKR: "Rs ", BDT: "\u09F3", AED: "AED ", SAR: "SAR ", ZAR: "R" };
// Rule (DECISIONS 95, 96): whole amounts have no decimals (70), others keep two (17.50). A value is shown with its currency symbol (GBP gives a pound sign), or the code when there is no symbol on file. Blank when the feed gave no currency.
const money = (n: number, currency = ""): string => (Number.isFinite(n) ? `${SYMBOLS[currency] ?? (currency ? currency + " " : "")}${n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : "");
const currencyOf = (g: GiftRow): string => g.payments.find((w) => w.currency)?.currency ?? "";
const TABS: [Filter, string][] = [["all", "All"], ["unrouted", "Unrouted"], ["review", "To review"], ["look", "Needs a look"], ["manual", "Manual"]];

// Units, from the framework's rule for how an instalment counts (DECISIONS 52, 58). No rule set, no guess.
function unitsCell(g: GiftRow, v: View): string {
  const c: Commitment | undefined = g.commitment;
  if (!c) return "";
  const fw = (v.frameworks ?? []).find((x) => x.id === c.frameworkId);
  if (fw === undefined) return `<span class="muted">No workflow chosen for this item</span>`;
  const rule = fw.instalment;
  if (rule === undefined) return `<span class="muted">Set how an instalment counts in the workflow ${esc(fw.name)}</span>`;
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
  const stopped = g.planStatus === "paused" || g.planStatus === "cancelled";
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
    // Rule: while a plan is paused or cancelled, the months after the last payment are not expected, so they are not missed.
    if (stopped && m > (c.paidMonths[c.paidMonths.length - 1] ?? "")) return pie("u", `Instalment ${i + 1}, ${m}: plan ${g.planStatus}, nothing expected`);
    if (m < now) return pie("m", `Instalment ${i + 1}, ${m}: missed`);
    // Rule (DECISIONS 85, as in the Allocation month view): orange is expected. A month not paid yet, this month or later, is expected.
    return pie("e", `Instalment ${i + 1}, ${m}: ${m === now ? "due this month" : "upcoming"}`);
  }).join("");
  const key = `<div class="ukey muted"><i class="p"></i>paid <i class="c"></i>catch-up <i class="e"></i>upcoming <i class="m"></i>missed <i class="f"></i>not this gift\u2019s units</div>`;
  return `<div class="upies">${pies}</div>${key}`;
}

// A small calendar icon on a payment opens a choice of how many months it pays for, with a tick to save and an undo to go back (DECISIONS 118). It is out of the way
// until needed, since most payments pay for one month.
const ICON_CAL = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>`;
const ICON_TICK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const ICON_UNDO = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg>`;
function monthsControl(w: WorkOrder): string {
  if (w.legacyUpload || (w.status !== "unrouted" && w.status !== "ready")) return "";
  // A one-off payment says how many months it covers (a year paid at once is 12). A subscription payment says how many instalments it pays for (a catch-up) (DECISIONS 126).
  const oneOff = w.subscriptionId === "" && w.instalmentCount === "";
  const cur = oneOff ? periodsOf(w) : w.covers ?? 1;
  const choices = oneOff ? [...new Set([1, 2, 3, 6, 12, 18, 24, cur])].sort((x, y) => x - y) : [1, 2, 3, 4];
  const undo = oneOff ? (w.periodsFixed !== undefined ? `<button class="iconact" data-periods-set="${esc(w.key)}" data-n="0" title="Back to what the CRM says" aria-label="Back to what the CRM says">${ICON_UNDO}</button>` : "") : (cur > 1 ? `<button class="iconact" data-covers-set="${esc(w.key)}" data-n="1" title="Back to one month" aria-label="Back to one month">${ICON_UNDO}</button>` : "");
  const title = oneOff ? "Months this one payment pays for" : "Months this payment pays for";
  return `<details class="mo"><summary class="iconact sm" title="${title}" aria-label="${title}">${ICON_CAL}</summary>
    <div class="mo-pop"><select id="pm-select-${esc(w.key)}" aria-label="${title}">${choices.map((n) => `<option value="${n}"${cur === n ? " selected" : ""}>${n} month${n === 1 ? "" : "s"}</option>`).join("")}</select>
      <button class="iconact ok" data-${oneOff ? "periods" : "months"}-save="${esc(w.key)}" title="Save" aria-label="Save the months">${ICON_TICK}</button>${undo}</div></details>`;
}

// The payments of a gift (DECISIONS 120): one line each, with icons and only what matters. A green circle is ready, a hand is a manual or custom amount,
// the archive box is a legacy record, and small icon buttons change the months or exclude. The line number is in the tooltip of the reference.
const ICON_X = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>`;
const ICON_ARCHIVE = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/></svg>`;
function paymentsTable(g: GiftRow, v: View): string {
  const reviewKeys = new Set(v.review.map((r) => r.key));
  const row = (w: WorkOrder): string => {
    const state = w.status === "excluded" ? `<span class="gi off" title="Excluded${w.exclusion ? `: ${esc(w.exclusion.reason)}` : ""}">${SYMBOL.excluded}</span>`
      : w.status === "unrouted" ? `<span class="gi warn" title="Unrouted: choose its workflow">${SYMBOL.unrouted}</span>`
      : `<span class="dotok" title="Ready" aria-label="Ready"></span>`;
    const hand = w.legacyUpload ? "" : w.partsFixed !== undefined ? `<span class="gi manual" title="Units set manually. The CRM says ${sentPartsOf(w)}.">${SYMBOL.manual}</span>` : w.partsManual !== undefined ? `<span class="gi manual" title="${esc(w.partsManual)}">${SYMBOL.manual}</span>` : "";
    const legacy = w.legacyUpload ? `<span class="legacyico" title="Uploaded from the old system. This date is the day it was loaded, not the day it was paid.">${ICON_ARCHIVE}</span>` : "";
    const inst = w.instalmentNumber === "" ? `<span class="muted">one-off${periodsOf(w) > 1 ? ` \u00B7 ${periodsOf(w)} months` : ""}</span>` : `${esc(w.instalmentNumber)} of ${countText(w.instalmentCount)}`;
    const catchUp = w.covers && w.covers > 1 ? ` <span class="pill blue" title="One payment that pays for ${w.covers} months. The months it fills are blue in the circles.">\u00D7${w.covers} months</span>` : "";
    // Each button has its own narrow column, so they line up row after row (DECISIONS 123).
    const restorable = w.status === "excluded";
    const editable = w.status === "unrouted" || w.status === "ready";
    const monthsCell = editable ? monthsControl(w) : "";
    const lastCell = restorable ? `<button class="iconact" data-excl="${esc(w.key)}" data-excl-action="restore" title="Restore" aria-label="Restore">${ICON_UNDO}</button>`
      : editable ? `<button class="iconact" data-excl="${esc(w.key)}" data-excl-action="exclude" title="Exclude this payment" aria-label="Exclude this payment">${ICON_X}</button>` : "";
    return `<tr class="pay"><td class="c">${state}${reviewKeys.has(w.key) ? ` <span class="gi warn" title="Held for review">${SYMBOL.review}</span>` : ""}</td>
      <td title="Line ${esc(w.key)}">${esc(w.transactionRef) || `<span class="muted">no reference</span>`}${w.status === "unrouted" ? ` ${workflowPicker(v, w.itemId)}` : ""}</td>
      <td class="date" title="${esc(w.paidDate.slice(0, 10))}"><span class="cellstart">${esc(shortDate(w.paidDate))}${legacy}</span></td>
      <td>${inst}${catchUp}</td>
      <td class="num"><span class="cellend">${w.legacyUpload ? `<span class="muted">\u2013</span>` : partsOf(w)}${hand}</span></td>
      <td class="num">${money(lineValue(w), w.currency)}</td>
      <td class="actcol"><div class="actbox">${monthsCell}</div></td>
      <td class="actcol"><div class="actbox">${lastCell}</div></td></tr>`;
  };
  return `<div class="paywrap"><table class="subtable"><thead><tr><th class="c"></th><th>Reference</th><th>Paid</th><th>Instalment</th><th class="num">Units</th><th class="num">Value</th><th class="actcol"></th><th class="actcol"></th></tr></thead><tbody>${g.payments.map(row).join("")}</tbody></table></div>`;
}

// Everything the list needs, worked out once: the gifts after the filters, and where each is allocated.
function listData(v: View) {
  const base = listBase(v, "main");
  const c = criteriaFor(v, "main");
  const payments = filterWorkOrders(base, c);
  let rows = giftRows(payments, v.workOrders, new Set(v.review.map((r) => r.key)));
  if (v.filter === "look") rows = rows.filter((r) => r.needsLook);
  if (v.filter === "manual") rows = rows.filter((r) => r.manual !== "");
  return { base, c, rows };
}

// The payment keys of the gifts the list is showing now, for "tick all".
export function shownGiftKeys(v: View): string[] {
  return listData(v).rows.slice(0, MAX_ROWS).flatMap((r) => r.payments.map((w) => w.key));
}

// Rule (DECISIONS 108): the project the donor chose in the CRM. A gift with no project (blank, or the CRM's Where Needed Most) is shown quietly. It is not a general fund: it is for its own item (DECISIONS 157).
export { shortDate };

// Rule (DECISIONS 119): a plan with no end is shown as the infinity sign, with the words in a tooltip.
const INFINITY = `<span class="inf" title="Continues until cancelled" aria-label="Continues until cancelled">\u221E</span>`;
const countText = (count: string): string => (/indefinite/i.test(count) || count === "" ? INFINITY : esc(count));
const projectCell = (name: string, cause = ""): string => {
  const general = name === "" || /^where needed most$/i.test(name.trim());
  if (!general) return esc(name);
  // A gift with no project shows its cause instead (Water for All, Orphan Care), quietly. With no cause either, a dash.
  // When the cause itself is Where Most Needed, it says No project, since the item still says what the gift is for.
  if (/^where (most|needed)/i.test(cause.trim())) return `<span class="muted" title="${esc(cause)}. No project was chosen: the gift is for its item">No project</span>`;
  return cause ? `<span class="muted">${esc(cause)}</span>` : `<span class="muted">\u2013</span>`;
};

// The icon of a gift's item (DECISIONS 107): the one chosen, else a suggestion from its name, else its outcome type's icon.
const giftIcon = (v: View, g: GiftRow, size: "sm" | "lg" = "sm"): string => iconHtml(itemIcon(g.itemId, g.itemName, v.itemIcons, (v.outcomeTypes ?? []).find((t) => g.frameworkId !== "" && t.frameworkIds.includes(g.frameworkId))?.icon ?? ""), g.itemName, size);

// Everything about where gifts are allocated, worked out once for the list and for the window.
// Rule (DECISIONS 141): the stage of a gift's workflow it is in now, shown as a small pill with the reason in its tooltip. Excluded payments have none.
function stageFor(v: View, g: GiftRow, a: { state: "placed" | "waiting" | "manual" | "none" | "n/a"; who: string; partner: string }): StageResult {
  const fw = (v.frameworks ?? []).find((f) => f.id === g.frameworkId);
  return giftStage({ kind: g.kind, hasWorkflow: g.frameworkId !== "" && !g.unrouted, holdUntilPaid: fw?.instalment === "share_of_whole", planStatus: g.planStatus, paid: g.paid, planned: g.planned, placement: a.state, assignedTo: a.state === "waiting" ? a.partner : "", where: a.state === "placed" ? `${a.who} at ${a.partner}` : "" });
}
const stagePill = (r: StageResult): string => (r.stage === null ? "" : `<span class="pill stage st-${r.stage}" title="${esc(r.note || STAGE_TITLES[r.stage])}">${esc(STAGE_TITLES[r.stage])}</span>`);

function allocationContext(v: View) {
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  // The gifts that take a beneficiary place now. Every gift needs allocation, but only these can be allocated to a beneficiary yet (sponsorships first, other kinds later).
  const keys = new Set(allocatable(v.workOrders, perPeriodRule(fws), today).filter((c) => takesCapacity(c, fws)).map((x) => x.subscriptionId));
  const outcomeById = new Map((v.outcomes ?? []).map((o) => [o.id, o]));
  const allocationOf = new Map((v.allocations ?? []).map((a) => [a.commitmentKey, a]));
  const partnerName = (id: string | undefined) => (v.projects ?? []).find((p) => p.id === id)?.name ?? "";
  // Where a gift is allocated: the beneficiary and its partner, or why it is not.
  // Rule (DECISIONS 113): a gift marked manual (a custom amount, or marked by a person) is not waiting for the system. A person allocates it.
  const waits = (g: GiftRow, why: string) => (g.manual !== "" ? { state: "manual" as const, who: "", partner: "", parts: null, why: g.manual } : { state: "waiting" as const, who: "", partner: "", parts: null, why });
  // Rule (DECISIONS 176): where a gift stands now is read from Assignment and Placement first. A recurring gift is kept under "sub:" and its subscription id, a one-off under its line id.
  const assigned = new Map((v.assignments?.records ?? []).map((a) => [a.key, a]));
  const placed = new Map((v.placements?.records ?? []).map((p) => [p.key, p]));
  const enrolled = new Map((v.enrolments?.records ?? []).map((e) => [e.id, e]));
  const personName = (id: string): string => (v.beneficiaries?.records ?? []).find((b) => b.id === id)?.name ?? id;
  const newKey = (g: GiftRow): string => (g.kind === "recurring" ? `sub:${g.key}` : g.kind === "one_off" ? g.payments[0]?.key ?? "" : "");
  return (g: GiftRow): { state: "placed" | "waiting" | "manual" | "none" | "n/a"; who: string; partner: string; parts: number | null; why: string; ref?: string; allocRef?: string } => {
    const nk = newKey(g);
    const asg = nk !== "" ? assigned.get(nk) : undefined;
    const plc = nk !== "" ? placed.get(nk) : undefined;
    if (asg && plc) return { state: "placed", who: plc.kind === "outcome" ? plc.outcomeRef : personName(enrolled.get(plc.enrolmentId)?.beneficiaryId ?? ""), partner: partnerName(asg.partnerId) || "No partner", parts: null, why: "" };
    if (asg) return { state: "waiting", who: "", partner: partnerName(asg.partnerId) || "A partner", parts: null, why: `Assigned to ${partnerName(asg.partnerId) || "a partner"}, waiting for a place` };
    if (g.allocationKey === "") return { state: "n/a", who: "", partner: "", parts: null, why: "" };
    if (keys.has(g.allocationKey)) {
      const a = allocationOf.get(g.allocationKey);
      const o = a ? outcomeById.get(a.outcomeId) : undefined;
      return o ? { state: "placed", who: o.name, partner: partnerName(o.projectId) || "No partner", parts: a && a.parts !== g.parts ? a.parts : null, why: "", ref: o.ref ?? "", allocRef: a?.ref ?? "" } : waits(g, g.planStatus === "paused" ? "Plan paused, parked until payments resume" : "");
    }
    // Rule (DECISIONS 98): every gift needs an allocation. One that cannot be allocated yet is waiting, with the reason, except a cancelled plan, which needs none.
    // Rule (DECISIONS 102): a paused plan stays parked and says so. A cancelled one is parked as cancelled, and can be excluded manually until the donor pays again.
    if (g.planStatus === "paused") return waits(g, "Plan paused, parked until payments resume");
    if (g.planStatus === "cancelled") return { state: "none", who: "", partner: "", parts: null, why: "Plan cancelled, parked. Exclude it manually if it is not coming back" };
    return waits(g, g.frameworkId === "" ? "It needs a workflow first" : "Not allocated yet. Allocation for this kind of gift is built later");
  };
}

// Symbols (DECISIONS 78). Each has a plain-words tooltip, and the window says it all in words.
const SYMBOL = { manual: "\u270B", recurring: "\u21BB", one: "\u2460", unlinked: "\u21BB?", excluded: "\u26D4", ok: "\u2714", unrouted: "\u2298", look: "\u26A0", review: "\u2691", waiting: "\u23F3", info: "\u24D8" };
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
  if (g.unrouted) out.push(icon("warn", SYMBOL.unrouted, "Unrouted: choose its workflow"));
  if (g.inReview) out.push(icon("warn", SYMBOL.review, "Held for review: it changed in the CRM"));
  if (g.needsLook) out.push(icon("warn", SYMBOL.look, g.notes.filter((n) => !n.resolved).map((n) => n.text).join(". ") || "Needs a look"));
  const p = PLAN_ICON[g.planStatus];
  if (p) out.push(icon("muted", p[0], p[1]));
  // An orange tick means a person changed something manually, so the gift may no longer match the CRM exactly (DECISIONS 88).
  if (out.length === 0 && g.adjustments.length > 0) return icon("manual", SYMBOL.ok, `Ready, with manual changes that the CRM does not know about: ${g.adjustments.join("; ")}`);
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
  const key = `<p class="symbolkey muted">${SYMBOL.recurring} recurring &nbsp; ${SYMBOL.one} one payment &nbsp; ${SYMBOL.manual} allocate manually &nbsp; ${SYMBOL.waiting} waiting for allocation &nbsp; ${SYMBOL.ok} ready &nbsp; ${SYMBOL.look} needs a look &nbsp; ${SYMBOL.review} held for review &nbsp; ${SYMBOL.unrouted} unrouted &nbsp; ${SYMBOL.excluded} excluded &nbsp; Click a row for its details.</p>`;

  // Rule: the plan column is the short form: paid/planned for a subscription, the months covered for a single payment.
  const planCell = (g: GiftRow): string => {
    if (g.kind === "excluded") return "";
    if (g.kind === "one_off") return g.periodCount > 1 ? `${g.periodCount} mo` : "";
    const pct = g.planned ? Math.min(100, Math.round((g.paid / g.planned) * 100)) : 0;
    return `${g.paid}/${g.planned ?? "\u221E"}${g.planned ? `<div class="bar"><span style="width:${pct}%"></span></div>` : ""}`;
  };
  const allocCell = (g: GiftRow): string => {
    const a = where(g);
    if (a.state === "placed") return `<span title="${esc(a.who)} ${esc(a.ref ?? "")} at ${esc(a.partner)}">${esc(a.who)} <span class="muted">${esc(a.ref ?? "")} ${esc(a.partner)}</span></span>`;
    if (a.state === "manual") return icon("manual", SYMBOL.manual, `Allocate manually. ${a.why}`);
    if (a.state === "waiting") return a.why.startsWith("Plan paused") ? icon("muted", PLAN_ICON["paused"]![0], a.why) : icon("warn", SYMBOL.waiting, a.why ? `Waiting for allocation. ${a.why}` : "Waiting for allocation");
    return a.state === "none" ? `<span class="muted" title="${esc(a.why)}">\u2013</span>` : "";
  };

  const row = (g: GiftRow): string => {
    const first = g.payments[0];
    const ticked = g.payments.length > 0 && g.payments.every((w) => picked.has(w.key));
    const paid = g.kind === "excluded" ? (g.payments[0]?.paidDate ?? "").slice(0, 10) : g.lastPaid || g.firstPaid;
    const reason = g.kind === "excluded" ? g.payments[0]?.exclusion?.reason ?? "" : "";
    return `<tr class="grow${g.kind === "excluded" ? " off" : ""}" data-gift-open="${esc(g.key)}" tabindex="0" title="Open the details"><td><input type="checkbox" data-sel-gift="${esc(g.key)}" data-keys="${esc(g.payments.map((w) => w.key).join(" "))}" title="Tick every payment of this gift"${ticked ? " checked" : ""}></td>
      <td class="c">${kindIcon(g)}</td>
      <td class="num muted">${g.kind === "recurring" ? esc(g.key) : ""}</td>
      <td class="clip" title="${esc(g.supporterName)} ${esc(g.supporterId)}">${esc(g.supporterName)} <span class="muted">${esc(g.supporterId)}</span></td>
      <td class="clip" title="${esc(g.itemName)}">${giftIcon(v, g)} ${esc(g.itemName)}${g.parts > 1 ? ` <span class="muted">\u00D7${g.parts}</span>` : ""}${g.unrouted && first ? ` ${workflowPicker(v, first.itemId)}` : ""}</td>
      <td class="clip" title="${esc([g.projectName, first?.cause ? `Cause: ${first.cause}` : ""].filter((x) => x !== "").join(". "))}">${projectCell(g.projectName, first?.cause ?? "")}</td>
      <td class="num">${planCell(g)}</td>
      <td class="num muted" title="Total of its payments, for reference">${money(g.payments.reduce((t, w) => t + (Number.isFinite(lineValue(w)) ? lineValue(w) : 0), 0), currencyOf(g))}</td>
      <td class="num" title="${esc(paid)}">${esc(shortDate(paid))}</td>
      <td class="num muted" title="${esc(g.nextDue)}">${esc(shortDate(g.nextDue))}</td>
      <td class="clip">${stagePill(stageFor(v, g, where(g)))}</td>
      <td class="clip">${allocCell(g)}</td>
      <td class="c st">${statusIcons(g)}${g.kind === "excluded" && first ? `<button data-excl="${esc(first.key)}" data-excl-action="restore" title="${esc(reason || "Excluded")}">Restore</button>` : ""}</td>
      </tr>`;
  };
  return `${bulk}${note}${rows.length === 0 ? `<div class="empty">No gifts match the filters.</div>` : `${key}<div class="tablewrap"><table class="giftlist"><thead><tr><th><input type="checkbox" data-selall="main" title="Tick all shown"${allTicked ? " checked" : ""}></th><th></th><th>Rec. ID</th><th>Donor</th><th>Item</th><th>Project</th><th>Plan</th><th>Value</th><th>Paid</th><th>Next</th><th>Stage</th><th>Allocated to</th><th>Status</th><th></th></tr></thead><tbody>${shown.map(row).join("")}</tbody></table></div>`}`;
}

// The window for one gift: everything the list leaves out (DECISIONS 78). Returns "" when the gift is not in the data, so the caller closes the window.
export function giftDetailHtml(v: View, giftKey: string, logOpen = false): string {
  const g = giftRows(v.workOrders, v.workOrders, new Set(v.review.map((r) => r.key))).find((r) => r.key === giftKey);
  if (!g) return "";
  const first = g.payments[0];
  const a = allocationContext(v)(g);
  const kindName = g.kind === "recurring" ? "Recurring gift" : g.kind === "unlinked" ? "Recurring payment the CRM did not link to a subscription" : g.kind === "excluded" ? "Excluded payment" : "One payment";
  const row = (label: string, value: string, wide = false) => value === "" ? "" : `<div class="f${wide ? " w" : ""}"><span>${label}</span><div>${value}</div></div>`;
  const progress = g.kind === "recurring" || g.kind === "unlinked" ? `${g.paid} of ${g.planned ?? INFINITY}${g.planned ? `<div class="bar"><span style="width:${Math.min(100, Math.round((g.paid / g.planned) * 100))}%"></span></div>` : ""}` : g.periodCount > 0 ? `covers ${g.periodCount} month${g.periodCount === 1 ? "" : "s"}` : "";
  const allocation = a.state === "placed" ? `${esc(a.who)}${a.ref ? ` <b>${esc(a.ref)}</b>` : ""}<div class="muted">${a.allocRef ? `Allocation ${esc(a.allocRef)} \u00B7 ` : ""}${esc(a.partner)}${a.parts !== null ? ` · ${a.parts} part${a.parts === 1 ? "" : "s"}` : ""}</div>` : a.state === "manual" ? `<span class="pill review">Allocate manually</span><div class="muted">${esc(a.why)}</div>` : a.state === "waiting" ? `<span class="pill review">Waiting for allocation</span>${a.why ? `<div class="muted">${esc(a.why)}</div>` : ""}` : a.why ? `<span class="muted">${esc(a.why)}</span>` : "";
  const status = [
    g.kind === "excluded" ? "" : g.unrouted ? `<span class="pill unrouted">Unrouted</span>` : `<span class="pill ready">Ready</span>`,
    g.inReview ? `<span class="pill review">Review</span>` : "",
    ...g.notes.map((n) => n.resolved ? `<span class="pill done" title="${esc(`Resolved. ${n.title ?? (g.checked ? "Checked by a person." : "")}`)}">\u2713 <s>${esc(n.text)}</s></span>` : `<span class="pill review"${n.title ? ` title="${esc(n.title)}"` : ""}>${esc(n.text)}</span>`),
  ].filter((x) => x !== "").join(" ");
  // The log of what was resolved and what a person changed manually opens in its own small window, so it does not take room here (DECISIONS 89).
  const logItems = [...g.adjustments.map((t) => `<li><span class="gi manual">${SYMBOL.ok}</span> ${esc(t)}</li>`), ...g.notes.filter((n) => n.resolved).map((n) => `<li><span class="gi good">${SYMBOL.ok}</span> <s>${esc(n.text)}</s> resolved${n.title ? `<div class="muted">${esc(n.title)}</div>` : ""}</li>`)];
  const logBtn = logItems.length ? `<button class="gi-open${g.adjustments.length ? " manual" : ""}" data-gift-log="open" title="${g.adjustments.length ? "Changed manually here, not in the CRM. See the log." : "See what was resolved."}" aria-label="Open the log">${SYMBOL.info}</button>` : "";
  const logWin = logOpen && logItems.length ? `<div class="pf-overlay log" data-gift-log="overlay"><div class="pf-box small" role="dialog" aria-label="Change log"><header><h2>Log</h2><button data-gift-log="close">Close</button></header><div class="pf-body compact">${g.adjustments.length ? `<p class="muted">Changed manually here. The CRM does not know about these.</p>` : ""}<ul class="loglist">${logItems.join("")}</ul></div></div></div>` : "";
  const link = g.kind !== "unlinked" ? "" : g.suggestions.length === 0 ? `<div class="muted">No commitment for the same supporter and item</div>` : g.suggestions.map((s) => `<div class="muted">Possibly subscription <b>${esc(s.subscriptionId)}</b> (${s.daysApart === null ? "legacy upload, date not comparable" : s.daysApart === 0 ? "same day" : `${Math.abs(s.daysApart)} day${Math.abs(s.daysApart) === 1 ? "" : "s"} ${s.daysApart < 0 ? "before its first instalment" : "after its first instalment"}`})</div>`).join("");
  // The suggestion for a payment that differs from the usual (DECISIONS 118): one plain question with the two things it can be.
  const catchUp = g.catchUps.map((x) => {
    const when = shortDate((g.payments.find((w) => w.key === x.key)?.paidDate ?? "").slice(0, 10));
    return `<div class="suggest-box"><b>${money(x.value)} on ${esc(when)}, when the usual is ${money(x.usual)}. What is it?</b>
      <div class="muted">If it is months paid together it fills ${x.fills.map(esc).join(", ")}.</div>
      <div class="actions"><button class="primary" data-covers-set="${esc(x.key)}" data-n="${x.covers}">${x.covers} months paid together</button><button data-increase="${esc(x.key)}" data-n="${x.covers}">${x.covers} parts a month</button></div></div>`;
  }).join("");
  // A gift for manual allocation (DECISIONS 113): the reason, and a way to set its parts. A person's own mark can be taken back.
  // The choice applies to every real payment of the gift, since each one carries the mark (DECISIONS 114).
  const firstReal = g.payments.find((w) => w.legacyUpload !== true);
  const realKeys = g.payments.filter((w) => w.legacyUpload !== true).map((w) => w.key).join(" ");
  const manualBox = g.manual !== "" && firstReal
    ? `<div class="suggest-box"><b>Allocate manually.</b> ${esc(g.manual)}. Choose how many units each payment is under <b>Units</b> below and press Save, then allocate it in Allocation. Or leave it out of project management by excluding its payments.${firstReal.partsByPerson ? `<div class="actions"><button data-manual-set="${esc(firstReal.key)}" data-keys="${esc(realKeys)}" data-on="0">Back to automatic</button></div>` : ""}</div>`
    : "";
  // Parts (DECISIONS 116): a standing control, always there. Choose, then Save. Reset takes a person's choice back.
  const fixed = g.payments.some((w) => w.legacyUpload !== true && w.partsFixed !== undefined);
  const partOptions = [...new Set([1, 2, 3, 4, 5, 6, g.parts])].sort((x, y) => x - y);
  const partsControl = firstReal && g.kind !== "excluded"
    ? `<select id="gp-select" aria-label="Units of each payment">${partOptions.map((n) => `<option value="${n}"${n === g.parts ? " selected" : ""}>${n} unit${n === 1 ? "" : "s"}</option>`).join("")}</select>
        <button class="iconact ok" data-parts-save="1" data-keys="${esc(realKeys)}" title="Save the units" aria-label="Save the units"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>${fixed ? `<button class="iconact" data-parts-set="${esc(firstReal.key)}" data-keys="${esc(realKeys)}" data-n="0" title="Reset: go back to what the price or the CRM says" aria-label="Reset the parts"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg></button>` : ""}`
    : "";
  const markManual = g.manual === "" && firstReal && g.kind !== "excluded" ? `<button data-manual-set="${esc(firstReal.key)}" data-keys="${esc(realKeys)}" data-on="1" title="Take this gift out of automatic allocation. It shows the hand symbol and goes to the Manual tab, and a person allocates it. Press Back to automatic to undo.">Allocate manually</button>` : "";
  const partFix = g.partFixes.map((x) => `<div class="suggest-box"><b>The quantity looks wrong.</b> ${esc(x.reason)} unit${x.parts === 1 ? "" : "s"}.
      <div class="actions"><button class="primary" data-parts-set="${esc(x.key)}" data-n="${x.parts}">Yes, count it as ${x.parts} unit${x.parts === 1 ? "" : "s"}</button><button data-parts-set="${esc(x.key)}" data-n="${x.sent}">No, ${x.sent} is right</button></div></div>`).join("");
  return `<div class="pf-overlay" data-gift-close="overlay"><div class="pf-box" role="dialog" aria-label="Gift details">
    <header><h2>${esc(g.supporterName)} <span class="muted">${esc(g.itemName)}</span></h2><button data-gift-close="x" aria-label="Close">Close</button></header>
    <div class="pf-body compact">${manualBox}${catchUp}${partFix}<div class="fgrid">
        ${row("Donor", `${esc(g.supporterName)} <span class="muted">${esc(g.supporterId)}</span>${first && first.group ? ` <span class="muted">· ${esc(first.group)}</span>` : ""}`)}
        ${row("Item", `${giftIcon(v, g)} ${esc(g.itemName)}${g.parts > 1 ? ` <span class="muted">\u00D7${g.parts}</span>` : ""}${g.unrouted && first ? ` ${workflowPicker(v, first.itemId)}` : `<div class="muted">${esc((v.frameworks ?? []).find((f) => f.id === g.frameworkId)?.name ?? "")}${first && first.bundleQty && first.bundleQty > 1 && g.kind !== "recurring" ? ` \u00B7 bundle of ${first.bundleQty}${first.quantity > 1 ? ` x ${first.quantity}` : ""}` : ""}</div>`}`)}
        ${row("Type", esc(kindName))}
        ${row("Recurring ID", g.kind === "recurring" ? `<b>${esc(g.key)}</b>` : "")}
        ${row("Value (reference)", money(g.payments.reduce((t, w) => t + (Number.isFinite(lineValue(w)) ? lineValue(w) : 0), 0), currencyOf(g)))}
        ${row("Paid", progress)}
        ${row("Dates", `${esc(shortDate(g.firstPaid))}${g.lastPaid && g.lastPaid !== g.firstPaid ? ` \u2192 ${esc(shortDate(g.lastPaid))}` : ""}${g.nextDue ? `<div class="muted">next due ${esc(shortDate(g.nextDue))}</div>` : ""}`)}
        ${row("Plan status", g.planStatus ? `<span class="pill ${g.planStatus === "active" ? "ready" : "review"}">${esc(g.planStatus)}</span>` : "")}
        ${row("Units", partsControl ? `<span class="partsrow">${partsControl}</span>${fixed ? `<div class="muted">Set manually. The CRM says ${esc(String(g.payments.find((w) => w.legacyUpload !== true) ? sentPartsOf(g.payments.find((w) => w.legacyUpload !== true) as WorkOrder) : g.parts))}.</div>` : ""}` : "")}
        ${row("Project chosen", esc(g.projectName))}
        ${row("Cause", esc(first?.cause ?? ""))}
        ${row("Units", g.kind === "recurring" ? unitsVisual(g, v) : "", true)}
        ${row("Stage", `${stagePill(stageFor(v, g, a))}${stageFor(v, g, a).note ? `<div class="muted">${esc(stageFor(v, g, a).note)}</div>` : ""}`)}
        ${row("Allocated to", allocation)}
        ${row("Status", `${status} ${logBtn}${markManual ? `<div class="statusact">${markManual}</div>` : ""}`)}
        ${first ? row("Credit", creditLine(first), true) : ""}
        ${row("Could belong to", link, true)}
      </div>
      <section><h3>Payments (${g.payments.length})</h3>${paymentsTable(g, v)}</section>
    </div></div>${logWin}</div>`;
}

// The tiles above the list (DECISIONS 97): they count what the list below shows, so they change with the tab and the filters.
export function giftMetricsHtml(v: View): string {
  const { rows } = listData(v);
  const where = allocationContext(v);
  const payments = rows.flatMap((g) => g.payments);
  const currencies = [...new Set(payments.map((w) => w.currency ?? ""))];
  const total = payments.reduce((t, w) => t + (Number.isFinite(lineValue(w)) ? lineValue(w) : 0), 0);
  const value = currencies.length <= 1 ? money(total, currencies[0] ?? "") : "mixed currencies";
  const count = (f: (g: GiftRow) => boolean) => rows.filter(f).length;
  const waiting = count((g) => where(g).state === "waiting");
  const review = count((g) => g.needsLook || g.inReview || g.unrouted);
  const recurring = count((g) => g.kind === "recurring" || g.kind === "unlinked");
  const status = (st: string) => count((g) => g.planStatus === st);
  const small = (n: number, label: string) => `<span class="sm"><b>${n}</b> ${label}</span>`;
  // Rule (DECISIONS 99): six tiles. Recurring is the large number with the single payments small beside it, the plan statuses share one tile, and
  // everything that needs a person (a look, a review or a workflow) is one tile called Review.
  return `<div class="metric"><b>${rows.length}</b><span>Gifts</span></div>
    <div class="metric"><b>${recurring}</b><span>Recurring</span><div class="smrow">${small(count((g) => g.kind === "one_off"), "one payments")}</div></div>
    <div class="metric"><b>${value}</b><span>Value</span></div>
    <div class="metric"><span>Plan status</span><div class="smrow">${small(status("cancelled"), "cancelled")}${small(status("paused"), "paused")}${small(status("completed"), "completed")}</div></div>
    <div class="metric${waiting ? " warn" : ""}"><b>${waiting}</b><span>Unallocated</span><div class="smrow">${small(count((g) => where(g).state === "placed"), "allocated")}${small(count((g) => where(g).state === "manual"), "manual")}${small(count((g) => where(g).state === "none"), "need none")}</div></div>
    <div class="metric${review ? " warn" : ""}"><b>${review}</b><span>Review</span></div>`;
}

export function giftsPage(v: View): string {
  const live = v.workOrders.filter((w) => w.status !== "excluded");
  const count = (s: string) => v.workOrders.filter((w) => w.status === s).length;
  const tab = (id: Filter, label: string) => `<button data-filter="${id}" class="${v.filter === id ? "on" : ""}">${label}</button>`;
  const base = listBase(v, "main");
  return `
    <h1>Gifts</h1>
    <p class="sub">Every gift in one list. A subscription is one row with its payments inside it, and a single payment is one row. Gifts arrive from the CRM feed. Only items the CRM marks as needing feedback appear here, so nothing is imported manually.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics" data-list="main-metrics">${giftMetricsHtml(v)}</div>
    <div class="tabrow"><div class="tabs">${TABS.map(([id, label]) => tab(id, label)).join("")}${tab("excluded", `Excluded (${count("excluded")})`)}</div>
    <span class="muted pickup">${v.live && v.run?.ok ? `Last pick-up ${esc(shortDateTime(v.run.at))} UTC. ` : ""}Gifts are brought in under <a data-page="data-feed">Data</a>${v.live ? "" : ", where the demo can be refreshed and your own files loaded"}.</span></div>
    ${filterBar(v, "main", base)}<div class="card" data-list="main">${giftListHtml(v)}</div>
    ${v.review.length ? `<div class="card"><h2>Held for review</h2><p class="muted">These changed in the CRM after the work order was made. Nothing was changed automatically.</p><table><tbody>${v.review.map((r) => `<tr><td>${esc(r.key)}</td><td>${esc(r.message)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
}

