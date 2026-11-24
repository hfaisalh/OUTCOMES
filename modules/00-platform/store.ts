/**
 * store.ts
 *
 * What it does: the storage interface OUTCOMES needs from any database, and an in-memory version for
 * tests and for a demo with no database. The Postgres version is in pg-store.ts.
 * Who calls it: handlers.ts and pickup.ts. The real databases implement it.
 * Depends on: the Module 1c, 2 types.
 *
 * Rule: every call takes the organisation first, and one organisation never reads or changes
 * another's records (DECISIONS 23). The organisation always comes from the signed session, never
 * from the request.
 */

import { MWF_CRM_CONFIG, type FeedConfig } from "../01c-crm-connector/feed.js";
import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { Allocation, Outcome } from "../05-outcomes/outcomes.js";
import type { OutcomeType } from "../05-outcomes/outcome-types.js";
import type { GiftProject, Node, Project } from "../06-projects/projects.js";
import type { Register } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolments } from "../07-beneficiaries/enrolments.js";
import type { Assignments } from "../08-assignment/assignment.js";
import type { Placements } from "../09-placement/placement.js";
import { migrateSetup, type Category, type FrameworkTemplate, type ItemMap, type Setup } from "../02-project-rules/categories.js";
import type { AuditRecord } from "../01f-batch-audit/audit.js";
import type { TriageMark } from "../04-triage/triage.js";

// How this organisation reads its CRM (DECISIONS 30). The token itself is never stored here, only the name of the setting that holds it.
// "demo" is the pretend CRM of Module 1d, for testing with live input before a real CRM is connected.
// "upload" means lines arrive by uploading CRM export files (Module 1e, DECISIONS 42, 43), no live connection.
export type CrmSetting = { kind: "none" } | { kind: "demo" } | { kind: "upload" } | { kind: "api"; baseUrl: string; tokenEnv: string };

// Everything an organisation sets up in OUTCOMES.
export interface OrgConfig {
  categories: Category[];
  itemMap: ItemMap;
  frameworks?: FrameworkTemplate[]; // framework templates (DECISIONS 59). Absent in a setup saved before them
  itemFramework?: Record<string, string>; // an item's own framework, only where it differs from its category
  outcomes?: Outcome[]; // what gifts are allocated to (DECISIONS 61). Kept in the setup for now, to move to their own table when there are many
  allocations?: Allocation[];
  giftProjects?: GiftProject[]; // the projects donors choose, and the partners that deliver them (DECISIONS 76)
  kindFeatures?: Record<string, unknown>; // the features of each kind a person has changed, by kind id. Absent: the defaults (DECISIONS 146)
  itemKinds?: Record<string, string>; // the kind of benefit chosen for an item, by item id. Absent: the kind is suggested from the name (DECISIONS 143)
  itemIcons?: Record<string, string>; // the icon chosen for an item, by item id. Absent: the icon is suggested from the name (DECISIONS 107)
  placements?: Placements; // which place each assigned gift fills, or which outcome it created, kept apart from the gifts so a test run can be reset (DECISIONS 175)
  assignments?: Assignments; // which partner each gift was assigned to, kept apart from the gifts so a test run can be reset (DECISIONS 170)
  enrolments?: Enrolments; // who is enrolled in which cluster, for which benefit (DECISIONS 167)
  beneficiaries?: Register; // the Beneficiary register: persons and households (DECISIONS 163)
  idCounters?: Record<string, number>; // the last number used for each ID prefix, so an ID is never used twice (DECISIONS 105)
  allocationPrefix?: string; // the prefix of allocation IDs, AL by default
  outcomeTypes?: OutcomeType[]; // the kinds of outcome, with their profile fields and how a gift gets its outcome (DECISIONS 103). Absent: the starter types
  partnerTypes?: string[]; // the organisation's own list of partner types (DECISIONS 69)
  partnerFields?: string[]; // the organisation's own extra partner profile fields, by label
  releaseLog?: { commitmentKey: string; outcomeId: string; by: string; at: string; daysOverdue: number }[]; // who approved which release, and when (DECISIONS 74)
  requireRef?: boolean; // place gifts only on beneficiaries that have an ID (DECISIONS 75)
  graceDays?: number; // days a payment may be unpaid after it was due before the place may be released, default 15 (DECISIONS 74)
  projects?: Project[]; // the projects, each with the structure it defines (DECISIONS 65)
  nodes?: Node[]; // the places in those structures
  usesFrameworks: boolean;
  feed: FeedConfig;
  crm: CrmSetting;
}

// What the last pick-up did, for staff to see.
export interface RunInfo {
  at: string; // ISO time of this run
  lastSuccessAt: string; // ISO time of the last run that finished without an error, "" if none
  ok: boolean;
  error: string; // plain English, "" when ok
  rows: number;
  created: number;
  rerouted: number;
  unchanged: number;
  skipped: number;
  issues: string[];
  reportedSent: number;
  reported: Record<string, string>; // work order key to the status last sent back to the CRM
}

export interface Store {
  getConfig(org: string): Promise<OrgConfig | null>;
  putConfig(org: string, config: OrgConfig): Promise<void>;
  listWorkOrders(org: string): Promise<WorkOrder[]>;
  saveWorkOrders(org: string, orders: WorkOrder[]): Promise<void>; // add or replace, by key
  deleteWorkOrders(org: string, keys: string[]): Promise<void>; // only used to move work orders to their new key (DECISIONS 46)
  getReview(org: string): Promise<ReviewItem[]>;
  putReview(org: string, items: ReviewItem[]): Promise<void>;
  getRun(org: string): Promise<RunInfo | null>;
  putRun(org: string, run: RunInfo): Promise<void>;
  listAudits(org: string): Promise<AuditRecord[]>; // newest first, at most KEEP_AUDITS
  addAudit(org: string, record: AuditRecord): Promise<void>;
  getTriage(org: string): Promise<Record<string, TriageMark>>; // what a person has reviewed in Needs attention
  putTriage(org: string, marks: Record<string, TriageMark>): Promise<void>;
  listOrgs(): Promise<string[]>; // organisations that have a setup, for the scheduled pick-up
  useLaunchId(jti: string, expiresAtSeconds: number, nowSeconds: number): Promise<boolean>; // true the first time only
}

// How many audit records are kept per organisation. Older ones are dropped.
export const KEEP_AUDITS = 100;

export const MWF_FEED: FeedConfig = MWF_CRM_CONFIG;

// A new organisation starts empty, with no CRM, until an administrator sets it up.
// Rule: a saved setup of any age is read through migrateSetup, so an older one (a framework inside each category) is understood.
export const setupOf = (c: OrgConfig): Setup => migrateSetup({ categories: c.categories, itemMap: c.itemMap, ...(c.frameworks ? { frameworks: c.frameworks } : {}), ...(c.itemFramework ? { itemFramework: c.itemFramework } : {}) });

export const defaultConfig = (): OrgConfig => ({ categories: [], itemMap: {}, frameworks: [], itemFramework: {}, usesFrameworks: true, feed: MWF_FEED, crm: { kind: "none" } });

export function memoryStore(): Store {
  const configs = new Map<string, OrgConfig>();
  const orders = new Map<string, Map<string, WorkOrder>>(); // org to key to work order
  const reviews = new Map<string, ReviewItem[]>();
  const runs = new Map<string, RunInfo>();
  const audits = new Map<string, AuditRecord[]>();
  const triage = new Map<string, Record<string, TriageMark>>();
  const launchIds = new Map<string, number>();
  return {
    async getConfig(org) { return configs.get(org) ?? null; },
    async putConfig(org, config) { configs.set(org, structuredClone(config)); },
    async listWorkOrders(org) { return [...(orders.get(org)?.values() ?? [])].map((w) => ({ ...w })); },
    async saveWorkOrders(org, list) {
      const m = orders.get(org) ?? new Map<string, WorkOrder>();
      for (const w of list) m.set(w.key, { ...w });
      orders.set(org, m);
    },
    async deleteWorkOrders(org, keys) { for (const k of keys) orders.get(org)?.delete(k); },
    async getReview(org) { return (reviews.get(org) ?? []).map((r) => ({ ...r })); },
    async putReview(org, items) { reviews.set(org, items.map((r) => ({ ...r }))); },
    async getRun(org) { return runs.get(org) ? structuredClone(runs.get(org) as RunInfo) : null; },
    async putRun(org, run) { runs.set(org, structuredClone(run)); },
    async listAudits(org) { return structuredClone(audits.get(org) ?? []); },
    async addAudit(org, record) { audits.set(org, [structuredClone(record), ...(audits.get(org) ?? [])].slice(0, KEEP_AUDITS)); },
    async getTriage(org) { return structuredClone(triage.get(org) ?? {}); },
    async putTriage(org, marks) { triage.set(org, structuredClone(marks)); },
    async listOrgs() { return [...configs.keys()]; },
    async useLaunchId(jti, expiresAt, now) {
      for (const [id, exp] of launchIds) if (exp <= now) launchIds.delete(id); // forget old ones
      if (launchIds.has(jti)) return false;
      launchIds.set(jti, expiresAt);
      return true;
    },
  };
}
