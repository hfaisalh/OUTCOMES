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
import { acceptSuggestions, addFramework, assignItem, removeFramework, renameFramework, setKeywords, suggestAll, updateRules, type Cycle, type FrameworkRules } from "../modules/02-project-rules/frameworks";
import { DEMO_ROLES, demoFeedRows, demoFrameworks } from "./demo-data";
import { landingPage, visibleMenu, type PageId } from "./menu";
import { dashboardPage, esc, frameworksPage, settingsPage, sourcesPage, workOrdersPage, type Filter, type View } from "./pages";

const state = {
  roleId: "admin",
  page: "work-orders" as PageId,
  feedRows: demoFeedRows() as FeedRow[],
  workOrders: [] as WorkOrder[],
  review: [] as ReviewItem[],
  itemFrameworks: {} as Record<string, string>, // every item starts unsorted, so the demo shows the whole flow
  frameworks: demoFrameworks(),
  selectedItem: "",
  filter: "all" as Filter,
  message: "",
};

const permissions = () => DEMO_ROLES.find((r) => r.id === state.roleId)?.permissions ?? [];

// Run the CRM feed through the connector and bring the work orders up to date.
function refresh(): void {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines;
  const plan = planWorkOrders(lines, state.workOrders, { frameworkByItem: state.itemFrameworks, usesFrameworks: true, feedIsComplete: true });
  const rerouted = new Map(plan.rerouted.map((w) => [w.key, w]));
  state.workOrders = [...state.workOrders.map((w) => rerouted.get(w.key) ?? w), ...plan.created];
  state.review = plan.review;
  state.message = `Refreshed from the CRM: ${plan.created.length} new, ${plan.rerouted.length} routed, ${plan.review.length} to review.`;
}

function view(): View {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines.filter((l) => l.needsFeedback);
  const items = new Map<string, { id: string; name: string; count: number }>();
  for (const l of lines) items.set(l.itemId, { id: l.itemId, name: l.itemName, count: (items.get(l.itemId)?.count ?? 0) + 1 });
  const flaggedItems = [...items.values()];
  return {
    workOrders: state.workOrders, review: state.review, itemFrameworks: state.itemFrameworks, flaggedItems, filter: state.filter, message: state.message, config: MWF_CRM_CONFIG,
    frameworks: state.frameworks, suggestions: suggestAll(flaggedItems, state.itemFrameworks, state.frameworks), selectedItem: state.selectedItem,
  };
}

// Put an item in a framework (or back to unsorted with ""). Unrouted work orders for it are routed now.
// Rule: work orders that already have a framework keep it, so work in progress never moves by accident.
function sortItem(itemId: string, frameworkId: string): void {
  const keep = state.workOrders.filter((w) => w.itemId === itemId && w.status !== "unrouted" && w.frameworkId !== frameworkId).length;
  state.itemFrameworks = assignItem(state.itemFrameworks, state.frameworks, itemId, frameworkId);
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
    <aside class="side"><div class="brand">OUTCOMES<small>Minhaj Welfare Foundation</small></div><nav class="nav">${sections}</nav><div class="foot">Demo with invented data. Nothing is saved.</div></aside>
    <header class="top"><span class="badge-demo">Opened from the CRM (imitated)</span>
      <div class="who"><span>Signed in as Sample User</span><select id="role" title="Pretend to hold this CRM role">${DEMO_ROLES.map((r) => `<option value="${r.id}"${r.id === state.roleId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div></header>
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
    refresh();
    return draw();
  }
  const el = target.closest("[data-page],[data-filter],[data-action]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.page) state.page = el.dataset.page as PageId;
  if (el.dataset.filter) state.filter = el.dataset.filter as Filter;
  const action = el.dataset.action;
  if (action === "refresh") refresh();
  if (action === "accept-suggestions") {
    state.itemFrameworks = acceptSuggestions(state.itemFrameworks, view().suggestions);
    refresh();
  }
  if (action === "add-framework") {
    const input = document.getElementById("newfw") as HTMLInputElement;
    const r = addFramework(state.frameworks, input.value);
    state.frameworks = r.value;
    state.message = r.error ?? "";
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
  } else if (t.dataset.rename) {
    const r = renameFramework(state.frameworks, t.dataset.rename, t.value);
    state.frameworks = r.value;
    state.message = r.error ?? "";
  } else if (t.dataset.rule && t.dataset.fw) {
    const key = t.dataset.rule as keyof FrameworkRules;
    state.frameworks = updateRules(state.frameworks, t.dataset.fw, { [key]: key === "cycle" ? (t.value as Cycle) : t.value });
  } else if (t.dataset.keywords) {
    state.frameworks = setKeywords(state.frameworks, t.dataset.keywords, t.value);
  }
  draw();
});

refresh();
state.message = "";
draw();

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
