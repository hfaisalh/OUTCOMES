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
import type { Category, ItemMap } from "../02-project-rules/categories.js";
import type { AuditRecord } from "../01f-batch-audit/audit.js";

// How this organisation reads its CRM (DECISIONS 30). The token itself is never stored here, only the name of the setting that holds it.
// "demo" is the pretend CRM of Module 1d, for testing with live input before a real CRM is connected.
// "upload" means lines arrive by uploading CRM export files (Module 1e, DECISIONS 42, 43), no live connection.
export type CrmSetting = { kind: "none" } | { kind: "demo" } | { kind: "upload" } | { kind: "api"; baseUrl: string; tokenEnv: string };

// Everything an organisation sets up in OUTCOMES.
export interface OrgConfig {
  categories: Category[];
  itemMap: ItemMap;
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
  getReview(org: string): Promise<ReviewItem[]>;
  putReview(org: string, items: ReviewItem[]): Promise<void>;
  getRun(org: string): Promise<RunInfo | null>;
  putRun(org: string, run: RunInfo): Promise<void>;
  listAudits(org: string): Promise<AuditRecord[]>; // newest first, at most KEEP_AUDITS
  addAudit(org: string, record: AuditRecord): Promise<void>;
  listOrgs(): Promise<string[]>; // organisations that have a setup, for the scheduled pick-up
  useLaunchId(jti: string, expiresAtSeconds: number, nowSeconds: number): Promise<boolean>; // true the first time only
}

// How many audit records are kept per organisation. Older ones are dropped.
export const KEEP_AUDITS = 100;

export const MWF_FEED: FeedConfig = MWF_CRM_CONFIG;

// A new organisation starts empty, with no CRM, until an administrator sets it up.
export const defaultConfig = (): OrgConfig => ({ categories: [], itemMap: {}, usesFrameworks: true, feed: MWF_FEED, crm: { kind: "none" } });

export function memoryStore(): Store {
  const configs = new Map<string, OrgConfig>();
  const orders = new Map<string, Map<string, WorkOrder>>(); // org to key to work order
  const reviews = new Map<string, ReviewItem[]>();
  const runs = new Map<string, RunInfo>();
  const audits = new Map<string, AuditRecord[]>();
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
    async getReview(org) { return (reviews.get(org) ?? []).map((r) => ({ ...r })); },
    async putReview(org, items) { reviews.set(org, items.map((r) => ({ ...r }))); },
    async getRun(org) { return runs.get(org) ? structuredClone(runs.get(org) as RunInfo) : null; },
    async putRun(org, run) { runs.set(org, structuredClone(run)); },
    async listAudits(org) { return structuredClone(audits.get(org) ?? []); },
    async addAudit(org, record) { audits.set(org, [structuredClone(record), ...(audits.get(org) ?? [])].slice(0, KEEP_AUDITS)); },
    async listOrgs() { return [...configs.keys()]; },
    async useLaunchId(jti, expiresAt, now) {
      for (const [id, exp] of launchIds) if (exp <= now) launchIds.delete(id); // forget old ones
      if (launchIds.has(jti)) return false;
      launchIds.set(jti, expiresAt);
      return true;
    },
  };
}
