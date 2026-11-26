/**
 * erasure.ts
 *
 * What it does: the two rules for a child's data on its own (DECISIONS 240): take a copy of everything OUTCOMES holds about one beneficiary, and erase it for good.
 * Who calls it: the server (outcomes-handler.ts, the "ben-erase" request), the demo (app/main.ts) and the beneficiary window (the download). Depends on: the register, enrolment and placement types only. Pure: no database, no page, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Erasing needs the beneficiary's ID typed back as confirmation, so a stray click cannot do it.
 * - Erasing a person removes their record, takes them out of any household, and removes their enrolments and the places those enrolments held. The gifts that filled those places are not touched: they are unplaced and wait to be placed again.
 * - Erasing a household removes only the household and its own enrolments. The persons in it stay.
 * - The ID is never used again (the register's counters are left as they are).
 * - Nothing is kept of the record: the server also blanks the change log entries about it.
 */
import type { Beneficiary, Register } from "./beneficiaries.js";
import type { Enrolment, Enrolments } from "./enrolments.js";
import type { Placement, Placements } from "../09-placement/placement.js";

export interface Erased { register: Register; enrolments: Enrolments; placements: Placements; name: string; enrolmentIds: string[]; message: string }

// Everything held about one beneficiary, as plain data a person can keep or hand over.
export interface BeneficiaryExport { exportedFor: string; note: string; beneficiary: Beneficiary; households: { id: string; name: string }[]; enrolments: Enrolment[]; placements: Placement[] }

export function exportBeneficiary(reg: Register, enr: Enrolments, plc: Placements, id: string): BeneficiaryExport | null {
  const b = reg.records.find((r) => r.id === id);
  if (!b) return null;
  const mine = enr.records.filter((e) => e.beneficiaryId === id);
  const ids = new Set(mine.map((e) => e.id));
  return {
    exportedFor: id,
    note: "Everything OUTCOMES holds about this beneficiary. Contact details are not held here, they stay in the CRM.",
    beneficiary: b,
    households: reg.records.filter((r) => r.kind === "household" && r.memberIds.includes(id)).map((h) => ({ id: h.id, name: h.name })),
    enrolments: mine,
    placements: plc.records.filter((p) => ids.has(p.enrolmentId)),
  };
}

export function eraseBeneficiary(reg: Register, enr: Enrolments, plc: Placements, id: string, confirm: string): Erased | { error: string } {
  const b = reg.records.find((r) => r.id === id);
  if (!b) return { error: "That beneficiary was not found." };
  if (confirm.trim() !== id) return { error: `To erase ${b.name}, type their ID (${id}) to confirm.` };
  const gone = enr.records.filter((e) => e.beneficiaryId === id);
  const goneIds = new Set(gone.map((e) => e.id));
  const places = plc.records.filter((p) => goneIds.has(p.enrolmentId));
  const register: Register = { ...reg, records: reg.records.filter((r) => r.id !== id).map((r) => (r.kind === "household" && r.memberIds.includes(id) ? { ...r, memberIds: r.memberIds.filter((m) => m !== id) } : r)) };
  return {
    register,
    enrolments: { ...enr, records: enr.records.filter((e) => !goneIds.has(e.id)) },
    placements: { ...plc, records: plc.records.filter((p) => !goneIds.has(p.enrolmentId)) },
    name: b.name,
    enrolmentIds: [...goneIds],
    message: `${b.name} (${id}) was erased, with ${gone.length} enrolment${gone.length === 1 ? "" : "s"} and ${places.length} place${places.length === 1 ? "" : "s"} filled.`,
  };
}

// The request the beneficiary window makes: { action: "ben-erase", id, confirm }. Null for any other request.
export function applyErasure(reg: Register, enr: Enrolments, plc: Placements, body: Record<string, unknown>): Erased | { error: string } | null {
  if (body["action"] !== "ben-erase") return null;
  return eraseBeneficiary(reg, enr, plc, String(body["id"] ?? ""), String(body["confirm"] ?? ""));
}
