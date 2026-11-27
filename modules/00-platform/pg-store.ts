/**
 * pg-store.ts
 *
 * What it does: the Store (store.ts) on a Postgres database. It is given one function that runs a
 * query, so it works with any Postgres driver (the server wires Neon, see api/_server.ts).
 * Who calls it: api/_server.ts. The table layout is in sql/001_init.sql.
 * Depends on: store.ts.
 *
 * Rule: every query filters by the organisation, passed as the first parameter ($1).
 * DECISIONS 237: the register, enrolments, assignments, allocations, parked outcomes, confirmations and progress are rows in their own tables (record-tables.ts).
 */

import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders.js";
import type { AuditRecord } from "../01f-batch-audit/audit.js";
import type { TriageMark } from "../04-triage/triage.js";
import type { ChangeEntry } from "./change-log.js";
import { canon, assembleConfig, listOf, rowsOf, splitConfig, TABLES, type Table } from "./record-tables.js";
import { ConflictError, KEEP_AUDITS, type OrgConfig, type RunInfo, type Store } from "./store.js";

export type Query = (sql: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export function pgStore(query: Query): Store {
  // What this process last read or saved for each organisation: its version and a fingerprint of each list, so a save sends only the lists that changed (and only when the database is still at that version).
  const seen = new Map<string, { version: number; legacy: boolean; sig: Record<Table, string> }>();
  const one = async <T>(sql: string, org: string, column: string): Promise<T | null> => {
    const rows = await query(sql, [org]);
    return rows[0] ? (rows[0][column] as T) : null;
  };
  return {
    // One query reads the document and every list together, so they are always from the same moment (DECISIONS 237).
    async getConfig(org) {
      const lists = TABLES.map((t) => `(SELECT coalesce(jsonb_agg(data ORDER BY pos), '[]'::jsonb) FROM ${t} WHERE org = $1) AS ${t}`).join(", ");
      const row = (await query(`SELECT config, version, ${lists} FROM org_config WHERE org = $1`, [org]))[0];
      if (!row) return null;
      const rows = Object.fromEntries(TABLES.map((t) => [t, (row[t] as unknown[]) ?? []])) as Record<Table, unknown[]>;
      const { config, legacy } = assembleConfig(row["config"] as OrgConfig, rows);
      const version = Number(row["version"] ?? 0);
      seen.set(org, { version, legacy, sig: Object.fromEntries(TABLES.map((t) => [t, canon(listOf(config, t))])) as Record<Table, string> });
      return { ...config, version };
    },
    // Rule (DECISIONS 235): a setup read at version N is saved only while the database is still at N. A first save only adds the row if no one else has.
    // Rule (DECISIONS 237): the document and every list that changed are saved in ONE statement, so they succeed or fail together. The lists are written only if the version check passed (the fence). Lists that did not change are not sent.
    async putConfig(org, config) {
      const { version, ...rest } = config; // the version lives in its own column, not inside the document
      const { blob, lists } = splitConfig(rest as OrgConfig);
      const params: unknown[] = [org, JSON.stringify(blob)];
      let fence: string;
      if (version === undefined) fence = "INSERT INTO org_config (org, config, version) VALUES ($1, $2, 1) ON CONFLICT (org) DO NOTHING RETURNING version";
      else { params.push(version); fence = "UPDATE org_config SET config = $2, version = version + 1 WHERE org = $1 AND version = $3 RETURNING version"; }
      const known = seen.get(org);
      const trust = known !== undefined && known.version === version && !known.legacy; // what this process read is exactly what the database holds
      const sig = {} as Record<Table, string>;
      const parts: string[] = [];
      for (const t of TABLES) {
        sig[t] = canon(lists[t]);
        if (trust && known.sig[t] === sig[t]) continue;
        params.push(JSON.stringify(rowsOf(t, lists[t])));
        const p = `$${params.length}::jsonb`;
        const ok = "EXISTS (SELECT 1 FROM fence)";
        parts.push(`${t}_put AS (INSERT INTO ${t} (org, rid, pos, data) SELECT $1, e->>'rid', (e->>'pos')::int, e->'data' FROM jsonb_array_elements(${p}) AS e WHERE ${ok} ON CONFLICT (org, rid) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data WHERE ${t}.pos IS DISTINCT FROM EXCLUDED.pos OR ${t}.data IS DISTINCT FROM EXCLUDED.data)`);
        parts.push(`${t}_gone AS (DELETE FROM ${t} WHERE org = $1 AND ${ok} AND rid NOT IN (SELECT e->>'rid' FROM jsonb_array_elements(${p}) AS e))`);
      }
      const rows = await query(`WITH fence AS (${fence})${parts.map((x) => ", " + x).join("")} SELECT version FROM fence`, params);
      if (rows.length === 0) throw new ConflictError();
      const next = Number(rows[0]!["version"]);
      seen.set(org, { version: next, legacy: false, sig });
      config.version = next;
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
    // Rule (DECISIONS 240): an erased child leaves nothing in the log but the fact that a record was there. The enrolments are found by their IDs and by the beneficiary they carry.
    async redactChanges(org, beneficiaryId, enrolmentIds) {
      await query("UPDATE change_log SET record = '{\"erased\": true}'::jsonb WHERE org = $1 AND ((section = 'beneficiaries' AND key = $2) OR (section = 'enrolments' AND (record->>'beneficiaryId' = $2 OR key IN (SELECT jsonb_array_elements_text($3::jsonb)))))", [org, beneficiaryId, JSON.stringify(enrolmentIds)]);
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
