/**
 * main.ts
 *
 * What it does: draws the OUTCOMES shell (side menu, top bar, page area), keeps the demo state, and
 * handles clicks. The work-order rules are in modules/01c-crm-connector, the menu rules in menu.ts.
 * Who calls it: index.html.
 * Depends on: menu.ts, pages.ts, demo-data.ts and the connector module.
 *
 * Demo mode: the CRM sign-in is imitated by a role picker in the top bar, so you can see how the
 * menu follows a CRM role (DECISIONS 32). Nothing is saved and no real login happens.
 */

import { MWF_CRM_CONFIG, readFeed, type FeedRow } from "../modules/01c-crm-connector/feed";
import { addOutcomes, autoAllocate, perPeriodRule, moveAllocation, releaseAllocation, removeOutcome, setActive, type Allocation, type Outcome } from "../modules/05-outcomes/outcomes";
import { allocatable } from "../modules/04b-commitments/commitments";
import { filterWorkOrders, NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { excludeWorkOrder, planWorkOrders, restoreWorkOrder, type ReviewItem, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { acceptSuggestions, addCategory, addFramework, assignItem, duplicateFramework, frameworkByItem, removeCategory, removeFramework, renameCategory, renameFramework, setCategoryFramework, setItemFramework, setKeywords, suggestAll, updateTemplate, type Cycle, type FrameworkTemplate, type InstalmentRule, type Setup } from "../modules/02-project-rules/categories";
import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import { adaptFiles } from "../modules/01e-crm-export-adapter/export-adapter";
import { buildAttention, type AttentionItem } from "../modules/04-triage/triage";
import { changeOutcomes, loadOutcomes, decideAttention, setExcluded, importFeed, loadAttention, loadAudits, loadConfig, loadWorkOrders, fetchMe, runPickupNow, saveConfig, type Me } from "./api";
import { packFeed } from "../modules/01e-crm-export-adapter/compact";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import { PERMISSIONS } from "./menu";
import { DEMO_ROLES, demoCategories, demoFeedRows, starterFrameworks, suggestItemFrameworks } from "./demo-data";
import { landingPage, menuEntries, visibleMenu, type PageId } from "./menu";
import { outcomesPage, commitmentsPage, commitmentList, listBlock, listHtml, listBase, workOrderList, attentionPage, auditPage, signinNote, dashboardPage, esc, categoriesPage, settingsPage, sourcesPage, workOrdersPage, type Filter, type View } from "./pages";

const state = {
  live: (): boolean => state.me !== null,
  roleId: "admin",
  page: "work-orders" as PageId,
  feedRows: demoFeedRows() as FeedRow[],
  workOrders: [] as WorkOrder[],
  review: [] as ReviewItem[],
  itemCategories: {} as Record<string, string>, // every item starts unsorted, so the demo shows the whole flow
  categories: demoCategories(),
  frameworks: starterFrameworks() as FrameworkTemplate[], // framework templates (DECISIONS 59)
  itemFramework: {} as Record<string, string>, // an item's own framework, where it differs from its category
  selectedItem: "",
  filter: "all" as Filter,
  criteria: { ...NO_CRITERIA } as Criteria, // the Work orders filter boxes
  scopeCriteria: {} as Record<string, Criteria>, // the filter boxes inside Needs attention entries, by list id
  selected: [] as string[], // work orders ticked for a bulk exclude or restore
  openAttn: [] as string[], // Needs attention entries whose lines are open
  outcomes: [] as Outcome[], // what gifts are allocated to (DECISIONS 61)
  allocations: [] as Allocation[],
  ocFilter: { cohort: "", type: "", status: "" }, // the Outcomes list filters
  openCommit: "", // the commitment whose details are open on the Outcomes page
  commitTab: "all", // Commitments page tab
  commitText: "", // Commitments page search text
  message: "",
  pendingFiles: [] as File[], // export files chosen but not loaded yet (demo only)
  loadNote: "", // what the last load did, shown in the load card
  audits: [] as AuditRecord[], // batch audit history (live only)
  attention: [] as AttentionItem[], // Needs attention, from the server when live (Module 4)
  ownerNote: "", // what the last owner sign-in attempt said
  loading: "", // what the load is doing right now, "" when idle (shows a spinner)
  me: null as Me | null, // set when signed in from the CRM (live mode)
  run: null as import("../modules/00-platform/store").RunInfo | null,
};

const permissions = () => (state.me ? state.me.perms : DEMO_ROLES.find((r) => r.id === state.roleId)?.permissions ?? []);

// Run the CRM feed through the connector and bring the work orders up to date.
function refresh(): void {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines;
  const plan = planWorkOrders(lines, state.workOrders, { categoryByItem: state.itemCategories, frameworkByItem: frameworkByItem(setupNow()), usesFrameworks: true, feedIsComplete: true });
  const rerouted = new Map(plan.rerouted.map((w) => [w.key, w]));
  state.workOrders = [...state.workOrders.map((w) => rerouted.get(w.key) ?? w), ...plan.created];
  state.review = plan.review;
  state.message = `Refreshed from the CRM: ${plan.created.length} new, ${plan.rerouted.length} routed, ${plan.review.length} to review.`;
}

// ---- Live mode: signed in from the CRM, data comes from the server ----

// Rule: in live mode the items to sort come from the work orders the server holds, not from a sample feed.
async function reloadLive(): Promise<void> {
  try {
    const r = await loadWorkOrders();
    state.workOrders = r.workOrders;
    state.review = r.review;
    state.run = r.run;
    state.attention = (await loadAttention().catch(() => ({ items: [] as AttentionItem[] }))).items;
    await loadOutcomes().then((o) => { state.outcomes = o.outcomes; state.allocations = o.allocations; }).catch(() => undefined);
    state.audits = (await loadAudits().catch(() => ({ audits: [] as AuditRecord[] }))).audits;
    state.message = "";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not load.";
  }
}

// The setup as one value, for the pure functions.
const setupNow = (): Setup => ({ categories: state.categories, itemMap: state.itemCategories, frameworks: state.frameworks, itemFramework: state.itemFramework });

// Save the setup after any change, then reload so newly routed work orders show.
async function persistAndReload(): Promise<void> {
  if (!state.live()) return;
  try {
    const r = await saveConfig({ categories: state.categories, itemMap: state.itemCategories, frameworks: state.frameworks, itemFramework: state.itemFramework });
    await reloadLive();
    state.message = r.routed > 0 ? `Saved. ${r.routed} work order${r.routed === 1 ? "" : "s"} routed.` : "Saved.";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not save.";
  }
  draw();
}
const changed = (): void => void persistAndReload();
// After any change to the setup. Live: save it (and reload work orders). Demo: re-run the sample feed when asked to.
function afterConfig(rerun = true): void {
  if (state.live()) return changed();
  if (rerun) refresh();
}

async function enterLive(me: Me): Promise<void> {
  state.me = me;
  state.workOrders = [];
  state.review = [];
  try {
    const c = await loadConfig();
    // A new organisation has no categories yet: start from the MWF starter list and save it, staff then edit it.
    if (c.categories.length === 0) await saveConfig({ categories: state.categories, itemMap: {}, frameworks: state.frameworks, itemFramework: {} });
    else {
      state.categories = c.categories;
      state.frameworks = c.frameworks ?? [];
      state.itemFramework = c.itemFramework ?? {};
    }
    state.itemCategories = c.itemMap;
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not load.";
  }
  await reloadLive();
  draw();
  if (me.demo) startDemoRefresh();
}

// With the pretend CRM, new gifts arrive all the time, so the page picks them up by itself every minute.
// Rule: it only redraws on the work orders and dashboard pages, so it never interrupts dragging on the categories page.
let demoTimer: ReturnType<typeof setInterval> | undefined;
function startDemoRefresh(): void {
  if (demoTimer) return;
  demoTimer = setInterval(() => {
    if (state.page !== "work-orders" && state.page !== "dashboard") return;
    void runPickupNow().then(reloadLive).then(draw).catch(() => undefined);
  }, 60_000);
}

function view(): View {
  const items = new Map<string, { id: string; name: string; count: number }>();
  if (state.live()) for (const w of state.workOrders) items.set(w.itemId, { id: w.itemId, name: w.itemName, count: (items.get(w.itemId)?.count ?? 0) + 1 });
  else for (const l of readFeed(state.feedRows, MWF_CRM_CONFIG).lines.filter((x) => x.needsFeedback)) items.set(l.itemId, { id: l.itemId, name: l.itemName, count: (items.get(l.itemId)?.count ?? 0) + 1 });
  const flaggedItems = [...items.values()];
  return {
    workOrders: state.workOrders, review: state.review, itemCategories: state.itemCategories, flaggedItems, filter: state.filter, criteria: state.criteria, scopeCriteria: state.scopeCriteria, selected: state.selected, openAttn: state.openAttn, outcomes: state.outcomes, allocations: state.allocations, today: new Date().toISOString().slice(0, 10), ocFilter: state.ocFilter, openCommit: state.openCommit, commitTab: state.commitTab, commitText: state.commitText, message: state.message, config: MWF_CRM_CONFIG,
    categories: state.categories, frameworks: state.frameworks, itemFramework: state.itemFramework, itemFrameworkSuggestions: suggestItemFrameworks(flaggedItems, setupNow()), suggestions: suggestAll(flaggedItems, state.itemCategories, state.categories), selectedItem: state.selectedItem,
    pendingFiles: state.pendingFiles.map((f) => f.name), loadNote: state.loadNote, loading: state.loading, ownerNote: state.ownerNote, attention: state.live() ? state.attention : buildAttention({ workOrders: state.workOrders, review: state.review, notes: [], marks: {} }), audits: state.audits, upload: state.me?.upload === true, live: state.live(), canPickup: permissions().includes(PERMISSIONS.settings), run: state.run,
  };
}

// Put an item in a category (or back to unsorted with ""). Unrouted work orders for it are routed now.
// Rule: work orders that already have a category keep it, so work in progress never moves by accident.
function sortItem(itemId: string, categoryId: string): void {
  const keep = state.workOrders.filter((w) => w.itemId === itemId && w.status !== "unrouted" && w.categoryId !== categoryId).length;
  state.itemCategories = assignItem(state.itemCategories, state.categories, itemId, categoryId);
  if (state.live()) return changed();
  refresh();
  if (keep > 0) state.message += ` ${keep} existing work order${keep === 1 ? "" : "s"} for this item keep${keep === 1 ? "s" : ""} the category they already had.`;
}

// One change to the outcomes. Live: the server does it and answers with the new state. Demo: the same pure functions run here.
async function outcomeChange(body: Record<string, unknown>): Promise<void> {
  try {
    if (state.live()) {
      const r = await changeOutcomes(body);
      state.outcomes = r.outcomes;
      state.allocations = r.allocations;
      if (body["action"] === "auto") state.message = `Placed ${r.placed ?? 0}, released ${r.released ?? 0}, ${r.unplaced?.length ?? 0} waiting.`;
      else state.message = "";
    } else {
      const commitments = allocatable(state.workOrders, perPeriodRule(state.frameworks), new Date().toISOString().slice(0, 10));
      const at = new Date().toISOString();
      const str = (k: string) => String(body[k] ?? "");
      let error: string | undefined;
      switch (body["action"]) {
        case "add": { const r = addOutcomes(state.outcomes, { name: str("name"), count: Number(body["count"] ?? 1), type: str("type"), cohort: str("cohort"), frameworkId: str("frameworkId") }); if (!state.frameworks.some((f) => f.id === str("frameworkId"))) error = "Choose a framework for the outcome."; else if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "active": state.outcomes = setActive(state.outcomes, str("id"), body["active"] === true); break;
        case "remove": { const r = removeOutcome(state.outcomes, state.allocations, str("id")); if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "auto": { const r = autoAllocate(commitments, state.outcomes, state.frameworks, state.allocations, at); state.allocations = r.allocations; state.message = `Placed ${r.placed}, released ${r.released}, ${r.unplaced.length} waiting.`; break; }
        case "move": { const r = moveAllocation(state.allocations, commitments, state.outcomes, state.frameworks, str("commitmentKey"), str("outcomeId"), at); if (r.error) error = r.error; else state.allocations = r.value; break; }
        case "release": state.allocations = releaseAllocation(state.allocations, str("commitmentKey")); break;
      }
      state.message = error ?? (body["action"] === "auto" ? state.message : "");
    }
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}

// Applies an exclude or restore to the chosen work orders, on the server when live, in the browser in the demo.
async function applyExclusion(keys: string[], restoring: boolean, reason: string): Promise<void> {
  const word = restoring ? "Restored" : "Excluded";
  try {
    if (state.live()) {
      const r = await setExcluded(keys, restoring ? "restore" : "exclude", reason);
      const back = new Map(r.workOrders.map((w) => [w.key, w]));
      state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
      if (!restoring) state.review = state.review.filter((x) => !back.has(x.key));
      state.message = `${word} ${r.workOrders.length}.${r.skipped ? ` Skipped ${r.skipped}: ${r.firstError ?? ""}` : ""}`;
      await loadAttention().then((a) => (state.attention = a.items)).catch(() => undefined);
    } else {
      let done = 0;
      let firstError = "";
      state.workOrders = state.workOrders.map((w) => {
        if (!keys.includes(w.key)) return w;
        const r = restoring ? restoreWorkOrder(w) : excludeWorkOrder(w, reason, "Sample User", new Date().toISOString());
        if ("order" in r) { done++; return r.order; }
        firstError ||= r.error;
        return w;
      });
      state.message = `${word} ${done}.${keys.length - done ? ` Skipped ${keys.length - done}: ${firstError}` : ""}`;
    }
    state.selected = state.selected.filter((k) => !keys.includes(k));
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}

// The keys a list is showing now (after its filter boxes), for "tick all".
function listShownKeys(scope: string): string[] {
  const v = view();
  const c = scope === "main" ? state.criteria : state.scopeCriteria[scope] ?? NO_CRITERIA;
  return filterWorkOrders(listBase(v, scope), c).slice(0, 500).map((w) => w.key);
}

// Redraws every list (the ticked count is shown in each), leaving the filter boxes alone.
function redrawLists(): void {
  for (const el of Array.from(document.querySelectorAll("[data-list]"))) el.innerHTML = listHtml(view(), (el as HTMLElement).dataset.list as string);
}

function draw(): void {
  const menu = visibleMenu(permissions());
  const role = DEMO_ROLES.find((r) => r.id === state.roleId);
  // Rule: if the current page is not allowed for this role, go to the first allowed page.
  if (!menu.some((m) => m.id === state.page)) state.page = landingPage(permissions()) ?? state.page;
  const v = view();
  const body = menu.length === 0
    ? `<h1>No access</h1><p class="sub">Your CRM role has no OUTCOMES permission. In the live product you would not have been shown the OUTCOMES button.</p>`
    : state.page === "work-orders" ? workOrdersPage(v)
    : state.page === "attention" ? attentionPage(v)
    : state.page === "commitments" ? commitmentsPage(v)
    : state.page === "outcomes" ? outcomesPage(v)
    : state.page === "audit" ? auditPage(v)
    : state.page === "dashboard" ? dashboardPage(v)
    : state.page === "categories" ? categoriesPage(v)
    : state.page === "sources" ? sourcesPage()
    : settingsPage(v);
  // Side menu: a module (Intake) is one entry, its pages are tabs above the page (DECISIONS 54).
  const entries = menuEntries(permissions());
  const sections = ["Work", "Set up"].map((s) => {
    const items = entries.filter((e) => e.section === s);
    return items.length ? `<h4>${s}</h4>${items.map((e) => `<a data-page="${(e.pages[0] as { id: string }).id}" class="${e.pages.some((p) => p.id === state.page) ? "on" : ""}"><span class="ico">${e.icon}</span>${e.label}</a>`).join("")}` : "";
  }).join("");
  const current = entries.find((e) => e.pages.some((p) => p.id === state.page));
  const openCount = (state.live() ? state.attention : view().attention ?? []).filter((i) => i.status === "open").length;
  const moduleTabs = current?.module && current.pages.length > 1
    ? `<div class="modhead"><b>${esc(current.module.label)}</b><span class="muted">${esc(current.module.blurb)}</span></div><div class="modtabs">${current.pages.map((p) => `<button data-page="${p.id}" class="${p.id === state.page ? "on" : ""}">${esc(p.label)}${p.id === "attention" && openCount > 0 ? ` <span class="pill review">${openCount}</span>` : ""}</button>`).join("")}</div>`
    : "";
  const shell = document.getElementById("shell") as HTMLElement;
  shell.innerHTML = `<div class="app">
    <aside class="side"><div class="brand">OUTCOMES<small>Minhaj Welfare Foundation</small></div><nav class="nav">${sections}</nav><div class="foot">${state.me ? "Live data from your CRM." : "Demo with invented data. Nothing is saved."}</div></aside>
    <header class="top">${state.me ? `<span class="badge-demo">Signed in from the CRM${state.me.storage === "memory" ? " · TEMPORARY STORAGE, nothing is kept" : ""}</span>
      <div class="who"><span>${esc(state.me.name)} · ${esc(state.me.org)}</span></div>` : `<span class="badge-demo">Opened from the CRM (imitated)</span>
      <div class="who"><span>Signed in as Sample User</span><select id="role" title="Pretend to hold this CRM role">${DEMO_ROLES.map((r) => `<option value="${r.id}"${r.id === state.roleId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>`}</header>
    <main class="content">${moduleTabs}${body}</main></div>`;
  void role;
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  // Tap to sort: tap an item, then tap the category (or unsorted) it should go to. Same result as dragging.
  const zone = target.closest("[data-drop]") as HTMLElement | null;
  const chipEl = target.closest("[data-item]") as HTMLElement | null;
  if (chipEl) {
    state.selectedItem = state.selectedItem === chipEl.dataset.item ? "" : (chipEl.dataset.item as string);
    return draw();
  }
  if (zone && state.selectedItem !== "") {
    sortItem(state.selectedItem, zone.dataset.drop as string);
    state.selectedItem = "";
    return draw();
  }
  const rm = target.closest("[data-remove]") as HTMLElement | null;
  if (rm) {
    const r = removeCategory(state.categories, state.itemCategories, rm.dataset.remove as string);
    state.categories = r.categories;
    state.itemCategories = r.map;
    afterConfig();
    return draw();
  }
  // Needs attention: mark an entry reviewed or reopen it. Saved on the server.
  const attn = target.closest("[data-attn]") as HTMLElement | null;
  if (attn && attn.dataset.attn) {
    void decideAttention(attn.dataset.attn, attn.dataset.attnAction === "reopen" ? "reopen" : "review")
      .then((r) => (state.attention = r.items))
      .catch((e) => (state.message = e instanceof Error ? e.message : "That did not work."))
      .then(draw);
    return;
  }
  // Exclude or restore work orders: one (its own button) or all ticked (the bulk bar). A reason is asked for once.
  const excl = target.closest("[data-excl]") as HTMLElement | null;
  const bulk = target.closest("[data-bulk]") as HTMLElement | null;
  if (excl || bulk) {
    const how = bulk?.dataset.bulk;
    if (how === "clear") {
      state.selected = [];
      return redrawLists();
    }
    const restoring = (excl ? excl.dataset.exclAction : how) === "restore";
    const keys = excl ? [excl.dataset.excl as string] : [...state.selected];
    if (keys.length === 0) return;
    const reason = restoring ? "" : window.prompt(`Why exclude ${keys.length === 1 ? "this work order" : `these ${keys.length} work orders`}? (kept on file, you can restore later)`) ?? "";
    if (!restoring && reason.trim() === "") return;
    void applyExclusion(keys, restoring, reason);
    return;
  }
  // Outcomes: open a commitment's details, make an outcome active or inactive, remove, release, close.
  const openC = target.closest("[data-open-commit]") as HTMLElement | null;
  if (openC) {
    state.openCommit = openC.dataset.openCommit as string;
    return draw();
  }
  if (target.closest("[data-oc-close]")) {
    state.openCommit = "";
    return draw();
  }
  const ocActive = target.closest("[data-oc-active]") as HTMLElement | null;
  if (ocActive) return void outcomeChange({ action: "active", id: ocActive.dataset.ocActive, active: ocActive.dataset.active === "1" });
  const ocRemove = target.closest("[data-oc-remove]") as HTMLElement | null;
  if (ocRemove) return void outcomeChange({ action: "remove", id: ocRemove.dataset.ocRemove });
  const ocRelease = target.closest("[data-oc-release]") as HTMLElement | null;
  if (ocRelease) return void outcomeChange({ action: "release", commitmentKey: ocRelease.dataset.ocRelease });
  // Commitments tabs.
  const ctab = target.closest("[data-ctab]") as HTMLElement | null;
  if (ctab) {
    state.commitTab = ctab.dataset.ctab as string;
    return draw();
  }
  // Needs attention: jump to the matching lines in Work orders.
  const viewItem = target.closest("[data-view-item]") as HTMLElement | null;
  const viewKey = target.closest("[data-view-key]") as HTMLElement | null;
  if (viewItem || viewKey) {
    state.criteria = { ...NO_CRITERIA, ...(viewItem ? { itemId: viewItem.dataset.viewItem as string } : { text: viewKey?.dataset.viewKey as string }) };
    state.filter = viewItem ? "unrouted" : "all";
    state.page = "work-orders";
    return draw();
  }
  const el = target.closest("[data-page],[data-filter],[data-action]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.page) state.page = el.dataset.page as PageId;
  if (el.dataset.filter) state.filter = el.dataset.filter as Filter;
  const action = el.dataset.action;
  if (action === "clear-filters") {
    const scope = el.dataset.scope ?? "main";
    if (scope === "main") state.criteria = { ...NO_CRITERIA };
    else state.scopeCriteria = { ...state.scopeCriteria, [scope]: { ...NO_CRITERIA } };
  }
  if (action === "refresh") {
    if (state.live()) return void reloadLive().then(draw);
    refresh();
  }
  if (action === "load-files") {
    // Rule: read the file box itself if the list of chosen files is empty, so the button works either way.
    const box = document.getElementById("feedfile") as HTMLInputElement | null;
    const chosen = state.pendingFiles.length ? state.pendingFiles : [...(box?.files ?? [])];
    if (chosen.length === 0) {
      state.loadNote = "Choose the files first, using the box above, then press Load.";
      return draw();
    }
    void loadFiles(chosen);
    return;
  }
  if (action === "pickup-now") {
    state.message = "Running the pick-up...";
    void runPickupNow()
      .then(async (r) => {
        await reloadLive();
        state.message = r.skipped ?? (r.ok ? `Pick-up finished: ${r.created} new, ${r.rerouted} routed.` : `The pick-up did not finish: ${r.error}`);
      })
      .catch((e) => (state.message = e instanceof Error ? e.message : "The pick-up failed."))
      .then(draw);
  }
  if (action === "accept-suggestions") {
    state.itemCategories = acceptSuggestions(state.itemCategories, view().suggestions);
    afterConfig();
  }
  if (action === "add-outcomes") {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    void outcomeChange({ action: "add", name: val("oc-name"), count: Number(val("oc-count") || 1), type: val("oc-type"), cohort: val("oc-cohort"), frameworkId: val("oc-fw") });
    return;
  }
  if (action === "auto-allocate") {
    void outcomeChange({ action: "auto" });
    return;
  }
  // Framework templates (DECISIONS 59).
  if (action === "add-framework") {
    const r = addFramework(state.frameworks, (document.getElementById("newfw") as HTMLInputElement).value);
    state.frameworks = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
  }
  if (action === "add-starters") {
    const have = new Set(state.frameworks.map((f) => f.id));
    state.frameworks = [...state.frameworks, ...starterFrameworks().filter((f) => !have.has(f.id) && !state.frameworks.some((x) => x.name.toLowerCase() === f.name.toLowerCase()))];
    state.message = "The starting frameworks are added. Choose a default framework for each category below.";
    afterConfig(false);
  }
  if (action === "dup-framework" && el.dataset.id) {
    state.frameworks = duplicateFramework(state.frameworks, el.dataset.id).value;
    afterConfig(false);
  }
  if (action === "remove-framework" && el.dataset.id) {
    const r = removeFramework(setupNow(), el.dataset.id);
    state.message = r.error ?? "";
    if (!r.error) {
      state.frameworks = r.value.frameworks;
      afterConfig(false);
    }
  }
  if (action === "suggest-item-frameworks") {
    state.itemFramework = { ...state.itemFramework, ...view().itemFrameworkSuggestions };
    afterConfig(false);
  }
  if (action === "add-category") {
    const r = addCategory(state.categories, (document.getElementById("newcat") as HTMLInputElement).value);
    state.categories = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
  }
  // Demo: a new paid line appears in the CRM. It is a copy of an existing flagged line with new ids.
  if (action === "demo-new") {
    const copy = { ...(state.feedRows.find((r) => r["line_id"] === "L004") as FeedRow), line_id: `L${900 + state.feedRows.length}`, transaction_ref: `T${2000 + state.feedRows.length}`, supporter_name: "Sample Supporter H", supporter_id: "D107" };
    state.feedRows = [...state.feedRows, copy];
    refresh();
  }
  // Demo: the CRM changes an amount after the work order exists. It is held for review, not applied.
  if (action === "demo-change") {
    state.feedRows = state.feedRows.map((r) => (r["line_id"] === "L002" ? { ...r, amount: "99" } : r));
    refresh();
  }
  draw();
});

// Rule: files chosen here are parsed in the browser. Nothing is sent anywhere or saved.
// Each step is shown with a spinner, and the page is given a moment to paint between steps, so it never looks stuck.
const paint = () => new Promise<void>((r) => setTimeout(r, 40));
async function step(text: string): Promise<void> {
  state.loading = text;
  draw();
  await paint();
}
async function loadFiles(files: File[]): Promise<void> {
  state.loadNote = "";
  try {
    const parsed = [];
    for (const [i, f] of files.entries()) {
      await step(`Reading file ${i + 1} of ${files.length}: ${f.name}`);
      parsed.push(toRecords(parseCsv(await f.text())).records);
    }
    await step("Matching items, plans and feedback flags...");
    const r = adaptFiles(parsed);
    if (r.rows.length === 0) {
      state.loadNote = r.issues[0]?.message ?? "The files could not be read.";
      return;
    }
    if (state.live()) {
      await step(`Sending ${r.counts.lines} lines to your saved data and auditing them...`);
      const res = await importFeed(packFeed(r.rows), files.map((f) => f.name).join(", "), r.issues.map((i) => i.message));
      if (!res.ok) throw new Error(res.error || "The import did not finish.");
      await reloadLive();
      state.pendingFiles = [];
      const a = state.audits[0];
      state.loadNote = `Imported ${res.rows} lines: ${res.created} new work orders, ${res.unchanged} already saved.${r.info?.length ? ` ${r.info.join(" ")}` : ""}${a ? ` Audit: ${a.counts.changed + a.counts.moved} changed or moved, ${a.complete ? a.counts.removed : 0} no longer in the CRM.` : ""} ${state.attention.filter((i) => i.status === "open").length} need attention. Saved.`;
      return;
    }
    await step(`Making work orders from ${r.counts.lines} lines...`);
    state.feedRows = r.rows;
    state.workOrders = [];
    state.review = [];
    refresh();
    state.message = "";
    state.pendingFiles = [];
    state.loadNote = `Loaded ${r.counts.lines} lines from your files, ${r.counts.feedbackLines} need feedback, ${state.workOrders.length} work orders made. NOT SAVED: you are not signed in, so this is lost when you refresh. They stayed in this browser.${r.issues.length ? ` ${r.issues.length} note${r.issues.length === 1 ? "" : "s"}, first: ${r.issues[0]?.message}` : ""}`;
  } catch (e) {
    state.loadNote = `The files could not be loaded: ${e instanceof Error ? e.message : "unknown error"}`;
  } finally {
    state.loading = "";
    draw();
  }
}

// Rule: if anything fails unexpectedly, say so in the load card instead of leaving the page looking stuck.
(globalThis as { addEventListener?: (type: "error", h: (e: ErrorEvent) => void) => void }).addEventListener?.("error", (e) => {
  if (!state.loading) return;
  state.loading = "";
  state.loadNote = `Something went wrong: ${e.message}`;
  draw();
});

// The filter boxes (Work orders page and inside Needs attention entries). Rule: only the list is redrawn, never the boxes, so typing is never interrupted.
function onFilterInput(e: Event): void {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  // The Commitments search box redraws only its list.
  if (t.dataset?.cf === "text") {
    state.commitText = t.value;
    const list = document.getElementById("commit-list");
    if (list) list.innerHTML = commitmentList(view());
    return;
  }
  const field = t.dataset?.f;
  if (!field) return;
  const scope = t.dataset.scope ?? "main";
  if (scope === "main") state.criteria = { ...state.criteria, [field]: t.value } as Criteria;
  else state.scopeCriteria = { ...state.scopeCriteria, [scope]: { ...(state.scopeCriteria[scope] ?? NO_CRITERIA), [field]: t.value } as Criteria };
  const list = document.querySelector(`[data-list="${scope}"]`);
  if (list) list.innerHTML = listHtml(view(), scope);
}
// Opening an entry's lines in Needs attention draws them then (they are not drawn while closed).
document.addEventListener("toggle", (e) => {
  const el = e.target as HTMLElement;
  const id = el.dataset?.attnOpen;
  if (!id) return;
  const open = (el as HTMLDetailsElement).open;
  state.openAttn = open ? [...new Set([...state.openAttn, id])] : state.openAttn.filter((x) => x !== id);
  const slot = el.querySelector(`[data-lazy="a:${id}"]`);
  if (slot && open && slot.innerHTML === "") slot.innerHTML = listBlock(view(), `a:${id}`);
}, true);
document.addEventListener("input", onFilterInput);

document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset?.f || el.dataset?.cf) return onFilterInput(e);
  // Tick boxes: one work order, or all shown in a list. Only the lists are redrawn.
  if (el.dataset?.sel !== undefined) {
    state.selected = el.checked ? [...new Set([...state.selected, el.dataset.sel])] : state.selected.filter((k) => k !== el.dataset.sel);
    return redrawLists();
  }
  if (el.dataset?.selall !== undefined) {
    const scope = el.dataset.selall;
    const shown = listShownKeys(scope);
    state.selected = el.checked ? [...new Set([...state.selected, ...shown])] : state.selected.filter((k) => !shown.includes(k));
    return redrawLists();
  }
  const t = e.target as HTMLSelectElement;
  if (t.id === "feedfile") {
    state.pendingFiles = [...((t as unknown as HTMLInputElement).files ?? [])];
    state.loadNote = "";
    return draw();
  }
  // Rule: only a field the page knows about causes a redraw. Any other field (the owner passphrase box, for example)
  // must be left alone, because a redraw would wipe what was typed and replace the button the person is about to press.
  const known = t.id === "role" || t.dataset.ocMove !== undefined || t.dataset.ocf !== undefined || t.dataset.assign !== undefined || !!t.dataset.rename || !!t.dataset.tpl || !!t.dataset.fwrename || t.dataset.catfw !== undefined || t.dataset.itemfw !== undefined || !!t.dataset.keywords;
  if (!known) return;
  if (t.dataset.ocf !== undefined) {
    state.ocFilter = { ...state.ocFilter, [t.dataset.ocf]: t.value };
    return draw();
  }
  if (t.dataset.ocMove !== undefined) {
    if (t.value !== "") void outcomeChange({ action: "move", commitmentKey: t.dataset.ocMove, outcomeId: t.value });
    return;
  }
  if (t.id === "role") {
    state.roleId = t.value;
    state.page = landingPage(permissions()) ?? state.page;
  } else if (t.dataset.assign !== undefined && t.value !== "") {
    sortItem(t.dataset.assign, t.value);
  } else if (t.dataset.rename) {
    const r = renameCategory(state.categories, t.dataset.rename, t.value);
    state.categories = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
  } else if (t.dataset.fwrename) {
    const r = renameFramework(state.frameworks, t.dataset.fwrename, t.value);
    state.frameworks = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
  } else if (t.dataset.tpl && t.dataset.tplid) {
    // One setting of one framework template. Empty "how an instalment counts" clears it.
    const field = t.dataset.tpl;
    const value = field === "unitsPerBeneficiary" ? Number(t.value) : field === "instalment" && t.value === "" ? undefined : t.value;
    state.frameworks = updateTemplate(state.frameworks, t.dataset.tplid, { [field]: value } as Partial<FrameworkTemplate>);
    afterConfig(false);
  } else if (t.dataset.catfw !== undefined) {
    state.categories = setCategoryFramework(state.categories, state.frameworks, t.dataset.catfw, t.value);
    afterConfig(false);
  } else if (t.dataset.itemfw !== undefined) {
    state.itemFramework = setItemFramework(state.itemFramework, state.frameworks, t.dataset.itemfw, t.value);
    afterConfig(false);
  } else if (t.dataset.keywords) {
    state.categories = setKeywords(state.categories, t.dataset.keywords, t.value);
    afterConfig(false);
  }
  draw();
});

refresh();
state.message = "";
// After the owner sign-in form was sent with a wrong passphrase the address says so. Show it, then tidy the address.
const loc = (globalThis as { location?: { search: string; pathname: string } }).location;
if (loc) {
  state.ownerNote = signinNote(loc.search);
  if (loc.search !== "") (globalThis as { history?: { replaceState(a: null, b: string, c: string): void } }).history?.replaceState(null, "", loc.pathname);
}
draw();
// If the person arrived from the CRM there is a session: switch from demo to live data.
void fetchMe().then((me) => (me ? enterLive(me) : undefined));

// Drag and drop: drag an item chip onto a category or onto Unsorted.
document.addEventListener("dragstart", (e) => {
  const c = (e.target as HTMLElement).closest("[data-item]") as HTMLElement | null;
  if (c && e.dataTransfer) {
    e.dataTransfer.setData("text/plain", c.dataset.item as string);
    e.dataTransfer.effectAllowed = "move";
  }
});
document.addEventListener("dragover", (e) => {
  const z = (e.target as HTMLElement).closest("[data-drop]") as HTMLElement | null;
  if (z) {
    e.preventDefault();
    z.classList.add("over");
  }
});
document.addEventListener("dragleave", (e) => ((e.target as HTMLElement).closest?.("[data-drop]") as HTMLElement | null)?.classList.remove("over"));
document.addEventListener("drop", (e) => {
  const z = (e.target as HTMLElement).closest("[data-drop]") as HTMLElement | null;
  const id = e.dataTransfer?.getData("text/plain") ?? "";
  if (!z || id === "") return;
  e.preventDefault();
  sortItem(id, z.dataset.drop as string);
  state.selectedItem = "";
  draw();
});
