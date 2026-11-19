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
import { filterWorkOrders, isFiltering, NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { noIndividualDonor } from "../modules/01c-crm-connector/credits";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import type { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import type { ReviewItem, WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { RunInfo } from "../modules/00-platform/store";
import { CYCLE_LABELS, groupItems, missingFramework, type Category, type Cycle, type ItemInfo } from "../modules/02-project-rules/categories";

export type Filter = "all" | "ready" | "unrouted" | "review" | "excluded";

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
  message: string;
  config: typeof MWF_CRM_CONFIG;
  categories: Category[];
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

const categoryName = (categories: Category[], id: string) => categories.find((c) => c.id === id)?.name ?? (id === "default" ? "Default journey" : id);

// A category picker. `item` is the CRM item id that the choice applies to.
const picker = (categories: Category[], item: string, current: string) =>
  `<select data-assign="${esc(item)}"><option value="">Choose category...</option>${categories.map((c) => `<option value="${c.id}"${c.id === current ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`;

const metric = (value: number, label: string, cls = "") => `<div class="metric ${cls}"><b>${value}</b><span>${label}</span></div>`;

// Rule shown to staff: the instalment as "2 of 12" or "2 of Indefinitely". Blank for a one-off.
const instalment = (w: WorkOrder) => (w.instalmentNumber === "" ? `<span class="muted">One-off</span>` : `${esc(w.instalmentNumber)} of ${esc(w.instalmentCount)}`);

// The last pick-up, in plain words (live only).
function liveBar(v: View): string {
  const r = v.run;
  if (!r) return `<div class="note">No pick-up has run yet. Work orders appear after the first pick-up from the CRM.</div>`;
  const when = esc(r.at.replace("T", " ").slice(0, 16));
  return r.ok
    ? `<p class="muted">Last pick-up ${when} UTC: read ${r.rows} lines, ${r.created} new work orders, ${r.rerouted} routed, ${r.skipped} left out${r.issues.length ? `, ${r.issues.length} notice${r.issues.length === 1 ? "" : "s"}: ${esc(r.issues.slice(0, 3).join(" "))}${r.issues.length > 3 ? ` and ${r.issues.length - 3} more (see Needs attention)` : ""}` : ""}.</p>`
    : `<div class="note" style="background:var(--bad-bg)">The last pick-up (${when} UTC) did not finish: ${esc(r.error)} Earlier work orders are kept.</div>`;
}

// Demo only: the owner signs in with a passphrase to use saved data. It is a plain form post, so it works without any script. Rule: the passphrase goes to the server over HTTPS and is never kept in the page.
const ownerCard = (v: View): string => `<div class="card"><h2>Not signed in: nothing is being saved</h2>
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
const loadCard = (v: View): string => `<div class="card"><h2>Use your own CRM export files</h2>
  <p class="muted">Choose the Donation lines, Catalogue items and (optionally) Recurring plans files from the CRM Export Centre, all at once, then press Load. ${v.live ? "They are read in this browser. Only the lines needed for work orders and the audit are sent to your saved data, with no contact details." : "They are read in this browser only. Nothing is uploaded or saved, so sign in above first if you want to keep the result."}</p>
  <div class="filebox"><input type="file" id="feedfile" multiple accept=".csv,text/csv"${v.loading ? " disabled" : ""}></div>
  ${v.pendingFiles?.length ? `<p>Chosen: ${v.pendingFiles.map(esc).join(", ")}</p>` : ""}
  <div class="actions loadbox"><button class="primary" data-action="load-files"${v.loading ? " disabled" : ""}>Load the chosen files</button></div>
  ${v.loading ? `<div class="progress"><span class="spinner"></span><span>${esc(v.loading)}</span></div>` : ""}
  ${v.loadNote && !v.loading ? `<div class="note">${esc(v.loadNote)}</div>` : ""}</div>`;

// Who else the gift is credited to (agent, group, organisation), and a flag when there is no individual donor (DECISIONS 44). Empty when the feed has neither.
const creditLine = (w: WorkOrder): string => {
  const chain = (w.credits ?? []).map((c) => `${c.role ? esc(c.role) + ": " : ""}${esc(c.name || c.id)}`).join(" › ");
  const flag = noIndividualDonor(w) && (w.credits?.length || w.supporterKind === "group") ? ` <span class="pill review">No individual donor</span>` : "";
  return chain || flag ? `<div class="muted">${chain ? "Credited: " + chain : ""}${flag}</div>` : "";
};

// Which work orders a list shows before the filter boxes apply. "main" is the Work orders page (by its tab); "a:<entry id>" is a Needs attention entry.
// Rule: the lines under an entry are found from the work orders themselves, so they always match what the page holds (DECISIONS 49).
export function listBase(v: View, id: string): WorkOrder[] {
  if (id === "main") {
    const reviewKeys = new Set(v.review.map((r) => r.key));
    return v.workOrders.filter((w) => (v.filter === "all" ? w.status !== "excluded" : v.filter === "review" ? reviewKeys.has(w.key) && w.status !== "excluded" : w.status === v.filter));
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
  if (/instalment count/i.test(i.detail)) return v.workOrders.filter((w) => w.subscriptionId === "" && w.instalmentCount !== "");
  return [];
}

export const criteriaFor = (v: View, id: string): Criteria => (id === "main" ? v.criteria : v.scopeCriteria?.[id]) ?? NO_CRITERIA;

// The filter boxes above a list. Typing or choosing only redraws the list, never the boxes (main.ts), so typing is not interrupted.
function filterBar(v: View, id: string, base: WorkOrder[]): string {
  const c = criteriaFor(v, id);
  const items = new Map<string, string>();
  for (const w of base) items.set(w.itemId, w.itemName);
  const opt = (value: string, label: string, cur: string) => `<option value="${esc(value)}"${value === cur ? " selected" : ""}>${esc(label)}</option>`;
  const d = `data-scope="${esc(id)}"`;
  return `<div class="card filters">
    <input type="search" data-f="text" ${d} placeholder="Search line id, order reference, supporter, item, subscription..." value="${esc(c.text)}">
    <select data-f="itemId" ${d}><option value="">All items</option>${[...items].sort((a, b) => a[1].localeCompare(b[1])).map(([k, name]) => opt(k, name, c.itemId)).join("")}</select>
    <select data-f="categoryId" ${d}><option value="">All categories</option>${v.categories.map((x) => opt(x.id, x.name, c.categoryId)).join("")}</select>
    ${id === "main" ? "" : `<select data-f="status" ${d}>${opt("", "Any status", c.status)}${opt("unrouted", "Unrouted", c.status)}${opt("ready", "Ready", c.status)}${opt("excluded", "Excluded", c.status)}</select>`}
    <select data-f="kind" ${d}>${opt("any", "One-off and recurring", c.kind)}${opt("recurring", "Recurring only", c.kind)}${opt("oneoff", "One-off only", c.kind)}</select>
    <label class="muted">Paid from <input type="date" data-f="from" ${d} value="${esc(c.from)}"></label>
    <label class="muted">to <input type="date" data-f="to" ${d} value="${esc(c.to)}"></label>
    <button data-action="clear-filters" data-scope="${esc(id)}">Clear filters</button></div>`;
}

const MAX_ROWS = 500; // the most rows drawn at once. The filter boxes narrow the rest.

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
            <td>${esc(w.transactionRef) || `<span class="muted">no reference</span>`}<div class="muted">Line ${esc(w.key)} · ${esc(w.paidDate)}</div></td>
            <td>${esc(w.supporterName)}<div class="muted">${esc(w.supporterId)}${w.group ? " · " + esc(w.group) : ""}</div>${creditLine(w)}</td>
            <td>${esc(w.itemName)}</td><td>${instalment(w)}</td>
            <td>${w.status === "unrouted" ? picker(v.categories, w.itemId, "") : esc(categoryName(v.categories, w.categoryId))}</td>
            <td>${w.status === "excluded" ? "" : `<span class="pill ${w.status === "unrouted" ? "unrouted" : "ready"}">${w.status === "unrouted" ? "Unrouted" : "Ready"}</span>`}${reviewKeys.has(w.key) ? ` <span class="pill review">Review</span>` : ""}${w.status === "excluded" ? `<span class="pill unrouted">Excluded</span><div class="muted">${esc(w.exclusion?.reason ?? "")}${w.exclusion ? ` (${esc(w.exclusion.by)}, ${esc(w.exclusion.at.slice(0, 10))})` : ""}</div>` : ""}</td>
            <td>${w.status === "excluded" ? `<button data-excl="${esc(w.key)}" data-excl-action="restore">Restore</button>` : w.status === "unrouted" || w.status === "ready" ? `<button data-excl="${esc(w.key)}" data-excl-action="exclude">Exclude</button>` : ""}</td></tr>`,
          )
          .join("")}</tbody></table>`
  }`;
}

// The Work orders page list, kept under its old name.
export const workOrderList = (v: View): string => listHtml(v, "main");

export function workOrdersPage(v: View): string {
  // Rule: excluded work orders are out of the active list and the counts. They show only under the Excluded tab (DECISIONS 47).
  const active = v.workOrders.filter((w) => w.status !== "excluded");
  const count = (s: string) => v.workOrders.filter((w) => w.status === s).length;
  const tab = (id: Filter, label: string) => `<button data-filter="${id}" class="${v.filter === id ? "on" : ""}">${label}</button>`;
  return `
    <h1>Work orders</h1>
    <p class="sub">Arrive from the CRM feed. Only items the CRM marks as needing feedback appear here, so nothing is imported by hand.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(active.length, "Work orders")}${metric(count("ready"), "Ready", "ok")}${metric(count("unrouted"), "Unrouted", count("unrouted") ? "warn" : "")}${metric(v.review.length, "To review", v.review.length ? "warn" : "")}</div>
    ${v.live ? liveBar(v) : ""}
    <div class="actions">
      <button class="primary" data-action="refresh">${v.live ? "Reload" : "Refresh from CRM"}</button>
      ${v.live ? (v.canPickup ? `<button data-action="pickup-now">Run pickup now</button>` : "") : `<button data-action="demo-new">Demo: a new paid line arrives in the CRM</button>
      <button data-action="demo-change">Demo: the CRM changes an amount</button>`}
    </div>
    ${v.live ? "" : ownerCard(v)}
    ${v.live && !v.upload ? "" : loadCard(v)}
    <div class="tabs">${tab("all", "All")}${tab("ready", "Ready")}${tab("unrouted", "Unrouted")}${tab("review", "To review")}${tab("excluded", `Excluded (${count("excluded")})`)}</div>
    ${listBlock(v, "main")}
    ${
      v.review.length
        ? `<div class="card"><h2>Held for review</h2><p class="muted">These changed in the CRM after the work order was made. Nothing was changed automatically.</p><table><tbody>${v.review.map((r) => `<tr><td>${esc(r.key)}</td><td>${esc(r.message)}</td></tr>`).join("")}</tbody></table></div>`
        : ""
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

export function categoriesPage(v: View): string {
  const items: ItemInfo[] = v.flaggedItems.map((i) => ({ id: i.id, name: i.name }));
  const { unsorted, byCategory } = groupItems(items, v.itemCategories, v.categories);
  const nSuggest = Object.keys(v.suggestions).length;
  // A category tile: name, how many items, the drop zone. The framework (the flow settings) is under "Edit".
  const card = (c: Category) => {
    const missing = missingFramework(c);
    const list = byCategory[c.id] ?? [];
    return `<div class="card fw"><div class="fwname"><b>${esc(c.name)}</b> <span class="muted">(${list.length})</span></div>
      <div class="zone" data-drop="${c.id}">${list.map((i) => chip(i, v)).join("") || `<span class="muted">Drop items here</span>`}</div>
      <details><summary>Edit and framework${missing.length ? ` <span class="pill unrouted">to fill in</span>` : ""}</summary>
        <div class="fwhead"><input class="title" data-rename="${c.id}" value="${esc(c.name)}" /><button data-remove="${c.id}" title="Remove this category (its items go back to unsorted)">Remove</button></div>
        ${field("Words that suggest this category", `<input data-keywords="${c.id}" value="${esc(c.keywords.join(", "))}" />`)}
        <h4 class="fwtitle">Framework: the flow of every order in this category</h4>
        ${field("What one delivery is (unit)", `<input data-rule="unit" data-fw="${c.id}" value="${esc(c.framework.unit)}" placeholder="for example child, pump, animal" />`)}
        ${field("How often the donor hears back", `<select data-rule="cycle" data-fw="${c.id}">${(Object.keys(CYCLE_LABELS) as Cycle[]).map((y) => `<option value="${y}"${y === c.framework.cycle ? " selected" : ""}>${CYCLE_LABELS[y]}</option>`).join("")}</select>`)}
        ${field("Report the donor receives", `<input data-rule="reportType" data-fw="${c.id}" value="${esc(c.framework.reportType)}" placeholder="for example Quarterly update" />`)}
        <p class="muted">Duration and instalments are not set here. They come from the CRM item.</p></details></div>`;
  };
  return `
    <h1>Categories</h1>
    <p class="sub">The CRM says which items need feedback. Drag each item into its category (or tap an item, then tap a category). A category's framework decides the flow of every order in it. Categories are kept in OUTCOMES, not in the CRM.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-action="accept-suggestions"${nSuggest ? "" : " disabled"}>Accept ${nSuggest} suggestion${nSuggest === 1 ? "" : "s"}</button>
      <input id="newcat" placeholder="New category name" /><button data-action="add-category">Add category</button></div>
    <div class="board"><div class="unsorted"><div class="card"><h2>Unsorted items <span class="muted">(${unsorted.length})</span></h2><p class="muted">Work orders for these stay unrouted. Nothing is lost.</p>
      <div class="zone" data-drop="">${unsorted.map((i) => chip(i, v, v.suggestions[i.id] ? categoryName(v.categories, v.suggestions[i.id] as string) : "")).join("") || `<span class="muted">Everything is sorted.</span>`}</div></div></div>
      <div>${v.categories.length ? `<div class="fwgrid">${v.categories.map(card).join("")}</div>` : `<div class="card empty">No categories yet. Add one.</div>`}</div></div>`;
}

export const sourcesPage = (): string => `
    <h1>Other sources</h1>
    <p class="sub">For organisations with no CRM, and for testing. Upload a file or read a Google Sheet, then map its columns to OUTCOMES' own fields.</p>
    <div class="card"><a class="btn primary" href="../modules/01-data-mapping/ui/index.html" style="text-decoration:none;display:inline-block">Open the file and field mapping page</a>
    <p class="muted">This is Module 1. It will move inside this shell once the connected screens are agreed.</p></div>`;

export const settingsPage = (v: View): string => `
    <h1>Settings</h1><p class="sub">Connector settings for this organisation. Roles and who may sign in are not set here: they come from the CRM (DECISIONS 32).</p>
    <div class="card"><h2>CRM connector (MWF CRM)</h2><table><tbody>
      <tr><td>Trigger column (item needs feedback)</td><td><code>${esc(v.config.triggerColumn)}</code></td></tr>
      <tr><td>Values that mean yes</td><td>${v.config.yesValues.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>Values that mean paid</td><td>${v.config.paidValues.map((x) => `<code>${esc(x)}</code>`).join(" ")}</td></tr>
      <tr><td>How the feed is read</td><td>Database view or API (chosen per organisation)</td></tr></tbody></table>
    <p class="muted">In this demo the settings are read-only and the feed is the invented sample.</p></div>`;

const kindWord: Record<string, string> = { added: "New", changed: "Changed", moved: "Moved to another item", no_longer_needs_feedback: "No longer needs feedback", removed: "No longer in the CRM" };

// The batch audit (DECISIONS 21, 43): what each import found compared with what was saved. It only reports.
export function auditPage(v: View): string {
  const audits = v.audits ?? [];
  const latest = audits[0];
  const row = (a: AuditRecord) => `<tr><td>${esc(a.at.slice(0, 16).replace("T", " "))}</td><td>${esc(a.source)}</td><td>${a.lines}</td>
    <td>${a.coverage.from ? esc(a.coverage.from) + " to " + esc(a.coverage.to) : ""}</td>
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
      i.kind === "unrouted" && i.itemId !== undefined ? picker(v.categories, i.itemId, "")
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
