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
import { acceptSuggestions, addCategory, addFramework, assignItem, removeCategory, removeFramework, renameFramework, setCategory, setKeywords, suggestAll, updateRules, type Cycle, type FrameworkRules } from "../modules/02-project-rules/frameworks";
import { loadConfig, loadWorkOrders, fetchMe, runPickupNow, saveConfig, type Me } from "./api";
import { PERMISSIONS } from "./menu";
import { DEMO_ROLES, demoCategories, demoFeedRows, demoFrameworks } from "./demo-data";
import { landingPage, visibleMenu, type PageId } from "./menu";
import { dashboardPage, esc, frameworksPage, settingsPage, sourcesPage, workOrdersPage, type Filter, type View } from "./pages";

const state = {
  live: (): boolean => state.me !== null,
  roleId: "admin",
  page: "work-orders" as PageId,
  feedRows: demoFeedRows() as FeedRow[],
  workOrders: [] as WorkOrder[],
  review: [] as ReviewItem[],
  itemFrameworks: {} as Record<string, string>, // every item starts unsorted, so the demo shows the whole flow
  categories: demoCategories(),
  frameworks: demoFrameworks(),
  selectedItem: "",
  filter: "all" as Filter,
  message: "",
  me: null as Me | null, // set when signed in from the CRM (live mode)
  run: null as import("../modules/00-platform/store").RunInfo | null,
};

const permissions = () => (state.me ? state.me.perms : DEMO_ROLES.find((r) => r.id === state.roleId)?.permissions ?? []);

// Run the CRM feed through the connector and bring the work orders up to date.
function refresh(): void {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines;
  const plan = planWorkOrders(lines, state.workOrders, { frameworkByItem: state.itemFrameworks, usesFrameworks: true, feedIsComplete: true });
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
    state.message = "";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not load.";
  }
}

// Save the setup after any change, then reload so newly routed work orders show.
async function persistAndReload(): Promise<void> {
  if (!state.live()) return;
  try {
    const r = await saveConfig({ frameworks: state.frameworks, categories: state.categories, itemMap: state.itemFrameworks });
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
    // A new organisation has no frameworks yet: start from the MWF starter list and save it, staff then edit it.
    if (c.frameworks.length === 0 && c.categories.length === 0) await saveConfig({ frameworks: state.frameworks, categories: state.categories, itemMap: {} });
    else {
      state.frameworks = c.frameworks;
      state.categories = c.categories;
    }
    state.itemFrameworks = c.itemMap;
  } catch (e) {
    state.message = e instanceof Error ? e.message : "Could not load.";
  }
  await reloadLive();
  draw();
  if (me.demo) startDemoRefresh();
}

// With the pretend CRM, new gifts arrive all the time, so the page picks them up by itself every minute.
// Rule: it only redraws on the work orders and dashboard pages, so it never interrupts dragging on the frameworks page.
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
    workOrders: state.workOrders, review: state.review, itemFrameworks: state.itemFrameworks, flaggedItems, filter: state.filter, message: state.message, config: MWF_CRM_CONFIG,
    frameworks: state.frameworks, categories: state.categories, suggestions: suggestAll(flaggedItems, state.itemFrameworks, state.frameworks), selectedItem: state.selectedItem,
    live: state.live(), canPickup: permissions().includes(PERMISSIONS.settings), run: state.run,
  };
}

// Put an item in a framework (or back to unsorted with ""). Unrouted work orders for it are routed now.
// Rule: work orders that already have a framework keep it, so work in progress never moves by accident.
function sortItem(itemId: string, frameworkId: string): void {
  const keep = state.workOrders.filter((w) => w.itemId === itemId && w.status !== "unrouted" && w.frameworkId !== frameworkId).length;
  state.itemFrameworks = assignItem(state.itemFrameworks, state.frameworks, itemId, frameworkId);
  if (state.live()) return changed();
  refresh();
  if (keep > 0) state.message += ` ${keep} existing work order${keep === 1 ? "" : "s"} for this item keep${keep === 1 ? "s" : ""} the framework they already had.`;
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
    : state.page === "dashboard" ? dashboardPage(v)
    : state.page === "frameworks" ? frameworksPage(v)
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
  // Tap to sort: tap an item, then tap the framework (or unsorted) it should go to. Same result as dragging.
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
    const r = removeFramework(state.frameworks, state.itemFrameworks, rm.dataset.remove as string);
    state.frameworks = r.frameworks;
    state.itemFrameworks = r.map;
    afterConfig();
    return draw();
  }
  const rc = target.closest("[data-remove-category]") as HTMLElement | null;
  if (rc) {
    const r = removeCategory(state.categories, state.frameworks, rc.dataset.removeCategory as string);
    state.categories = r.categories;
    state.frameworks = r.frameworks;
    afterConfig();
    return draw();
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
    state.itemFrameworks = acceptSuggestions(state.itemFrameworks, view().suggestions);
    afterConfig();
  }
  if (action === "add-framework") {
    const input = document.getElementById("newfw") as HTMLInputElement;
    const cat = state.categories.find((c) => c.id === (document.getElementById("newfwcat") as HTMLSelectElement).value);
    const r = addFramework(state.frameworks, input.value, cat);
    state.frameworks = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
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

document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.id === "role") {
    state.roleId = t.value;
    state.page = landingPage(permissions()) ?? state.page;
  } else if (t.dataset.assign !== undefined && t.value !== "") {
    sortItem(t.dataset.assign, t.value);
  } else if (t.dataset.fwcat) {
    state.frameworks = setCategory(state.frameworks, state.categories, t.dataset.fwcat, t.value);
    afterConfig(false);
  } else if (t.dataset.rename) {
    const r = renameFramework(state.frameworks, t.dataset.rename, t.value);
    state.frameworks = r.value;
    state.message = r.error ?? "";
    if (!r.error) afterConfig(false);
  } else if (t.dataset.rule && t.dataset.fw) {
    const key = t.dataset.rule as keyof FrameworkRules;
    state.frameworks = updateRules(state.frameworks, t.dataset.fw, { [key]: key === "cycle" ? (t.value as Cycle) : t.value });
    afterConfig(false);
  } else if (t.dataset.keywords) {
    state.frameworks = setKeywords(state.frameworks, t.dataset.keywords, t.value);
    afterConfig(false);
  }
  draw();
});

refresh();
state.message = "";
draw();
// If the person arrived from the CRM there is a session: switch from demo to live data.
void fetchMe().then((me) => (me ? enterLive(me) : undefined));

// Drag and drop: drag an item chip onto a framework or onto Unsorted.
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
