/**
 * waiting.ts
 *
 * What it does: the pool and the waiting list (DECISIONS 246). A partner feeds the register, each person with the project they are meant for (targetProjectId). This module does, without anyone dragging
 * or picking: (1) decides admission for a complete record, (2) works out each project's waiting list, (3) enrols the next in line into the cluster with the most room, whenever there is room.
 * Who calls it: the server (modules/00-platform/outcomes-handler.ts) and the demo (app/main.ts) after any change to the register, enrolments or a project, and the pages (app/projects-page.ts, app/register-form.ts) for the figures.
 * Depends on: beneficiaries.ts, enrolments.ts and the cluster types. Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: admission by completeness. A person who has a target project and no decision yet is marked Ready when the date of birth, the guardian and the ID number are all given, and Needs review (with what is missing) when not.
 *   An automatic decision carries the note "Automatic: ..." and is worked out again when the record changes. A decision a person made (any other note, or Declined) is never changed here.
 * - Rule: the waiting list of a project is the active persons who are Ready, have that project as their target, and have never been enrolled in it. First in, first out: by the date registered, then by ID (IDs only go up).
 * - Rule: a project with "Enrol automatically" on enrols the next in line whenever it has room, into the top cluster with the most vacancies, for the first benefit of the project that takes a person.
 *   A project with no benefits listed, or no active cluster, enrols no one by itself. Capacity is still checked by the enrolment rule itself (enrol), so this module cannot overfill a cluster.
 * - Rule: room opens when an enrolment ends, a cluster is added or its capacity raised. Every save runs this again, so the next in line is enrolled at once.
 * - Nothing is changed in place: every function returns a new value.
 */

import { clusterStateOf, type Cluster } from "../06-projects/clusters.js";
import type { GiftProject } from "../06-projects/projects.js";
import type { Beneficiary, Register } from "./beneficiaries.js";
import { activeIn, enrol, type EnrolContext, type Enrolments } from "./enrolments.js";

// --- Admission by completeness ---
export const AUTO_NOTE = "Automatic: ";
export const isAutoDecision = (b: Beneficiary): boolean => (b.eligibilityNote ?? "").startsWith(AUTO_NOTE);

// What a record still lacks to be Ready, in plain words.
export function missingFor(b: Beneficiary): string[] {
  return [b.dob ? "" : "date of birth", b.guardian ? "" : "guardian", b.idNumber ? "" : "ID number"].filter((x) => x !== "");
}

// The decision this rule would make for a person, or undefined when it is not its to make (not a person, no target project, or a person decided).
export function autoDecision(b: Beneficiary): { eligibility: "ready" | "review"; note: string } | undefined {
  if (b.kind !== "person" || (b.targetProjectId ?? "") === "") return undefined;
  const e = b.eligibility ?? "";
  if (e === "declined" || (e !== "" && !isAutoDecision(b))) return undefined;
  const gaps = missingFor(b);
  return gaps.length === 0 ? { eligibility: "ready", note: `${AUTO_NOTE}the record is complete` } : { eligibility: "review", note: `${AUTO_NOTE}missing ${gaps.join(", ")}` };
}

// Applies the automatic decisions to the register. Returns the same register object when nothing changed.
export function autoAdmit(reg: Register): Register {
  let changed = false;
  const records = reg.records.map((b) => {
    const d = autoDecision(b);
    if (!d || (b.eligibility === d.eligibility && b.eligibilityNote === d.note)) return b;
    changed = true;
    return { ...b, eligibility: d.eligibility, eligibilityNote: d.note };
  });
  return changed ? { ...reg, records } : reg;
}

// --- The pool of a project ---
// Rule: someone who has ever been enrolled in the project (even if it has ended) is not waiting for it: leaving does not put a child back in the queue.
const enrolledIn = (enr: Enrolments, projectId: string): Set<string> => new Set(enr.records.filter((e) => e.giftProjectId === projectId).map((e) => e.beneficiaryId));

// First in, first out: the date registered, then the ID.
const byArrival = (a: Beneficiary, b: Beneficiary): number => (a.registeredOn ?? "").localeCompare(b.registeredOn ?? "") || a.id.localeCompare(b.id);

export interface Pool { waiting: Beneficiary[]; review: Beneficiary[] }

// The people meant for a project and not enrolled in it: those ready (the waiting list, in order) and those a person still has to look at.
export function poolOf(reg: Register, enr: Enrolments, projectId: string): Pool {
  const held = enrolledIn(enr, projectId);
  const mine = reg.records.filter((b) => b.kind === "person" && b.status === "active" && b.targetProjectId === projectId && !held.has(b.id));
  return { waiting: mine.filter((b) => b.eligibility === "ready").sort(byArrival), review: mine.filter((b) => b.eligibility === "review").sort(byArrival) };
}

// Where a person stands: the project they wait for and their place in the line (1 is next), or undefined when they are not waiting.
export function positionOf(reg: Register, enr: Enrolments, b: Beneficiary): { projectId: string; position: number; of: number } | undefined {
  const pid = b.targetProjectId ?? "";
  if (pid === "") return undefined;
  const w = poolOf(reg, enr, pid).waiting;
  const i = w.findIndex((x) => x.id === b.id);
  return i < 0 ? undefined : { projectId: pid, position: i + 1, of: w.length };
}

// --- Enrolling the next in line ---
// The top cluster with the most vacancies. A cluster with no capacity set has no limit, so it counts as having room but ranks below one with a known number.
function roomiest(g: GiftProject, enr: Enrolments): Cluster | undefined {
  const state = clusterStateOf(g.levels, g.clusters);
  const tops = state.clusters.filter((c) => c.status === "active" && c.parentId === "");
  const room = (c: Cluster): number => (c.capacity === undefined ? 0.5 : c.capacity - activeIn(enr, state, g.id, c.id, true).length);
  return tops.filter((c) => room(c) > 0).sort((a, b) => room(b) - room(a))[0];
}

export interface PoolResult { register: Register; enrolments: Enrolments; enrolled: { beneficiaryId: string; projectId: string; enrolmentId: string }[] }

/**
 * Runs the whole rule: automatic admission, then for each project with "Enrol automatically" on, enrols the waiting list in order while there is room.
 */
export function settlePool(ctx: Omit<EnrolContext, "beneficiaries">, reg: Register, enr: Enrolments): PoolResult {
  const register = autoAdmit(reg);
  let enrolments = enr;
  const enrolled: PoolResult["enrolled"] = [];
  for (const g of ctx.giftProjects) {
    if (g.enrolAuto !== true) continue;
    for (const b of poolOf(register, enrolments, g.id).waiting) {
      const cluster = roomiest(g, enrolments);
      if (!cluster) break; // no room anywhere in this project: the rest keep waiting
      const itemId = (g.itemIds ?? []).find((i) => { const r = ctx.rulesOf(i); return !r || r.receiver === "person" || r.receiver === "list"; });
      if (itemId === undefined) break; // nothing to enrol for
      const r = enrol({ ...ctx, beneficiaries: register }, enrolments, { beneficiaryId: b.id, giftProjectId: g.id, clusterId: cluster.id, itemId });
      if ("error" in r) continue; // this person cannot be enrolled (for example already enrolled for the benefit): the next in line is tried
      enrolments = { ...r.value, records: r.value.records.map((e) => (e.id === r.id ? { ...e, auto: true as const } : e)) };
      enrolled.push({ beneficiaryId: b.id, projectId: g.id, enrolmentId: r.id });
    }
  }
  return { register, enrolments, enrolled };
}

// The line for the screen: "3 enrolled automatically from the waiting list." or "" when no one was.
export const poolMessage = (r: PoolResult): string => (r.enrolled.length === 0 ? "" : `${r.enrolled.length} enrolled automatically from the waiting list.`);

// One plain sentence on where a person stands for their target project, for their window. "" when they have none.
export function standingOf(reg: Register, enr: Enrolments, giftProjects: GiftProject[], b: Beneficiary): string {
  const pid = b.targetProjectId ?? "";
  const name = giftProjects.find((g) => g.id === pid)?.name;
  if (pid === "" || name === undefined) return "";
  const mine = enr.records.filter((e) => e.giftProjectId === pid && e.beneficiaryId === b.id);
  if (mine.some((e) => e.status === "active")) return `Enrolled in ${name}.`;
  if (mine.length > 0) return `Was enrolled in ${name}.`;
  if (b.eligibility === "declined") return `Cannot be offered a place in ${name}.`;
  const pos = positionOf(reg, enr, b);
  if (pos) return `Waiting for ${name}: ${pos.position} of ${pos.of} in line (first in, first out).`;
  return `Waiting for ${name}, but a person has to look at the record first${b.eligibilityNote ? ` (${b.eligibilityNote.replace(AUTO_NOTE, "").trim()})` : ""}.`;
}
