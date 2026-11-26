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

import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { AuditRecord } from "../01f-batch-audit/audit.js";
import type { TriageMark } from "../04-triage/triage.js";
import type { ChangeEntry } from "./change-log.js";
import { ConflictError, KEEP_AUDITS, type OrgConfig, type RunInfo, type Store } from "./store.js";

export type Query = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export function pgStore(query: Query): Store {
  const one = async <T>(sql: string, org: string, column: string): Promise<T | null> => {
    const rows = await query(sql, [org]);
    return rows[0] ? (rows[0][column] as T) : null;
  };
  return {
    async getConfig(org) {
      const row = (await query("SELECT config, version FROM org_config WHERE org = $1", [org]))[0];
      return row ? { ...(row["config"] as OrgConfig), version: Number(row["version"] ?? 0) } : null;
    },
    // Rule (DECISIONS 235): a setup read at version N is saved only while the database is still at N. A first save only adds the row if no one else has.
    async putConfig(org, config) {
      const { version, ...body } = config; // the version lives in its own column, not inside the document
      const rows = version === undefined
        ? await query("INSERT INTO org_config (org, config, version) VALUES ($1, $2, 1) ON CONFLICT (org) DO NOTHING RETURNING version", [org, JSON.stringify(body)])
        : await query("UPDATE org_config SET config = $2, version = version + 1 WHERE org = $1 AND version = $3 RETURNING version", [org, JSON.stringify(body), version]);
      if (rows.length === 0) throw new ConflictError();
      config.version = Number(rows[0]!["version"]);
    },
    async listWorkOrders(org) {
      const rows = await query("SELECT data FROM work_orders WHERE org = $1 ORDER BY key", [org]);
      return rows.map((r) => r["data"] as WorkOrder);
    },
    // Rule: saved in batches of one query per 200 work orders, so a whole import fits inside the server's time limit.
    async saveWorkOrders(org, orders) {
      for (let i = 0; i < orders.length; i += 200) {
        const chunk = orders.slice(i, i + 200);
        await query("INSERT INTO work_orders (org, key, data) SELECT $1, e->>'key', e FROM jsonb_array_elements($2::jsonb) AS e ON CONFLICT (org, key) DO UPDATE SET data = EXCLUDED.data", [org, JSON.stringify(chunk)]);
      }
    },
    async deleteWorkOrders(org, keys) {
      if (keys.length > 0) await query("DELETE FROM work_orders WHERE org = $1 AND key IN (SELECT jsonb_array_elements_text($2::jsonb))", [org, JSON.stringify(keys)]);
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
    async listAudits(org) {
      const rows = await query("SELECT data FROM audits WHERE org = $1 ORDER BY at DESC LIMIT " + KEEP_AUDITS, [org]);
      return rows.map((r) => r["data"] as AuditRecord);
    },
    async addAudit(org, record) {
      await query("INSERT INTO audits (org, id, at, data) VALUES ($1, $2, $3, $4) ON CONFLICT (org, id) DO UPDATE SET data = EXCLUDED.data", [org, record.id, record.at, JSON.stringify(record)]);
      await query("DELETE FROM audits WHERE org = $1 AND id NOT IN (SELECT id FROM audits WHERE org = $1 ORDER BY at DESC LIMIT " + KEEP_AUDITS + ")", [org]);
    },
    getTriage: async (org) => (await one<Record<string, TriageMark>>("SELECT marks FROM triage WHERE org = $1", org, "marks")) ?? {},
    async putTriage(org, marks) {
      await query("INSERT INTO triage (org, marks) VALUES ($1, $2) ON CONFLICT (org) DO UPDATE SET marks = EXCLUDED.marks", [org, JSON.stringify(marks)]);
    },
    // One query per save: the entries go in together, so a save is logged whole or not at all.
    async addChanges(org, entries) {
      if (entries.length === 0) return;
      await query("INSERT INTO change_log (org, at, by, action, section, key, change, record) SELECT $1, (e->>'at')::timestamptz, e->>'by', e->>'action', e->>'section', e->>'key', e->>'change', e->'record' FROM jsonb_array_elements($2::jsonb) AS e", [org, JSON.stringify(entries)]);
    },
    async listChanges(org, limit, key) {
      const rows = await query("SELECT at, by, action, section, key, change, record FROM change_log WHERE org = $1 AND ($3::text IS NULL OR key = $3) ORDER BY id DESC LIMIT $2", [org, limit, key ?? null]);
      return rows.map((r) => ({ at: new Date(r["at"] as string).toISOString(), by: r["by"], action: r["action"], section: r["section"], key: r["key"], change: r["change"], record: r["record"] }) as ChangeEntry);
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
