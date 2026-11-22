/**
 * api.ts
 *
 * What it does: the page's calls to the OUTCOMES server (modules/00-platform/handlers.ts). Each call
 * returns plain data or throws an Error with a plain English message.
 * Who calls it: main.ts. Depends on: the browser's fetch.
 *
 * Demo mode: when nobody is signed in the server answers 401, fetchMe returns null, and the page
 * stays in demo mode with its invented data.
 */

import type { GiftProject, Node, Project } from "../modules/06-projects/projects";
import type { ReviewItem, WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { RunInfo } from "../modules/00-platform/store";
import type { AttentionItem } from "../modules/04-triage/triage";
import type { AuditRecord } from "../modules/01f-batch-audit/audit";
import type { CompactFeed } from "../modules/01e-crm-export-adapter/compact";
import type { Allocation, Outcome } from "../modules/05-outcomes/outcomes";
import type { OutcomeType } from "../modules/05-outcomes/outcome-types";
import type { Category, FrameworkTemplate, ItemMap } from "../modules/02-project-rules/categories";

export interface Me {
  name: string;
  org: string;
  perms: string[];
  expiresAt: number;
  storage: "database" | "memory";
  demo?: boolean; // true when the organisation is connected to the pretend CRM
  upload?: boolean; // true when the organisation takes uploaded CRM export files
}
export interface ServerConfig {
  categories: Category[];
  itemMap: ItemMap;
  frameworks: FrameworkTemplate[];
  itemFramework: Record<string, string>;
  crmConnected: boolean;
}
export interface WorkOrdersReply {
  workOrders: WorkOrder[];
  review: ReviewItem[];
  run: RunInfo | null;
}

async function call<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: init?.method ?? "GET", credentials: "same-origin", headers: init?.body ? { "content-type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new Error("Could not reach the OUTCOMES server. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `The server answered with an error (${res.status}).`);
  return data as T;
}

// Who is signed in, or null when nobody is (demo mode) or the server cannot be reached.
// Rule: only a real session counts. The local dev server answers /api/me with a plain page (status 200, no
// permissions), which must not be mistaken for a sign-in, or the page would try to draw with no permissions and freeze.
export async function fetchMe(): Promise<Me | null> {
  try {
    const me = await call<Partial<Me>>("/api/me");
    return Array.isArray(me.perms) && typeof me.name === "string" ? (me as Me) : null;
  } catch {
    return null;
  }
}
export const signOut = () => call<{ ok: boolean }>("/api/logout", { method: "POST", body: {} });
export const loadConfig = () => call<ServerConfig>("/api/config");
export const saveConfig = (c: { categories: Category[]; itemMap: ItemMap; frameworks: FrameworkTemplate[]; itemFramework: Record<string, string>; reapply?: boolean }) => call<{ ok: boolean; routed: number; reapplied?: number }>("/api/config", { method: "PUT", body: c });
export const loadWorkOrders = () => call<WorkOrdersReply>("/api/work-orders");
export const runPickupNow = () => call<{ ok?: boolean; error?: string; created?: number; rerouted?: number; skipped?: string }>("/api/pickup", { method: "POST" });

export const loadAudits = () => call<{ audits: AuditRecord[] }>("/api/audits");
export const importFeed = (feed: CompactFeed, source: string, notes: string[] = []) => call<{ ok: boolean; error: string; rows: number; created: number; unchanged: number; issues: string[] }>("/api/import", { method: "POST", body: { ...feed, source, notes } });
export const ownerLogin = (passphrase: string) => call<{ ok: boolean }>("/api/owner-login", { method: "POST", body: { passphrase } });
export const loadAttention = () => call<{ items: AttentionItem[] }>("/api/triage");
export const decideAttention = (id: string, action: "review" | "reopen", note = "") => call<{ items: AttentionItem[] }>("/api/triage", { method: "POST", body: { id, action, note } });
export const setCovers = (key: string, covers: number) => call<{ ok: boolean; workOrders: WorkOrder[]; skipped: number; firstError?: string }>("/api/work-orders", { method: "POST", body: { keys: [key], action: "covers", covers } });
export const setParts = (key: string, parts: number) => call<{ ok: boolean; workOrders: WorkOrder[]; skipped: number; firstError?: string }>("/api/work-orders", { method: "POST", body: { keys: [key], action: "parts", parts } });
export const setLooked = (key: string, looked: string) => call<{ ok: boolean; workOrders: WorkOrder[]; skipped: number; firstError?: string }>("/api/work-orders", { method: "POST", body: { keys: [key], action: "looked", looked } });
export const setExcluded = (keys: string[], action: "exclude" | "restore", reason = "") => call<{ ok: boolean; workOrders: WorkOrder[]; skipped: number; firstError?: string }>("/api/work-orders", { method: "POST", body: { keys, action, reason } });

export interface OutcomesReply {
  outcomes: Outcome[];
  allocations: Allocation[];
  projects?: Project[];
  giftProjects?: GiftProject[];
  nodes?: Node[];
  graceDays?: number;
  requireRef?: boolean;
  partnerTypes?: string[];
  partnerFields?: string[];
  outcomeTypes?: OutcomeType[];
  idCounters?: Record<string, number>;
  itemIcons?: Record<string, string>;
  warning?: string;
  placed?: number;
  removed?: number;
  kept?: number;
  released?: number;
  unplaced?: { commitmentKey: string; why: string }[];
}
export const loadOutcomes = () => call<OutcomesReply>("/api/outcomes");
export const changeOutcomes = (body: Record<string, unknown>) => call<OutcomesReply>("/api/outcomes", { method: "POST", body });
