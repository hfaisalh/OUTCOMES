/**
 * record-tables.ts
 *
 * What it does: the pure rules for keeping records in their own tables (DECISIONS 237). It splits a setup into the small document (settings and counters) plus the lists of records, and puts them back together, so the rest of OUTCOMES still sees one OrgConfig and no handler had to change.
 * Who calls it: pg-store.ts (reads and saves), scripts/db-move-records.mjs (through pg-store). Depends on: store.ts types, node:crypto for the content fingerprint.
 *
 * Rules:
 * - Seven lists live in tables: the Beneficiary register, enrolments, assignments, placements, the parked outcomes (stock), confirmations and progress.
 * - A row's id is the record's own ID where it has one (a beneficiary, an enrolment), otherwise a fingerprint of its content, so the same record is always the same row. Two identical records get "#2", "#3".
 * - A row remembers its place in the list, so lists come back in exactly the order they were saved.
 * - A setup saved before this (records still inside the document) is read as it is and moved to the tables by its next save.
 */
import { createHash } from "node:crypto";
import type { OrgConfig } from "./store.js";

export const TABLES = ["beneficiaries", "enrolments", "assignments", "placements", "stock", "confirmations", "progress"] as const;
export type Table = (typeof TABLES)[number];
export interface RecordRow { rid: string; pos: number; data: unknown }

// Where each list sits inside the setup. "natural" is the field that is already a permanent ID.
type Container = "beneficiaries" | "enrolments" | "assignments" | "placements" | "confirmations" | "progress";
const SPEC: Record<Table, { container: Container; field: "records" | "stock"; natural?: string; blank: () => Record<string, unknown> }> = {
  beneficiaries: { container: "beneficiaries", field: "records", natural: "id", blank: () => ({ counters: {} }) },
  enrolments: { container: "enrolments", field: "records", natural: "id", blank: () => ({ counter: 0 }) },
  assignments: { container: "assignments", field: "records", blank: () => ({}) },
  placements: { container: "placements", field: "records", blank: () => ({ counter: 0 }) },
  stock: { container: "placements", field: "stock", blank: () => ({ counter: 0 }) },
  confirmations: { container: "confirmations", field: "records", blank: () => ({}) },
  progress: { container: "progress", field: "records", blank: () => ({}) },
};

// The same text for the same content whatever order the fields were written in.
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

export function rowsOf(table: Table, records: unknown[]): RecordRow[] {
  const seen = new Map<string, number>();
  const natural = SPEC[table].natural;
  return records.map((data, pos) => {
    const own = natural ? (data as Record<string, unknown>)[natural] : undefined;
    const base = typeof own === "string" && own !== "" ? own : createHash("sha1").update(canon(data)).digest("hex");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { rid: n === 1 ? base : `${base}#${n}`, pos, data };
  });
}

type Container_ = Record<string, unknown>;
const containerOf = (c: OrgConfig, t: Table): Container_ | undefined => (c as unknown as Record<string, Container_ | undefined>)[SPEC[t].container];

// The setup without its lists (they are left empty), and the lists.
export function splitConfig(config: OrgConfig): { blob: OrgConfig; lists: Record<Table, unknown[]> } {
  const blob = { ...config } as unknown as Record<string, Container_ | unknown>;
  const lists = {} as Record<Table, unknown[]>;
  for (const t of TABLES) {
    const { container, field } = SPEC[t];
    const cont = blob[container] as Container_ | undefined;
    lists[t] = cont && Array.isArray(cont[field]) ? (cont[field] as unknown[]) : [];
    if (cont && field in cont) blob[container] = { ...(blob[container] as Container_), [field]: [] };
  }
  return { blob: blob as unknown as OrgConfig, lists };
}

// Puts the lists back. A list that is empty in the tables but full in the document is an older setup: the document's is used and `legacy` says the next save must move it.
export function assembleConfig(blob: OrgConfig, rows: Record<Table, unknown[]>): { config: OrgConfig; legacy: boolean } {
  const out = { ...blob } as unknown as Record<string, Container_ | unknown>;
  let legacy = false;
  for (const t of TABLES) {
    const { container, field, blank } = SPEC[t];
    const cont = out[container] as Container_ | undefined;
    const held = cont && Array.isArray(cont[field]) ? (cont[field] as unknown[]) : [];
    if (rows[t].length === 0 && held.length > 0) { legacy = true; continue; }
    if (rows[t].length === 0 && !(cont && field in cont)) continue; // never had this list: leave it absent, as it was
    out[container] = { ...(cont ?? { records: [], ...blank() }), [field]: rows[t] };
  }
  return { config: out as unknown as OrgConfig, legacy };
}

// Reads the list a table holds out of a setup, for comparing before and after.
export const listOf = (config: OrgConfig, t: Table): unknown[] => {
  const cont = containerOf(config, t);
  return cont && Array.isArray(cont[SPEC[t].field]) ? (cont[SPEC[t].field] as unknown[]) : [];
};
