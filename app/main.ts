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

import { prioritySet, setManyPriority } from "../modules/08-assignment/priority-gifts";
import { normaliseSteps, orderText } from "../modules/09-allocation/order";
import { MWF_CRM_CONFIG, readFeed, type FeedRow } from "../modules/01c-crm-connector/feed";
import { adoptLegacy, allocOptions, crmNamesOf, applyProjectAction, autoCreateProjects, clearLegacy, allocateInNode, allocateInPartner, samplePartnerProfile, type GiftProject } from "../modules/06-projects/projects";
import { markCustomAmounts } from "../modules/04b-commitments/parts";
import { enhanceTables } from "./shared/table-tools";
import { giftDetailHtml, giftKeysOfPayments, giftListHtml, giftMetricsHtml, giftsPage, shownGiftKeys } from "./gifts/gifts-page";
import { partnersPage } from "./partners/partners-page";
import { projectsPage } from "./projects/projects-page";
import { beneficiariesPage, NO_BEN_FILTER, type BenFilter } from "./beneficiaries/beneficiaries-page";
import { registerPage } from "./beneficiaries/register-page";
import { outcomeRecordsPage } from "./beneficiaries/outcome-records-page";
import { applyErasure, exportBeneficiary } from "../modules/07-beneficiaries/erasure";
import { installHouseholdPicker } from "./beneficiaries/household-picker";
import { confirmationWindowHtml } from "./allocation/confirmation-window";
import { installGiftActions } from "./gifts/gift-actions";
import { installListEvents, placePopover } from "./shared/list-events";
import { progressPage } from "./allocation/progress-page";
import { confirmationPage } from "./allocation/confirmation-page";
import { assignmentPage } from "./allocation/assignment-page";
import { allocatePage } from "./allocation/allocate-page";
import { enrolmentHistoryHtml, giftHistoryHtml, type HistoryData } from "./gifts/history-window";
import { applyAllocationAction, allocateContext, syncAllocations } from "../modules/09-allocation/allocation";
import { applyProgressAction, emptyProgress } from "../modules/12-progress/progress";
import { progressContext } from "../modules/12-progress/context";
import { batchSizeOf } from "../modules/08-assignment/batches";
import { applyConfirmationAction, confirmOnBehalf, emptyConfirmations, refusedBy } from "../modules/11-confirmation/confirmation";
import { applyAssignmentAction, assignables, contextFrom, demandByItem } from "../modules/08-assignment/assignment";
import { loadSampleSetup, realProjectsFor, wholeByItem, type SampleState, removeSampleSetup, removedSummaryText, sampleSummaryText } from "../modules/07-beneficiaries/sample-setup";
import { poolMessage, settlePool } from "../modules/07-beneficiaries/waiting";
import { applyEnrolmentAction, heldByBeneficiary, heldInCluster, itemRulesOf } from "../modules/07-beneficiaries/enrolments";
import { applyBeneficiaryAction } from "../modules/07-beneficiaries/beneficiaries";
import { projectFormHtml, readProjectForm } from "./projects/project-form";
import { ICON_SETTINGS } from "./shared/icons";
import { clusterStateOf } from "../modules/06-projects/clusters";
import { closedClusters, clusterUi } from "./projects/clusters-tab";
import { benefitRow, NEW_CONTACT_ROW, NEW_DOC_ROW, readPartnerForm } from "./partners/partner-form";
import { partnerWindowHtml, type PartnerTab } from "./partners/partner-window";
import { addOutcomes, autoAllocate, perPeriodRule, releaseApprovals, moveAllocation, releaseAllocation, removeOutcome, removeUnused, setActive } from "../modules/05-outcomes/outcomes";
import { allocatable } from "../modules/04b-commitments/commitments";
import { filterWorkOrders, NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { planWorkOrders } from "../modules/01c-crm-connector/work-orders";
import { acceptSuggestions, addCategory, addFramework, resolveFrameworkId, assignItem, duplicateFramework, frameworkByItem, removeCategory, renameCategory, renameFramework, setCategoryFramework, setItemFramework, setKeywords, suggestAll, updateTemplate, type FrameworkTemplate, type Setup } from "../modules/02-project-rules/categories";
import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import { adaptFiles } from "../modules/01e-crm-export-adapter/export-adapter";
import { buildAttention, type AttentionItem } from "../modules/04-triage/triage";
import { changeOutcomes, loadOutcomes, decideAttention, signOut, importFeed, loadAttention, loadAudits, loadConfig, loadPartner, loadWorkOrders, fetchMe, runPickupNow, saveConfig, searchPlaces, type Me } from "./shared/api";
import { packFeed } from "../modules/01e-crm-export-adapter/compact";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import { PERMISSIONS } from "./menu";
import { frameLists } from "./shared/list-frames";
import { dataFeedPage, dataFilesPage } from "./setup/data-page";
import { benefitsPage } from "./setup/benefits-page";
import { unitPie, workflowsPage } from "./setup/workflows-page";
import { rulesPage } from "./setup/rules-page";
import { initStepOrder } from "./setup/rules-steps";

initStepOrder(() => state.allocationSteps, (steps) => void outcomeChange({ action: "alloc-steps", steps }));
import { mergeWorkflow, addStarterWorkflows, assignToWorkflow, linkStarterTypes, removeWorkflow, suggestWorkflowFor } from "../modules/02-project-rules/workflows";
import { createMapping } from "./setup/mapping-controller";
import { applyOutcomeTypeAction } from "../modules/05-outcomes/outcome-types";
import { ensureRefs } from "../modules/05-outcomes/refs";
import { checkingHtml, signinHtml } from "./signin-page";
import { partnerHomeHtml } from "./portal/partner-home";
import { handlePartnerAction, partnerKeys, partnerUi, switchView } from "./portal/partner-session";
import { initPlacePicker } from "./shared/place-picker";
import { areasCard } from "./dashboard/areas-page";
import { mountAreasMap } from "./dashboard/areas-map";
import { costsCard } from "./dashboard/costs-card";
import { withSetupCard } from "./dashboard/setup-card";
import { dashboardPage } from "./dashboard/dashboard-page";
import { trendsAction, trendsView } from "./dashboard/trends-session";
import { areasAction, areasView } from "./dashboard/areas-session";
import { acceptPlace, upsertPlace } from "../modules/14-locations/locations";
import { resolveArea } from "../modules/14-locations/areas";

initPlacePicker(searchPlaces);
import { viewAsMenu } from "./view-as-menu";
import { DEMO_ROLES, suggestItemFrameworks } from "./demo-data";
import { setItemKind, setItemUnits } from "../modules/02-project-rules/benefits";
import { setItemTimeline } from "../modules/02-project-rules/timeline";
import { autoRulesOf, setAutoRule } from "../modules/18-automation/rules";
import { sweepRecords } from "../modules/18-automation/run";
import { applyKindAction, type SavedFeatures } from "../modules/02-project-rules/kind-features";
import { landingPage, menuEntries, visibleMenu, type PageId } from "./menu";
import { listBlock, listHtml, listBase, attentionPage, auditPage, signinNote, esc, categoriesPage, settingsPage, type Filter, type View } from "./shared/pages";

declare const __BUILD_LABEL__: string; // set at build time in vite.config.ts: version, commit and build time
import "./shared/list-controls";
import "./setup/workflow-events";
import { shell } from "./shell";
import { dropWindow, putWindow, reducedMotion } from "./shared/windows";
import { placeOfWindow, renderBenWindow } from "./beneficiaries/beneficiary-window";
import { renderAreasWindow } from "./dashboard/areas-window";
import "./dashboard/scatter-open";
import { renderPrgWindow } from "./allocation/progress-window-session";
import { state, keepPageInAddress } from "./state";


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
  state.giftProjects = autoCreateProjects(state.giftProjects, state.workOrders).projects; // a gift that carries a project creates it (DECISIONS 155)
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
    await loadOutcomes().then((o) => { state.outcomes = o.outcomes; state.outcomeAllocations = o.outcomeAllocations; state.projects = o.projects ?? []; state.giftProjects = o.giftProjects ?? []; state.nodes = o.nodes ?? []; state.graceDays = o.graceDays ?? 15; state.requireRef = o.requireRef === true; state.partnerTypes = o.partnerTypes ?? []; state.partnerFields = o.partnerFields ?? []; state.outcomeTypes = o.outcomeTypes ?? state.outcomeTypes; state.idCounters = o.idCounters ?? state.idCounters; state.beneficiaries = o.beneficiaries ?? state.beneficiaries; state.locations = o.locations ?? state.locations; state.partnerCosts = o.partnerCosts ?? state.partnerCosts; state.priorityGifts = o.priorityGifts ?? state.priorityGifts; state.allocationSteps = o.allocationSteps ?? state.allocationSteps; state.itemUnits = o.itemUnits ?? state.itemUnits; state.itemTimelines = o.itemTimelines ?? state.itemTimelines; state.autoRules = o.autoRules ?? state.autoRules; state.autoLast = o.autoLast ?? state.autoLast; state.enrolments = o.enrolments ?? state.enrolments; state.assignments = o.assignments ?? state.assignments; state.allocations = o.allocations ?? state.allocations; state.itemIcons = o.itemIcons ?? state.itemIcons; state.itemKinds = o.itemKinds ?? state.itemKinds; state.kindFeatures = o.kindFeatures ?? state.kindFeatures;
      // Rule (DECISIONS 258): the answers and the steps taken are read when the page loads too, so a partner's answer is on the Confirmation list without anyone pressing anything first.
      state.confirmations = o.confirmations ?? state.confirmations; state.progress = o.progress ?? state.progress; }).catch(() => undefined);
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

// A partner's sign-in never loads staff data: it gets its own slice and its own home screen (DECISIONS 249).
async function enterPartner(me: Me): Promise<void> {
  state.me = me;
  try { state.partnerSlice = await loadPartner(); state.gate = "partner"; } catch { state.gate = "signin"; state.ownerNote = "Your partner account could not be loaded. Try signing in again."; }
  draw();
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
    locations: state.locations, allocationSteps: state.allocationSteps, priorityGifts: state.priorityGifts, partnerCosts: state.partnerCosts, workOrders: state.workOrders, review: state.review, itemCategories: state.itemCategories, flaggedItems, filter: state.filter, criteria: state.criteria, scopeCriteria: state.scopeCriteria, selected: state.selected, openAttn: state.openAttn, outcomes: state.outcomes, beneficiaries: state.beneficiaries, enrolments: state.enrolments, assignments: state.assignments, confirmations: state.confirmations, progress: state.progress, prgFilter: state.prgFilter, assignFilter: state.assignFilter, pageTab: state.pageTab, allocations: state.allocations, allocFilter: state.allocFilter, cnfFilter: state.cnfFilter, pjFilter: state.pjFilter, registerFilter: state.registerFilter, giftSort: state.giftSort, giftColFilters: state.giftColFilters, giftKeys: state.giftKeys, giftFiltOpen: state.giftFiltOpen, giftHidden: state.giftHidden, giftColsOpen: state.giftColsOpen, registerSort: state.registerSort, outcomeRecFilter: state.outcomeRecFilter, outcomeRecSort: state.outcomeRecSort, outcomeAllocations: state.outcomeAllocations, projects: state.projects, giftProjects: state.giftProjects, benFilter: state.benFilter, nodes: state.nodes, graceDays: state.graceDays, requireRef: state.requireRef, openProject: state.openProject, today: new Date().toISOString().slice(0, 10), message: state.message, config: MWF_CRM_CONFIG,
    categories: state.categories, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, itemIcons: state.itemIcons, itemKinds: state.itemKinds, kindFeatures: state.kindFeatures, kindSel: state.kindSel, itemUnits: state.itemUnits, itemTimelines: state.itemTimelines, autoRules: state.autoRules, ...(state.autoLast ? { autoLast: state.autoLast } : {}), workflowSel: state.workflowSel, workflowSuggestions: Object.fromEntries(flaggedItems.filter((i) => resolveFrameworkId(setupNow(), i.id) === "").map((i) => [i.id, suggestWorkflowFor(i.name, state.frameworks.map((f) => f.id))]).filter(([, w]) => w !== "")), itemFramework: state.itemFramework, itemFrameworkSuggestions: suggestItemFrameworks(flaggedItems, setupNow()), suggestions: suggestAll(flaggedItems, state.itemCategories, state.categories), selectedItem: state.selectedItem,
    pendingFiles: state.pendingFiles.map((f) => f.name), loadNote: state.loadNote, loading: state.loading, ownerNote: state.ownerNote, ...(state.me?.logins ? { logins: state.me.logins } : {}), attention: state.live() ? state.attention : buildAttention({ workOrders: state.workOrders, review: state.review, notes: [], marks: {} }), audits: state.audits, upload: state.me?.upload === true, live: state.live(), canPickup: permissions().includes(PERMISSIONS.settings), run: state.run,
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
      state.outcomeAllocations = r.outcomeAllocations;
      state.projects = r.projects ?? state.projects;
      state.giftProjects = r.giftProjects ?? state.giftProjects;
      state.nodes = r.nodes ?? state.nodes;
      state.graceDays = r.graceDays ?? state.graceDays;
      state.requireRef = r.requireRef ?? state.requireRef;
      state.partnerTypes = r.partnerTypes ?? state.partnerTypes;
      state.partnerFields = r.partnerFields ?? state.partnerFields;
      state.outcomeTypes = r.outcomeTypes ?? state.outcomeTypes;
      state.idCounters = r.idCounters ?? state.idCounters;
      state.beneficiaries = r.beneficiaries ?? state.beneficiaries;
      state.locations = r.locations ?? state.locations;
      state.partnerCosts = r.partnerCosts ?? state.partnerCosts;
      state.priorityGifts = r.priorityGifts ?? state.priorityGifts;
      state.allocationSteps = r.allocationSteps ?? state.allocationSteps;
      state.itemUnits = r.itemUnits ?? state.itemUnits; state.itemTimelines = r.itemTimelines ?? state.itemTimelines; state.autoRules = r.autoRules ?? state.autoRules; state.autoLast = r.autoLast ?? state.autoLast;
      state.enrolments = r.enrolments ?? state.enrolments;
      state.assignments = r.assignments ?? state.assignments;
      state.confirmations = r.confirmations ?? state.confirmations;
      state.progress = r.progress ?? state.progress;
      state.allocations = r.allocations ?? state.allocations;
      state.itemIcons = r.itemIcons ?? state.itemIcons;
      state.itemKinds = r.itemKinds ?? state.itemKinds;
      state.kindFeatures = r.kindFeatures ?? state.kindFeatures;
      if (body["action"] === "remove-many") state.message = `Removed ${r.removed ?? 0}${r.kept ? `, kept ${r.kept} that hold commitments` : ""}.`;
      else if (body["action"] === "adopt-legacy") state.message = `Moved ${(r as unknown as { moved?: number }).moved ?? 0} into the partner.`;
      else if (body["action"] === "clear-legacy") state.message = `Removed ${(r as unknown as { removed?: number }).removed ?? 0} and released ${(r as unknown as { released?: number }).released ?? 0} gifts.`;
      else if (body["action"] === "auto") state.message = `Allocated ${r.allocated ?? 0}, released ${r.released ?? 0}, ${r.unallocated?.length ?? 0} waiting.`;
      else state.message = r.warning ?? "";
    } else {
      const commitments = allocatable(state.workOrders, perPeriodRule(state.frameworks), new Date().toISOString().slice(0, 10));
      const at = new Date().toISOString();
      const str = (k: string) => String(body[k] ?? "");
      let error: string | undefined;
      // Outcome types (DECISIONS 103): the same pure rule the server uses.
      const kf = typeof body["action"] === "string" && (body["action"] as string).startsWith("kf-") ? applyKindAction(state.kindFeatures as SavedFeatures, body) : null;
      if (kf) { if ("error" in kf) error = kf.error; else state.kindFeatures = kf.value; }
      const ot = typeof body["action"] === "string" && (body["action"] as string).startsWith("ot-") ? applyOutcomeTypeAction(state.outcomeTypes, state.frameworks.map((f) => f.id), [...new Set(state.outcomes.map((o) => o.outcomeTypeId ?? "").filter((x) => x !== ""))], body) : null;
      // The Beneficiary register (DECISIONS 163): the same pure rule the server uses.
      if (body["action"] === "alloc-steps") { state.allocationSteps = normaliseSteps(body["steps"]); state.message = `Allocation order saved: ${orderText(state.allocationSteps)}.`; }
      if (body["action"] === "gift-priority") { const ks = Array.isArray(body["keys"]) ? (body["keys"] as unknown[]).map(String) : [String(body["key"] ?? "")]; state.priorityGifts = setManyPriority(state.priorityGifts, ks, body["on"] === true); state.message = body["on"] === true ? "Marked as priority: assigned and allocated first." : "Priority taken away."; }
      if (body["action"] === "ben-area") { // the demo does the same as the server (DECISIONS 275)
        const place = acceptPlace(body["location"]);
        if (!place || typeof body["area"] !== "string") error = "Choose a place from the list.";
        else { const r = resolveArea(state.beneficiaries, body["area"], place); state.beneficiaries = r.register; state.locations = upsertPlace(state.locations, place); state.message = `${r.changed} records now have the place ${place.name}.`; }
      }
      const bn = typeof body["action"] === "string" && (body["action"] as string).startsWith("ben-") ? applyBeneficiaryAction(state.beneficiaries, body, (id) => heldByBeneficiary(state.enrolments, id), new Date().toISOString().slice(0, 10)) : null;
      if (bn) { if ("error" in bn) error = bn.error; else { state.beneficiaries = bn.value; if (bn.message) state.message = bn.message; } }
      // Enrolments (DECISIONS 167): the same pure rule the server uses. The type of each item says who it takes and who comes first.
      const names = new Map(view().flaggedItems.map((i) => [i.id, i.name]));
      const en = typeof body["action"] === "string" && (body["action"] as string).startsWith("enr-") ? applyEnrolmentAction({ beneficiaries: state.beneficiaries, giftProjects: state.giftProjects, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, names.get(itemId) ?? ""), today: new Date().toISOString().slice(0, 10) }, state.enrolments, body) : null;
      if (en) { if ("error" in en) error = en.error; else state.enrolments = en.value; }
      // Erasing one beneficiary (DECISIONS 240): the same pure rule the server uses.
      const er = body["action"] === "ben-erase" ? applyErasure(state.beneficiaries, state.enrolments, state.allocations, body) : null;
      if (er) { if ("error" in er) error = er.error; else { state.beneficiaries = er.register; state.enrolments = er.enrolments; state.allocations = er.allocations; state.message = er.message; } }
      if (kf || bn || en || er) { /* a kind feature request or a register request, applied above */ }
      else if (ot) { if ("error" in ot) error = ot.error; else state.outcomeTypes = ot.types; }
      else switch (body["action"]) {
        case "add": { const r = addOutcomes(state.outcomes, { name: str("name"), count: Number(body["count"] ?? 1), type: str("type"), cohort: str("cohort"), frameworkId: str("frameworkId") }); if (!state.frameworks.some((f) => f.id === str("frameworkId"))) error = "Choose a framework for the outcome."; else if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "active": state.outcomes = setActive(state.outcomes, str("id"), body["active"] === true); break;
        case "remove": { const r = removeOutcome(state.outcomes, state.outcomeAllocations, str("id")); if (r.error) error = r.error; else state.outcomes = r.value; break; }
        case "auto": { const r = autoAllocate(commitments, state.outcomes, state.frameworks, state.outcomeAllocations, at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects)); state.outcomeAllocations = r.outcomeAllocations; state.message = `Allocated ${r.allocated}, released ${r.released}, ${r.unallocated.length} waiting.`; break; }
        case "move": { const r = moveAllocation(state.outcomeAllocations, commitments, state.outcomes, state.frameworks, str("commitmentKey"), str("outcomeId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.outcomeAllocations = r.value; break; }
        case "remove-many": { const r = removeUnused(state.outcomes, state.outcomeAllocations, Array.isArray(body["ids"]) ? (body["ids"] as string[]) : []); state.outcomes = r.value; state.message = `Removed ${r.removed}${r.kept ? `, kept ${r.kept} that hold commitments` : ""}.`; break; }
        case "allocate-in-node": { const r = allocateInNode(state.outcomeAllocations, commitments, state.outcomes, state.nodes, state.frameworks, str("commitmentKey"), str("nodeId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.outcomeAllocations = r.value; break; }
        case "allocate-in-partner": { const r = allocateInPartner(state.outcomeAllocations, commitments, state.outcomes, state.projects, state.frameworks, str("commitmentKey"), str("projectId"), at, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy); if (r.error) error = r.error; else state.outcomeAllocations = r.value; break; }
        case "adopt-legacy": { const r = adoptLegacy(state.outcomes, state.projects, str("projectId")); if (r.error) error = r.error; else { state.outcomes = r.value; state.message = `Moved ${r.moved} into the partner.`; } break; }
        case "clear-legacy": { const r = clearLegacy(state.outcomes, state.outcomeAllocations); state.outcomes = r.outcomes; state.outcomeAllocations = r.outcomeAllocations; state.message = `Removed ${r.removed} and released ${r.released} gift${r.released === 1 ? "" : "s"}.`; break; }
        case "asg-run": case "asg-confirm": case "asg-set": case "asg-unassign": case "asg-reset": { // Assignment (DECISIONS 170): the same pure rule the server uses.
          const wosA = view().workOrders;
          const namesA = new Map(wosA.map((w) => [w.itemId, w.itemName]));
          const ctx = contextFrom({ urgent: prioritySet(state.priorityGifts), refused: refusedBy(state.confirmations.records), workOrders: wosA, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: new Date().toISOString().slice(0, 10), now: new Date().toISOString(), enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, namesA.get(itemId) ?? ""), itemUnits: state.itemUnits, stock: state.allocations.stock });
          const r = applyAssignmentAction(ctx, state.assignments, body);
          if (!r) { error = "That request is not understood."; break; }
          if ("error" in r) { error = r.error; break; }
          state.assignments = r.value;
          if (body["action"] === "asg-reset") { state.confirmations = emptyConfirmations(); state.progress = emptyProgress(); }
          settleConfirmations();
          if (r.message) state.message = r.message;
          break;
        }
        case "prg-next": case "prg-reject": case "prg-undo": case "prg-close-batch": case "prg-open-batch": case "prg-reset": { // Progress after allocation (DECISIONS 232): the same pure rule the server uses.
          const wosP = view().workOrders;
          const namesP = new Map(wosP.map((w) => [w.itemId, w.itemName]));
          const actxP = contextFrom({ urgent: prioritySet(state.priorityGifts), workOrders: wosP, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: at.slice(0, 10), now: at, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, namesP.get(itemId) ?? ""), itemUnits: state.itemUnits, stock: state.allocations.stock });
          const fwOf = new Map(assignables(actxP).map((u) => [u.key, u.w.frameworkId ?? ""]));
          const pctx = progressContext({ assignments: state.assignments.records, allocations: state.allocations.records, frameworkOf: (k) => fwOf.get(k) ?? "", frameworks: state.frameworks, sizeOf: (id) => batchSizeOf(state.projects.find((x) => x.id === id)), today: at.slice(0, 10) });
          const r = applyProgressAction(pctx, state.progress, body, "Demo administrator", at);
          if (!r) { error = "That request is not understood."; break; }
          if ("error" in r) { error = r.error; break; }
          state.progress = r.value;
          if (r.message) state.message = r.message;
          break;
        }
        case "cnf-confirm": case "cnf-reject": case "cnf-confirm-batch": case "cnf-reject-batch": case "cnf-reset": { // Confirmation (DECISIONS 231): the same pure rule the server uses.
          const r = applyConfirmationAction(state.confirmations, state.assignments.records, body, "Demo administrator", at);
          if (!r) { error = "That request is not understood."; break; }
          if ("error" in r) { error = r.error; break; }
          state.confirmations = r.value;
          if (r.message) state.message = r.message;
          break;
        }
        case "alc-run": case "alc-set": case "alc-undo": case "alc-reset": { // Allocation, the rewired Allocation (DECISIONS 175): the same pure rule the server uses.
          const wos = view().workOrders;
          const names2 = new Map(wos.map((w) => [w.itemId, w.itemName]));
          const nowIso = new Date().toISOString();
          const actx = contextFrom({ urgent: prioritySet(state.priorityGifts), workOrders: wos, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: nowIso.slice(0, 10), now: nowIso, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, names2.get(itemId) ?? ""), itemUnits: state.itemUnits, stock: state.allocations.stock });
          const pctx = allocateContext({ steps: state.allocationSteps, urgent: prioritySet(state.priorityGifts), assignments: state.assignments.records, assignables: assignables(actx), workOrders: wos, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, giftProjects: state.giftProjects, frameworks: state.frameworks, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, names2.get(itemId) ?? ""), now: nowIso, itemUnits: state.itemUnits });
          const r = applyAllocationAction(pctx, state.allocations, body);
          if (!r) { error = "That request is not understood."; break; }
          if ("error" in r) { error = r.error; break; }
          state.allocations = r.value;
          settleConfirmations();
          if (r.message) state.message = r.message;
          break;
        }
        case "sample-load": case "sample-remove": { // The sample setup (DECISIONS 168): the same pure rule the server uses.
          const cur = { partners: state.projects, giftProjects: state.giftProjects, partnerTypes: state.partnerTypes, register: state.beneficiaries, enrolments: state.enrolments, assignments: state.assignments, allocations: state.allocations };
          let next: SampleState = cur;
          if (body["action"] === "sample-load") {
            const r = loadSampleSetup({ items: view().flaggedItems.map((i) => ({ id: i.id, name: i.name })), realProjects: realProjectsFor(state.giftProjects, state.workOrders), whole: wholeByItem(view().workOrders, state.frameworks, state.itemUnits), demand: demandByItem(contextFrom({ urgent: prioritySet(state.priorityGifts), workOrders: view().workOrders, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: new Date().toISOString().slice(0, 10), now: new Date().toISOString() })), itemKinds: state.itemKinds, kindFeatures: state.kindFeatures as SavedFeatures, ...cur, today: new Date().toISOString().slice(0, 10) });
            if ("error" in r) { error = r.error; break; }
            next = r.value; state.message = sampleSummaryText(r.summary);
          } else {
            const r = removeSampleSetup(cur);
            next = r.value; state.message = removedSummaryText(r);
          }
          state.projects = next.partners; state.giftProjects = next.giftProjects; state.partnerTypes = next.partnerTypes; state.beneficiaries = next.register; state.enrolments = next.enrolments; if (next.assignments) state.assignments = next.assignments; if (next.allocations) state.allocations = next.allocations;
          break;
        }
        case "set-require-ref": state.requireRef = body["on"] === true; break;
        case "set-grace": { const n = Number(body["days"]); if (!Number.isInteger(n) || n < 0 || n > 90) error = "The grace period is a whole number of days, from 0 to 90."; else state.graceDays = n; break; }
        case "approve-release": { const due = releaseApprovals(state.outcomeAllocations, commitments, state.frameworks, allocOptions(state.projects, state.graceDays, at.slice(0, 10), state.requireRef, state.giftProjects).policy).find((x) => x.commitmentKey === str("commitmentKey")); if (!due) error = "That release is not due."; else state.outcomeAllocations = releaseAllocation(state.outcomeAllocations, due.commitmentKey); break; }
        case "release": state.outcomeAllocations = releaseAllocation(state.outcomeAllocations, str("commitmentKey")); break;
        case "item-icon": { const icon = str("icon"); const next = { ...state.itemIcons }; if (icon === "") delete next[str("itemId")]; else next[str("itemId")] = icon; state.itemIcons = next; break; }
        case "item-timeline": { const r = setItemTimeline(state.itemTimelines, str("itemId"), body["part"], body["value"]); if ("error" in r) error = r.error; else state.itemTimelines = r.value; break; }
        // The automatic work (DECISIONS 326), in the demo: the same rules the server uses.
        case "auto-rule": { const r = setAutoRule(state.autoRules, body["key"], body["value"]); if ("error" in r) error = r.error; else state.autoRules = r.value; break; }
        case "auto-note": state.autoLast = { at, by: "Demo administrator", text: str("text") }; break;
        case "auto-sweep": {
          const r = sweepRecords({ workOrders: view().workOrders, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, assignments: state.assignments, confirmations: state.confirmations, allocations: state.allocations, progress: state.progress, messages: state.partnerMessages, priorityGifts: state.priorityGifts, rules: state.autoRules }, at);
          state.assignments = r.assignments; state.confirmations = r.confirmations; state.partnerMessages = r.messages;
          state.message = `${r.reminded} reminder${r.reminded === 1 ? "" : "s"} left, ${r.moved} gift${r.moved === 1 ? "" : "s"} moved`;
          break;
        }
        case "auto-run": {
          const rules = autoRulesOf(state.autoRules);
          const did: string[] = [];
          if (rules.remind || state.frameworks.some((f) => f.moveAfterDays !== undefined)) { await outcomeChange({ action: "auto-sweep" }); did.push(`Reminders and moves: ${state.message}`); }
          if (rules.assign) { await outcomeChange({ action: "asg-run" }); did.push(`Assign: ${state.message || "done"}`); }
          if (rules.allocate) { await outcomeChange({ action: "alc-run" }); did.push(`Allocate: ${state.message || "done"}`); }
          if (did.length === 0) did.push("Nothing to do: reminders, Assign and Allocate are all off");
          state.autoLast = { at, by: "Demo administrator", text: `${did.join(". ")}.` };
          state.message = state.autoLast.text;
          break;
        }
        case "item-units": { const r = setItemUnits(state.itemUnits, str("itemId"), body["units"]); if ("error" in r) error = r.error; else state.itemUnits = r.value; break; }
        case "item-kind": { const r = setItemKind(state.itemKinds, str("itemId"), str("kind")); if ("error" in r) error = r.error; else state.itemKinds = r.value; break; }
        default: {
          // Projects (DECISIONS 65): the same pure rule the server uses.
          const r = applyProjectAction({ projects: state.projects, nodes: state.nodes, outcomes: state.outcomes, partnerTypes: state.partnerTypes, partnerFields: state.partnerFields, giftProjects: state.giftProjects }, state.frameworks, body, new Date().toISOString().slice(0, 10), new Set(state.outcomeAllocations.map((x) => x.outcomeId)), (gpId, clusterId) => heldInCluster(state.enrolments, gpId, clusterId));
          if (!r) error = "That request is not understood.";
          else if (r.error) error = r.error;
          else { state.projects = r.state.projects; state.nodes = r.state.nodes; state.outcomes = r.state.outcomes; state.partnerTypes = r.state.partnerTypes; state.partnerFields = r.state.partnerFields; state.giftProjects = r.state.giftProjects; if (r.warning) state.message = r.warning; }
        }
      }
      // Rule (DECISIONS 246): after a change to the register, enrolments or a project, complete records are admitted and the waiting list is enrolled while there is room. The same pure rule the server uses.
      if (error === undefined) {
        const poolNames = new Map(view().flaggedItems.map((i) => [i.id, i.name]));
        const pool = settlePool({ giftProjects: state.giftProjects, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, poolNames.get(itemId) ?? ""), today: new Date().toISOString().slice(0, 10) }, state.beneficiaries, state.enrolments);
        state.beneficiaries = pool.register; state.enrolments = pool.enrolments;
        if (poolMessage(pool)) state.message = [state.message, poolMessage(pool)].filter((x) => x).join(" ");
      }
      // Rule (DECISIONS 105): every outcome and allocation has an ID, in the demo too.
      const refs = ensureRefs({ outcomes: state.outcomes, outcomeAllocations: state.outcomeAllocations, counters: state.idCounters }, state.outcomeTypes);
      state.outcomes = refs.outcomes; state.outcomeAllocations = refs.outcomeAllocations; state.idCounters = refs.counters;
      lastError = error ?? "";
      state.message = error ?? (body["action"] === "auto" || state.message !== "" ? state.message : "");
    }
  } catch (e) {
    state.message = e instanceof Error ? e.message : "That did not work.";
    lastError = state.message;
  }
  draw();
}

// The changes a person makes to a gift's work order (app/gifts/gift-actions.ts).
const { applyExclusion } = installGiftActions({ state, draw, reloadLive, deriveDemoParts });


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

let lastListSig = "";
// Rule (DECISIONS 231): a partner holding a parked outcome ready for the gift's benefit is confirmed for. Run after anything that changes assignments or stock.
function settleConfirmations(): void {
  state.confirmations = confirmOnBehalf(state.confirmations, state.assignments.records, state.allocations.stock ?? [], state.allocations.records, new Date().toISOString()).value;
}
let lastFocusedPage = ""; // the page focus was last moved to, so a redraw of the same page does not steal focus
function draw(): void {
  // Rule (DECISIONS 91): until a session is found, or the demo is chosen, only the sign-in screen is shown.
  if (state.gate !== "app") {
    const html = state.gate === "checking" ? checkingHtml() : state.gate === "partner" && state.partnerSlice && state.me ? partnerHomeHtml(state.partnerSlice, state.me.name, typeof __BUILD_LABEL__ === "string" ? __BUILD_LABEL__ : "dev", partnerUi, state.me.canReturn === true) : signinHtml(state.ownerNote);
    (document.getElementById("shell") as HTMLElement).innerHTML = html;
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
    : state.page === "rules" ? rulesPage(v)
    : state.page === "benefits" ? benefitsPage(v)
    : state.page === "attention" ? attentionPage(v)
    : state.page === "projects" ? projectsPage(v)
    : state.page === "partners" ? partnersPage(v)
    : state.page === "beneficiaries" ? registerPage(v)
    : state.page === "outcome-records" ? outcomeRecordsPage(v)
    : state.page === "assignment" ? assignmentPage(v)
    : state.page === "allocate" ? allocatePage(v)
    : state.page === "confirmation" ? confirmationPage(v)
    : state.page === "progress" ? progressPage(v)
    : state.page === "outcome-list" ? beneficiariesPage(v)
    : state.page === "audit" ? auditPage(v)
    : state.page === "dashboard" ? withSetupCard(dashboardPage(v, trendsView), v) + areasCard(v, areasView) + costsCard(v)
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
  const ICON_GEAR = ICON_SETTINGS.replace("<svg ", '<svg width="18" height="18" ');
  const ICON_USER = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
  const gear = setupEntry ? `<span class="popwrap"><button class="iconbtn${setupEntry.pages.some((p) => p.id === state.page) || state.topMenu === "settings" ? " on" : ""}" data-menu="settings" title="Settings" aria-label="Settings${openCount > 0 ? `, ${openCount} need attention` : ""}" aria-expanded="${state.topMenu === "settings"}">${ICON_GEAR}${openCount > 0 ? `<span class="dot" aria-hidden="true">${openCount}</span>` : ""}</button>${state.topMenu === "settings" ? `<div class="pop" role="menu"><div class="pophead">Settings</div>${setupEntry.pages.map((p) => `<a data-page="${p.id}" role="menuitem" class="${p.id === state.page ? "on" : ""}"><span class="ico">${p.icon}</span>${esc(p.label)}${p.id === "attention" && openCount > 0 ? ` <span class="pill review">${openCount}</span>` : ""}</a>`).join("")}</div>` : ""}</span>` : "";
  const person = `<span class="popwrap"><button class="iconbtn${state.topMenu === "user" ? " on" : ""}" data-menu="user" title="${state.me ? esc(state.me.name) : "Sign in"}" aria-label="Your account" aria-expanded="${state.topMenu === "user"}">${ICON_USER}</button>${state.topMenu === "user" ? `<div class="pop" role="menu">${state.me
    ? `<div class="pophead">${esc(state.me.name)}<div class="muted">${esc(state.me.org)}${state.me.storage === "memory" ? " · temporary storage" : ""}</div></div><div class="popnote muted">${state.me.perms.length} OUTCOMES permission${state.me.perms.length === 1 ? "" : "s"} from your CRM role.</div>${viewAsMenu(state.me.partners)}<button class="item" data-action="sign-out">Sign out</button>`
    : `<div class="pophead">Demo<div class="muted">Invented data, nothing is saved.</div></div><label class="popnote muted">Pretend to hold this CRM role<select id="role">${DEMO_ROLES.map((r) => `<option value="${r.id}"${r.id === state.roleId ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label><button class="item" data-action="show-signin">Sign in</button>`}</div>` : ""}</span>`;
  const moduleTabs = current?.module && current.pages.length > 1
    ? `<div class="modhead"><b>${esc(current.module.label)}</b><span class="muted">${esc(current.module.blurb)}</span></div><div class="modtabs">${current.pages.map((p) => `<button data-page="${p.id}" class="${p.id === state.page ? "on" : ""}">${esc(p.label)}${p.id === "attention" && openCount > 0 ? ` <span class="pill review">${openCount}</span>` : ""}</button>`).join("")}</div>`
    : "";
  const shell = document.getElementById("shell") as HTMLElement;
  shell.innerHTML = `<a class="skip" href="#main">Skip to the page</a><div class="app">
    <aside class="side"><div class="brand"><img class="brand-mark" src="/brand/mark-light.svg" alt="" width="30" height="30"><span>OUTCOMES<small>Minhaj Welfare Foundation</small></span></div><nav class="nav">${sections}</nav><div class="foot">${state.me ? "Live data from your CRM." : "Demo with invented data. Nothing is saved."}</div></aside>
    <header class="top">${state.me ? `<span class="badge-demo">Signed in from the CRM${state.me.storage === "memory" ? " · TEMPORARY STORAGE, nothing is kept" : ""}</span>` : `<span class="badge-demo">Demo with invented data</span>`}
      <span class="ver" title="The version of this page. If it is not the latest, refresh the page.">${esc(typeof __BUILD_LABEL__ === "string" ? __BUILD_LABEL__ : "dev")}</span>
      <div class="who">${gear}${person}</div></header>
    <main class="content" id="main" tabindex="-1">${moduleTabs}${frameLists(body)}</main></div>`;
  void role;
  // Moving between pages (DECISIONS 297): the tab says where the person is, and focus goes to the page so a screen reader starts at its title and a keyboard user is not left in the menu.
  const here = entries.flatMap((e) => e.pages).find((p) => p.id === state.page);
  document.title = here ? `${here.label} \u00B7 OUTCOMES` : "OUTCOMES";
  if (lastFocusedPage !== state.page) {
    if (lastFocusedPage !== "") (document.getElementById("main") as HTMLElement | null)?.focus({ preventScroll: true });
    lastFocusedPage = state.page;
  }
  void mountAreasMap(); // the real map on the Dashboard card, when it is on the page (DECISIONS 279)
  // Motion (DECISIONS 220): the visual indicators (bars, meters, pies, tile figures) draw in, and the first rows of the Gifts list ease in, when the list itself changes (page, tab, tile, column filter or sort), not on every redraw or keystroke.
  const sig = `${state.page}|${state.filter}|${JSON.stringify(state.giftColFilters)}|${JSON.stringify(state.giftSort ?? "")}`;
  if (sig !== lastListSig) { lastListSig = sig; if (!reducedMotion()) { document.querySelector?.(".giftlist")?.classList.add("rows-in"); document.querySelector?.("main.content")?.classList.add("fx"); } }
  // The partner window sits outside the page, so it is drawn again from the new state, except on the profile tab, which keeps what is being typed.
  if (state.partnerWin.open && state.partnerWin.tab !== "profile") renderPartnerWindow();
  enhanceTables(document.querySelector?.("main.content") as ParentNode, state.tt, state.page);
  placePopover();
  renderGiftWindow();
  renderCnfWindow();
  renderPrgWindow();
}

// The Confirmation window of one batch, drawn outside the page. It is drawn again after every answer, keeping the scroll place, and closes itself if the batch is gone.
function renderCnfWindow(): void {
  let root = document.getElementById("cnf-root");
  if (state.cnfWin.id === "") return dropWindow(root);
  if (!root) { root = document.createElement("div"); root.id = "cnf-root"; document.body.appendChild(root); }
  const html = confirmationWindowHtml(view(), state.cnfWin.id);
  if (html === "") { state.cnfWin.id = ""; return dropWindow(root); }
  const scroll = root.querySelector?.(".pf-body")?.scrollTop ?? 0;
  putWindow(root, html);
  const body = root.querySelector?.(".pf-body");
  if (body) body.scrollTop = scroll;
}

// ---- The gift details window (DECISIONS 78) ----
// A pop-up outside the redrawn page. It is drawn again from the new state after every change, and closes itself when the gift is no longer there.
// Motion (DECISIONS 220): the window eases in when it OPENS and out when it closes, and is not replayed when it is redrawn after a change inside it.
// Rule: exits are shorter than entrances, only transform and opacity move, and a person who asks the system for less motion gets none.
let giftClosing: ReturnType<typeof setTimeout> | undefined;
function renderGiftWindow(): void {
  let root = document.getElementById("gift-root");
  if (state.giftWin.key === "") {
    state.giftWin.log = false;
    if (!root || root.innerHTML === "" || giftClosing !== undefined) return;
    if (reducedMotion()) { root.innerHTML = ""; return; }
    root.classList.add("gw-out");
    giftClosing = setTimeout(() => { giftClosing = undefined; if (state.giftWin.key === "") root!.innerHTML = ""; root!.classList.remove("gw-out"); }, 130);
    return;
  }
  if (!root) {
    root = document.createElement("div");
    root.id = "gift-root";
    document.body.appendChild(root);
  }
  // Opening again while it is still closing cancels the close, so the animation can always be interrupted.
  if (giftClosing !== undefined) { clearTimeout(giftClosing); giftClosing = undefined; root.classList.remove("gw-out"); root.innerHTML = ""; }
  const opening = root.innerHTML === "";
  const html = giftDetailHtml(view(), state.giftWin.key, state.giftWin.log);
  if (html === "") state.giftWin.key = "";
  root.innerHTML = html;
  root.classList.toggle("gw-in", opening && html !== "" && !reducedMotion());
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
  if (state.gate === "partner") partnerKeys(e, draw);
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
    // Priority for every ticked gift (DECISIONS 288): the ticked payments are turned into the gifts they belong to.
    if (how === "priority-on" || how === "priority-off") {
      const keys = giftKeysOfPayments(view(), state.selected);
      if (keys.length === 0) { state.message = "None of the ticked gifts can be given priority."; return draw(); }
      return void outcomeChange({ action: "gift-priority", keys, on: how === "priority-on" }).then(() => { state.selected = []; draw(); });
    }
    const restoring = (excl ? excl.dataset.exclAction : how) === "restore";
    const keys = excl ? [excl.dataset.excl as string] : [...state.selected];
    if (keys.length === 0) return;
    const reason = restoring ? "" : window.prompt(`Why exclude ${keys.length === 1 ? "this work order" : `these ${keys.length} work orders`}? (kept on file, you can restore later)`) ?? "";
    if (!restoring && reason.trim() === "") return;
    void applyExclusion(keys, restoring, reason);
    return;
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
  // The top bar icon menus: one click opens, another closes, and a click anywhere else closes it.
  const menuBtn = target.closest("[data-menu]") as HTMLElement | null;
  if (menuBtn) { state.topMenu = state.topMenu === menuBtn.dataset.menu ? "" : (menuBtn.dataset.menu as "settings" | "user"); return draw(); }
  if (state.topMenu !== "" && !target.closest(".pop")) { state.topMenu = ""; draw(); }
  const el = target.closest("[data-page],[data-filter],[data-action]") as HTMLElement | null;
  if (!el) return;
  if (el.dataset.page) { if (state.page !== el.dataset.page) state.message = ""; state.page = el.dataset.page as PageId; state.topMenu = ""; } // a note about one page (for example "Sample setup loaded") does not follow the person to the next
  if (el.dataset.filter) state.filter = el.dataset.filter as Filter;
  const action = el.dataset.action;
  if (action === "clear-filters") {
    const scope = el.dataset.scope ?? "main";
    if (scope === "main") { state.criteria = { ...NO_CRITERIA }; state.giftColFilters = {}; state.giftFiltOpen = ""; state.giftKeys = null; }
    else state.scopeCriteria = { ...state.scopeCriteria, [scope]: { ...NO_CRITERIA } };
  }
  if (action === "clear-filter") {
    // Removes one filter chip on its own (DECISIONS 215): that filter goes back to "any", the others stay.
    const k = el.dataset.key as keyof Criteria | undefined;
    const scope = el.dataset.scope ?? "main";
    if (k && k in NO_CRITERIA && scope === "main") state.criteria = { ...state.criteria, [k]: NO_CRITERIA[k] };
  }
  if (action === "view-as") return void switchView(el.dataset["partner"] ?? "");
  if (action?.startsWith("tr-")) return trendsAction(action, el, draw);
  if (action?.startsWith("ar-")) return void areasAction(action, el, outcomeChange, () => { draw(); renderAreasWindow(); });
  if (action?.startsWith("pt-")) return void handlePartnerAction(action, el, state.partnerSlice, (slice) => { state.partnerSlice = slice; }, draw);
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
    if (window.confirm("Remove the beneficiaries that are not in a partner and release their gifts? The gifts can then be allocated again. This cannot be undone.")) void outcomeChange({ action: "clear-legacy" });
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
  // Merge a workflow into another (DECISIONS 188): its items move, each keeps its own units per beneficiary, and the emptied workflow is removed.
  if (action === "merge-framework" && el.dataset.id) {
    const into = (document.getElementById("wf-merge-to") as HTMLSelectElement | null)?.value ?? "";
    const r = mergeWorkflow(setupNow(), state.itemUnits, el.dataset.id, into);
    if (r.error) { state.message = r.error; return draw(); }
    const { setup, itemUnits, moved } = r.value;
    state.categories = setup.categories; state.itemCategories = setup.itemMap; state.itemFramework = setup.itemFramework; state.frameworks = setup.frameworks;
    state.workflowSel = { ...state.workflowSel, id: into };
    void (async () => {
      for (const [id, units] of Object.entries(itemUnits)) if (state.itemUnits[id] !== units) await outcomeChange({ action: "item-units", itemId: id, units });
      afterConfig();
      state.message = `Merged: ${moved} item${moved === 1 ? "" : "s"} moved, and the old workflow removed.`;
      draw();
    })();
    return;
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
  // The Priority switches (DECISIONS 285): a gift in its window, and a parked outcome in its row.
  if (el.dataset?.giftPriority !== undefined) return void outcomeChange({ action: "gift-priority", key: el.dataset.giftPriority, on: el.checked }).then(() => { renderGiftWindow(); });
  if (el.dataset?.stockPriority !== undefined) return clusterRequestThen(el.checked ? "Marked as priority: gifts take it first." : "Priority taken away.", { action: "alc-stock-priority", id: el.dataset.stockPriority, priority: el.checked });
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
  const known = t.id === "role" || t.dataset.assign !== undefined || !!t.dataset.rename || !!t.dataset.tpl || !!t.dataset.fwrename || t.dataset.catfw !== undefined || t.dataset.itemfw !== undefined || !!t.dataset.keywords || t.dataset.pjOpen !== undefined || t.dataset.levelParent !== undefined || t.dataset.placeSelect !== undefined || t.dataset.grace !== undefined || t.dataset.ref !== undefined || t.dataset.crmProject !== undefined || t.dataset.setPlace !== undefined || t.dataset.setGroup !== undefined || t.dataset.benf !== undefined;
  if (!known) return;
  // A level moved under another, or to the top (DECISIONS 71).
  if (t.dataset.levelParent !== undefined) return void outcomeChange({ action: "move-level", projectId: state.openProject, levelId: t.dataset.levelParent, parentId: t.value });
  if (t.dataset.placeSelect !== undefined) {
    if (t.value.startsWith("partner:")) void outcomeChange({ action: "allocate-in-partner", commitmentKey: t.dataset.placeSelect, projectId: t.value.slice(8) });
    else if (t.value !== "") void outcomeChange({ action: "allocate-in-node", commitmentKey: t.dataset.placeSelect, nodeId: t.value });
    return;
  }
  if (t.dataset.grace !== undefined) return void outcomeChange({ action: "set-grace", days: Number(t.value) });
  if (t.dataset.ref !== undefined) return void outcomeChange({ action: "set-ref", outcomeId: t.dataset.ref, ref: t.value });
  // A CRM name put in a project, or in none (DECISIONS 76).
  if (t.dataset.crmProject !== undefined) return void outcomeChange({ action: "assign-crm-name", name: t.dataset.crmProject, giftProjectId: t.value });
  // A beneficiary allocated afterwards in a place, or in a group of a kind (DECISIONS 76).
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
  if (me?.partner) return enterPartner(me);
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
    return void outcomeChange({ action: "allocate-in-partner", commitmentKey: gift, projectId: partner.dataset.dropPartner });
  }
  const place = (e.target as HTMLElement).closest("[data-drop-node]") as HTMLElement | null;
  const key = e.dataTransfer?.getData("text/plain") ?? "";
  if (place && key !== "") {
    e.preventDefault();
    void outcomeChange({ action: "allocate-in-node", commitmentKey: key, nodeId: place.dataset.dropNode });
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
  putWindow(root, partnerWindowHtml(view(), w.id, w.tab, partnerCtx(), (w.draft ?? existing ?? {}) as Parameters<typeof partnerWindowHtml>[4], error));
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
  dropWindow(document.getElementById("modal-root"));
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
  narrow(place, (o) => level === "" || o.dataset.level === level, "No location of this kind yet. Add one on the Structure tab.", "Place...");
  for (const g of document.querySelectorAll(".pj-ben-group") as NodeListOf<HTMLSelectElement>) {
    const used = groups.includes(g.dataset.groupLevel ?? "");
    g.hidden = !used;
    if (!used) g.value = "";
    narrow(g, (o) => place.value !== "" && (o.dataset.in ?? "").split(" ").includes(place.value), place.value === "" ? "Choose the location first" : "None in this location yet", g.getAttribute("aria-label") + "...");
  }
}
// Adding a place or a group: only the places of the level above are offered to sit inside (DECISIONS 71).
function filterParents(): void {
  const level = document.getElementById("pj-node-level") as HTMLSelectElement | null;
  const parent = document.getElementById("pj-node-parent") as HTMLSelectElement | null;
  if (!level || !parent) return;
  const above = (level.selectedOptions[0] as HTMLOptionElement | undefined)?.dataset.parentLevel;
  parent.disabled = level.value !== "" && above === "";
  narrow(parent, (o) => above !== undefined && o.dataset.level === above, level.value === "" ? "Inside..." : above === "" ? "Not inside anything" : "No location of that kind yet", "Inside...");
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
  if (what === "rm-item") {
    const row = el.closest(".pf-benrow") as HTMLElement | null;
    const sel = document.getElementById("pf-additem") as HTMLSelectElement | null;
    if (row && sel) {
      const name = row.querySelector("td")?.textContent ?? "";
      const o = document.createElement("option");
      o.value = row.dataset.item ?? ""; o.textContent = name;
      sel.appendChild(o);
      row.remove();
      if (!document.querySelector(".pf-benrow")) document.getElementById("pf-benempty")?.removeAttribute("hidden");
    }
    return;
  }
  if (what === "new") return openPartnerWindow("");
  if (what === "sample") return void outcomeChange({ action: "save-partner", projectId: "", copyFrom: "", profile: samplePartnerProfile(view().flaggedItems.map((i) => ({ id: i.id, name: i.name })), new Date().toISOString().slice(0, 10)) });
  if (what === "open" || what === "edit") return openPartnerWindow(el.dataset.id ?? "");
  if (what === "cancel") return closePartnerWindow();
  const root = document.getElementById("modal-root") as HTMLElement | null;
  if (!root) return;
  // Removing a partner (DECISIONS 104). The question says what goes with it. A partner with beneficiaries is removed together with them, only when none has a gift.
  if (what === "export") {
    const x = exportBeneficiary(state.beneficiaries, state.enrolments, state.allocations, state.benWin.id);
    if (!x) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: "application/json" }));
    link.download = `${state.benWin.id}-data.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  if (what === "erase") {
    const confirm = (document.getElementById("rg-erase-confirm") as HTMLInputElement | null)?.value ?? "";
    void outcomeChange({ action: "ben-erase", id: state.benWin.id, confirm }).then(() => {
      if (lastError !== "") return renderBenWindow(lastError);
      state.benWin = { ...state.benWin, open: false };
      renderBenWindow();
    });
  }
  if (what === "remove") {
    const id = state.partnerWin.id;
    const p = state.projects.find((x) => x.id === id);
    const own = state.outcomes.filter((o) => o.projectId === id).length;
    const places = state.nodes.filter((n) => n.projectId === id).length;
    const words = `${p?.name ?? "This partner"}${own || places ? `, its ${own} beneficiar${own === 1 ? "y" : "ies"} and ${places} location${places === 1 ? "" : "s"} and group${places === 1 ? "" : "s"}` : ""}`;
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
// Rule (DECISIONS 234): the list of people to enrol shows only those the chosen benefit can go to (a person benefit, a household benefit), and those that match what is typed. An option that does not fit is hidden and cannot be chosen.
function filterEnrolList(): void {
  const ben = document.getElementById?.("en-ben") as HTMLSelectElement | null;
  if (!ben?.options) return; // not on the page, or the test page has no select
  const receiver = (document.getElementById("en-item") as HTMLSelectElement | null)?.selectedOptions?.[0]?.dataset.receiver ?? "";
  const q = ((document.getElementById("en-search") as HTMLInputElement | null)?.value ?? "").trim().toLowerCase();
  for (const o of [...ben.options]) {
    const fits = (receiver === "" || o.dataset.kind === receiver) && (q === "" || (o.dataset.text ?? "").includes(q));
    o.hidden = !fits;
    if (!fits) o.disabled = true; else o.disabled = o.dataset.ineligible === "1";
  }
  if (ben.selectedOptions[0]?.disabled || ben.selectedOptions[0]?.hidden) ben.selectedIndex = [...ben.options].findIndex((o) => !o.hidden && !o.disabled);
}
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
  const names = crmNamesOf(state.workOrders, state.giftProjects).filter((n) => n.giftProjectId === "").map((n) => ({ name: n.name, gifts: n.gifts })); // the CRM names no project has yet, to link a new project to
  putWindow(root, projectFormHtml((draft ?? existing ?? {}) as Partial<GiftProject>, w.id, { crmNames: names, partners: state.projects, items: view().flaggedItems.map((i) => ({ id: i.id, name: i.name })), people: { beneficiaries: state.beneficiaries.records, enrolments: state.enrolments.records, allocations: state.allocations.records, stock: state.allocations.stock ?? [], stockItemIds: view().flaggedItems.filter((i) => { const r = itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, i.id, i.name); return !!r && (r.first === "gift" || r.receiver === "none"); }).map((i) => i.id), receivers: Object.fromEntries(view().flaggedItems.map((i) => [i.id, itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, i.id, i.name)?.receiver ?? ""])) } }, error, w.tab ?? "details"));
  filterEnrolList();
}
document.addEventListener("input", (e) => { if ((e.target as HTMLElement | null)?.id === "en-search") filterEnrolList(); });
document.addEventListener("change", (e) => { if ((e.target as HTMLElement | null)?.id === "en-item") filterEnrolList(); });
function closeProjectWindow(): void {
  clusterUi.node = ""; clusterUi.adding = ""; clusterUi.nodeTab = "details"; // the next project opens on its list of clusters
  state.projectWin = { open: false, id: "" };
  dropWindow(document.getElementById("project-root"));
}
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest("[data-pj]") as HTMLElement | null;
  if (!el) return;
  const what = el.dataset.pj;
  if (what === "new") { state.projectWin = { open: true, id: "" }; return renderProjectWindow(); }
  if (what === "open") { state.projectWin = { open: true, id: el.dataset.id ?? "" }; return renderProjectWindow(); }
  // A new project from a CRM name: the form opens with that name filled in and ticked.
  if (what === "from-name") { state.projectWin = { open: true, id: "" }; return renderProjectWindow("", { name: el.dataset.name ?? "", partnerIds: [], itemIds: (el.dataset.items ?? "").split(",").filter((x) => x !== "") }); }
  // Create the project at once from a CRM name, offering the benefits seen on its gifts. Vendors are added afterwards.
  if (what === "create-now") return void outcomeChange({ action: "save-gift-project", giftProjectId: "", profile: { name: el.dataset.name ?? "", crmName: el.dataset.name ?? "", partnerIds: [], itemIds: (el.dataset.items ?? "").split(",").filter((x) => x !== "") } });
  // A vendor moves up or down in the priority order: the row moves in the form, and the order is read back from the form when it is saved.
  if (what === "vup" || what === "vdown") {
    const row = el.closest(".pf-vendor") as HTMLElement | null;
    const sib = what === "vup" ? row?.previousElementSibling : row?.nextElementSibling;
    if (row && sib) (what === "vup" ? sib.before(row) : sib.after(row));
    return;
  }
  if (what === "tab") { state.projectWin = { ...state.projectWin, tab: el.dataset.tab === "clusters" ? "clusters" : "details" }; return renderProjectWindow(); }
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

// In the partner's benefits (line by line): choosing a benefit from the list adds its line, and the x takes a line off and puts the benefit back in the list.
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement | null;
  if (t?.id !== "pf-additem" || t.value === "") return;
  const opt = t.selectedOptions[0];
  const body = document.getElementById("pf-bentbody");
  if (!opt || !body) return;
  body.insertAdjacentHTML("beforeend", benefitRow(opt.value, opt.textContent ?? opt.value));
  opt.remove();
  t.value = "";
  document.getElementById("pf-benempty")?.setAttribute("hidden", "");
  (body.lastElementChild?.querySelector(".pf-cap") as HTMLInputElement | null)?.focus();
});

// The Clusters tab of the project window (DECISIONS 158, 161, 162): each button or field is one request on the project's clusters, applied on the server when live and in the browser in the demo.
const clusterRequest = (body: Record<string, unknown>): void => void outcomeChange({ ...body, giftProjectId: state.projectWin.id }).then(() => { clusterUi.notice = ""; renderProjectWindow(lastError); });
// The same, and a short "Saved." shows when it worked, so a person can see that a Save did something.
const clusterRequestThen = (notice: string, body: Record<string, unknown>): void => void outcomeChange({ ...body, giftProjectId: state.projectWin.id }).then(() => { clusterUi.notice = lastError === "" ? notice : ""; renderProjectWindow(lastError); });
// A change of view only (open a folder, go into a cluster): it clears any old message, so a stale error does not stay on the screen.
const clusterView = (): void => { lastError = ""; clusterUi.notice = ""; renderProjectWindow(); };
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-cl]") as HTMLElement | null;
  if (!b || !state.projectWin.open) return;
  const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null)?.value ?? "";
  const id = b.dataset.id ?? "";
  switch (b.dataset.cl) {
    case "toggle": if (closedClusters.has(id)) closedClusters.delete(id); else closedClusters.add(id); return clusterView();
    case "expand-all": closedClusters.clear(); return clusterView();
    case "collapse-all": { const gp = state.giftProjects.find((g) => g.id === state.projectWin.id); const all = clusterStateOf(gp?.levels, gp?.clusters); for (const c of all.clusters) if (all.clusters.some((x) => x.parentId === c.id)) closedClusters.add(c.id); return clusterView(); }
    case "sub-open": closedClusters.delete(id); clusterUi.adding = id; return clusterView(); // the folder opens so the new sub cluster shows
    case "sub-cancel": clusterUi.adding = ""; return clusterView();
    case "goto": clusterUi.node = id; clusterUi.adding = ""; clusterUi.nodeTab = "details"; return clusterView(); // "" goes back to the tree
    case "enr-add": return clusterRequestThen("Enrolled.", { action: "enr-add", beneficiaryId: val("en-ben"), clusterId: id, itemId: val("en-item"), role: val("en-role") });
    case "enr-end": return clusterRequestThen("Enrolment ended.", { action: "enr-end", id });
    case "stock-add": return clusterRequestThen("Parked outcome added.", { action: "alc-stock-add", clusterId: id, itemId: val("st-item"), partnerId: val("st-partner"), name: val("st-name") });
    case "stock-rm": return clusterRequestThen("Parked outcome removed.", { action: "alc-stock-remove", id });
    case "node-tab": clusterUi.nodeTab = b.dataset.tab === "inside" ? "inside" : b.dataset.tab === "people" ? "people" : b.dataset.tab === "outcomes" ? "outcomes" : "details"; clusterUi.adding = ""; return clusterView();
    case "node-save": return clusterRequestThen("Saved.", { action: "cluster-set", clusterId: id, name: val("cn-name"), label: val("cn-label"), place: val("cn-place"), ...placeOfWindow(), roles: val("cn-roles"), status: val("cn-status"), ...(document.getElementById("cn-capacity") ? { capacity: val("cn-capacity") } : {}) });
    case "cluster-add": { // Rule: capacity belongs to the master cluster only, so a sub cluster is sent none.
      if (id === "") return clusterRequest({ action: "cluster-add", name: val("cl-tname"), label: val("cl-tlabel"), parentId: "", place: val("cl-tplace"), capacity: val("cl-tcap") });
      closedClusters.delete(id);
      clusterUi.adding = "";
      return clusterRequest({ action: "cluster-add", name: val("cl-sname"), label: val("cl-slabel"), parentId: id, place: val("cl-splace") });
    }
    case "cluster-add-b": closedClusters.delete(id); return clusterRequest({ action: "cluster-add", name: val("cl-bname"), label: val("cl-blabel"), parentId: id, place: val("cl-bplace") });
    case "cluster-rm": return clusterRequest({ action: "cluster-remove", clusterId: id });
  }
});
// Moving an enrolment to another cluster of the project, from the list on its row.
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement | null;
  if (t?.dataset?.cl !== "enr-move" || !state.projectWin.open || t.value === "") return;
  clusterRequestThen("Moved.", { action: "enr-move", id: t.dataset.id ?? "", clusterId: t.value });
});
// The search box on a long list hides the rows that do not match. Nothing is saved.
document.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement | null;
  if (t?.id !== "cl-search") return;
  const q = t.value.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>("tr[data-find]").forEach((r) => { r.hidden = q !== "" && !(r.dataset.find ?? "").includes(q); });
});

// The Assignment page (DECISIONS 170): the buttons, the partner list on each gift, and the filter.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-asg]") as HTMLElement | null;
  if (!b || b.tagName === "SELECT") return;
  const what = b.dataset.asg;
  if (what === "run") void outcomeChange({ action: "asg-run" });
  else if (what === "confirm") void outcomeChange({ action: "asg-confirm" });
  else if (what === "reset") void outcomeChange({ action: "asg-reset" });
  else if (what === "unassign") void outcomeChange({ action: "asg-unassign", key: b.dataset.key ?? "" });
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement | null;
  if (t?.dataset?.asg === "set" && t.value !== "") void outcomeChange({ action: "asg-set", key: t.dataset.key ?? "", partnerId: t.value });
  else if (t?.dataset?.asgf === "filter") { state.assignFilter = t.value; draw(); }
});

// The allocation history window (DECISIONS 186): a pop-up for one gift or one place, outside the page that is redrawn.
function renderHistWindow(): void {
  const w = state.histWin;
  let root = document.getElementById("hist-root");
  if (!w.open) { dropWindow(root); return; }
  if (!root) { root = document.createElement("div"); root.id = "hist-root"; document.body.appendChild(root); }
  const wos = view().workOrders;
  const names = new Map(wos.map((x) => [x.itemId, x.itemName]));
  const gifts = new Map(assignables(contextFrom({ urgent: prioritySet(state.priorityGifts), workOrders: wos, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: new Date().toISOString().slice(0, 10), now: new Date().toISOString() })).map((u) => [u.key, { donor: u.w.supporterName, item: u.w.itemName, payments: u.payments }]));
  // The history shows the true state now (DECISIONS 187): an allocation of a parked plan, a child who has left or a withdrawn assignment is shown as ended before a run records it.
  const nowIso = new Date().toISOString();
  const actx = contextFrom({ urgent: prioritySet(state.priorityGifts), workOrders: wos, partners: state.projects, giftProjects: state.giftProjects, frameworks: state.frameworks, outcomeTypes: state.outcomeTypes, today: nowIso.slice(0, 10), now: nowIso, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, names.get(itemId) ?? ""), itemUnits: state.itemUnits, stock: state.allocations.stock });
  const pctx = allocateContext({ steps: state.allocationSteps, urgent: prioritySet(state.priorityGifts), assignments: state.assignments.records, assignables: assignables(actx), workOrders: wos, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, giftProjects: state.giftProjects, frameworks: state.frameworks, rulesOf: (itemId) => itemRulesOf(state.itemKinds, state.kindFeatures as SavedFeatures, itemId, names.get(itemId) ?? ""), now: nowIso, itemUnits: state.itemUnits });
  const data: HistoryData = { allocations: syncAllocations(pctx, state.allocations).value.records, enrolments: state.enrolments.records, beneficiaries: state.beneficiaries.records, giftProjects: state.giftProjects, gifts, itemName: (id) => names.get(id) ?? id };
  putWindow(root, w.kind === "gift" ? giftHistoryHtml(data, w.id) : enrolmentHistoryHtml(data, w.id));
}
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-hist]") as HTMLElement | null;
  if (!b) return;
  if (b.dataset.hist === "close") { state.histWin = { ...state.histWin, open: false }; return renderHistWindow(); }
  state.histWin = { open: true, kind: b.dataset.hist === "enrolment" ? "enrolment" : "gift", id: b.dataset.id ?? "" };
  renderHistWindow();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.histWin.open) { state.histWin = { ...state.histWin, open: false }; renderHistWindow(); }
});

// The Allocate page (DECISIONS 175): the buttons, the place list on each gift, and the filter.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-alc]") as HTMLElement | null;
  if (!b || b.tagName === "SELECT") return;
  const what = b.dataset.alc;
  if (what === "run") void outcomeChange({ action: "alc-run" });
  else if (what === "reset") void outcomeChange({ action: "alc-reset" });
  else if (what === "undo") void outcomeChange({ action: "alc-undo", key: b.dataset.key ?? "" });
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement | null;
  if (t?.dataset?.alc === "set" && t.value !== "") void outcomeChange({ action: "alc-set", key: t.dataset.key ?? "", enrolmentId: t.value });
  else if (t?.dataset?.allocf === "filter") { state.allocFilter = t.value; draw(); }
});

// The sample setup buttons on the Organisation settings page (DECISIONS 168).
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-sample]") as HTMLElement | null;
  if (!b) return;
  void outcomeChange({ action: b.dataset.sample === "remove" ? "sample-remove" : "sample-load" });
});

// ---- Events of the lists: sort, filter, columns, tiles, the drop-down panel, and the buttons of Confirmation and Progress (app/shared/list-events.ts) ----
installListEvents({ state, draw, outcomeChange });
installHouseholdPicker(); // the household member picker in the beneficiary window (app/beneficiaries/household-picker.ts)

// The calls the feature files use (DECISIONS 298), filled in once everything above exists.
Object.assign(shell, { openGifts: (label: string, keys: string[]) => { state.criteria = { ...NO_CRITERIA }; state.giftColFilters = {}; state.giftFiltOpen = ""; state.filter = "all"; state.giftKeys = { label, keys }; state.page = "work-orders"; draw(); }, draw, redrawLists, outcomeChange, view, lastError: () => lastError, afterConfig, changed, setupNow });
