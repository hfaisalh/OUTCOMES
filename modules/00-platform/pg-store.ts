/**
 * pg-store.ts
 *
 * What it does: the Store (store.ts) on a Postgres database. It is given one function that runs a
 * query, so it works with any Postgres driver (the server wires Neon, see api/_server.ts).
 * Who calls it: api/_server.ts. The table layout is in sql/001_init.sql.
 * Depends on: store.ts.
 *
 * Rule: every query filters by the organisation, passed as the first parameter ($1).
 */

import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders";
import type { OrgConfig, RunInfo, Store } from "./store";

export type Query = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export function pgStore(query: Query): Store {
  const one = async <T>(sql: string, org: string, column: string): Promise<T | null> => {
    const rows = await query(sql, [org]);
    return rows[0] ? (rows[0][column] as T) : null;
  };
  return {
    getConfig: (org) => one<OrgConfig>("SELECT config FROM org_config WHERE org = $1", org, "config"),
    async putConfig(org, config) {
      await query("INSERT INTO org_config (org, config) VALUES ($1, $2) ON CONFLICT (org) DO UPDATE SET config = EXCLUDED.config", [org, JSON.stringify(config)]);
    },
    async listWorkOrders(org) {
      const rows = await query("SELECT data FROM work_orders WHERE org = $1 ORDER BY key", [org]);
      return rows.map((r) => r["data"] as WorkOrder);
    },
    async saveWorkOrders(org, orders) {
      for (const w of orders) {
        await query("INSERT INTO work_orders (org, key, data) VALUES ($1, $2, $3) ON CONFLICT (org, key) DO UPDATE SET data = EXCLUDED.data", [org, w.key, JSON.stringify(w)]);
      }
    },
    async getReview(org) {
      return (await one<ReviewItem[]>("SELECT items FROM review WHERE org = $1", org, "items")) ?? [];
    },
    async putReview(org, items) {
      await query("INSERT INTO review (org, items) VALUES ($1, $2) ON CONFLICT (org) DO UPDATE SET items = EXCLUDED.items", [org, JSON.stringify(items)]);
    },
    getRun: (org) => one<RunInfo>("SELECT info FROM runs WHERE org = $1", org, "info"),
    async putRun(org, run) {
      await query("INSERT INTO runs (org, info) VALUES ($1, $2) ON CONFLICT (org) DO UPDATE SET info = EXCLUDED.info", [org, JSON.stringify(run)]);
    },
    async listOrgs() {
      return (await query("SELECT org FROM org_config ORDER BY org", [])).map((r) => r["org"] as string);
    },
    async useLaunchId(jti, expiresAt, now) {
      await query("DELETE FROM used_launch WHERE expires_at <= $1", [now]);
      const rows = await query("INSERT INTO used_launch (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING RETURNING jti", [jti, expiresAt]);
      return rows.length === 1; // a repeat inserts nothing, so it is refused
    },
  };
}
