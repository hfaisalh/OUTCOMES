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
import { adoptLegacy, allocOptions, crmNamesOf, applyProjectAction, clearLegacy, placeInNode, placeInPartner, type GiftProject, type Node, type Project } from "../modules/06-projects/projects";
import { setCovers, setLooked, setParts, setPeriods } from "../modules/04b-commitments/catch-up";
import { markCustomAmounts, setManual } from "../modules/04b-commitments/parts";
import { giftDetailHtml, giftListHtml, giftMetricsHtml, giftsPage, shownGiftKeys } from "./gifts-page";
import { partnersPage } from "./partners-page";
import { projectsPage } from "./projects-page";
import { beneficiariesPage, NO_BEN_FILTER, type BenFilter } from "./beneficiaries-page";
import { projectFormHtml, readProjectForm } from "./project-form";
import { NEW_CONTACT_ROW, NEW_DOC_ROW, readPartnerForm } from "./partner-form";
import { partnerWindowHtml, type PartnerTab } from "./partner-window";
import { allocationPage } from "./allocation-page";
import { addOutcomes, autoAllocate, perPeriodRule, releaseApprovals, moveAllocation, releaseAllocation, removeOutcome, removeUnused, setActive, type Allocation, type Outcome } from "../modules/05-outcomes/outcomes";
import { allocatable } from "../modules/04b-commitments/commitments";
import { filterWorkOrders, NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { excludeWorkOrder, planWorkOrders, restoreWorkOrder, type ReviewItem, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { acceptSuggestions, addCategory, addFramework, resolveFrameworkId, assignItem, duplicateFramework, frameworkByItem, removeCategory, removeFramework, renameCategory, renameFramework, setCategoryFramework, setItemFramework, setKeywords, suggestAll, updateTemplate, type Cycle, type FrameworkTemplate, type InstalmentRule, type Setup } from "../modules/02-project-rules/categories";
import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import { adaptFiles } from "../modules/01e-crm-export-adapter/export-adapter";
import { buildAttention, type AttentionItem } from "../modules/04-triage/triage";
import { changeOutcomes, loadOutcomes, decideAttention, signOut, setExcluded, setCovers as setCoversApi, setLooked as setLookedApi, setParts as setPartsApi, setManualApi, setPeriodsApi, importFeed, loadAttention, loadAudits, loadConfig, loadWorkOrders, fetchMe, runPickupNow, saveConfig, type Me } from "./api";
import { packFeed } from "../modules/01e-crm-export-adapter/compact";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import { PERMISSIONS } from "./menu";
import { dataFeedPage, dataFilesPage } from "./data-page";
import { unitPie, workflowsPage } from "./workflows-page";
import { addStarterWorkflows, addTask, assignToWorkflow, linkStarterTypes, removeTask, removeWorkflow, setTask, setUnitRule, setFlag, setConfirm, addStage, setStage, removeStage, moveStage, setAssign, suggestWorkflowFor, unassignItem } from "../modules/02-project-rules/workflows";
import { createMapping } from "./mapping-controller";
import { applyOutcomeTypeAction, starterOutcomeTypes, type OutcomeType } from "../modules/05-outcomes/outcome-types";
import { ensureRefs } from "../modules/05-outcomes/refs";
import { checkingHtml, signinHtml } from "./signin-page";
import { DEMO_ROLES, demoCategories, demoFeedRows, starterFrameworks, suggestItemFrameworks } from "./demo-data";
import { isPageId, landingPage, menuEntries, visibleMenu, type PageId } from "./menu";
import { outcomesPage, listBlock, listHtml, listBase, attentionPage, auditPage, signinNote, dashboardPage, esc, categoriesPage, settingsPage, type Filter, type View } from "./pages";

// Rule: the page being looked at is kept in the address (#workflows), so a reload comes back to it instead of the first page. Only known pages are used.
function pageFromAddress(): PageId {
  try {
    const id = typeof location !== "undefined" ? location.hash.replace(/^#/, "") : "";
    if (isPageId(id)) return id;
  } catch { /* no address to read, for example in a test */ }
  return "work-orders";
}
function keepPageInAddress(page: PageId): void {
  try {
    if (typeof location !== "undefined" && typeof history !== "undefined" && location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
  } catch { /* the address cannot be changed here, the page still works */ }
}

const state = {
  live: (): boolean => state.me !== null,
  roleId: "admin",
  page: pageFromAddress(),
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
  projects: [] as Project[], // the projects and the places in them (DECISIONS 65)
  nodes: [] as Node[],
  giftProjects: [] as GiftProject[], // the projects donors choose, and the partners that deliver them (DECISIONS 76)
  benFilter: { ...NO_BEN_FILTER } as BenFilter, // the filters on the Beneficiaries page
  projectWin: { open: false, id: "" }, // the project form
  giftWin: { key: "", log: false }, // the gift details window (DECISIONS 78): the key of the gift it shows, "" when closed
  partnerWin: { open: false, id: "", tab: "profile" as PartnerTab, draft: null as Record<string, unknown> | null }, // the partner window (DECISIONS 70)
  workflowSel: { id: "", stage: 1, parts: 1, allocated: false, pick: "" } as NonNullable<View["workflowSel"]>, // the workflow and stage the Workflows page shows, and its sample gift (DECISIONS 130)
  itemIcons: {} as Record<string, string>, // the icon chosen for an item (DECISIONS 107)
  idCounters: {} as Record<string, number>, // the last number used for each ID prefix (DECISIONS 105)
  outcomeTypes: starterOutcomeTypes() as OutcomeType[], // the kinds of outcome and their profile fields (DECISIONS 103)
  partnerTypes: [] as string[], // the organisation's own list of partner types (DECISIONS 69)
  partnerFields: [] as string[], // and its own extra partner fields
  requireRef: false, // place gifts only on beneficiaries that have an ID (DECISIONS 75)
  graceDays: 15, // days a payment may be unpaid before the place may be released (DECISIONS 74)
  openProject: "", // the project open on the Projects page
  ocFilter: { cohort: "", type: "", status: "" }, // the Outcomes list filters
  openCommit: "", // the commitment whose details are open on the Outcomes page
  message: "",
  pendingFiles: [] as File[], // export files chosen but not loaded yet (demo only)
  loadNote: "", // what the last load did, shown in the load card
  audits: [] as AuditRecord[], // batch audit history (live only)
  attention: [] as AttentionItem[], // Needs attention, from the server when live (Module 4)
  topMenu: "" as "" | "settings" | "user", // which icon menu in the top bar is open
  gate: "app" as "app" | "checking" | "signin", // before anything starts (DECISIONS 91): checking the session, the sign-in screen, or the app
  ownerNote: "", // what the last owner sign-in attempt said
  loading: "", // what the load is doing right now, "" when idle (shows a spinner)
  me: null as Me | null, // set when signed in from the CRM (live mode)
  run: null as import("../modules/00-platform/store").RunInfo | null,
};

const permissions = () => (state.me ? state.me.perms : DEMO_ROLES.find((r) => r.id === state.roleId)?.permissions ?? []);

// Run the CRM feed through the connector and bring the work orders up to date.
// Custom amount gifts (DECISIONS 129): in the demo they are marked too. The server does the same on a pick-up and when the list is read.
function deriveDemoParts(): void {
  const changed = new Map(markCustomAmounts(state.workOrders).map((w) => [w.key, w]));
  if (changed.size > 0) state.workOrders = state.workOrders.map((w) => changed.get(w.key) ?? w);
}

function refresh(): void {
  const lines = readFeed(state.feedRows, MWF_CRM_CONFIG).lines;
  const plan = planWorkOrders(lines, state.workOrders, { categoryByItem: state.itemCategories, frameworkByItem: frameworkByItem(setupNow()), usesFrameworks: true, feedIsComplete: true });
  const rerouted = new Map(plan.rerouted.map((w) => [w.key, w]));
  state.workOrders = [...state.workOrders.map((w) => rerouted.get(w.key) ?? w), ...plan.created];
  deriveDemoParts();
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
    await loadOutcomes().then((o) => { state.outcomes = o.outcomes; state.allocations = o.allocations; state.projects = o.projects ?? []; state.giftProjects = o.giftProjects ?? []; state.nodes = o.nodes ?? []; state.graceDays = o.graceDays ?? 15; state.requireRef = o.requireRef === true; state.partnerTypes = o.partnerTypes ?? []; state.partnerFields = o.partnerFields ?? []; state.outcomeTypes = o.outcomeTypes ?? state.outcomeTypes; state.idCounters = o.idCounters ?? state.idCounters; state.itemIcons = o.itemIcons ?? state.itemIcons; }).catch(() => undefined);
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
    workOrders: state.workOrders, review: state.review, itemCategories: state.itemCategories, flaggedItems, filter: state.filter, criteria: state.criteria, scopeCriteria: state.scopeCriteria, selected: state.selected, openAttn: state.openAttn, outcomes: state.outcomes, allocations: state.allocations, projects: state.projects, giftProjects: state.giftProjects, benFilter: state.benFilter, nodes: state.nodes, graceDays: state.graceDays, requireRef: state.requireRef, openProject: state.openProject, today: new Date().toISOString().slice(0, 10), ocFilter: state.ocFilter, openCommit: state.openCommit, message: state.message, config: MWF_CRM_CONFIG,
    categories: state.categories, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, itemIcons: state.itemIcons, workflowSel: state.workflowSel, workflowSuggestions: Object.fromEntries(flaggedItems.filter((i) => resolveFrameworkId(setupNow(), i.id) === "").map((i) => [i.id, suggestWorkflowFor(i.name, state.frameworks.map((f) => f.id))]).filter(([, w]) => w !== "")), itemFramework: state.itemFramework, itemFrameworkSuggestions: suggestItemFrameworks(flaggedItems, setupNow()), suggestions: suggestAll(flaggedItems, state.itemCategories, state.categories), selectedItem: state.selectedItem,
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
// The last error from outcomeChange, so a pop-up can show it where the person is looking. Empty when the change worked.
let lastError = "";
async function outcomeChange(body: Record<string, unknown>): Promise<void> {
  lastError = "";
  try {
    if (state.live()) {
      const r = await changeOutcomes(body);
      state.outcomes = r.outcomes;
      state.allocations = r.allocations;
      state.projects = r.projects ?? state.projects;
      state.giftProjects = r.giftProjects ?? state.giftProjects;
      state.nodes = r.nodes ?? state.nodes;
      state.graceDays = r.graceDays ?? state.graceDays;
      state.requireRef = r.requireRef ?? state.requireRef;
      state.partnerTypes = r.partnerTypes ?? state.partnerTypes;
      state.partnerFields = r.partnerFields ?? state.partnerFields;
      state.outcomeTypes = r.outcomeTypes ?? state.outcomeTypes;
      state.idCounters = r.idCounters ?? state.idCounters;
      state.itemIcons = r.itemIcons ?? state.itemIcons;
      if (body["action"] === "remove-many") state.message = `Removed ${r.removed ?? 0}${r.kept ? `, kept ${r.kept} that hold commitments` : ""}.`;
      else if (body["action"] === "adopt-legacy") state.message = `Moved ${(r as unknown as { moved?: number }).moved ?? 0} into the partner.`;
      else if (body["action"] === "clear-legacy") state.message = `Removed ${(r as unknown as { removed?: number }).removed ?? 0} and released ${(r as unknown as { released?: number }).released ?? 0} gifts.`;
      else if (body["action"] === "auto") state.message = `Placed ${r.placed ?? 0}, released ${r.released ?? 0}, ${r.unplaced?.length ?? 0} waiting.`;
      else state.message = r.warning ?? "";
    } else {
      const commitments = allocatable(state.workOrders, perPeriodRule(state.frameworks), new Date().toISOString().slice(0, 10));
      const at = new Date().toISOString();
      const str = (k: string) => String(body[k] ?? "");
      let error: string | undefined;
      // Outcome types (DECISIONS 103): the same pure rule the server uses.
      if (body["action"] === "item-icon") { const icon = String(body["icon"] ?? ""); const next = { ...state.itemIcons }; if (icon === "") delete next[String(body["itemId"])]; else next[String(body["itemId"])] = icon; state.itemIcons = next; }
      const ot = typeof body["action"] === "string" && (body["action"] as string).startsWith("ot-") ? applyOutcomeTypeAction(state.outcomeTypes, state.frameworks.map((f) => f.id), [...new Set(state.outcomes.map((o) => o.outcomeTypeId ?? "").filter((x) => x !== ""))], body) : null;
      if (ot) { if ("error" in ot) error = ot.error; else state.outcomeTypes = ot.types; }
      else switch (body["action"]) {
        case "add": { const r = addOutcomes(state.outcomes, { name: str("name"), count: Number(body["count"] ?? 1), type: str("type"), cohort: str("cohort"), frameworkId: str("frameworkId") }); if (!state.frameworks.some((f) => f.id === str("frameworkId"))) error = "Choose a framework for the outcome."; else if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "active": state.outcomes = setActive(state.outcomes, str("id"), body["active"] === true); break;
        case "remove": { const r = removeOutcome(state.outcomes, state.allocations, str("id")); if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "auto": { const r = autoAllocate(commitments, state.outcomes, state.frameworks, state.allocations, at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects)); state.allocations = r.allocations; state.message = `Placed ${r.placed}, released ${r.released}, ${r.unplaced.length} waiting.`; break; }
        case "move": { const r = moveAllocation(state.allocations, commitments, state.outcomes, state.frameworks, str("commitmentKey"), str("outcomeId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.allocations = r.value; break; }
        case "remove-many": { const r = removeUnused(state.outcomes, state.allocations, Array.isArray(body["ids"]) ? (body["ids"] as string[]) : []); state.outcomes = r.value; state.message = `Removed ${r.removed}${r.kept ? `, kept ${r.kept} that hold commitments` : ""}.`; break; }
        case "place-in-node": { const r = placeInNode(state.allocations, commitments, state.outcomes, state.nodes, state.frameworks, str("commitmentKey"), str("nodeId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.allocations = r.value; break; }
        case "place-in-partner": { const r = placeInPartner(state.allocations, commitments, state.outcomes, state.projects, state.frameworks, str("commitmentKey"), str("projectId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.allocations = r.value; break; }
        case "adopt-legacy": { const r = adoptLegacy(state.outcomes, state.projects, str("projectId")); if (r.error) error = r.error; else { state.outcomes = r.value; state.message = `Moved ${r.moved} into the partner.`; } break; }
        case "clear-legacy": { const r = clearLegacy(state.outcomes, state.allocations); state.outcomes = r.outcomes; state.allocations = r.allocations; state.message = `Removed ${r.removed} and released ${r.released} gift${r.released === 1 ? "" : "s"}.`; break; }
        case "set-require-ref": state.requireRef = body["on"] === true; break;
        case "set-grace": { const n = Number(body["days"]); if (!Number.isInteger(n) || n < 0 || n > 90) error = "The grace period is a whole number of days, from 0 to 90."; else state.graceDays = n; break; }
        case "approve-release": { const due = releaseApprovals(state.allocations, commitments, state.frameworks, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy).find((x) => x.commitmentKey === str("commitmentKey")); if (!due) error = "That place is not due for release."; else state.allocations = releaseAllocation(state.allocations, due.commitmentKey); break; }
        case "release": state.allocations = releaseAllocation(state.allocations, str("commitmentKey")); break;
        default: {
          // Projects (DECISIONS 65): the same pure rule the server uses.
          const r = applyProjectAction({ projects: state.projects, nodes: state.nodes, outcomes: state.outcomes, partnerTypes: state.partnerTypes, partnerFields: state.partnerFields, giftProjects: state.giftProjects }, state.frameworks, body, new Date().toISOString().slice(0, 10), new Set(state.allocations.map((x) => x.outcomeId)));
          if (!r) error = "That request is not understood.";
          else if (r.error) error = r.error;
          else { state.projects = r.state.projects; state.nodes = r.state.nodes; state.outcomes = r.state.outcomes; state.partnerTypes = r.state.partnerTypes; state.partnerFields = r.state.partnerFields; state.giftProjects = r.state.giftProjects; if (r.warning) state.message = r.warning; }
        }
      }
      // Rule (DECISIONS 105): every outcome and allocation has an ID, in the demo too.
      const refs = ensureRefs({ outcomes: state.outcomes, allocations: state.allocations, counters: state.idCounters }, state.outcomeTypes);
      state.outcomes = refs.outcomes; state.allocations = refs.allocations; state.idCounters = refs.counters;
      lastError = error ?? "";
      state.message = error ?? (body["action"] === "auto" || state.message !== "" ? state.message : "");
    }
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
    lastError = state.message;
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

// Says how many instalments a payment covers (DECISIONS 84), on the server when live, in the browser in the demo.
async function applyCovers(key: string, covers: number): Promise<void> {
  try {
    if (state.live()) {
      const r = await setCoversApi(key, covers);
      const back = new Map(r.workOrders.map((w) => [w.key, w]));
      state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
    } else {
      state.workOrders = state.workOrders.map((w) => {
        if (w.key !== key) return w;
        const r = setCovers(w, covers);
        return "order" in r ? r.order : w;
      });
    }
    state.message = covers === 1 ? "Marked as a normal payment." : `Marked as covering ${covers} instalments.`;
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}
// The calendar icon on a payment: choose the months, then save (DECISIONS 118).
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-months-save]") as HTMLElement | null;
  if (!b) return;
  const key = b.dataset.monthsSave ?? "";
  void applyCovers(key, Number((document.getElementById(`pm-select-${key}`) as HTMLSelectElement | null)?.value ?? "1"));
});
// "N parts a month": the donor raised the gift, so it is not a catch-up. The payment is marked a single month and its parts are set (DECISIONS 118).
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-increase]") as HTMLElement | null;
  if (!b) return;
  const key = b.dataset.increase ?? "";
  void applyCovers(key, 1).then(() => applyParts([key], Number(b.dataset.n)));
});
// The months a one-off payment covers (DECISIONS 126). The server then works the parts out again, so the list is read again.
async function applyPeriods(keys: string[], periods: number): Promise<void> {
  try {
    if (state.live()) {
      await setPeriodsApi(keys, periods);
      await reloadLive();
    } else {
      state.workOrders = state.workOrders.map((w) => {
        if (!keys.includes(w.key)) return w;
        const r = setPeriods(w, periods);
        return "order" in r ? r.order : w;
      });
      deriveDemoParts();
    }
    state.message = periods === 0 ? "Back to what the CRM says." : `Saved: ${periods} month${periods === 1 ? "" : "s"}.`;
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const save = t.closest?.("[data-periods-save]") as HTMLElement | null;
  if (save) { const key = save.dataset.periodsSave ?? ""; return void applyPeriods([key], Number((document.getElementById(`pm-select-${key}`) as HTMLSelectElement | null)?.value ?? "1")); }
  const back = t.closest?.("[data-periods-set]") as HTMLElement | null;
  if (back) return void applyPeriods([back.dataset.periodsSet ?? ""], Number(back.dataset.n));
});
// Marks a gift for manual allocation, or takes the mark back (DECISIONS 113).
async function applyManual(keys: string[], on: boolean): Promise<void> {
  try {
    if (state.live()) {
      const r = await setManualApi(keys, on);
      const back = new Map(r.workOrders.map((w) => [w.key, w]));
      state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
    } else {
      state.workOrders = state.workOrders.map((w) => {
        if (!keys.includes(w.key)) return w;
        const r = setManual(w, on);
        return "order" in r ? r.order : w;
      });
    }
    state.message = on ? "Marked for manual allocation." : "Back to automatic.";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-manual-set]") as HTMLElement | null;
  if (b) void applyManual((b.dataset.keys ?? b.dataset.manualSet ?? "").split(" ").filter((k) => k !== ""), b.dataset.on === "1");
});
// Sets the parts of a payment when its quantity looked wrong, or confirms the CRM's (DECISIONS 87).
async function applyParts(keys: string[], parts: number): Promise<void> {
  try {
    if (state.live()) {
      const r = await setPartsApi(keys, parts);
      const back = new Map(r.workOrders.map((w) => [w.key, w]));
      state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
    } else {
      state.workOrders = state.workOrders.map((w) => {
        if (!keys.includes(w.key)) return w;
        const r = setParts(w, parts);
        return "order" in r ? r.order : w;
      });
    }
    state.message = parts === 0 ? "Back to what the price says." : `Saved: ${parts} part${parts === 1 ? "" : "s"}.`;
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}
// Choose the parts in the drop-down, then Save (DECISIONS 116).
document.addEventListener("click", (e) => {
  const sv = (e.target as HTMLElement).closest?.("[data-parts-save]") as HTMLElement | null;
  if (!sv) return;
  const n = Number((document.getElementById("gp-select") as HTMLSelectElement | null)?.value ?? "");
  void applyParts((sv.dataset.keys ?? "").split(" ").filter((k) => k !== ""), n);
});
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-parts-set]") as HTMLElement | null;
  if (b) void applyParts((b.dataset.keys ?? b.dataset.partsSet ?? "").split(" ").filter((k) => k !== ""), Number(b.dataset.n));
});
// A person says they checked what the notes of a gift say (DECISIONS 86), or reopens it.
async function applyLooked(key: string, looked: string): Promise<void> {
  try {
    if (state.live()) {
      const r = await setLookedApi(key, looked);
      const back = new Map(r.workOrders.map((w) => [w.key, w]));
      state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
    } else {
      state.workOrders = state.workOrders.map((w) => {
        if (w.key !== key) return w;
        const r = setLooked(w, looked);
        return "order" in r ? r.order : w;
      });
    }
    state.message = looked === "" ? "Reopened." : "Marked as checked.";
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
  }
  draw();
}
document.addEventListener("click", (e) => {
  const l = (e.target as HTMLElement).closest("[data-looked]") as HTMLElement | null;
  if (l) void applyLooked(l.dataset.looked as string, l.dataset.text ?? "");
});
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("[data-covers-set]") as HTMLElement | null;
  if (b) void applyCovers(b.dataset.coversSet as string, Number(b.dataset.n));
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.dataset?.coversKey !== undefined) void applyCovers(t.dataset.coversKey, Number(t.value));
});

// The keys a list is showing now (after its filter boxes), for "tick all".
function listShownKeys(scope: string): string[] {
  const v = view();
  if (scope === "main") return shownGiftKeys(v);
  const c = scope === "main" ? state.criteria : state.scopeCriteria[scope] ?? NO_CRITERIA;
  return filterWorkOrders(listBase(v, scope), c).slice(0, 500).map((w) => w.key);
}

// Redraws every list (the ticked count is shown in each), leaving the filter boxes alone.
function redrawLists(): void {
  for (const el of Array.from(document.querySelectorAll("[data-list]"))) el.innerHTML = (el as HTMLElement).dataset.list === "main-metrics" ? giftMetricsHtml(view()) : (el as HTMLElement).dataset.list === "main" ? giftListHtml(view()) : listHtml(view(), (el as HTMLElement).dataset.list as string);
}

// The Other sources page (field mapping) lives in the shell and keeps its own state (DECISIONS 93).
const mapping = createMapping(() => draw());

function draw(): void {
  // Rule (DECISIONS 91): until a session is found, or the demo is chosen, only the sign-in screen is shown.
  if (state.gate !== "app") {
    (document.getElementById("shell") as HTMLElement).innerHTML = state.gate === "checking" ? checkingHtml() : signinHtml(state.ownerNote);
    return;
  }
  const menu = visibleMenu(permissions());
  const role = DEMO_ROLES.find((r) => r.id === state.roleId);
  // Rule: if the current page is not allowed for this role, go to the first allowed page.
  if (!menu.some((m) => m.id === state.page)) state.page = landingPage(permissions()) ?? state.page;
  keepPageInAddress(state.page);
  const v = view();
  const body = menu.length === 0
    ? `<h1>No access</h1><p class="sub">Your CRM role has no OUTCOMES permission. In the live product you would not have been shown the OUTCOMES button.</p>`
    : state.page === "work-orders" ? giftsPage(v)
    : state.page === "data-feed" ? dataFeedPage(v)
    : state.page === "data-files" ? dataFilesPage(v)
    : state.page === "workflows" ? workflowsPage(v)
    : state.page === "attention" ? attentionPage(v)
    : state.page === "allocation" ? allocationPage(v)
    : state.page === "outcomes" ? outcomesPage(v)
    : state.page === "projects" ? projectsPage(v)
    : state.page === "partners" ? partnersPage(v)
    : state.page === "beneficiaries" ? beneficiariesPage(v)
    : state.page === "audit" ? auditPage(v)
    : state.page === "dashboard" ? dashboardPage(v)
    : state.page === "categories" ? categoriesPage(v)
    : state.page === "sources" ? mapping.html()
    : settingsPage(v);
  // Side menu (DECISIONS 66): the journey of a gift. A module is one entry and its pages are tabs above the page. Setup is behind the gear.
  const entries = menuEntries(permissions());
  const work = entries.filter((e) => e.section === "Work");
  const link = (e: (typeof entries)[number]) => `<a data-page="${(e.pages[0] as { id: string }).id}" class="${e.pages.some((p) => p.id === state.page) ? "on" : ""}"><span class="ico">${e.icon}</span>${e.label}</a>`;
  const dataEntries = entries.filter((e) => e.section === "Data");
  const sections = `${work.length ? `<h4>Work</h4>${work.map(link).join("")}` : ""}${dataEntries.length ? `<h4>Data</h4>${dataEntries.map(link).join("")}` : ""}`;
  const setupEntry = entries.find((e) => e.section === "Set up");
  const current = entries.find((e) => e.pages.some((p) => p.id === state.page));
  const openCount = (state.live() ? state.attention : view().attention ?? []).filter((i) => i.status === "open").length;
  // Icon menus in the top bar (DECISIONS 92): settings (a gear) and the person (name, role and sign out). One opens at a time, and a click elsewhere closes it.
  const ICON_GEAR = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
  const ICON_USER = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
  const gear = setupEntry ? `<span class="popwrap"><button class="iconbtn${setupEntry.pages.some((p) => p.id === state.page) || state.topMenu === "settings" ? " on" : ""}" data-menu="settings" title="Settings" aria-label="Settings" aria-expanded="${state.topMenu === "settings"}">${ICON_GEAR}${openCount > 0 ? `<span class="dot">${openCount}</span>` : ""}</button>${state.topMenu === "settings" ? `<div class="pop" role="menu"><div class="pophead">Settings</div>${setupEntry.pages.map((p) => `<a data-page="${p.id}" role="menuitem" class="${p.id === state.page ? "on" : ""}"><span class="ico">${p.icon}</span>${esc(p.label)}${p.id === "attention" && openCount > 0 ? ` <span class="pill review">${openCount}</span>` : ""}</a>`).join("")}</div>` : ""}</span>` : "";
  const person = `<span class="popwrap"><button class="iconbtn${state.topMenu === "user" ? " on" : ""}" data-menu="user" title="${state.me ? esc(state.me.name) : "Sign in"}" aria-label="Your account" aria-expanded="${state.topMenu === "user"}">${ICON_USER}</button>${state.topMenu === "user" ? `<div class="pop" role="menu">${state.me
    ? `<div class="pophead">${esc(state.me.name)}<div class="muted">${esc(state.me.org)}${state.me.storage === "memory" ? " · temporary storage" : ""}</div></div><div class="popnote muted">${state.me.perms.length} OUTCOMES permission${state.me.perms.length === 1 ? "" : "s"} from your CRM role.</div><button class="item" data-action="sign-out">Sign out</button>`
    : `<div class="pophead">Demo<div class="muted">Invented data, nothing is saved.</div></div><label class="popnote muted">Pretend to hold this CRM role<select id="role">${DEMO_ROLES.map((r) => `<option value="${r.id}"${r.id === state.roleId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label><button class="item" data-action="show-signin">Sign in</button>`}</div>` : ""}</span>`;
  const moduleTabs = current?.module && current.pages.length > 1
    ? `<div class="modhead"><b>${esc(current.module.label)}</b><span class="muted">${esc(current.module.blurb)}</span></div><div class="modtabs">${current.pages.map((p) => `<button data-page="${p.id}" class="${p.id === state.page ? "on" : ""}">${esc(p.label)}${p.id === "attention" && openCount > 0 ? ` <span class="pill review">${openCount}</span>` : ""}</button>`).join("")}</div>`
    : "";
  const shell = document.getElementById("shell") as HTMLElement;
  shell.innerHTML = `<div class="app">
    <aside class="side"><div class="brand">OUTCOMES<small>Minhaj Welfare Foundation</small></div><nav class="nav">${sections}</nav><div class="foot">${state.me ? "Live data from your CRM." : "Demo with invented data. Nothing is saved."}</div></aside>
    <header class="top">${state.me ? `<span class="badge-demo">Signed in from the CRM${state.me.storage === "memory" ? " · TEMPORARY STORAGE, nothing is kept" : ""}</span>` : `<span class="badge-demo">Demo with invented data</span>`}
      <div class="who">${gear}${person}</div></header>
    <main class="content">${moduleTabs}${body}</main></div>`;
  void role;
  // The partner window sits outside the page, so it is drawn again from the new state, except on the profile tab, which keeps what is being typed.
  if (state.partnerWin.open && state.partnerWin.tab !== "profile") renderPartnerWindow();
  renderGiftWindow();
}

// ---- The gift details window (DECISIONS 78) ----
// A pop-up outside the redrawn page. It is drawn again from the new state after every change, and closes itself when the gift is no longer there.
function renderGiftWindow(): void {
  let root = document.getElementById("gift-root");
  if (state.giftWin.key === "") { state.giftWin.log = false; if (root) root.innerHTML = ""; return; }
  if (!root) {
    root = document.createElement("div");
    root.id = "gift-root";
    document.body.appendChild(root);
  }
  const html = giftDetailHtml(view(), state.giftWin.key, state.giftWin.log);
  if (html === "") state.giftWin.key = "";
  root.innerHTML = html;
}
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  // The small log window inside the gift window.
  const lg = t.closest("[data-gift-log]") as HTMLElement | null;
  if (lg && (lg.dataset.giftLog !== "overlay" || t === lg)) { state.giftWin.log = lg.dataset.giftLog === "open"; return renderGiftWindow(); }
  const close = t.closest("[data-gift-close]") as HTMLElement | null;
  if (close && (close.dataset.giftClose !== "overlay" || t === close)) { state.giftWin.key = ""; state.giftWin.log = false; return renderGiftWindow(); }
  // A click on a row opens it, unless the click was on a tick box, a drop-down or a button of its own.
  const open = t.closest("[data-gift-open]") as HTMLElement | null;
  if (open && !t.closest("input,select,button:not(.gi-open),a,details")) { state.giftWin.key = open.dataset.giftOpen ?? ""; state.giftWin.log = false; renderGiftWindow(); }
});
document.addEventListener("keydown", (e) => {
  // A row opens with Enter too, since the info button at its end is gone (DECISIONS 109).
  const row = (e.target as HTMLElement | null)?.closest?.("tr[data-gift-open]") as HTMLElement | null;
  if (row && e.key === "Enter" && !(e.target as HTMLElement).closest("input,select,button,a")) { state.giftWin.key = row.dataset.giftOpen ?? ""; state.giftWin.log = false; renderGiftWindow(); return; }
  if (e.key !== "Escape" || state.giftWin.key === "") return;
  if (state.giftWin.log) state.giftWin.log = false; else state.giftWin.key = "";
  renderGiftWindow();
});

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
  // Needs attention: jump to the matching lines in Work orders.
  const viewItem = target.closest("[data-view-item]") as HTMLElement | null;
  const viewKey = target.closest("[data-view-key]") as HTMLElement | null;
  if (viewItem || viewKey) {
    state.criteria = { ...NO_CRITERIA, ...(viewItem ? { itemId: viewItem.dataset.viewItem as string } : { text: viewKey?.dataset.viewKey as string }) };
    state.filter = viewItem ? "unrouted" : "all";
    state.page = "work-orders";
    return draw();
  }
  // The top bar icon menus: one click opens, another closes, and a click anywhere else closes it.
  const menuBtn = target.closest("[data-menu]") as HTMLElement | null;
  if (menuBtn) { state.topMenu = state.topMenu === menuBtn.dataset.menu ? "" : (menuBtn.dataset.menu as "settings" | "user"); return draw(); }
  if (state.topMenu !== "" && !target.closest(".pop")) { state.topMenu = ""; draw(); }
  const el = target.closest("[data-page],[data-filter],[data-action]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.page) { state.page = el.dataset.page as PageId; state.topMenu = ""; }
  if (el.dataset.filter) state.filter = el.dataset.filter as Filter;
  const action = el.dataset.action;
  if (action === "clear-filters") {
    const scope = el.dataset.scope ?? "main";
    if (scope === "main") state.criteria = { ...NO_CRITERIA };
    else state.scopeCriteria = { ...state.scopeCriteria, [scope]: { ...NO_CRITERIA } };
  }
  if (action === "show-signin") { state.topMenu = ""; state.gate = "signin"; return draw(); }
  if (action === "sign-out") {
    void signOut().finally(() => (globalThis as { location?: { assign(u: string): void } }).location?.assign("/app/"));
    return;
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
  // Matching a CRM project name to a project (DECISIONS 67).
  if (action === "assign-crm") return void outcomeChange({ action: "assign-crm-name", name: el.dataset.name, giftProjectId: el.dataset.project });
  if (action === "assign-crm-all") {
    const pairs = JSON.parse(el.dataset.pairs ?? "[]") as [string, string][];
    void (async () => { for (const [name, projectId] of pairs) await outcomeChange({ action: "assign-crm-name", name, giftProjectId: projectId }); })();
    return;
  }
  // Projects (DECISIONS 65).
  if (["add-level", "remove-level", "add-type", "remove-type", "add-node", "remove-node", "add-beneficiaries"].includes(action ?? "")) {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    const pid = (state.projects.find((p) => p.id === state.openProject) ?? state.projects[0])?.id ?? "";
    if (action === "add-level") void outcomeChange({ action: "add-level", projectId: pid, name: val("pj-level"), parentId: val("pj-level-parent") });
    if (action === "remove-level") void outcomeChange({ action: "remove-level", projectId: pid, levelId: el.dataset.id });
    if (action === "add-type") void outcomeChange({ action: "add-type", projectId: pid, name: val("pj-type-name"), levelId: val("pj-type-level"), frameworkId: val("pj-type-fw"), groupingIds: [...document.querySelectorAll(".pj-type-group:checked")].map((i) => (i as HTMLInputElement).value) });
    if (action === "remove-type") void outcomeChange({ action: "remove-type", projectId: pid, typeId: el.dataset.id });
    if (action === "add-node") void outcomeChange({ action: "add-node", projectId: pid, levelId: val("pj-node-level"), parentId: val("pj-node-parent"), name: val("pj-node-name"), field: val("pj-node-loc") !== "" ? "Location" : "", fieldValue: val("pj-node-loc") });
    if (action === "remove-node") void outcomeChange({ action: "remove-node", nodeId: el.dataset.id });
    if (action === "add-beneficiaries") void outcomeChange({ action: "add-beneficiaries", projectId: pid, typeId: val("pj-ben-type"), frameworkId: val("pj-ben-fw"), nodeId: val("pj-ben-node"), groupIds: [...document.querySelectorAll(".pj-ben-group")].filter((i) => !(i as HTMLElement).hidden).map((i) => (i as HTMLSelectElement).value).filter((x) => x !== ""), name: val("pj-ben-name"), count: Number(val("pj-ben-count") || 1) });
    return;
  }
  if (action === "add-outcomes") {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    void outcomeChange({ action: "add", name: val("oc-name"), count: Number(val("oc-count") || 1), type: val("oc-type"), cohort: val("oc-cohort"), frameworkId: val("oc-fw") });
    return;
  }
  // Beneficiaries made before partners existed (DECISIONS 73).
  if (action === "adopt-legacy") return void outcomeChange({ action: "adopt-legacy", projectId: (document.getElementById("al-adopt") as HTMLSelectElement | null)?.value ?? "" });
  if (action === "clear-legacy") {
    if (window.confirm("Remove the beneficiaries that are not in a partner and release their gifts? The gifts can then be placed again. This cannot be undone.")) void outcomeChange({ action: "clear-legacy" });
    return;
  }
  // Add beneficiaries from the Beneficiaries page: a partner, a name, a number and how they are sponsored (DECISIONS 72, 76).
  if (action === "ben-add") {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    if (val("ben-partner") === "") { state.message = "Choose the partner first."; return draw(); }
    state.benFilter = { ...state.benFilter, partner: val("ben-partner") };
    return void outcomeChange({ action: "add-beneficiaries", projectId: val("ben-partner"), typeId: "", name: val("ben-name"), count: Number(val("ben-count") || 1), frameworkId: val("ben-fw"), nodeId: "" });
  }
  // Give every beneficiary of the open partner that has no ID the next number (DECISIONS 75).
  if (action === "assign-refs") {
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
    return void outcomeChange({ action: "assign-refs", projectId: el.dataset.partner ?? state.openProject, prefix: val("pj-ref-prefix"), start: Number(val("pj-ref-start") || 1) });
  }
  // A manager approves releasing a place that has been unpaid beyond the grace days (DECISIONS 74).
  if (action === "approve-release") return void outcomeChange({ action: "approve-release", commitmentKey: el.dataset.key });
  if (action === "remove-unused") {
    const ids = (el.dataset.ids ?? "").split(",").filter((x) => x !== "");
    if (ids.length > 0 && window.confirm(`Remove ${ids.length} outcome${ids.length === 1 ? "" : "s"} that hold no commitments? This cannot be undone.`)) void outcomeChange({ action: "remove-many", ids });
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
  // The standard workflows with their outcome types and tasks (DECISIONS 130). Nothing already there is replaced.
  if (action === "add-starters") {
    const r = addStarterWorkflows(state.frameworks, state.outcomeTypes);
    state.frameworks = r.frameworks;
    state.message = r.added.length ? `Added ${r.added.join(", ")}. Choose a workflow for each item below.` : "The standard workflows are already there.";
    if (state.live()) {
      void (async () => {
        try {
          await saveConfig({ categories: state.categories, itemMap: state.itemCategories, frameworks: state.frameworks, itemFramework: state.itemFramework });
          await outcomeChange({ action: "ot-starters" });
          await reloadLive();
        } catch (e) {
          state.message = e instanceof Error ? e.message : "Could not save.";
        }
        draw();
      })();
    } else {
      state.outcomeTypes = linkStarterTypes(r.types, state.frameworks.map((f) => f.id));
      draw();
    }
  }
  // Suggest a workflow for each item that has none, from its name (DECISIONS 130). A person's own choices are kept.
  if (action === "suggest-workflows") {
    const ids = state.frameworks.map((f) => f.id);
    let setup = setupNow();
    for (const i of view().flaggedItems) if (resolveFrameworkId(setup, i.id) === "") { const w = suggestWorkflowFor(i.name, ids); if (w !== "") setup = assignToWorkflow(setup, i.id, w).value; }
    state.categories = setup.categories; state.itemCategories = setup.itemMap; state.itemFramework = setup.itemFramework;
    afterConfig(false);
  }
  if (action === "dup-framework" && el.dataset.id) {
    state.frameworks = duplicateFramework(state.frameworks, el.dataset.id).value;
    afterConfig(false);
  }
  if (action === "remove-framework" && el.dataset.id) {
    const r = removeWorkflow(setupNow(), el.dataset.id);
    state.message = r.error ?? "";
    if (!r.error) {
      state.frameworks = r.value.frameworks;
      state.categories = r.value.categories;
      state.workflowSel = { ...state.workflowSel, id: state.workflowSel.id === el.dataset.id ? "" : state.workflowSel.id };
      afterConfig(false);
    }
  }
  // Move work orders already made to the framework that now applies to their item (DECISIONS 64).
  if (action === "apply-frameworks") {
    const fw = frameworkByItem(setupNow());
    if (state.live()) {
      void (async () => {
        try {
          const r = await saveConfig({ categories: state.categories, itemMap: state.itemCategories, frameworks: state.frameworks, itemFramework: state.itemFramework, reapply: true });
          await reloadLive();
          state.message = `${r.reapplied ?? 0} work order${r.reapplied === 1 ? "" : "s"} moved to the workflow that now applies.`;
        } catch (e) {
          state.message = e instanceof Error ? e.message : "Could not save.";
        }
        draw();
      })();
    } else {
      const moved = state.workOrders.filter((w) => w.status !== "excluded" && fw[w.itemId] !== undefined && w.frameworkId !== fw[w.itemId]);
      state.workOrders = state.workOrders.map((w) => (w.status !== "excluded" && fw[w.itemId] !== undefined ? { ...w, frameworkId: fw[w.itemId] as string } : w));
      state.message = `${moved.length} work order${moved.length === 1 ? "" : "s"} moved to the workflow that now applies.`;
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
  const field = t.dataset?.f;
  if (!field) return;
  const scope = t.dataset.scope ?? "main";
  if (scope === "main") state.criteria = { ...state.criteria, [field]: t.value } as Criteria;
  else state.scopeCriteria = { ...state.scopeCriteria, [scope]: { ...(state.scopeCriteria[scope] ?? NO_CRITERIA), [field]: t.value } as Criteria };
  const list = document.querySelector(`[data-list="${scope}"]`);
  if (list) list.innerHTML = scope === "main" ? giftListHtml(view()) : listHtml(view(), scope);
  const tiles = scope === "main" ? document.querySelector('[data-list="main-metrics"]') : null;
  if (tiles) tiles.innerHTML = giftMetricsHtml(view());
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
// Rule (DECISIONS 133): the pie follows the units number on every keystroke. Only the pie is redrawn, so the field keeps focus. The number is saved when the field is left.
document.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement | null;
  if (t?.dataset?.wfShares === undefined) return;
  const n = Math.floor(Number(t.value));
  if (!(n >= 1 && n <= 100)) return;
  const pie = document.getElementById?.("wf-pie"); const note = document.getElementById?.("wf-pie-note");
  if (pie) pie.innerHTML = unitPie(n);
  if (note) note.textContent = n === 1 ? "1 unit: a whole outcome." : `${n} units make one outcome.`;
});

document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset?.f) return onFilterInput(e);
  // The setting that places gifts only on beneficiaries that have an ID (DECISIONS 75).
  if (el.dataset?.requireRef !== undefined) return void outcomeChange({ action: "set-require-ref", on: el.checked });
  // Tick boxes: one work order, or all shown in a list. Only the lists are redrawn.
  if (el.dataset?.sel !== undefined) {
    state.selected = el.checked ? [...new Set([...state.selected, el.dataset.sel])] : state.selected.filter((k) => k !== el.dataset.sel);
    return redrawLists();
  }
  // Tick a whole gift: every payment it holds (DECISIONS 77).
  if (el.dataset?.selGift !== undefined) {
    const keys = (el.dataset.keys ?? "").split(" ").filter((k) => k !== "");
    state.selected = el.checked ? [...new Set([...state.selected, ...keys])] : state.selected.filter((k) => !keys.includes(k));
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
  const known = t.id === "role" || t.dataset.ocMove !== undefined || t.dataset.ocf !== undefined || t.dataset.assign !== undefined || !!t.dataset.rename || !!t.dataset.tpl || !!t.dataset.fwrename || t.dataset.catfw !== undefined || t.dataset.itemfw !== undefined || !!t.dataset.keywords || t.dataset.pjOpen !== undefined || t.dataset.levelParent !== undefined || t.dataset.placeSelect !== undefined || t.dataset.grace !== undefined || t.dataset.ref !== undefined || t.dataset.crmProject !== undefined || t.dataset.setPlace !== undefined || t.dataset.setGroup !== undefined || t.dataset.benf !== undefined;
  if (!known) return;
  // A level moved under another, or to the top (DECISIONS 71).
  if (t.dataset.levelParent !== undefined) return void outcomeChange({ action: "move-level", projectId: state.openProject, levelId: t.dataset.levelParent, parentId: t.value });
  if (t.dataset.placeSelect !== undefined) {
    if (t.value.startsWith("partner:")) void outcomeChange({ action: "place-in-partner", commitmentKey: t.dataset.placeSelect, projectId: t.value.slice(8) });
    else if (t.value !== "") void outcomeChange({ action: "place-in-node", commitmentKey: t.dataset.placeSelect, nodeId: t.value });
    return;
  }
  if (t.dataset.grace !== undefined) return void outcomeChange({ action: "set-grace", days: Number(t.value) });
  if (t.dataset.ref !== undefined) return void outcomeChange({ action: "set-ref", outcomeId: t.dataset.ref, ref: t.value });
  // A CRM name put in a project, or in none (DECISIONS 76).
  if (t.dataset.crmProject !== undefined) return void outcomeChange({ action: "assign-crm-name", name: t.dataset.crmProject, giftProjectId: t.value });
  // A beneficiary placed afterwards in a place, or in a group of a kind (DECISIONS 76).
  if (t.dataset.setPlace !== undefined) return void outcomeChange({ action: "set-place", outcomeId: t.dataset.setPlace, nodeId: t.value });
  if (t.dataset.setGroup !== undefined) return void outcomeChange({ action: "set-group", outcomeId: t.dataset.setGroup, levelId: t.dataset.level, groupId: t.value });
  // The filters on the Beneficiaries page.
  if (t.dataset.benf !== undefined) {
    state.benFilter = { ...state.benFilter, [t.dataset.benf]: t.value } as BenFilter;
    return draw();
  }
  if (t.dataset.pjOpen !== undefined) {
    state.openProject = t.value;
    return draw();
  }
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
const wantsDemo = new URLSearchParams(loc?.search ?? "").get("demo") === "1"; // read before the address is tidied
if (loc) {
  state.ownerNote = signinNote(loc.search);
  if (loc.search !== "") (globalThis as { history?: { replaceState(a: null, b: string, c: string): void } }).history?.replaceState(null, "", loc.pathname);
}
// In a browser nothing is shown until the session is checked. Without one the sign-in screen appears, unless the demo was asked for (?demo=1).
if (loc && !wantsDemo) state.gate = "checking";
draw();
// If the person arrived from the CRM there is a session: switch from demo to live data.
void fetchMe().then((me) => {
  if (me) { state.gate = "app"; return enterLive(me); }
  if (state.gate === "checking") { state.gate = "signin"; draw(); }
  return undefined;
});

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

// Drag a waiting gift onto a place (DECISIONS 66). The same change as choosing the place from the gift's list.
document.addEventListener("dragstart", (e) => {
  const gift = (e.target as HTMLElement).closest("[data-drag-key]") as HTMLElement | null;
  if (gift && e.dataTransfer) {
    e.dataTransfer.setData("text/plain", gift.dataset.dragKey as string);
    e.dataTransfer.effectAllowed = "move";
  }
});
document.addEventListener("dragover", (e) => {
  if ((e.target as HTMLElement).closest("[data-drop-node],[data-drop-partner]")) e.preventDefault();
});
document.addEventListener("drop", (e) => {
  const partner = (e.target as HTMLElement).closest("[data-drop-partner]") as HTMLElement | null;
  const gift = e.dataTransfer?.getData("text/plain") ?? "";
  if (partner && gift !== "") {
    e.preventDefault();
    return void outcomeChange({ action: "place-in-partner", commitmentKey: gift, projectId: partner.dataset.dropPartner });
  }
  const place = (e.target as HTMLElement).closest("[data-drop-node]") as HTMLElement | null;
  const key = e.dataTransfer?.getData("text/plain") ?? "";
  if (place && key !== "") {
    e.preventDefault();
    void outcomeChange({ action: "place-in-node", commitmentKey: key, nodeId: place.dataset.dropNode });
  }
});

// ---- The partner window (DECISIONS 69, 70) ----
// It lives outside the page that is redrawn, so nothing typed in the profile is lost when the page behind it refreshes.
function partnerCtx() {
  const v = view();
  return { types: state.partnerTypes, fields: state.partnerFields, items: v.flaggedItems.map((i) => ({ id: i.id, name: i.name })), others: state.projects.filter((p) => p.levels.length > 0).map((p) => ({ id: p.id, name: p.name })) };
}
// Draws the window from the current state. The scroll position is kept, so adding a row does not jump to the top.
function renderPartnerWindow(error = "", ok = false): void {
  const w = state.partnerWin;
  if (!w.open) return;
  let root = document.getElementById("modal-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "modal-root";
    document.body.appendChild(root);
  }
  const scroll = (root.querySelector(".pf-body") as HTMLElement | null)?.scrollTop ?? 0;
  const existing = state.projects.find((p) => p.id === w.id);
  root.dataset.id = w.id;
  root.innerHTML = partnerWindowHtml(view(), w.id, w.tab, partnerCtx(), (w.draft ?? existing ?? {}) as Parameters<typeof partnerWindowHtml>[4], error);
  const body = root.querySelector(".pf-body") as HTMLElement | null;
  if (body) body.scrollTop = scroll;
  if (ok) document.getElementById("pf-error")?.classList.add("ok");
  syncNewType();
}
function openPartnerWindow(id: string, tab: PartnerTab = "profile"): void {
  state.partnerWin = { open: true, id, tab, draft: null };
  if (id) state.openProject = id;
  renderPartnerWindow();
}
function closePartnerWindow(): void {
  state.partnerWin = { open: false, id: "", tab: "profile", draft: null };
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}
// Shows the box for a new type's name only while "New type..." is chosen.
function syncNewType(): void {
  const sel = document.getElementById("pf-type") as HTMLSelectElement | null;
  const wrap = document.getElementById("pf-newtype-wrap");
  if (sel && wrap) wrap.hidden = sel.value !== "__new__";
}
const readForm = () => readPartnerForm(document.getElementById("modal-root") as HTMLElement);

// Hides the options of a list that do not fit, and says so when none do.
function narrow(select: HTMLSelectElement | null, fits: (o: HTMLOptionElement) => boolean, emptyText: string, normalText: string): void {
  if (!select) return;
  let shown = 0;
  for (const o of [...select.options]) {
    if (o.value === "") continue;
    const ok = fits(o);
    o.hidden = !ok;
    o.disabled = !ok;
    if (ok) shown++;
  }
  if (select.selectedOptions[0]?.disabled) select.value = "";
  (select.options[0] as HTMLOptionElement).textContent = shown === 0 ? emptyText : normalText;
}
// Adding beneficiaries (DECISIONS 71): the type decides which places are offered and which groups (class, house) are asked for, and the place decides which groups are offered.
function filterPlaces(): void {
  const type = document.getElementById("pj-ben-type") as HTMLSelectElement | null;
  const place = document.getElementById("pj-ben-node") as HTMLSelectElement | null;
  if (!type || !place) return;
  const picked = type.selectedOptions[0] as HTMLOptionElement | undefined;
  const fwSel = document.getElementById("pj-ben-fw") as HTMLSelectElement | null;
  if (fwSel) fwSel.disabled = type.value !== ""; // a kind that is set up already says how it is sponsored
  const level = picked?.dataset.level ?? "";
  const groups = (picked?.dataset.groups ?? "").split(" ").filter((x) => x !== "");
  narrow(place, (o) => level === "" || o.dataset.level === level, "No place of this kind yet. Add one on the Structure tab.", "Place...");
  for (const g of document.querySelectorAll(".pj-ben-group") as NodeListOf<HTMLSelectElement>) {
    const used = groups.includes(g.dataset.groupLevel ?? "");
    g.hidden = !used;
    if (!used) g.value = "";
    narrow(g, (o) => place.value !== "" && (o.dataset.in ?? "").split(" ").includes(place.value), place.value === "" ? "Choose the place first" : "None in this place yet", g.getAttribute("aria-label") + "...");
  }
}
// Adding a place or a group: only the places of the level above are offered to sit inside (DECISIONS 71).
function filterParents(): void {
  const level = document.getElementById("pj-node-level") as HTMLSelectElement | null;
  const parent = document.getElementById("pj-node-parent") as HTMLSelectElement | null;
  if (!level || !parent) return;
  const above = (level.selectedOptions[0] as HTMLOptionElement | undefined)?.dataset.parentLevel;
  parent.disabled = level.value !== "" && above === "";
  narrow(parent, (o) => above !== undefined && o.dataset.level === above, level.value === "" ? "Inside..." : above === "" ? "Not inside anything" : "No place of that kind yet", "Inside...");
  if (above === "") (parent.options[0] as HTMLOptionElement).textContent = "Not inside anything";
}
document.addEventListener("change", (e) => {
  const id = (e.target as HTMLElement).id;
  if (id === "pf-type") syncNewType();
  if (id === "pj-ben-type" || id === "pj-ben-node") filterPlaces();
  if (id === "pj-node-level") filterParents();
});
document.addEventListener("click", (e) => {
  const nav = (e.target as HTMLElement).closest("[data-nav]") as HTMLElement | null;
  if (!nav) return;
  // A link from one register to another, for example from a partner to its beneficiaries.
  state.page = nav.dataset.nav as PageId;
  if (nav.dataset.partner) state.benFilter = { ...NO_BEN_FILTER, partner: nav.dataset.partner };
  closePartnerWindow();
  draw();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.partnerWin.open) closePartnerWindow();
  const row = (e.target as HTMLElement).closest?.(".rowlink") as HTMLElement | null;
  if (row && e.key === "Enter") openPartnerWindow(row.dataset.id ?? "");
});
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const tabBtn = target.closest("[data-pf-tab]") as HTMLElement | null;
  if (tabBtn && !(tabBtn as HTMLButtonElement).disabled) {
    if (state.partnerWin.tab === "profile") state.partnerWin.draft = readForm(); // what was typed is kept while another tab is open
    state.partnerWin.tab = tabBtn.dataset.pfTab as PartnerTab;
    return renderPartnerWindow();
  }
  const el = target.closest("[data-pf]") as HTMLElement | null;
  if (!el) return;
  const what = el.dataset.pf;
  if (what === "new") return openPartnerWindow("");
  if (what === "open" || what === "edit") return openPartnerWindow(el.dataset.id ?? "");
  if (what === "cancel") return closePartnerWindow();
  const root = document.getElementById("modal-root") as HTMLElement | null;
  if (!root) return;
  // Removing a partner (DECISIONS 104). The question says what goes with it. A partner with beneficiaries is removed together with them, only when none has a gift.
  if (what === "remove") {
    const id = state.partnerWin.id;
    const p = state.projects.find((x) => x.id === id);
    const own = state.outcomes.filter((o) => o.projectId === id).length;
    const places = state.nodes.filter((n) => n.projectId === id).length;
    const words = `${p?.name ?? "This partner"}${own || places ? `, its ${own} beneficiar${own === 1 ? "y" : "ies"} and ${places} place${places === 1 ? "" : "s"} and group${places === 1 ? "" : "s"}` : ""}`;
    if (!window.confirm(`Remove ${words}? This cannot be undone. A beneficiary with a gift allocated is never removed: release the gift first.`)) return;
    void outcomeChange({ action: "remove-partner", projectId: id, withBeneficiaries: own > 0 }).then(() => {
      if (lastError !== "") { const box = document.getElementById("pf-error"); if (box) box.textContent = lastError; return; }
      closePartnerWindow();
      state.message = `Removed ${p?.name ?? "the partner"}.`;
      draw();
    });
    return;
  }
  if (what === "add-contact") return void document.getElementById("pf-contacts")?.insertAdjacentHTML("beforeend", NEW_CONTACT_ROW);
  if (what === "add-doc") return void document.getElementById("pf-docs")?.insertAdjacentHTML("beforeend", NEW_DOC_ROW);
  // Adding or removing an extra field changes the organisation's list, so the form is drawn again with what was typed kept.
  if (what === "add-field" || what === "remove-field") {
    const draft = readForm();
    const name = what === "add-field" ? (document.getElementById("pf-newfield") as HTMLInputElement).value : (el.dataset.name ?? "");
    if (name.trim() === "") return;
    void outcomeChange({ action: what === "add-field" ? "add-partner-field" : "remove-partner-field", name }).then(() => {
      state.partnerWin.draft = draft;
      renderPartnerWindow(lastError);
    });
    return;
  }
  if (what === "save") {
    const profile = readForm();
    const w = state.partnerWin;
    const copyFrom = (document.getElementById("pf-copy") as HTMLSelectElement | null)?.value ?? "";
    void outcomeChange({ action: "save-partner", projectId: w.id, copyFrom, profile }).then(() => {
      if (lastError !== "") {
        const box = document.getElementById("pf-error");
        if (box) box.textContent = lastError;
        return;
      }
      const made = state.projects.find((p) => p.name.toLowerCase() === String(profile["name"] ?? "").trim().replace(/\s+/g, " ").toLowerCase());
      const wasNew = w.id === "";
      if (made) { w.id = made.id; state.openProject = made.id; }
      w.draft = null;
      // A new partner goes on to its structure. An edited one stays where it is and says it was saved.
      if (wasNew) w.tab = "structure";
      renderPartnerWindow(wasNew ? "" : "Saved.", !wasNew);
    });
  }
});


// ---- The project form (DECISIONS 76) ----
// A pop-up like the partner window, outside the page that is redrawn.
function renderProjectWindow(error = "", draft?: Record<string, unknown>): void {
  const w = state.projectWin;
  if (!w.open) return;
  let root = document.getElementById("project-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "project-root";
    document.body.appendChild(root);
  }
  const existing = state.giftProjects.find((g) => g.id === w.id);
  const names = crmNamesOf(state.workOrders, state.giftProjects).map((n) => ({ name: n.name, gifts: n.gifts }));
  root.innerHTML = projectFormHtml((draft ?? existing ?? {}) as Partial<GiftProject>, w.id, { crmNames: names, partners: state.projects }, error);
}
function closeProjectWindow(): void {
  state.projectWin = { open: false, id: "" };
  const root = document.getElementById("project-root");
  if (root) root.innerHTML = "";
}
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest("[data-pj]") as HTMLElement | null;
  if (!el) return;
  const what = el.dataset.pj;
  if (what === "new") { state.projectWin = { open: true, id: "" }; return renderProjectWindow(); }
  if (what === "open") { state.projectWin = { open: true, id: el.dataset.id ?? "" }; return renderProjectWindow(); }
  // A new project from a CRM name: the form opens with that name filled in and ticked.
  if (what === "from-name") { state.projectWin = { open: true, id: "" }; return renderProjectWindow("", { name: el.dataset.name ?? "", partnerIds: [] }); }
  if (what === "cancel") return closeProjectWindow();
  const root = document.getElementById("project-root");
  if (!root) return;
  if (what === "remove") {
    void outcomeChange({ action: "remove-gift-project", giftProjectId: state.projectWin.id }).then(() => closeProjectWindow());
    return;
  }
  if (what === "save") {
    const profile = readProjectForm(root);
    void outcomeChange({ action: "save-gift-project", giftProjectId: state.projectWin.id, profile }).then(() => {
      if (lastError !== "") {
        const box = document.getElementById("pr-error");
        if (box) box.textContent = lastError;
        return;
      }
      closeProjectWindow();
    });
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.projectWin.open) closeProjectWindow();
  const row = (e.target as HTMLElement).closest?.(".rowlink[data-pj]") as HTMLElement | null;
  if (row && e.key === "Enter") { state.projectWin = { open: true, id: row.dataset.id ?? "" }; renderProjectWindow(); }
});

// Events inside the Other sources page go to its controller (DECISIONS 93). The click listener comes first so a tap on a chip is not taken for anything else.
document.addEventListener("click", (e) => { mapping.onClick(e); });
document.addEventListener("change", (e) => { mapping.onChange(e); });
document.addEventListener("dragstart", (e) => mapping.onDragStart(e as DragEvent));
document.addEventListener("dragover", (e) => { mapping.onDragOver(e as DragEvent); });
document.addEventListener("dragleave", (e) => mapping.onDragLeave(e as DragEvent));
document.addEventListener("drop", (e) => { mapping.onDrop(e as DragEvent); });

// ---- Outcome types on the Categories and frameworks page (DECISIONS 103) ----
// Buttons carry data-ot-act, fields and drop-downs carry data-ot. Each becomes one request, applied on the server when live and in the browser in the demo.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-ot-act]") as HTMLElement | null;
  if (!b) return;
  const typeId = b.dataset.typeId ?? "";
  const fieldId = b.dataset.fieldId ?? "";
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
  switch (b.dataset.otAct) {
    case "add": return void outcomeChange({ action: "ot-add", name: val("newot") });
    case "remove": return void outcomeChange({ action: "ot-remove", typeId });
    case "up": return void outcomeChange({ action: "ot-field-move", typeId, fieldId, by: -1 });
    case "down": return void outcomeChange({ action: "ot-field-move", typeId, fieldId, by: 1 });
    case "field-remove": return void outcomeChange({ action: "ot-field-remove", typeId, fieldId });
    case "field-add": return void outcomeChange({ action: "ot-field-add", typeId, label: val(`otf-label-${typeId}`), kind: val(`otf-kind-${typeId}`) });
  }
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  const what = t.dataset?.ot;
  if (what === undefined) return;
  const typeId = t.dataset["typeId"] ?? "";
  const fieldId = t.dataset["fieldId"] ?? "";
  if (what === "icon") void outcomeChange({ action: "ot-icon", typeId, icon: t.value });
  else if (what === "rename") void outcomeChange({ action: "ot-rename", typeId, name: t.value });
  else if (what === "prefix") void outcomeChange({ action: "ot-prefix", typeId, prefix: t.value });
  else if (what === "source") void outcomeChange({ action: "ot-source", typeId, source: t.value });
  else if (what === "assign") void outcomeChange({ action: "ot-assign", typeId, assign: t.value });
  else if (what === "framework") void outcomeChange({ action: "ot-framework", typeId, frameworkId: t.dataset["frameworkId"] ?? "", on: (t as HTMLInputElement).checked });
  else if (what === "required") void outcomeChange({ action: "ot-field-set", typeId, fieldId, required: (t as HTMLInputElement).checked });
  else if (what === "inreport") void outcomeChange({ action: "ot-field-set", typeId, fieldId, inReport: (t as HTMLInputElement).checked });
  else if (what === "options") void outcomeChange({ action: "ot-field-set", typeId, fieldId, options: t.value });
});

// The icon of an item, chosen on the Categories and frameworks page (DECISIONS 107).
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.dataset?.iconItem !== undefined) void outcomeChange({ action: "item-icon", itemId: t.dataset.iconItem, icon: t.value });
});

// ---- The Workflows page (DECISIONS 130, 131) ----
// Puts an item in a workflow (or takes it out, when the workflow is empty). An item is in one workflow only, so this replaces any earlier one.
function moveItem(itemId: string, workflowId: string): void {
  const setup = setupNow();
  const r = workflowId === "" ? { value: unassignItem(setup, itemId), error: undefined as string | undefined } : assignToWorkflow(setup, itemId, workflowId);
  if (r.error) { state.message = r.error; return draw(); }
  state.categories = r.value.categories; state.itemCategories = r.value.itemMap; state.itemFramework = r.value.itemFramework;
  state.message = "";
  afterConfig(); // in the demo the sample feed is read again, so gifts of the item are routed
  draw();
}
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  // Items are put in a workflow with the switch on the Items list (DECISIONS 133), handled on change.
  // The icon library popup (DECISIONS 135): open, choose, OK keeps it, Cancel leaves it.
  const iconOpen = t.closest?.("[data-wf-iconopen]") as HTMLElement | null;
  if (iconOpen) { const w = state.frameworks.find((x) => x.id === iconOpen.dataset.wfIconopen); state.workflowSel = { ...state.workflowSel, iconPick: w?.icon || "bullseye" }; return draw(); }
  const iconChoose = t.closest?.("[data-wf-iconchoose]") as HTMLElement | null;
  if (iconChoose) { state.workflowSel = { ...state.workflowSel, iconPick: iconChoose.dataset.wfIconchoose ?? "" }; return draw(); }
  if (t.closest?.("[data-wf-iconcancel]")) { const { iconPick: _i, ...rest } = state.workflowSel; state.workflowSel = rest; return draw(); }
  const iconOk = t.closest?.("[data-wf-iconok]") as HTMLElement | null;
  if (iconOk) {
    const { iconPick, ...rest } = state.workflowSel;
    state.frameworks = updateTemplate(state.frameworks, iconOk.dataset.wfIconok ?? "", { icon: iconPick || undefined });
    state.workflowSel = rest;
    afterConfig(false);
    return draw();
  }
  const pick = t.closest?.("[data-wf-select]") as HTMLElement | null;
  if (pick) { state.workflowSel = { ...state.workflowSel, id: pick.dataset.wfSelect ?? "", stage: 1 }; return draw(); }
  const stage = t.closest?.("[data-wf-stage]") as HTMLElement | null;
  if (stage) { state.workflowSel = { ...state.workflowSel, stage: Number(stage.dataset.wfStage) }; return draw(); }
  const act = t.closest?.("[data-wf-act]") as HTMLElement | null;
  if (!act) return;
  const id = act.dataset.wf ?? "";
  const set = (r: { frameworks: FrameworkTemplate[] } | { error: string }) => { if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; state.message = ""; afterConfig(false); draw(); } };
  if (act.dataset.wfAct === "task-add") {
    const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null);
    set(addTask(state.frameworks, id, val("wf-task-label")?.value ?? "", Number(val("wf-task-after")?.value ?? "0"), val("wf-task-photo")?.checked === true));
  } else if (act.dataset.wfAct === "task-remove") set(removeTask(state.frameworks, id, act.dataset.task ?? ""));
  else if (act.dataset.wfAct === "sub-add") {
    const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null);
    set(addStage(state.frameworks, id, val("wf-sub-label")?.value ?? "", Number(val("wf-sub-days")?.value ?? "14")));
  } else if (act.dataset.wfAct === "sub-remove") set(removeStage(state.frameworks, id, act.dataset.sub ?? ""));
  else if (act.dataset.wfAct === "sub-up") set(moveStage(state.frameworks, id, act.dataset.sub ?? "", -1));
  else if (act.dataset.wfAct === "sub-down") set(moveStage(state.frameworks, id, act.dataset.sub ?? "", 1));
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === "wf-sim-parts") { state.workflowSel = { ...state.workflowSel, parts: Number(t.value) }; return draw(); }
  if (t.id === "wf-sim-alloc") { state.workflowSel = { ...state.workflowSel, allocated: (t as HTMLInputElement).checked }; return draw(); }
  // An unrouted gift: choose a workflow for its item, and the item moves into it (DECISIONS 131).
  if (t.dataset?.assignWf !== undefined) { if (t.value !== "") moveItem(t.dataset.assignWf, t.value); return; }
  // How a unit supports an outcome (DECISIONS 131).
  if (t.dataset?.wfToggle !== undefined) { moveItem(t.dataset.wfToggle, (t as HTMLInputElement).checked ? (t.dataset.wf ?? "") : ""); return; }
  if (t.dataset?.wfShares !== undefined || t.dataset?.wfFull !== undefined) {
    const id = (t.dataset.wfShares ?? t.dataset.wfFull) as string;
    const f = state.frameworks.find((x) => x.id === id);
    const full = t.dataset.wfFull !== undefined ? (t as HTMLInputElement).checked : f?.instalment === "share_of_whole";
    const units = t.dataset.wfShares !== undefined ? Number(t.value) : Math.max(1, f?.unitsPerBeneficiary ?? 1);
    const r = setUnitRule(state.frameworks, id, units, full);
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); draw(); }
    return;
  }
  // The outcome type of a workflow: a type belongs to at most one workflow, so choosing it takes it from the other (DECISIONS 103, 130).
  if (t.dataset?.wfType !== undefined) {
    const fid = t.dataset.wfType;
    const current = state.outcomeTypes.find((x) => x.frameworkIds.includes(fid));
    if (t.value === "" && current) void outcomeChange({ action: "ot-framework", typeId: current.id, frameworkId: fid, on: false });
    else if (t.value !== "") void outcomeChange({ action: "ot-framework", typeId: t.value, frameworkId: fid, on: true });
    return;
  }
  // Assigned for implementation (DECISIONS 137): how the handoff happens, and the partner's stages.
  if (t.dataset?.wfAssign !== undefined) {
    const r = setAssign(state.frameworks, t.dataset.wfAssign, t.value === "auto" ? "auto" : "suggest");
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); draw(); }
    return;
  }
  if (t.dataset?.wfFlag !== undefined) {
    const r = setFlag(state.frameworks, t.dataset.wf ?? "", t.dataset.wfFlag as "reassign" | "urgent" | "approve", (t as HTMLInputElement).checked);
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); draw(); }
    return;
  }
  if (t.dataset?.wfConfirm !== undefined) {
    const r = setConfirm(state.frameworks, t.dataset.wf ?? "", t.dataset.wfConfirm === "days" ? { days: Number(t.value) } : { tell: t.value });
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); draw(); }
    return;
  }
  const sub = t.dataset?.wfSub;
  if (sub !== undefined) {
    const fid = t.dataset.wf ?? "", sid = t.dataset.sub ?? "";
    const checked = (t as HTMLInputElement).checked;
    const r = setStage(state.frameworks, fid, sid, sub === "label" ? { label: t.value } : sub === "days" ? { days: Number(t.value) } : sub === "needs" ? { needs: t.value } : sub === "tell" ? { tell: t.value } : sub === "photo" ? { photo: checked } : { canPause: checked });
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); draw(); }
    return;
  }
  const task = t.dataset?.wfTask;
  if (task !== undefined) {
    const fid = t.dataset.wf ?? "", tid = t.dataset.task ?? "";
    const r = setTask(state.frameworks, fid, tid, task === "label" ? { label: t.value } : task === "after" ? { afterMonths: Number(t.value) } : { photo: (t as HTMLInputElement).checked });
    if ("error" in r) { state.message = r.error; draw(); } else { state.frameworks = r.frameworks; afterConfig(false); }
    return;
  }
});
