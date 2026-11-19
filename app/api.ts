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

import type { ReviewItem, WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { RunInfo } from "../modules/00-platform/store";
import type { Category, ItemMap } from "../modules/02-project-rules/categories";

export interface Me {
  name: string;
  org: string;
  perms: string[];
  expiresAt: number;
  storage: "database" | "memory";
  demo?: boolean; // true when the organisation is connected to the pretend CRM
}
export interface ServerConfig {
  categories: Category[];
  itemMap: ItemMap;
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
export async function fetchMe(): Promise<Me | null> {
  try {
    return await call<Me>("/api/me");
  } catch {
    return null;
  }
}
export const loadConfig = () => call<ServerConfig>("/api/config");
export const saveConfig = (c: { categories: Category[]; itemMap: ItemMap }) => call<{ ok: boolean; routed: number }>("/api/config", { method: "PUT", body: c });
export const loadWorkOrders = () => call<WorkOrdersReply>("/api/work-orders");
export const runPickupNow = () => call<{ ok?: boolean; error?: string; created?: number; rerouted?: number; skipped?: string }>("/api/pickup", { method: "POST" });
