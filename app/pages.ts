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
import { noIndividualDonor } from "../modules/01c-crm-connector/credits";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import type { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import type { ReviewItem, WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { RunInfo } from "../modules/00-platform/store";
import { CYCLE_LABELS, groupItems, missingFramework, type Category, type Cycle, type ItemInfo } from "../modules/02-project-rules/categories";

export type Filter = "all" | "ready" | "unrouted" | "review";

export interface View {
  workOrders: WorkOrder[];
  review: ReviewItem[];
  itemCategories: Record<string, string>;
  flaggedItems: { id: string; name: string; count: number }[]; // CRM items that need feedback, with how many work orders each has
  filter: Filter;
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
    ? `<p class="muted">Last pick-up ${when} UTC: read ${r.rows} lines, ${r.created} new work orders, ${r.rerouted} routed, ${r.skipped} left out${r.issues.length ? `, ${r.issues.length} notice(s): ${esc(r.issues.join(" "))}` : ""}.</p>`
    : `<div class="note" style="background:var(--bad-bg)">The last pick-up (${when} UTC) did not finish: ${esc(r.error)} Earlier work orders are kept.</div>`;
}

// Demo only: load your own CRM export files. They are read in this browser and go nowhere else.
// Two steps so it is clear what happens: choose the files, then press the button.
// Demo only: the owner signs in with a passphrase to use saved data. Rule: the passphrase is sent to the server over HTTPS and never kept in the page.
const ownerCard = (v: View): string => `<div class="card"><h2>Owner sign-in</h2>
  <p class="muted">Sign in to save your work on the server, so you can come back to it. Without it, everything on this page is forgotten when you close it.</p>
  <div class="filebox"><input type="password" id="ownerpass" placeholder="Owner passphrase" autocomplete="current-password"></div>
  <div class="actions loadbox"><button data-action="owner-login">Sign in</button></div>
  ${v.message && /passphrase|sign-in/i.test(v.message) ? `<div class="note">${esc(v.message)}</div>` : ""}</div>`;

const loadCard = (v: View): string => `<div class="card"><h2>Use your own CRM export files</h2>
  <p class="muted">Choose the Donation lines, Catalogue items and (optionally) Recurring plans files from the CRM Export Centre, all at once, then press Load. ${v.live ? "They are read in this browser. Only the lines needed for work orders and the audit are sent to your saved data, with no contact details." : "They are read in this browser only. Nothing is uploaded or saved."}</p>
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

export function workOrdersPage(v: View): string {
  const reviewKeys = new Set(v.review.map((r) => r.key));
  const count = (s: string) => v.workOrders.filter((w) => w.status === s).length;
  const rows = v.workOrders.filter((w) => (v.filter === "all" ? true : v.filter === "review" ? reviewKeys.has(w.key) : w.status === v.filter));
  const tab = (id: Filter, label: string) => `<button data-filter="${id}" class="${v.filter === id ? "on" : ""}">${label}</button>`;
  return `
    <h1>Work orders</h1>
    <p class="sub">Arrive from the CRM feed. Only items the CRM marks as needing feedback appear here, so nothing is imported by hand.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(v.workOrders.length, "Work orders")}${metric(count("ready"), "Ready", "ok")}${metric(count("unrouted"), "Unrouted", count("unrouted") ? "warn" : "")}${metric(v.review.length, "To review", v.review.length ? "warn" : "")}</div>
    ${v.live ? liveBar(v) : ""}
    <div class="actions">
      <button class="primary" data-action="refresh">${v.live ? "Reload" : "Refresh from CRM"}</button>
      ${v.live ? (v.canPickup ? `<button data-action="pickup-now">Run pickup now</button>` : "") : `<button data-action="demo-new">Demo: a new paid line arrives in the CRM</button>
      <button data-action="demo-change">Demo: the CRM changes an amount</button>`}
    </div>
    ${v.live && !v.upload ? "" : loadCard(v)}
    ${v.live ? "" : ownerCard(v)}
    <div class="tabs">${tab("all", "All")}${tab("ready", "Ready")}${tab("unrouted", "Unrouted")}${tab("review", "To review")}</div>
    <div class="card">${
      rows.length === 0
        ? `<div class="empty">No work orders in this list.</div>`
        : `<table><thead><tr><th>Reference</th><th>Supporter</th><th>Item</th><th>Instalment</th><th>Category</th><th>Status</th></tr></thead><tbody>${rows
            .map(
              (w) => `<tr><td>${esc(w.transactionRef)}<div class="muted">${esc(w.paidDate)}</div></td>
              <td>${esc(w.supporterName)}<div class="muted">${esc(w.supporterId)}${w.group ? " · " + esc(w.group) : ""}</div>${creditLine(w)}</td>
              <td>${esc(w.itemName)}</td><td>${instalment(w)}</td>
              <td>${w.status === "unrouted" ? picker(v.categories, w.itemId, "") : esc(categoryName(v.categories, w.categoryId))}</td>
              <td><span class="pill ${w.status === "unrouted" ? "unrouted" : "ready"}">${w.status === "unrouted" ? "Unrouted" : "Ready"}</span>${reviewKeys.has(w.key) ? ` <span class="pill review">Review</span>` : ""}</td></tr>`,
            )
            .join("")}</tbody></table>`
    }</div>
    ${
      v.review.length
        ? `<div class="card"><h2>Held for review</h2><p class="muted">These changed in the CRM after the work order was made. Nothing was changed automatically.</p><table><tbody>${v.review.map((r) => `<tr><td>${esc(r.key)}</td><td>${esc(r.message)}</td></tr>`).join("")}</tbody></table></div>`
        : ""
    }`;
}

export function dashboardPage(v: View): string {
  const total = Math.max(v.workOrders.length, 1);
  const byFw = new Map<string, number>();
  for (const w of v.workOrders) byFw.set(w.categoryId || "", (byFw.get(w.categoryId || "") ?? 0) + 1);
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
  const card = (i: AttentionItem) => `<tr><td><b>${esc(i.title)}</b><div class="muted">${esc(i.detail)}</div>${i.note ? `<div class="muted">Note: ${esc(i.note)}</div>` : ""}</td>
    <td style="text-align:right;white-space:nowrap">${
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
