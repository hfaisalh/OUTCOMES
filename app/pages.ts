/**
 * pages.ts
 *
 * What it does: turns the app state into the HTML of each page (work orders, dashboard,
 * categories, other sources, settings). It has no events and no business rules: the rules are in
 * modules/01c-crm-connector, and main.ts handles clicks.
 * Who calls it: main.ts.
 * Depends on: the connector types, menu.ts and demo-data.ts (categories list).
 */

import type { AttentionItem } from "../modules/04-triage/triage";
import { hasSample } from "../modules/07-beneficiaries/sample-setup";
import type { BeneficiaryFilter, Register } from "../modules/07-beneficiaries/beneficiaries";
import type { Enrolments } from "../modules/07-beneficiaries/enrolments";
import type { Assignments } from "../modules/08-assignment/assignment";
import type { Placements } from "../modules/09-placement/placement";
import { filterWorkOrders, isFiltering, NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { partsOf } from "../modules/01c-crm-connector/work-orders";
import { autoAllocate, fillOf, holdingReport, monthsAround, perPeriodRule, timelineOf, type UnitStatus, type Allocation, type Availability, type Outcome } from "../modules/05-outcomes/outcomes";
import { allocOptions, type GiftProject, type Node, type Project } from "../modules/06-projects/projects";
import type { BenFilter } from "./beneficiaries-page";
import { shortDate, shortDateTime } from "./dates";
import { ICONS, iconHtml, itemIcon } from "./icons";
import type { OutcomeType } from "../modules/05-outcomes/outcome-types";
import { allocatable, buildCommitments, needsLook, type Commitment } from "../modules/04b-commitments/commitments";
import { noIndividualDonor } from "../modules/01c-crm-connector/credits";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import type { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import type { ReviewItem, WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { RunInfo } from "../modules/00-platform/store";
import { allocationShape, CYCLE_LABELS, groupItems, INSTALMENT_LABELS, missingFramework, unitsForCommitment, type Category, type Cycle, type FrameworkTemplate, type InstalmentRule, type ItemInfo } from "../modules/02-project-rules/categories";

export type Filter = "all" | "ready" | "unrouted" | "review" | "look" | "manual" | "excluded";

export interface View {
  workOrders: WorkOrder[];
  review: ReviewItem[];
  itemCategories: Record<string, string>;
  flaggedItems: { id: string; name: string; count: number }[]; // CRM items that need feedback, with how many work orders each has
  filter: Filter;
  criteria?: Criteria; // the Work orders filter boxes (DECISIONS 48)
  scopeCriteria?: Record<string, Criteria>; // the filter boxes inside each Needs attention entry, by list id
  selected?: string[]; // work order keys ticked for a bulk exclude or restore (DECISIONS 49)
  openAttn?: string[]; // Needs attention entries whose lines are open
  outcomes?: Outcome[]; // what gifts are allocated to (DECISIONS 61)
  allocations?: Allocation[];
  ocFilter?: { cohort: string; type: string; status: string }; // the Outcomes list filters (DECISIONS 63)
  today?: string; // today as YYYY-MM-DD, so the month by month view can be drawn and tested for any date
  requireRef?: boolean; // place gifts only on beneficiaries that have an ID (DECISIONS 75)
  graceDays?: number; // days a payment may be unpaid before the place may be released (DECISIONS 74)
  giftProjects?: GiftProject[]; // the projects donors choose and the partners that deliver them (DECISIONS 76)
  benFilter?: BenFilter; // the filters on the Outcomes list page
  beneficiaries?: Register; // the Beneficiary register (DECISIONS 163)
  placements?: Placements; // which place each assigned gift fills (DECISIONS 175)
  assignments?: Assignments; // which partner each gift was assigned to (DECISIONS 170)
  allocFilter?: string; // the filter on the Allocate page: all, open, placed
  assignFilter?: string; // the filter on the Assignment page: all, open, assigned
  enrolments?: Enrolments; // who is enrolled in which cluster (DECISIONS 167)
  outcomeRecFilter?: { text: string; project: string; type: string; show: "" | "underfunded" | "missed" | "ended" }; // the filters on the Outcomes list (DECISIONS 197)
  outcomeRecSort?: { key: string; dir: "asc" | "desc" };
  giftHidden?: string[]; // the Gifts list columns a person has hidden (DECISIONS 215)
  giftColsOpen?: boolean; // whether the column chooser is open
  giftSort?: { key: string; dir: "asc" | "desc" }; // the column the Gifts list is sorted by (DECISIONS 214)
  registerSort?: { key: string; dir: "asc" | "desc" }; // the column the Beneficiaries list is sorted by (DECISIONS 196)
  registerFilter?: BeneficiaryFilter; // the filters on the Beneficiaries page
  projects?: Project[]; // the partners (the code still calls a partner a Project) and their structures (DECISIONS 65)
  nodes?: Node[]; // the places in them
  openProject?: string; // the project open on the Projects page
  openCommit?: string; // the commitment whose details are open on the Outcomes page ("" when none)
  message: string;
  config: typeof MWF_CRM_CONFIG;
  categories: Category[];
  frameworks?: FrameworkTemplate[]; // framework templates (DECISIONS 59)
  itemIcons?: Record<string, string>; // the icon chosen for an item (DECISIONS 107)
  itemUnits?: Record<string, number>; // the units that make one whole beneficiary, by item (DECISIONS 188)
  itemKinds?: Record<string, string>; // the kind of benefit chosen for an item (DECISIONS 143)
  kindFeatures?: Record<string, unknown>; // the features of the kinds a person changed (DECISIONS 146)
  kindSel?: string; // the kind the Benefits page shows (DECISIONS 146)
  outcomeTypes?: OutcomeType[];
  workflowSuggestions?: Record<string, string>; // item id to the workflow its name suggests (DECISIONS 130)
  workflowSel?: { id: string; stage: number; parts: number; allocated: boolean; pick?: string; iconPick?: string }; // which workflow and stage the Workflows page shows, and the sample gift (DECISIONS 130) // the kinds of outcome and their profile fields (DECISIONS 103)
  itemFramework?: Record<string, string>; // an item's own framework, where it differs from its category
  itemFrameworkSuggestions?: Record<string, string>; // suggested item frameworks, for a person to accept
  suggestions: Record<string, string>; // item id to suggested category id, for items not yet sorted
  live: boolean; // true when signed in from the CRM, false for the demo
  canPickup: boolean; // the person may run a pick-up now
  run: RunInfo | null; // what the last pick-up did (live only)
  selectedItem: string; // item picked by tapping, waiting to be tapped onto a category ("" when none)
  pendingFiles?: string[]; // names of the export files chosen but not loaded yet (demo only)
  loadNote?: string; // what the last load of export files did, shown inside the load card (demo only)
  attention?: AttentionItem[]; // everything that needs a person, open first (Module 4)
  audits?: AuditRecord[]; // batch audit history, newest first (live only)
  upload?: boolean; // the organisation takes uploaded export files, so the load card is shown even when signed in
  ownerNote?: string; // what the last owner sign-in attempt said (demo only)
  loading?: string; // what the load is doing right now ("" when idle), shown with a spinner (demo only)
}

// Text that came from the CRM is never trusted as HTML.
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const categoryName = (categories: Category[], id: string) => categories.find((c) => c.id === id)?.name ?? (id === "default" ? "Default journey" : id);

// A category picker. `item` is the CRM item id that the choice applies to.
export const picker = (categories: Category[], item: string, current: string) =>
  `<select data-assign="${esc(item)}"><option value="">Choose category...</option>${categories.map((c) => `<option value="${c.id}"${c.id === current ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;

// Rule (DECISIONS 131): an item with no workflow is unrouted. Its workflow is chosen here, and the item is moved into it. There is no category to choose.
export const workflowPicker = (v: View, item: string) =>
  `<select data-assign-wf="${esc(item)}" aria-label="Choose a workflow"><option value="">Choose a workflow...</option>${(v.frameworks ?? []).map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select>`;

export const metric = (value: number | string, label: string, cls = "") => `<div class="metric ${cls}"><b>${value}</b><span>${label}</span></div>`;

// Rule shown to staff: the instalment as "2 of 12" or "2 of Indefinitely". Blank for a one-off.
const instalment = (w: WorkOrder) => (w.instalmentNumber === "" ? `<span class="muted">One-off</span>` : `${esc(w.instalmentNumber)} of ${esc(w.instalmentCount)}`);

// The last pick-up, in plain words (live only).
export function liveBar(v: View): string {
  const r = v.run;
  if (!r) return `<div class="note">No pick-up has run yet. Work orders appear after the first pick-up from the CRM.</div>`;
  const when = esc(shortDateTime(r.at));
  return r.ok
    ? `<p class="muted">Last pick-up ${when} UTC: read ${r.rows} lines, ${r.created} new work orders, ${r.rerouted} routed, ${r.skipped} left out${r.issues.length ? `, ${r.issues.length} notice${r.issues.length === 1 ? "" : "s"}: ${esc(r.issues.slice(0, 3).join(" "))}${r.issues.length > 3 ? ` and ${r.issues.length - 3} more (see Needs attention)` : ""}` : ""}.</p>`
    : `<div class="note" style="background:var(--bad-bg)">The last pick-up (${when} UTC) did not finish: ${esc(r.error)} Earlier work orders are kept.</div>`;
}

// Demo only: the owner signs in with a passphrase to use saved data. It is a plain form post, so it works without any script. Rule: the passphrase goes to the server over HTTPS and is never kept in the page.
export const ownerCard = (v: View): string => `<div class="card"><h2>Not signed in: nothing is being saved</h2>
  <div class="note warnnote"><b>Everything on this page is forgotten when you refresh or open a new address.</b> Sign in as the owner first to keep your work on the server, then load your files. Always use the same address, https://outcomes-beryl.vercel.app/app/, because the sign-in belongs to that address.</div>
  <form method="post" action="/api/owner-login">
    <div class="filebox"><input type="password" name="passphrase" placeholder="Owner passphrase" autocomplete="current-password" required></div>
    <div class="actions loadbox"><button class="primary" type="submit">Sign in</button></div>
  </form>
  ${v.ownerNote ? `<div class="note warnnote">${esc(v.ownerNote)}</div>` : ""}</div>`;

// What the address says after the sign-in form was sent: "?signin=wrong" means the passphrase was not right.
export const signinNote = (search: string): string => (new URLSearchParams(search).get("signin") === "wrong" ? "That passphrase is not right. Try again." : "");

// Demo only: load your own CRM export files. They are read in this browser and go nowhere else.
// Two steps so it is clear what happens: choose the files, then press the button.
export const loadCard = (v: View): string => `<div class="card"><h2>Use your own CRM export files</h2>
  <p class="muted">Choose the Donation lines, Catalogue items and (optionally) Recurring plans files from the CRM Export Centre, all at once, then press Load. ${v.live ? "They are read in this browser. Only the lines needed for work orders and the audit are sent to your saved data, with no contact details." : "They are read in this browser only. Nothing is uploaded or saved, so sign in above first if you want to keep the result."}</p>
  <div class="filebox"><input type="file" id="feedfile" multiple accept=".csv,text/csv"${v.loading ? " disabled" : ""}></div>
  ${v.pendingFiles?.length ? `<p>Chosen: ${v.pendingFiles.map(esc).join(", ")}</p>` : ""}
  <div class="actions loadbox"><button class="primary" data-action="load-files"${v.loading ? " disabled" : ""}>Load the chosen files</button></div>
  ${v.loading ? `<div class="progress"><span class="spinner"></span><span>${esc(v.loading)}</span></div>` : ""}
  ${v.loadNote && !v.loading ? `<div class="note">${esc(v.loadNote)}</div>` : ""}</div>`;

// Who else the gift is credited to (agent, group, organisation), and a flag when there is no individual donor (DECISIONS 44). Empty when the feed has neither.
export const creditLine = (w: WorkOrder): string => {
  const chain = (w.credits ?? []).map((c) => `${c.role ? esc(c.role) + ": " : ""}${esc(c.name || c.id)}`).join(" › ");
  const flag = noIndividualDonor(w) && (w.credits?.length || w.supporterKind === "group") ? ` <span class="pill review">No individual donor</span>` : "";
  return chain || flag ? `<div class="muted">${chain ? "Credited: " + chain : ""}${flag}</div>` : "";
};

// Which work orders a list shows before the filter boxes apply. "main" is the Work orders page (by its tab); "a:<entry id>" is a Needs attention entry.
// Rule: the lines under an entry are found from the work orders themselves, so they always match what the page holds (DECISIONS 49).
export function listBase(v: View, id: string): WorkOrder[] {
  if (id === "main") {
    const reviewKeys = new Set(v.review.map((r) => r.key));
    return v.workOrders.filter((w) => (v.filter === "all" || v.filter === "look" || v.filter === "manual" ? w.status !== "excluded" : v.filter === "review" ? reviewKeys.has(w.key) && w.status !== "excluded" : w.status === v.filter));
  }
  const i = (v.attention ?? []).find((x) => `a:${x.id}` === id);
  return i ? attentionBase(v, i) : [];
}

// The work orders an Needs attention entry is about. Empty when the entry is not about particular work orders.
function attentionBase(v: View, i: AttentionItem): WorkOrder[] {
  if (i.kind === "unrouted") return v.workOrders.filter((w) => w.itemId === i.itemId && (w.status === "unrouted" || w.status === "excluded"));
  if (i.workOrderKey !== undefined) return v.workOrders.filter((w) => w.key === i.workOrderKey);
  // Import notes: the order reference notes are about lines with no reference, the instalment notes about recurring lines with no subscription.
  if (/order reference|transaction_ref/i.test(i.detail)) return v.workOrders.filter((w) => w.transactionRef === "");
  if (/instalment count/i.test(i.detail)) {
    // The note names the line ids ("Lines: 7320, 7702"). Without them, nothing can be shown.
    const ids = new Set(((/Lines: ([\d, ]+)/.exec(i.detail)?.[1] ?? "").match(/\d+/g)) ?? []);
    return v.workOrders.filter((w) => ids.has(w.key));
  }
  return [];
}

export const criteriaFor = (v: View, id: string): Criteria => (id === "main" ? v.criteria : v.scopeCriteria?.[id]) ?? NO_CRITERIA;

// The filter boxes above a list. Typing or choosing only redraws the list, never the boxes (main.ts), so typing is not interrupted.
export function filterBar(v: View, id: string, base: WorkOrder[]): string {
  const c = criteriaFor(v, id);
  const items = new Map<string, string>();
  for (const w of base) items.set(w.itemId, w.itemName);
  const opt = (value: string, label: string, cur: string) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;
  const d = `data-scope="${esc(id)}"`;
  return `<div class="card filters">
    <input type="search" data-f="text" ${d} placeholder="Search donor, item, reference, subscription" title="Search line id, order reference, supporter, item or subscription" value="${esc(c.text)}">
    <select data-f="itemId" ${d}><option value="">All items</option>${[...items].sort((a, b) => a[1].localeCompare(b[1])).map(([k, name]) => opt(k, name, c.itemId)).join("")}</select>
    ${id === "main" ? "" : `<select data-f="status" ${d}>${opt("", "Any status", c.status)}${opt("unrouted", "Unrouted", c.status)}${opt("ready", "Ready", c.status)}${opt("excluded", "Excluded", c.status)}</select>`}
    <select data-f="legacy" ${d}>${opt("", "Legacy: included", c.legacy)}${opt("only", "Legacy only", c.legacy)}${opt("hide", "No legacy", c.legacy)}</select>
    <select data-f="kind" ${d}>${opt("any", "All types", c.kind)}${opt("recurring", "Recurring", c.kind)}${opt("oneoff", "One-off", c.kind)}${opt("custom", "Custom amount", c.kind)}</select>
    <input type="date" data-f="from" ${d} value="${esc(c.from)}" title="Paid from">
    <input type="date" data-f="to" ${d} value="${esc(c.to)}" title="Paid to">
    <button data-action="clear-filters" data-scope="${esc(id)}" title="Clear the filters">Clear</button></div>`;
}

export const MAX_ROWS = 500; // the most rows drawn at once. The filter boxes narrow the rest.

// A list with its filter boxes and bulk exclude and restore. Used on the Work orders page and inside each Needs attention entry.
export function listBlock(v: View, id: string): string {
  const base = listBase(v, id);
  return `${filterBar(v, id, base)}<div class="card" data-list="${esc(id)}">${listHtml(v, id)}</div>`;
}

// The list itself (the part that is redrawn as you type or tick): the count, the bulk bar and the table.
export function listHtml(v: View, id: string): string {
  const base = listBase(v, id);
  const c = criteriaFor(v, id);
  const rows = filterWorkOrders(base, c);
  const shown = rows.slice(0, MAX_ROWS);
  const reviewKeys = new Set(v.review.map((r) => r.key));
  const picked = new Set(v.selected ?? []);
  const allTicked = shown.length > 0 && shown.every((w) => picked.has(w.key));
  const bulk = `<div class="bulkbar"><span><b>${picked.size}</b> selected</span>
    <button data-bulk="exclude"${picked.size ? "" : " disabled"}>Exclude selected</button><button data-bulk="restore"${picked.size ? "" : " disabled"}>Restore selected</button><button data-bulk="clear"${picked.size ? "" : " disabled"}>Clear selection</button></div>`;
  const note = `${isFiltering(c) ? `<p class="muted">Showing ${rows.length} of ${base.length}.</p>` : ""}${rows.length > MAX_ROWS ? `<p class="muted">Only the first ${MAX_ROWS} are drawn. Narrow the list with the filter boxes.</p>` : ""}`;
  if (base.length === 0) return `<div class="empty">No work orders in this list.</div>`;
  return `${bulk}${note}${
    rows.length === 0
      ? `<div class="empty">No work orders match the filters.</div>`
      : `<table><thead><tr><th><input type="checkbox" data-selall="${esc(id)}" title="Tick all shown"${allTicked ? " checked" : ""}></th><th>Reference</th><th>Supporter</th><th>Item</th><th>Instalment</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>${shown
          .map(
            (w) => `<tr><td><input type="checkbox" data-sel="${esc(w.key)}"${picked.has(w.key) ? " checked" : ""}></td>
            <td>${esc(w.transactionRef) || `<span class="muted">no reference</span>`}<div class="muted">Line ${esc(w.key)} · ${w.legacyUpload ? `${esc(shortDate(w.paidDate))} <span class="pill review" title="Uploaded from the old system. This date is the day it was loaded, not the real payment date.">Legacy upload</span>` : esc(shortDate(w.paidDate))}</div></td>
            <td>${esc(w.supporterName)}<div class="muted">${esc(w.supporterId)}${w.group ? " · " + esc(w.group) : ""}</div>${creditLine(w)}</td>
            <td>${esc(w.itemName)}${partsOf(w) > 1 ? `<div class="muted">${partsOf(w)} units${w.bundleQty && w.bundleQty > 1 ? ` (bundle of ${w.bundleQty}${w.quantity > 1 ? ` x ${w.quantity}` : ""})` : ""}</div>` : ""}</td><td>${instalment(w)}</td>
            <td>${w.status === "unrouted" ? workflowPicker(v, w.itemId) : esc(categoryName(v.categories, w.categoryId))}</td>
            <td>${w.status === "excluded" ? "" : `<span class="pill ${w.status === "unrouted" ? "unrouted" : "ready"}">${w.status === "unrouted" ? "Unrouted" : "Ready"}</span>`}${reviewKeys.has(w.key) ? ` <span class="pill review">Review</span>` : ""}${w.status === "excluded" ? `<span class="pill unrouted">Excluded</span><div class="muted">${esc(w.exclusion?.reason ?? "")}${w.exclusion ? ` (${esc(w.exclusion.by)}, ${esc(w.exclusion.at.slice(0, 10))})` : ""}</div>` : ""}</td>
            <td>${w.status === "excluded" ? `<button data-excl="${esc(w.key)}" data-excl-action="restore">Restore</button>` : w.status === "unrouted" || w.status === "ready" ? `<button data-excl="${esc(w.key)}" data-excl-action="exclude">Exclude</button>` : ""}</td></tr>`,
          )
          .join("")}</tbody></table>`
  }`;
}

export function dashboardPage(v: View): string {
  const total = Math.max(v.workOrders.filter((w) => w.status !== "excluded").length, 1);
  const byFw = new Map<string, number>();
  for (const w of v.workOrders.filter((x) => x.status !== "excluded")) byFw.set(w.categoryId || "", (byFw.get(w.categoryId || "") ?? 0) + 1);
  return `
    <h1>Dashboard</h1><p class="sub">A first view of the work. More dashboards (coverage, compliance, outstanding feedback) come with the later modules.</p>
    <div class="card"><h2>Work orders by category</h2>${[...byFw.entries()]
      .map(([id, n]) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span>${id === "" ? "Unrouted" : esc(categoryName(v.categories, id))}</span><b>${n}</b></div><div class="bar"><i style="width:${Math.round((n / total) * 100)}%"></i></div></div>`)
      .join("") || `<div class="empty">No work orders yet.</div>`}</div>`;
}

// One item as a draggable chip. A suggested category is shown as a hint, never applied on its own.
const chip = (i: ItemInfo, v: View, hint = "") =>
  `<span class="chip${v.selectedItem === i.id ? " sel" : ""}" draggable="true" data-item="${esc(i.id)}">${esc(i.name)} <small>${esc(i.id)}</small>${hint ? ` <em class="sug">suggested: ${esc(hint)}</em>` : ""}</span>`;

const field = (label: string, control: string) => `<label class="fld"><span>${label}</span>${control}</label>`;

// A framework template: defined once, used by any number of categories and items (DECISIONS 59).
export function categoriesPage(v: View): string {
  const items: ItemInfo[] = v.flaggedItems.map((i) => ({ id: i.id, name: i.name }));
  const { unsorted, byCategory } = groupItems(items, v.itemCategories, v.categories);
  const nSuggest = Object.keys(v.suggestions).length;
  const frameworks = v.frameworks ?? [];
  const itemFw = v.itemFramework ?? {};
  const fwName = (id: string) => frameworks.find((f) => f.id === id)?.name ?? "";
  const fwOptions = (cur: string, blank: string) => `<option value="">${esc(blank)}</option>${frameworks.map((f) => `<option value="${esc(f.id)}"${f.id === cur ? " selected" : ""}>${esc(f.name)}</option>`).join("")}`;
  const nItemSuggest = Object.keys(v.itemFrameworkSuggestions ?? {}).length;
  // A category tile: name, how many items, the drop zone. Its default framework is chosen under "Edit". An item can have its own framework.
  const card = (c: Category) => {
    const list = byCategory[c.id] ?? [];
    const own = list.filter((i) => itemFw[i.id] !== undefined).length;
    return `<div class="card fw"><div class="fwname"><b>${esc(c.name)}</b> <span class="muted">(${list.length})</span>${c.frameworkId === "" ? ` <span class="pill unrouted">choose a workflow</span>` : ` <span class="muted">· ${esc(fwName(c.frameworkId))}</span>`}</div>
      <div class="zone" data-drop="${c.id}">${list.map((i) => chip(i, v) + (itemFw[i.id] !== undefined ? ` <small class="muted">${esc(fwName(itemFw[i.id] as string))}</small>` : "")).join("") || `<span class="muted">Drop items here</span>`}</div>
      <details><summary>Edit${own ? ` <span class="muted">(${own} item${own === 1 ? "" : "s"} with its own workflow)</span>` : ""}</summary>
        <div class="fwhead"><input class="title" data-rename="${c.id}" value="${esc(c.name)}" /><button data-remove="${c.id}" title="Remove this category (its items go back to unsorted)">Remove</button></div>
        ${field("Words that suggest this category", `<input data-keywords="${c.id}" value="${esc(c.keywords.join(", "))}" />`)}
        ${field("Default workflow for items in this category (optional)", `<select data-catfw="${c.id}">${fwOptions(c.frameworkId, "Choose...")}</select>`)}
        ${list.length ? `<h4 class="fwtitle">Items that differ from the category</h4><p class="muted">An item follows the category's workflow unless you choose another here.</p>
        <table class="inner"><tbody>${list.map((i) => `<tr><td>${esc(i.name)} <span class="muted">${esc(i.id)}</span></td><td><select data-itemfw="${esc(i.id)}">${fwOptions(itemFw[i.id] ?? "", `Same as category${c.frameworkId ? ` (${fwName(c.frameworkId)})` : ""}`)}</select></td></tr>`).join("")}</tbody></table>` : ""}
      </details></div>`;
  };
  return `
    <h1>Categories</h1>
    <p class="sub">The CRM says which items need feedback. Drag each item into its category (or tap an item, then tap a category). A category is only a label for reporting. What happens to a gift is decided by its item's workflow, set on the Workflows page. Categories and frameworks are kept in OUTCOMES, not in the CRM.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-action="accept-suggestions"${nSuggest ? "" : " disabled"}>Accept ${nSuggest} suggestion${nSuggest === 1 ? "" : "s"}</button>
      <input id="newcat" placeholder="New category name" /><button data-action="add-category">Add category</button></div>
    <div class="board"><div class="unsorted"><div class="card"><h2>Unsorted items <span class="muted">(${unsorted.length})</span></h2><p class="muted">Work orders for these stay unrouted. Nothing is lost.</p>
      <div class="zone" data-drop="">${unsorted.map((i) => chip(i, v, v.suggestions[i.id] ? categoryName(v.categories, v.suggestions[i.id] as string) : "")).join("") || `<span class="muted">Everything is sorted.</span>`}</div></div></div>
      <div>${v.categories.length ? `<div class="fwgrid">${v.categories.map(card).join("")}</div>` : `<div class="card empty">No categories yet. Add one.</div>`}</div></div>`;
}


export const settingsPage = (v: View): string => `
    <h1>Settings</h1><p class="sub">Connector settings for this organisation. Roles and who may sign in are not set here: they come from the CRM (DECISIONS 32).</p>
    <div class="card"><h2>CRM connector (MWF CRM)</h2><table><tbody>
      <tr><td>Trigger column (item needs feedback)</td><td><code>${esc(v.config.triggerColumn)}</code></td></tr>
      <tr><td>Values that mean yes</td><td>${v.config.yesValues.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>Values that mean paid</td><td>${v.config.paidValues.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>How the feed is read</td><td>Database view or API (chosen per organisation)</td></tr></tbody></table>
    <p class="muted">${v.live ? "These settings are read-only here. Gifts come from the CRM exports or the feed you loaded." : "In this demo the settings are read-only and the feed is the invented sample."}</p></div>
    ${sampleCard(v)}`;

// The sample setup card (DECISIONS 168): one button loads invented partners, projects, clusters, beneficiaries and enrolments so the whole chain can be tried, and one removes exactly those.
function sampleCard(v: View): string {
  const loaded = hasSample({ giftProjects: v.giftProjects ?? [], register: v.beneficiaries ?? { records: [], counters: {} } });
  return `<div class="card"><h2>Sample setup</h2>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <p class="muted">Loads invented partners, projects with clusters, children and households, and enrolments, built from the items that exist, so the whole journey can be tried without real data. Everything it makes is marked as sample, and Remove takes away exactly that and nothing else. Real children's data is never loaded this way.</p>
    <div class="actions"><button class="primary" data-sample="load"${loaded ? " disabled" : ""}>Load sample setup</button><button data-sample="remove"${loaded ? "" : " disabled"}>Remove sample data</button></div>
    <p class="muted">${loaded ? "The sample setup is loaded." : "The sample setup is not loaded."}</p></div>`;
}

const kindWord: Record<string, string> = { added: "New", changed: "Changed", moved: "Moved to another item", no_longer_needs_feedback: "No longer needs feedback", removed: "No longer in the CRM" };

// The batch audit (DECISIONS 21, 43): what each import found compared with what was saved. It only reports.
export function auditPage(v: View): string {
  const audits = v.audits ?? [];
  const latest = audits[0];
  const row = (a: AuditRecord) => `<tr><td>${esc(shortDateTime(a.at))}</td><td>${esc(a.source)}</td><td>${a.lines}</td>
    <td>${a.coverage.from ? esc(shortDate(a.coverage.from)) + " to " + esc(shortDate(a.coverage.to)) : ""}</td>
    <td>${a.counts.added}</td><td>${a.counts.changed}</td><td>${a.counts.moved}</td><td>${a.counts.no_longer_needs_feedback}</td><td>${a.complete ? a.counts.removed : "not judged"}</td></tr>`;
  return `
    <h1>Audit</h1>
    <p class="sub">Every import is compared with what is already saved, line by line. The audit only reports. Nothing is changed or deleted by it.</p>
    ${v.live ? "" : `<div class="empty">Sign in as the owner to keep an audit history.</div>`}
    ${latest ? `<div class="metrics">${metric(latest.counts.added, "New lines")}${metric(latest.counts.changed + latest.counts.moved, "Changed or moved", latest.counts.changed + latest.counts.moved ? "warn" : "")}${metric(latest.counts.no_longer_needs_feedback, "No longer need feedback")}${metric(latest.complete ? latest.counts.removed : 0, "No longer in the CRM", latest.counts.removed ? "warn" : "")}</div>` : ""}
    <div class="card"><h2>Imports</h2>${audits.length === 0 ? `<div class="empty">No imports yet.</div>` : `<table><thead><tr><th>When</th><th>Source</th><th>Lines</th><th>Dates covered</th><th>New</th><th>Changed</th><th>Moved</th><th>Not flagged</th><th>Removed</th></tr></thead><tbody>${audits.map(row).join("")}</tbody></table>`}</div>
    ${latest && latest.findings.length ? `<div class="card"><h2>Latest import: to look at</h2><p class="muted">Work orders already made were kept. A person decides what to do with each.</p><table><tbody>${latest.findings.slice(0, 100).map((f) => `<tr><td>${esc(f.key)}</td><td><span class="pill review">${esc(kindWord[f.kind] ?? f.kind)}</span></td><td>${esc(f.message)}</td></tr>`).join("")}</tbody></table>${latest.findings.length > 100 ? `<p class="muted">Showing 100 of ${latest.findings.length}.</p>` : ""}</div>` : ""}`;
}

// Needs attention (Module 4): everything that needs a person, in one list. Unrouted items are fixed by choosing a category here.
export function attentionPage(v: View): string {
  const items = v.attention ?? [];
  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "reviewed");
  // Under each entry: the lines it is about, with the same filter boxes and bulk exclude or restore as the Work orders page (DECISIONS 48, 49).
  const detail = (i: AttentionItem) => {
    const was = i.was || i.now ? `<p><b>Saved:</b> ${esc(i.was ?? "")}<br><b>CRM now:</b> ${esc(i.now ?? "")}</p>` : "";
    const base = attentionBase(v, i);
    const id = `a:${i.id}`;
    const open = (v.openAttn ?? []).includes(i.id);
    const jump = [
      i.itemId !== undefined && i.kind === "unrouted" ? `<button data-view-item="${esc(i.itemId)}">Show in Work orders</button>` : "",
      i.workOrderKey !== undefined ? `<button data-view-key="${esc(i.workOrderKey)}">Show in Work orders</button>` : "",
    ].join("");
    if (base.length === 0) return was ? `<div>${was}</div>` : "";
    return `<details data-attn-open="${esc(i.id)}"${open ? " open" : ""}><summary>Show the lines (${base.length})</summary>${was}<div data-lazy="${esc(id)}">${open ? listBlock(v, id) : ""}</div>${jump ? `<div class="actions">${jump}</div>` : ""}</details>`;
  };
  const card = (i: AttentionItem) => `<tr><td><b>${esc(i.title)}</b><div class="muted">${esc(i.detail)}</div>${i.note ? `<div class="muted">Note: ${esc(i.note)}</div>` : ""}${detail(i)}</td>
    <td style="text-align:right;white-space:nowrap;vertical-align:top">${
      i.kind === "unrouted" && i.itemId !== undefined ? workflowPicker(v, i.itemId)
      : !v.live ? ""
      : i.status === "open" ? `<button data-attn="${esc(i.id)}" data-attn-action="review">Mark reviewed</button>`
      : `<button data-attn="${esc(i.id)}" data-attn-action="reopen">Reopen</button>`
    }</td></tr>`;
  return `
    <h1>Needs attention</h1>
    <p class="sub">Everything that needs a person, in one place. Nothing here is changed automatically. An item waiting for a category clears itself when you choose one.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(open.length, "Open", open.length ? "warn" : "ok")}${metric(open.filter((i) => i.kind === "unrouted").length, "Items to sort")}${metric(done.length, "Reviewed")}</div>
    <div class="card"><h2>Open</h2>${open.length === 0 ? `<div class="empty">Nothing needs attention.</div>` : `<table><tbody>${open.map(card).join("")}</tbody></table>`}</div>
    ${done.length ? `<div class="card"><h2>Reviewed</h2><table><tbody>${done.map(card).join("")}</tbody></table></div>` : ""}`;
}

// Outcomes (Module 5): what the gifts are for, how full each outcome is, and which commitment fills it. Colours show fulfilment, never donors:
// a click on a filled cell opens the commitment, which holds the donor (DECISIONS 61).
const AVAIL: Record<Availability, [string, string]> = { open: ["Open", "ready"], part: ["Part funded, has capacity", "review"], full: ["Full", "ok"], inactive: ["Inactive", "unrouted"] };

export function outcomesPage(v: View): string {
  const outcomes = v.outcomes ?? [];
  const allocations = v.allocations ?? [];
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const byKey = new Map(commitments.map((c) => [c.subscriptionId, c]));
  const opts = allocOptions(v.projects ?? [], v.graceDays, today, v.requireRef === true, v.giftProjects ?? []);
  const fills = new Map(outcomes.map((o) => [o.id, fillOf(o, fws, allocations, commitments, opts.policy)]));
  const waiting = autoAllocate(commitments, outcomes, fws, allocations, "", opts).unplaced; // a dry run: nothing is saved
  const hold = holdingReport(commitments, fws, opts.policy);
  const why = [hold.noFramework ? `${hold.noFramework} have no workflow (set one for the item on the Workflows page)` : "", hold.noRule ? `${hold.noRule} are on a framework that does not say how an instalment counts (open it on the Categories tab and set it)` : "", hold.cancelled ? `${hold.cancelled} are cancelled in the CRM` : "", hold.finished ? `${hold.finished} are fully paid` : ""].filter((x) => x !== "");
  const holdNote = `<p class="muted">${hold.total} commitment${hold.total === 1 ? "" : "s"}, ${hold.holding} asking for capacity${why.length ? `. Not asking: ${why.join("; ")}` : ""}.</p>`;
  const count = (s: Availability) => outcomes.filter((o) => fills.get(o.id)?.state === s).length;
  const fwName = (id: string) => fws.find((f) => f.id === id)?.name ?? "No workflow";
  const cohorts = [...new Set(outcomes.map((o) => o.cohort))];

  // One row per outcome, one small pie per month. A pie has a slice for each unit of capacity (3 parts, 3 slices), coloured by status:
  // paid green, expected orange, missed red, nothing expected grey. A slice that holds a commitment is a button that opens it (DECISIONS 62).
  const months = monthsAround(today, 5, 6);
  const NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthPie = (slots: { status: UnitStatus; commitmentKey: string }[], label: string, off = false): string => {
    const n = slots.length;
    if (n === 0) return "";
    const R = 9, C = 2 * Math.PI * R;
    const arcs = slots.map((sl, i) => {
      const len = C / n;
      const on = sl.commitmentKey !== "";
      const attrs = on ? ` data-open-commit="${esc(sl.commitmentKey)}" tabindex="0" role="button"` : "";
      return `<circle class="seg ${off ? "x" : sl.status}" cx="12" cy="12" r="${R}" fill="none" stroke-width="6" stroke-dasharray="${n === 1 ? C : Math.max(len - (n > 1 ? 1.2 : 0), 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 12 12)"${attrs}><title>${esc(label)}: ${{ p: "paid", e: "expected", m: "missed", f: "nothing expected" }[sl.status]}${on ? ", commitment " + esc(sl.commitmentKey) : ""}</title></circle>`;
    });
    return `<svg class="mpie" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${esc(label)}">${arcs.join("")}</svg>`;
  };
  const f0 = v.ocFilter ?? { cohort: "", type: "", status: "" };
  const types = [...new Set(outcomes.map((o) => o.type))].filter((t) => t !== "").sort();
  const shown = outcomes.filter((o) => (f0.cohort === "" || o.cohort === f0.cohort) && (f0.type === "" || o.type === f0.type) && (f0.status === "" || fills.get(o.id)?.state === f0.status));
  const MAXROWS = 300;
  const heldIds = new Set(allocations.map((a) => a.outcomeId));
  const unusedShown = shown.filter((o) => !heldIds.has(o.id));
  const head = `<thead><tr><th>Outcome</th><th>Cohort</th><th>Type</th>${months.map((m) => `<th class="m${m === today.slice(0, 7) ? " now" : ""}">${NAME[Number(m.slice(5, 7)) - 1]}</th>`).join("")}<th>Now</th><th></th></tr></thead>`;

  // One line per outcome: name, cohort, type, a pie per month, availability. The slices are the units the framework gives it (DECISIONS 62, 63).
  const row = (o: Outcome) => {
    const f = fills.get(o.id) as ReturnType<typeof fillOf>;
    const [label, cls] = AVAIL[f.state];
    const mine = allocations.filter((a) => a.outcomeId === o.id && byKey.has(a.commitmentKey));
    const rowMonths = timelineOf(o, fws, allocations, commitments, months, today, opts.policy);
    return `<tr><td><b>${esc(o.name)}</b><div class="muted">${f.used} of ${f.capacity} units${f.capacity === 0 ? ", no framework units" : ""}</div></td><td>${esc(o.cohort) || `<span class="muted">none</span>`}</td><td>${esc(o.type)}<div class="muted">${esc(fwName(o.frameworkId))}</div></td>
      ${rowMonths.map((m) => `<td class="m">${monthPie(m.slots, `${NAME[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`, !o.active)}</td>`).join("")}
      <td><span class="pill ${cls}">${label}</span></td>
      <td class="acts"><button data-oc-active="${esc(o.id)}" data-active="${o.active ? "0" : "1"}" title="${o.active ? "Offboard: its commitments are released and placed elsewhere" : "Make active again"}">${o.active ? "Offboard" : "Activate"}</button>${mine.length === 0 ? `<button data-oc-remove="${esc(o.id)}" title="Remove this outcome">Remove</button>` : ""}</td></tr>`;
  };
  const opt = (value: string, label: string, cur: string) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;
  const filters = `<div class="actions"><select data-ocf="cohort">${opt("", "All cohorts", f0.cohort)}${cohorts.filter((c) => c !== "").map((c) => opt(c, c, f0.cohort)).join("")}</select>
    <select data-ocf="type">${opt("", "All types", f0.type)}${types.map((t) => opt(t, t, f0.type)).join("")}</select>
    <select data-ocf="status">${opt("", "All statuses", f0.status)}${opt("open", "Open", f0.status)}${opt("part", "Part funded", f0.status)}${opt("full", "Full", f0.status)}${opt("inactive", "Inactive", f0.status)}</select></div>
    <div class="legendrow"><span class="lg"><i class="sw p"></i>Paid</span><span class="lg"><i class="sw e"></i>Expected</span><span class="lg"><i class="sw m"></i>Missed</span><span class="lg"><i class="sw f"></i>Nothing expected</span><span class="lg"><i class="sw x"></i>Inactive</span><span class="muted">One slice for each unit the framework gives an outcome. Click a slice to open its commitment.</span></div>`;

  // The commitment that is open: who it is from, what it is, where it is allocated, and how to move or release it.
  const open = byKey.get(v.openCommit ?? "");
  const alloc = open ? allocations.find((a) => a.commitmentKey === open.subscriptionId) : undefined;
  const moveTargets = open ? outcomes.filter((o) => o.active && o.frameworkId === open.frameworkId && o.id !== alloc?.outcomeId) : [];
  const detail = open
    ? `<div class="card detailcard"><h2>${open.once ? "One payment" : "Commitment"} ${esc(open.once ? open.lines[0]?.key ?? "" : open.subscriptionId)}</h2>
        <dl class="dl"><dt>Donor</dt><dd>${esc(open.supporterName)} <span class="muted">${esc(open.supporterId)}</span></dd>
        <dt>Item</dt><dd>${esc(open.itemName)}</dd>
        <dt>Plan</dt><dd>${open.once ? `${open.partsPerInstalment} part${open.partsPerInstalment === 1 ? "" : "s"}, paid at once for ${open.planned} month${open.planned === 1 ? "" : "s"} (${esc(open.paidMonths[0] ?? "")} to ${esc(open.endMonth ?? "")})` : `${open.partsPerInstalment} part${open.partsPerInstalment === 1 ? "" : "s"} each instalment, ${open.paid} of ${open.planned ?? "ongoing"} paid${open.legacyOpening ? " (plus earlier instalments paid on the old website)" : ""}`}</dd>
        <dt>Paid</dt><dd>${open.firstPaid ? `${esc(shortDate(open.firstPaid))} to ${esc(shortDate(open.lastPaid))}` : "none since the load"}</dd>
        <dt>Framework</dt><dd>${esc(fwName(open.frameworkId))}</dd>
        <dt>Allocated to</dt><dd>${alloc ? `${esc(outcomes.find((o) => o.id === alloc.outcomeId)?.name ?? alloc.outcomeId)} <span class="muted">(${alloc.how === "auto" ? "automatically" : "moved by a person"})</span>` : `<span class="muted">Not allocated</span>`}</dd></dl>
        ${alloc ? `<div class="actions"><select data-oc-move="${esc(open.subscriptionId)}"><option value="">Move to another outcome...</option>${moveTargets.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${fills.get(o.id)?.free ?? 0} free)</option>`).join("")}</select><button data-oc-release="${esc(open.subscriptionId)}">Release</button><button data-oc-close>Close</button></div>` : `<div class="actions"><button data-oc-close>Close</button></div>`}</div>`
    : "";

  return `
    <h1>Month by month</h1>
    <p class="sub">What the gifts are for: a child, a student, a widow, a building, an activity. Each outcome has a workflow, which gives it a capacity in units. Recurring commitments and one-off payments for a number of months fill that capacity automatically, oldest first. Each outcome is one row of months. Each month is a small pie with a slice for every unit of capacity (an orphan has 3 parts, so 3 slices), coloured by status: paid (green), expected (orange), missed (red), nothing expected (grey). Click a slice to open its commitment, which holds the donor.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(outcomes.length, "Outcomes")}${metric(count("open"), "Open")}${metric(count("part"), "Part funded")}${metric(count("full"), "Full", "ok")}${metric(waiting.length, "Commitments waiting", waiting.length ? "warn" : "")}</div>
    <div class="actions"><button class="primary" data-action="auto-allocate"${outcomes.length ? "" : " disabled"}>Allocate automatically</button>
      <span class="muted">Releases what no longer holds, then places each waiting commitment in the first outcome with room. Nothing already allocated is moved.</span></div>
    ${holdNote}
    ${unusedShown.length ? `<div class="actions"><button data-action="remove-unused" data-ids="${esc(unusedShown.slice(0, 1000).map((o) => o.id).join(","))}" title="Removes the outcomes in the list below that hold no commitments. Use the filters to choose which">Remove ${Math.min(unusedShown.length, 1000)} unused outcome${unusedShown.length === 1 ? "" : "s"} in the list</button></div>` : ""}
    ${detail}
    ${waiting.length ? `<div class="card"><h2>Commitments waiting <span class="muted">(${waiting.length})</span></h2><table><tbody>${waiting.slice(0, 50).map((w) => { const c = byKey.get(w.commitmentKey); return `<tr><td><button class="linkbtn" data-open-commit="${esc(w.commitmentKey)}">Commitment ${esc(w.commitmentKey)}</button></td><td>${esc(c?.itemName ?? "")} <span class="muted">${c?.partsPerInstalment ?? 0} part${c?.partsPerInstalment === 1 ? "" : "s"}</span></td><td class="muted">${esc(w.why)}</td></tr>`; }).join("")}</tbody></table>${waiting.length > 50 ? `<p class="muted">Showing 50 of ${waiting.length}.</p>` : ""}</div>` : ""}
    ${outcomes.length === 0 ? `<div class="card empty">No beneficiaries yet. Add them on the Projects page.</div>` : `<h2>12-month status</h2>${filters}<div class="card octablewrap">${shown.length === 0 ? `<div class="empty">No outcomes match the filters.</div>` : `<table class="octable">${head}<tbody>${shown.slice(0, MAXROWS).map(row).join("")}</tbody></table>${shown.length > MAXROWS ? `<p class="muted">Showing ${MAXROWS} of ${shown.length}. Use the filters to narrow the list.</p>` : ""}`}</div>`}`;

}
