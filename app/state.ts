/**
 * state.ts
 *
 * What it does: the one state of the staff screens (DECISIONS 298): everything the shell draws from, in one object, with the few helpers that read the page from the address and remember hidden columns in the browser.
 * Who calls it: app/main.ts, which draws from it and changes it, and (as the shell is split) the feature files that react to buttons on their own screens. Depends on: the record types of the modules and the demo data. Holds no screen code and calls no server.
 * Data flow: main.ts sets it from the server (live) or the demo data, and draws; a button changes it, then main.ts draws again. It is never saved here: the server and the browser's own storage are the only places it lives on.
 */

import { normaliseSteps } from "../modules/09-allocation/order";
import { type FeedRow } from "../modules/01c-crm-connector/feed";
import { type GiftProject, type Node, type Project } from "../modules/06-projects/projects";
import { newTableTools } from "./shared/table-tools";
import { GIFT_COLUMNS, GIFT_HIDDEN_DEFAULT } from "./gifts/gifts-page";
import { type ProjectFilter } from "./projects/projects-page";
import { NO_BEN_FILTER, type BenFilter } from "./beneficiaries/beneficiaries-page";
import { NO_OUTCOME_FILTER } from "./beneficiaries/outcome-records-page";
import { type ConfirmFilter } from "./allocation/confirmation-page";
import { emptyAllocations, type Allocations } from "../modules/09-allocation/allocation";
import { emptyProgress, type Progress } from "../modules/12-progress/progress";
import { emptyConfirmations, type Confirmations } from "../modules/11-confirmation/confirmation";
import { emptyAssignments, type Assignments } from "../modules/08-assignment/assignment";
import { emptyEnrolments, type Enrolments } from "../modules/07-beneficiaries/enrolments";
import { emptyRegister, NO_FILTER as NO_REGISTER_FILTER, type BeneficiaryFilter, type BeneficiaryKind, type Register } from "../modules/07-beneficiaries/beneficiaries";
import { type PartnerTab } from "./partners/partner-window";
import { type OutcomeAllocation, type Outcome } from "../modules/05-outcomes/outcomes";
import { NO_CRITERIA, type Criteria } from "../modules/01c-crm-connector/filter";
import { type ReviewItem, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { type FrameworkTemplate } from "../modules/02-project-rules/categories";
import { type AttentionItem } from "../modules/04-triage/triage";
import { type Me } from "./shared/api";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import { starterOutcomeTypes, type OutcomeType } from "../modules/05-outcomes/outcome-types";
import type { PartnerCost } from "../modules/15-partner-costs/costs";
import { type Place } from "../modules/14-locations/locations";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { demoCategories, demoFeedRows, starterFrameworks } from "./demo-data";
import { isPageId, type PageId } from "./menu";
import { type Filter, type View } from "./shared/pages";

// The Gifts columns a person has hidden are remembered in this browser only (DECISIONS 215). Storage can be blocked or empty, so every read and write is guarded and the usual columns are the fallback.
export const GIFT_COLS_KEY = "outcomes.gifts.hiddenColumns";
export const loadHiddenCols = (): string[] => {
  try {
    const raw = (globalThis as { localStorage?: { getItem(k: string): string | null } }).localStorage?.getItem(GIFT_COLS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string" && GIFT_COLUMNS.some(([id]) => id === x));
  } catch { /* storage is blocked or holds something else: use the usual columns */ }
  return [...GIFT_HIDDEN_DEFAULT];
};
export const saveHiddenCols = (cols: string[]): void => { try { (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage?.setItem(GIFT_COLS_KEY, JSON.stringify(cols)); } catch { /* not kept this time */ } };

// Rule: the page being looked at is kept in the address (#workflows), so a reload comes back to it instead of the first page. Only known pages are used.
export function pageFromAddress(): PageId {
  try {
    const id = typeof location !== "undefined" ? location.hash.replace(/^#/, "") : "";
    if (isPageId(id)) return id;
  } catch { /* no address to read, for example in a test */ }
  return "work-orders";
}
export function keepPageInAddress(page: PageId): void {
  try {
    if (typeof location !== "undefined" && typeof history !== "undefined" && location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
  } catch { /* the address cannot be changed here, the page still works */ }
}

export const state = {
  tt: newTableTools(), // sort, value filters and hidden columns of every list that is not Gifts (DECISIONS 222)
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
  outcomeAllocations: [] as OutcomeAllocation[],
  projects: [] as Project[], // the projects and the places in them (DECISIONS 65)
  nodes: [] as Node[],
  giftProjects: [] as GiftProject[], // the projects donors choose, and the partners that deliver them (DECISIONS 76)
  benFilter: { ...NO_BEN_FILTER } as BenFilter, // the filters on the Outcomes list page
  beneficiaries: emptyRegister() as Register, // the Beneficiary register (DECISIONS 163)
  locations: [] as Place[], // the checked places in use, for the Areas page (DECISIONS 275)
  priorityGifts: [] as string[], // the gifts marked Priority (DECISIONS 284)
  allocationSteps: normaliseSteps(undefined), // the order a gift looks for a place in (DECISIONS 293)
  partnerCosts: [] as PartnerCost[], // what partners recorded as spent (DECISIONS 280)
  histWin: { open: false, kind: "gift" as "gift" | "enrolment", id: "" }, // the allocation history window (DECISIONS 186)
  allocations: emptyAllocations() as Allocations, // which place each assigned gift fills (DECISIONS 175)
  allocFilter: "all", // the filter on the Allocate page
  cnfFilter: "all" as ConfirmFilter, // the tile chosen on the Confirmation page
  pjFilter: "all" as ProjectFilter, // the tile chosen on the Projects page
  assignments: emptyAssignments() as Assignments, // which partner each gift was assigned to (DECISIONS 170)
  confirmations: emptyConfirmations() as Confirmations, // the partners' answers to those assignments (DECISIONS 231)
  progress: emptyProgress() as Progress, // the steps taken after allocation, and the batches closed (DECISIONS 232)
  prgFilter: "all", // the tile chosen on the Progress page
  assignFilter: "all", // the filter on the Assignment page
  enrolments: emptyEnrolments() as Enrolments, // who is enrolled in which cluster (DECISIONS 167)
  outcomeRecFilter: { ...NO_OUTCOME_FILTER } as { text: string; project: string; type: string; show: "" | "underfunded" | "missed" | "ended" }, // the filters on the Outcomes list
  outcomeRecSort: { key: "", dir: "asc" } as { key: string; dir: "asc" | "desc" },
  giftSort: { key: "", dir: "asc" } as { key: string; dir: "asc" | "desc" }, // the column the Gifts list is sorted by
  giftColFilters: {} as Record<string, string[]>, // the values chosen in a Gifts column
  giftFiltOpen: "", // the Gifts column whose value list is open
  giftHidden: loadHiddenCols(), // the Gifts columns a person has hidden
  giftColsOpen: false, // whether the column chooser is open
  registerSort: { key: "", dir: "asc" } as { key: string; dir: "asc" | "desc" }, // the column the Beneficiaries list is sorted by
  registerFilter: { ...NO_REGISTER_FILTER } as BeneficiaryFilter, // the filters on the Beneficiaries page
  benWin: { open: false, id: "", kind: "person" as BeneficiaryKind }, // the beneficiary window
  cnfWin: { id: "" }, // the batch open in the Confirmation window (DECISIONS 243)
  projectWin: { open: false, id: "" } as { open: boolean; id: string; tab?: "details" | "clusters" }, // the project form and the tab it shows
  giftWin: { key: "", log: false }, // the gift details window (DECISIONS 78): the key of the gift it shows, "" when closed
  partnerWin: { open: false, id: "", tab: "profile" as PartnerTab, draft: null as Record<string, unknown> | null }, // the partner window (DECISIONS 70)
  workflowSel: { id: "", stage: 1, parts: 1, allocated: false, pick: "" } as NonNullable<View["workflowSel"]>, // the workflow and stage the Workflows page shows, and its sample gift (DECISIONS 130)
  itemIcons: {} as Record<string, string>, // the icon chosen for an item (DECISIONS 107)
  kindSel: "", // the kind the Benefits page shows (DECISIONS 146)
  kindFeatures: {} as Record<string, unknown>, // the features of the kinds a person changed (DECISIONS 146)
  itemUnits: {} as Record<string, number>, // the units that make one whole beneficiary, by item (DECISIONS 188)
  itemKinds: {} as Record<string, string>, // the kind of benefit chosen for an item (DECISIONS 143)
  idCounters: {} as Record<string, number>, // the last number used for each ID prefix (DECISIONS 105)
  outcomeTypes: starterOutcomeTypes() as OutcomeType[], // the kinds of outcome and their profile fields (DECISIONS 103)
  partnerTypes: [] as string[], // the organisation's own list of partner types (DECISIONS 69)
  partnerFields: [] as string[], // and its own extra partner fields
  requireRef: false, // place gifts only on beneficiaries that have an ID (DECISIONS 75)
  graceDays: 15, // days a payment may be unpaid before the place may be released (DECISIONS 74)
  openProject: "", // the project open on the Projects page
  message: "",
  pendingFiles: [] as File[], // export files chosen but not loaded yet (demo only)
  loadNote: "", // what the last load did, shown in the load card
  audits: [] as AuditRecord[], // batch audit history (live only)
  attention: [] as AttentionItem[], // Needs attention, from the server when live (Module 4)
  topMenu: "" as "" | "settings" | "user", // which icon menu in the top bar is open
  gate: "app" as "app" | "checking" | "signin" | "partner", // before anything starts (DECISIONS 91): checking the session, the sign-in screen, or the app
  ownerNote: "", // what the last owner sign-in attempt said
  loading: "", // what the load is doing right now, "" when idle (shows a spinner)
  partnerSlice: null as PartnerSlice | null, // a partner's own data, set only for a partner's sign-in (DECISIONS 249)
  me: null as Me | null, // set when signed in from the CRM (live mode)
  run: null as import("../modules/00-platform/store").RunInfo | null,
};
