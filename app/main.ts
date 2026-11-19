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
import { planWorkOrders, type ReviewItem, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { acceptSuggestions, addCategory, assignItem, removeCategory, renameCategory, setKeywords, suggestAll, updateFramework, type Cycle, type Framework } from "../modules/02-project-rules/categories";
import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import { adaptFiles } from "../modules/01e-crm-export-adapter/export-adapter";
import { buildAttention, type AttentionItem } from "../modules/04-triage/triage";
import { decideAttention, importFeed, loadAttention, loadAudits, loadConfig, loadWorkOrders, fetchMe, ownerLogin, runPickupNow, saveConfig, type Me } from "./api";
import { packFeed } from "../modules/01e-crm-export-adapter/compact";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import { PERMISSIONS } from "./menu";
import { DEMO_ROLES, demoCategories, demoFeedRows } from "./demo-data";
import { landingPage, visibleMenu, type PageId } from "./menu";
import { attentionPage, auditPage, dashboardPage, esc, categoriesPage, settingsPage, sourcesPage, workOrdersPage, type Filter, type View } from "./pages";

const state = {
  live: (): boolean => state.me !== null,
  roleId: "admin",
  page: "work-orders" as PageId,
  feedRows: demoFeedRows() as FeedRow[],
  workOrders: [] as WorkOrder[],
  review: [] as ReviewItem[],
  itemCategories: {} as Record<string, string>, // every item starts unsorted, so the demo shows the whole flow
  categories: demoCategories(),
  selectedItem: "",
  filter: "all" as Filter,
  message: "",
  pendingFiles: [] as File[], // export files chosen but not loaded yet (demo only)
  loadNote: "", // what the last load did, shown in the load card
  audits: [] as AuditRecord[], // batch audit history (live only)
  attention: [] as AttentionItem[], // Needs attention, from the server when live (Module 4)
  ownerBusy: false, // the owner sign-in is in progress
  ownerNote: "", // what the last owner sign-in attempt said
  loading: "", // what the load is doing right now, "" when idle (shows a spinner)
  me: null as Me | null, // set when signed in from the CRM (live mode)
  run: null as import("../modules/00-platform/store").RunInfo | null,
};

const permissions = () => (state.me ? state.me.perms : DEMO_ROLES.find((r) => r.id === state.roleId)?.permissions ?? []);

// Run the CRM feed through the connector and bring the work orders up to date.
function refresh(): void {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines;
  const plan = planWorkOrders(lines, state.workOrders, { categoryByItem: state.itemCategories, usesFrameworks: true, feedIsComplete: true });
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
    state.audits = (await loadAudits().catch(() => ({ audits: [] as AuditRecord[] }))).audits;
    state.message = "";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not load.";
  }
}

// Save the setup after any change, then reload so newly routed work orders show.
async function persistAndReload(): Promise<void> {
  if (!state.live()) return;
  try {
    const r = await saveConfig({ categories: state.categories, itemMap: state.itemCategories });
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
    if (c.categories.length === 0) await saveConfig({ categories: state.categories, itemMap: {} });
    else state.categories = c.categories;
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
    workOrders: state.workOrders, review: state.review, itemCategories: state.itemCategories, flaggedItems, filter: state.filter, message: state.message, config: MWF_CRM_CONFIG,
    categories: state.categories, suggestions: suggestAll(flaggedItems, state.itemCategories, state.categories), selectedItem: state.selectedItem,
    pendingFiles: state.pendingFiles.map((f) => f.name), loadNote: state.loadNote, loading: state.loading, ownerBusy: state.ownerBusy, ownerNote: state.ownerNote, attention: state.live() ? state.attention : buildAttention({ workOrders: state.workOrders, review: state.review, notes: [], marks: {} }), audits: state.audits, upload: state.me?.upload === true, live: state.live(), canPickup: permissions().includes(PERMISSIONS.settings), run: state.run,
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
    : state.page === "audit" ? auditPage(v)
    : state.page === "dashboard" ? dashboardPage(v)
    : state.page === "categories" ? categoriesPage(v)
    : state.page === "sources" ? sourcesPage()
    : settingsPage(v);
  const sections = ["Work", "Set up"].map((s) => {
    const items = menu.filter((m) => m.section === s);
    return items.length ? `<h4>${s}</h4>${items.map((m) => `<a data-page="${m.id}" class="${m.id === state.page ? "on" : ""}"><span class="ico">${m.icon}</span>${m.label}</a>`).join("")}` : "";
  }).join("");
  const shell = document.getElementById("shell") as HTMLElement;
  shell.innerHTML = `<div class="app">
    <aside class="side"><div class="brand">OUTCOMES<small>Minhaj Welfare Foundation</small></div><nav class="nav">${sections}</nav><div class="foot">${state.me ? "Live data from your CRM." : "Demo with invented data. Nothing is saved."}</div></aside>
    <header class="top">${state.me ? `<span class="badge-demo">Signed in from the CRM${state.me.storage === "memory" ? " · TEMPORARY STORAGE, nothing is kept" : ""}</span>
      <div class="who"><span>${esc(state.me.name)} · ${esc(state.me.org)}</span></div>` : `<span class="badge-demo">Opened from the CRM (imitated)</span>
      <div class="who"><span>Signed in as Sample User</span><select id="role" title="Pretend to hold this CRM role">${DEMO_ROLES.map((r) => `<option value="${r.id}"${r.id === state.roleId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>`}</header>
    <main class="content">${body}</main></div>`;
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
  const el = target.closest("[data-page],[data-filter],[data-action]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.page) state.page = el.dataset.page as PageId;
  if (el.dataset.filter) state.filter = el.dataset.filter as Filter;
  const action = el.dataset.action;
  if (action === "refresh") {
    if (state.live()) return void reloadLive().then(draw);
    refresh();
  }
  if (action === "owner-login") {
    signInOwner();
    return;
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

// The owner signs in with the passphrase. Feedback is shown at once: "Signing in...", then a plain message if it failed,
// and on success the page switches to the saved data (the top bar then says Signed in from the CRM).
function signInOwner(): void {
  const pass = (document.getElementById("ownerpass") as HTMLInputElement | null)?.value ?? "";
  if (pass === "") {
    state.ownerNote = "Type the owner passphrase first.";
    return draw();
  }
  state.ownerBusy = true;
  state.ownerNote = "";
  draw();
  void ownerLogin(pass)
    .then(() => fetchMe())
    .then(async (me) => {
      if (!me) throw new Error("The passphrase was accepted but the browser did not keep the sign-in. Check that you are on https://outcomes-beryl.vercel.app/app/ and that cookies are allowed for it.");
      state.ownerBusy = false;
      await enterLive(me);
    })
    .catch((e) => {
      state.ownerBusy = false;
      state.ownerNote = e instanceof Error ? e.message : "The sign-in did not work.";
      draw();
    });
}

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
      state.loadNote = `Imported ${res.rows} lines: ${res.created} new work orders, ${res.unchanged} already saved.${a ? ` Audit: ${a.counts.changed + a.counts.moved} changed or moved, ${a.complete ? a.counts.removed : 0} no longer in the CRM.` : ""} ${state.attention.filter((i) => i.status === "open").length} need attention. Saved.`;
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

document.addEventListener("keydown", (e) => {
  const k = e as unknown as KeyboardEvent;
  if (k.key === "Enter" && (k.target as HTMLElement | null)?.id === "ownerpass") signInOwner();
});

document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.id === "feedfile") {
    state.pendingFiles = [...((t as unknown as HTMLInputElement).files ?? [])];
    state.loadNote = "";
    return draw();
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
  } else if (t.dataset.rule && t.dataset.fw) {
    const key = t.dataset.rule as keyof Framework;
    state.categories = updateFramework(state.categories, t.dataset.fw, { [key]: key === "cycle" ? (t.value as Cycle) : t.value });
    afterConfig(false);
  } else if (t.dataset.keywords) {
    state.categories = setKeywords(state.categories, t.dataset.keywords, t.value);
    afterConfig(false);
  }
  draw();
});

refresh();
state.message = "";
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
