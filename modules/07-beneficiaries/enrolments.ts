/**
 * enrolments.ts
 *
 * What it does: enrolment (DECISIONS 167). An enrolment places a beneficiary in a cluster or sub cluster of a project, for one benefit (a gift item), optionally in a role the cluster needs (Principal,
 * Warden). A person sponsored in orphan care, an education scholarship and Hifz has one beneficiary record and three enrolments. For a type where the beneficiary comes first (sponsorship), an enrolment of
 * an approved beneficiary is the open place a gift fills (Allocation, a later step). A type where the gift comes first (house, pump, tent) creates its outcome from the gift, and its recipients are enrolled
 * after. A community outcome (a mosque) has no beneficiary, so nothing is enrolled.
 * Who calls it: the Beneficiaries tab of a cluster (app/cluster-people.ts), the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), all through applyEnrolmentAction.
 * Depends on: beneficiaries.ts, clusters.ts, projects.ts (the project type only) and kind-features.ts (the types only). Pure functions: no database, no screen.
 *
 * Rules:
 * - A beneficiary must be in the register and active. The project must exist, the cluster must be one of its clusters and active, and the benefit must be one the project offers (any, when it names none).
 * - Rule: who a benefit's type allows. Receiver "none" takes no one. "person" takes persons only, "household" households only, "list" or not set takes either.
 * - Rule: where the beneficiary comes first, a person must be approved (admission decision Ready) before being enrolled. Declined says so. A role holder (a principal or warden) needs no admission decision.
 * - Rule: a role must be one the cluster lists. A role holder does not count towards the capacity.
 * - Rule: capacity is the total on the master cluster (DECISIONS 161). Enrolments inside it, in the cluster itself or any sub cluster, may not pass it. It is checked when enrolling and when moving.
 * - Rule: the same beneficiary is enrolled once for the same project, benefit and role while it is active. Ending an enrolment frees that, and keeps the record.
 * - A beneficiary or cluster that is enrolled cannot be removed (held counts the active enrolments).
 * - Nothing is changed in place: every function returns a new value.
 */

import { clusterStateOf, treeRows, type Cluster, type ClusterState } from "../06-projects/clusters.js";
import type { GiftProject } from "../06-projects/projects.js";
import { featuresOf, type First, type Receiver, type SavedFeatures } from "../02-project-rules/kind-features.js";
import { kindLabel, kindOf } from "../02-project-rules/benefits.js";
import type { Register } from "./beneficiaries.js";

export type EnrolmentStatus = "active" | "ended";
export interface Enrolment {
  id: string; // for example EN-0001, permanent
  beneficiaryId: string;
  giftProjectId: string;
  clusterId: string;
  itemId: string; // the benefit: a CRM item
  role: string; // a role the cluster needs, "" for an ordinary beneficiary
  status: EnrolmentStatus;
  since: string; // YYYY-MM-DD
  endedOn?: string;
  sample?: true; // made by the sample setup (DECISIONS 168)
  auto?: true; // enrolled by itself from the waiting list (DECISIONS 246)
}
export interface Enrolments { records: Enrolment[]; counter: number }
export const emptyEnrolments = (): Enrolments => ({ records: [], counter: 0 });

// What the type of a benefit says about who it takes. Undefined when the item has no type yet.
export interface ItemRules { first: First; receiver: Receiver; kindLabel: string }
// What the type of an item says about who it takes: the type chosen for the item (or suggested from its name), and that type's features. Undefined when the item has no type.
export function itemRulesOf(itemKinds: Record<string, string>, saved: SavedFeatures, itemId: string, itemName: string): ItemRules | undefined {
  const k = kindOf(itemKinds, itemId, itemName).kind;
  if (k === "") return undefined;
  const p = featuresOf(saved, k).props;
  return { first: p.first, receiver: p.receiver, kindLabel: kindLabel(k) };
}

export interface EnrolContext { beneficiaries: Register; giftProjects: GiftProject[]; rulesOf: (itemId: string) => ItemRules | undefined; today: string }
type Result = { value: Enrolments; id: string } | { error: string };

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

// The active enrolments in a cluster and everything inside it. Role holders are left out when `people` is true (they do not count towards capacity).
export function activeIn(enr: Enrolments, state: ClusterState, giftProjectId: string, clusterId: string, peopleOnly = false): Enrolment[] {
  const ids = new Set([clusterId, ...treeRows(state, clusterId).map((r) => r.cluster.id)]);
  return enr.records.filter((e) => e.status === "active" && e.giftProjectId === giftProjectId && ids.has(e.clusterId) && (!peopleOnly || e.role === ""));
}

// The master cluster a cluster sits under (itself when it is one).
export function masterOf(state: ClusterState, clusterId: string): Cluster | undefined {
  let c = state.clusters.find((x) => x.id === clusterId);
  while (c && c.parentId !== "") c = state.clusters.find((x) => x.id === (c as Cluster).parentId);
  return c;
}

// Rule: capacity. The people already enrolled inside the master cluster (not counting `ignoreId`, an enrolment being moved) may not reach its total.
function capacityError(enr: Enrolments, state: ClusterState, giftProjectId: string, clusterId: string, ignoreId: string): string {
  const top = masterOf(state, clusterId);
  if (!top || top.capacity === undefined) return "";
  const n = activeIn(enr, state, giftProjectId, top.id, true).filter((e) => e.id !== ignoreId).length;
  return n >= top.capacity ? `${top.name} is full: ${top.capacity} of ${top.capacity} places are taken.` : "";
}

export function enrol(ctx: EnrolContext, enr: Enrolments, raw: { beneficiaryId: unknown; giftProjectId: unknown; clusterId: unknown; itemId: unknown; role?: unknown }): Result {
  const beneficiaryId = clean(raw.beneficiaryId);
  const projectId = clean(raw.giftProjectId);
  const clusterId = clean(raw.clusterId);
  const itemId = clean(raw.itemId);
  const role = clean(raw.role).slice(0, 40);
  const b = ctx.beneficiaries.records.find((x) => x.id === beneficiaryId);
  if (!b) return { error: "Choose a beneficiary from the register." };
  if (b.status !== "active") return { error: `${b.name} is inactive, so cannot be enrolled.` };
  const gp = ctx.giftProjects.find((g) => g.id === projectId);
  if (!gp) return { error: "That project was not found." };
  const state = clusterStateOf(gp.levels, gp.clusters);
  const cluster = state.clusters.find((c) => c.id === clusterId);
  if (!cluster) return { error: "Choose a cluster of this project." };
  if (cluster.status !== "active") return { error: `${cluster.name} is closed.` };
  if (itemId === "") return { error: "Choose the benefit." };
  if ((gp.itemIds ?? []).length > 0 && !(gp.itemIds ?? []).includes(itemId)) return { error: `${gp.name} does not offer that benefit.` };
  const rules = ctx.rulesOf(itemId);
  if (rules) {
    if (rules.receiver === "none") return { error: `A ${rules.kindLabel.toLowerCase()} benefit has no beneficiary: it serves a community.` };
    if (rules.receiver === "person" && b.kind !== "person") return { error: `This benefit goes to a person, and ${b.name} is a household.` };
    if (rules.receiver === "household" && b.kind !== "household") return { error: `This benefit goes to a household, and ${b.name} is a person.` };
    // Rule: where the beneficiary comes first, a person must be approved. A role holder needs no admission decision.
    if (rules.first === "beneficiary" && b.kind === "person" && role === "" && b.eligibility !== "ready") return { error: b.eligibility === "declined" ? `${b.name} cannot be offered a place (admission decision).` : `${b.name} needs an admission decision of Ready before being enrolled.` };
  }
  if (role !== "" && !(cluster.roles ?? []).some((r) => r.toLowerCase() === role.toLowerCase())) return { error: `${cluster.name} does not list the role ${role}.` };
  const dup = enr.records.find((e) => e.status === "active" && e.beneficiaryId === beneficiaryId && e.giftProjectId === projectId && e.itemId === itemId && e.role.toLowerCase() === role.toLowerCase());
  if (dup) return { error: `${b.name} is already enrolled in this project for this benefit (${dup.id}).` };
  if (role === "") { const full = capacityError(enr, state, projectId, clusterId, ""); if (full) return { error: full }; }
  const next = enr.counter + 1;
  const id = `EN-${String(next).padStart(4, "0")}`;
  return { value: { records: [...enr.records, { id, beneficiaryId, giftProjectId: projectId, clusterId, itemId, role, status: "active", since: ctx.today }], counter: next }, id };
}

export function endEnrolment(enr: Enrolments, id: string, today: string): Result {
  const e = enr.records.find((x) => x.id === id);
  if (!e) return { error: "That enrolment was not found." };
  if (e.status === "ended") return { error: "That enrolment has already ended." };
  return { value: { ...enr, records: enr.records.map((x) => (x.id === id ? { ...x, status: "ended" as const, endedOn: today } : x)) }, id };
}

// Rule: an enrolment moves to another cluster of the same project. Capacity and the role are checked again.
export function moveEnrolment(ctx: EnrolContext, enr: Enrolments, id: string, clusterId: string): Result {
  const e = enr.records.find((x) => x.id === id);
  if (!e || e.status !== "active") return { error: "That enrolment was not found, or has ended." };
  const gp = ctx.giftProjects.find((g) => g.id === e.giftProjectId);
  const state = clusterStateOf(gp?.levels, gp?.clusters);
  const cluster = state.clusters.find((c) => c.id === clusterId);
  if (!cluster) return { error: "Choose a cluster of this project." };
  if (cluster.status !== "active") return { error: `${cluster.name} is closed.` };
  if (e.role !== "" && !(cluster.roles ?? []).some((r) => r.toLowerCase() === e.role.toLowerCase())) return { error: `${cluster.name} does not list the role ${e.role}.` };
  if (e.role === "") { const full = capacityError(enr, state, e.giftProjectId, clusterId, e.id); if (full) return { error: full }; }
  return { value: { ...enr, records: enr.records.map((x) => (x.id === id ? { ...x, clusterId } : x)) }, id };
}

// How many active enrolments a beneficiary has, and how many a cluster holds (itself, not what is inside it). These block removal.
export const heldByBeneficiary = (enr: Enrolments, beneficiaryId: string): number => enr.records.filter((e) => e.status === "active" && e.beneficiaryId === beneficiaryId).length;
export const heldInCluster = (enr: Enrolments, giftProjectId: string, clusterId: string): number => enr.records.filter((e) => e.status === "active" && e.giftProjectId === giftProjectId && e.clusterId === clusterId).length;

/**
 * The requests the page makes on enrolments, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about enrolments.
 */
export function applyEnrolmentAction(ctx: EnrolContext, enr: Enrolments, body: Record<string, unknown>): Result | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "enr-add": return enrol(ctx, enr, { beneficiaryId: body["beneficiaryId"], giftProjectId: body["giftProjectId"], clusterId: body["clusterId"], itemId: body["itemId"], role: body["role"] });
    case "enr-end": return endEnrolment(enr, str("id"), ctx.today);
    case "enr-move": return moveEnrolment(ctx, enr, str("id"), str("clusterId"));
    default: return null;
  }
}
