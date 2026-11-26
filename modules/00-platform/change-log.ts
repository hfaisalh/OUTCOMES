/**
 * change-log.ts
 *
 * What it does: works out what a save changed, for the change log (DECISIONS 235 step 2, docs/DATABASE-REVIEW.md). It compares the setup before and after and lists each record that was added or removed in the parts that matter for an audit: assignments, placements (and the parked outcomes), confirmations, progress, enrolments and the Beneficiary register. A record that was edited shows as the old one removed and the new one added.
 * Who calls it: outcomes-handler.ts after every save. The entries are written by the store (store.ts addChanges, pg-store.ts, sql/003_change_log.sql).
 * Depends on: store.ts types only. Pure: no database, so it can be ported (CLAUDE.md rule 4).
 *
 * Rule: records are told apart by their whole content, so it needs no knowledge of each record's ID.
 */
import type { OrgConfig } from "./store.js";

export interface ChangeEntry {
  at: string; // ISO time of the save
  by: string; // who, a display name
  action: string; // the request that made it, for example "asg-assign"
  section: string; // assignments, placements, stock, confirmations, progress, enrolments or beneficiaries
  key: string; // the record's gift key or ID, "" when it has none
  change: "added" | "removed";
  record: unknown; // the whole record as it was added or removed
}

// How many entries one save may write. A bigger change (loading or removing the sample setup, resetting assignments) is cut here and ends with one note saying how many were left out.
export const MAX_CHANGES_PER_SAVE = 500;

// The parts of the setup that are logged, and where their records are.
const SECTIONS: [string, (c: OrgConfig) => unknown[]][] = [
  ["assignments", (c) => c.assignments?.records ?? []],
  ["placements", (c) => c.placements?.records ?? []],
  ["stock", (c) => c.placements?.stock ?? []],
  ["confirmations", (c) => c.confirmations?.records ?? []],
  ["progress", (c) => c.progress?.records ?? []],
  ["enrolments", (c) => c.enrolments?.records ?? []],
  ["beneficiaries", (c) => c.beneficiaries?.records ?? []],
];

const keyOf = (r: unknown): string => {
  const o = (r ?? {}) as { key?: unknown; id?: unknown };
  return typeof o.key === "string" ? o.key : typeof o.id === "string" ? o.id : "";
};

export function changesBetween(before: OrgConfig | null, after: OrgConfig, by: string, action: string, at: string): ChangeEntry[] {
  const out: ChangeEntry[] = [];
  for (const [section, get] of SECTIONS) {
    const was = before ? get(before) : [];
    const now = get(after);
    // Count each record's content, so a repeated identical record is counted as many times as it appears.
    const left = new Map<string, number>();
    for (const r of was) left.set(JSON.stringify(r), (left.get(JSON.stringify(r)) ?? 0) + 1);
    for (const r of now) {
      const s = JSON.stringify(r);
      const n = left.get(s) ?? 0;
      if (n > 0) left.set(s, n - 1); // still there, unchanged
      else out.push({ at, by, action, section, key: keyOf(r), change: "added", record: r });
    }
    for (const r of was) {
      const s = JSON.stringify(r);
      const n = left.get(s) ?? 0;
      if (n > 0) { left.set(s, n - 1); out.push({ at, by, action, section, key: keyOf(r), change: "removed", record: r }); }
    }
  }
  if (out.length <= MAX_CHANGES_PER_SAVE) return out;
  const kept = out.slice(0, MAX_CHANGES_PER_SAVE);
  kept.push({ at, by, action, section: "note", key: "", change: "added", record: { leftOut: out.length - MAX_CHANGES_PER_SAVE } });
  return kept;
}
