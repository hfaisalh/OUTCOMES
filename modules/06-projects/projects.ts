/**
 * projects.ts
 *
 * What it does: projects, the structure each one defines for itself (levels such as Branch, Block, Class), the places in
 * that structure (nodes), the types of beneficiary (child, teacher, warden) and where each lives, and the roll-up of how
 * full each place is. The beneficiaries themselves are the outcomes of Module 5, tied to a node (DECISIONS 65).
 * Who calls it: the Projects page (app/) and the /api/projects endpoint (modules/00-platform/handlers.ts).
 * Depends on: Module 5 (outcomes, fill) and Module 2 (framework templates). Pure functions: no database, no screen.
 *
 * Rules:
 * - A partner defines its own levels. The first level is the place (a branch, a site: a partner may have many). Other levels sit under it as ways of
 *   grouping people inside a place, such as Class, House or School. They are not a chain: a child can be in a class and a house at once (DECISIONS 71).
 * - A node is one place in the structure (Lahore, Block A, Class 5A) at one level, under a node of the parent level.
 * - A beneficiary type says which level its beneficiaries belong to (usually the place), which groupings apply to them (Class, House), and which framework
 *   sponsors them. A beneficiary belongs to one place and to at most one group of each grouping that applies. Two types in one project should not share a framework, or a gift for one could land on the other (a warning is given).
 * - Beneficiaries are added in numbers to a node of the right level, as dummy numbered records for now (profile fields come later).
 * - Nothing is changed in place: every function returns a new value.
 */

import { slugify, type FrameworkTemplate } from "../02-project-rules/categories.js";
import { addOutcomes, autoAllocate, capacityOf, DEFAULT_GRACE_DAYS, fillOf, inGrace, asksForPlace, pickOutcome, releaseDue, takesCapacity, type AllocOptions, type Allocation, type Outcome, type Policy } from "../05-outcomes/outcomes.js";
import type { Commitment } from "../04b-commitments/commitments.js";

export interface Level {
  id: string;
  name: string;
  parentId: string; // "" means directly under the project
}

export interface BeneficiaryType {
  id: string;
  name: string; // child, teacher, warden
  levelId: string; // the level its beneficiaries belong to, usually the place (the branch)
  groupingIds?: string[]; // levels that group them inside that place (Class, House), each under the level above
  frameworkId: string; // how they are sponsored
}

// What a partner is, how it is doing in the approval, and who to contact. A partner is whoever implements the job of a gift: an institute, a contractor,
// another charity or anything else you add as a type (DECISIONS 69). The code still calls it a Project, from before partners were named.
export type PartnerStatus = "pending" | "active" | "on_hold" | "ended";
export const PARTNER_STATUSES: { id: PartnerStatus; label: string }[] = [{ id: "pending", label: "Pending" }, { id: "active", label: "Active" }, { id: "on_hold", label: "On hold" }, { id: "ended", label: "Ended" }];
// Due diligence is done in a separate tool. Here only its outcome is kept, since a partner may be active only while it is approved.
export type DueDiligenceStatus = "none" | "pending" | "approved" | "expired";
export const DUE_DILIGENCE: { id: DueDiligenceStatus; label: string }[] = [{ id: "none", label: "Not started" }, { id: "pending", label: "Pending" }, { id: "approved", label: "Approved" }, { id: "expired", label: "Expired" }];

export interface PartnerContact {
  name: string;
  position: string;
  phone: string;
  mobile: string;
  email: string;
  handles: string; // what they deal with, such as updates or batches
}

export interface Project {
  id: string;
  name: string; // the name shown, the working name
  officialName?: string;
  reference?: string; // MWF's partner reference
  type?: string; // from the organisation's own list of partner types
  status?: PartnerStatus; // absent means pending
  parent?: string; // the larger organisation it belongs to, if any
  established?: string; // YYYY-MM-DD
  partnershipStart?: string;
  contacts?: PartnerContact[];
  countries?: string;
  regions?: string;
  itemIds?: string[]; // CRM item ids it can deliver. Empty or absent means any item
  capacity?: number; // how many jobs it can take at once, set by hand, then adjusted by how it performs
  capacityNote?: string;
  reportVia?: string; // how it sends updates (email, WhatsApp, portal)
  reportContact?: string;
  language?: string;
  media?: string; // media capacity: cameras, video, trained staff
  ddReference?: string; // the due diligence record in the other tool
  ddStatus?: DueDiligenceStatus;
  ddReview?: string; // YYYY-MM-DD when the approval must be reviewed
  notes?: string;
  documents?: { title: string; url: string }[];
  custom?: Record<string, string>; // the organisation's own extra fields, by label
  aliases: string[]; // other names the CRM uses for it, matched when a gift names a project (DECISIONS 65)
  levels: Level[];
  types: BeneficiaryType[];
}

export interface Node {
  id: string;
  projectId: string;
  levelId: string;
  parentId: string; // "" means directly under the project
  name: string;
  fields: Record<string, string>; // the node's own profile, such as a branch's location. Free text for now
}

export interface Changed<T> {
  value: T;
  error?: string; // plain English, set when nothing was changed
  warning?: string; // something to look at, though the change was made
}

export const MAX_LEVELS = 8;
const clean = (s: string): string => s.trim().replace(/\s+/g, " ");
const uniqueId = (base: string, taken: Set<string>): string => {
  let id = slugify(base) || "item";
  for (let n = 2; taken.has(id); n++) id = `${slugify(base)}-${n}`;
  return id;
};
const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---- Projects ----

export function addProject(projects: Project[], name: string, aliases: string[] = []): Changed<Project[]> {
  const n = clean(name);
  if (n === "") return { value: projects, error: "Give the project a name." };
  if (projects.some((p) => same(p.name, n))) return { value: projects, error: `There is already a project called "${n}".` };
  const project: Project = { id: uniqueId(n, new Set(projects.map((p) => p.id))), name: n, status: "pending", aliases: aliases.map(clean).filter((a) => a !== ""), levels: [], types: [] };
  return { value: [...projects, project] };
}

// Rule (DECISIONS 68): a gift's project name goes to every partner that has it as a name or an alias, ignoring capitals. More than one partner may answer to a name. None means a general gift.
export function matchProjects(projects: Project[], crmName: string): Project[] {
  const n = clean(crmName);
  if (n === "") return [];
  return projects.filter((p) => same(p.name, n) || p.aliases.some((a) => same(a, n)));
}
export const matchProject = (projects: Project[], crmName: string): Project | undefined => matchProjects(projects, crmName)[0];

const withProject = (projects: Project[], id: string, change: (p: Project) => Project): Project[] => projects.map((p) => (p.id === id ? change(p) : p));

// ---- Levels ----

export function addLevel(projects: Project[], projectId: string, name: string, parentId: string): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: projects, error: "That project was not found." };
  const n = clean(name);
  if (n === "") return { value: projects, error: "Give the level a name." };
  if (p.levels.some((l) => same(l.name, n))) return { value: projects, error: `There is already a level called "${n}".` };
  if (parentId !== "" && !p.levels.some((l) => l.id === parentId)) return { value: projects, error: "The level it sits under was not found." };
  if (p.levels.length >= MAX_LEVELS) return { value: projects, error: `A project can have at most ${MAX_LEVELS} levels.` };
  const level: Level = { id: uniqueId(n, new Set(p.levels.map((l) => l.id))), name: n, parentId };
  return { value: withProject(projects, projectId, (x) => ({ ...x, levels: [...x.levels, level] })) };
}

// The levels under a level, all the way down.
export function levelsBelow(p: Project, levelId: string): Set<string> {
  const out = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const l of p.levels) if (!out.has(l.id) && (l.parentId === levelId || out.has(l.parentId))) { out.add(l.id); grew = true; }
  }
  return out;
}

// Rule: a level that is in use (it has places, a level under it, or a type that uses it) cannot be removed.
export function removeLevel(projects: Project[], nodes: Node[], projectId: string, levelId: string): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: projects, error: "That project was not found." };
  if (p.levels.some((l) => l.parentId === levelId)) return { value: projects, error: "Remove the levels under it first." };
  if (p.types.some((t) => t.levelId === levelId || (t.groupingIds ?? []).includes(levelId))) return { value: projects, error: "A type of beneficiary uses this level. Change or remove the type first." };
  if (nodes.some((nd) => nd.projectId === projectId && nd.levelId === levelId)) return { value: projects, error: "There are places at this level. Remove them first." };
  return { value: withProject(projects, projectId, (x) => ({ ...x, levels: x.levels.filter((l) => l.id !== levelId) })) };
}

// Rule (DECISIONS 71): put a level under another one, or at the top. It cannot go under itself or under a level below it, and a level with places cannot move, because its places hang under places of the old parent.
export function moveLevel(projects: Project[], nodes: Node[], projectId: string, levelId: string, parentId: string): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  const level = p?.levels.find((l) => l.id === levelId);
  if (!p || !level) return { value: projects, error: "That level was not found." };
  if (parentId !== "" && !p.levels.some((l) => l.id === parentId)) return { value: projects, error: "The level to put it under was not found." };
  if (parentId === levelId || levelsBelow(p, levelId).has(parentId)) return { value: projects, error: "A level cannot go under itself or under a level below it." };
  if (level.parentId === parentId) return { value: projects };
  if (nodes.some((nd) => nd.projectId === projectId && nd.levelId === levelId)) return { value: projects, error: "There are places at this level, so it cannot move. Remove them first." };
  return { value: withProject(projects, projectId, (x) => ({ ...x, levels: x.levels.map((l) => (l.id === levelId ? { ...l, parentId } : l)) })) };
}

// The levels from the top down, each with how deep it is, children after their parent. Used to show the levels and to offer them in lists.
export function levelTree(p: Project): { level: Level; depth: number }[] {
  const out: { level: Level; depth: number }[] = [];
  const walk = (parent: string, depth: number) => p.levels.filter((l) => l.parentId === parent).forEach((l) => { out.push({ level: l, depth }); walk(l.id, depth + 1); });
  walk("", 0);
  return out;
}
export const orderedLevels = (p: Project): Level[] => levelTree(p).map((x) => x.level);

// ---- Beneficiary types ----

export function addType(projects: Project[], projectId: string, t: { name: string; levelId: string; frameworkId: string; groupingIds?: string[] }, fw: FrameworkTemplate[]): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: projects, error: "That project was not found." };
  const name = clean(t.name);
  if (name === "") return { value: projects, error: "Give the type a name, such as child or teacher." };
  if (p.types.some((x) => same(x.name, name))) return { value: projects, error: `There is already a type called "${name}".` };
  // Rule (DECISIONS 72): a type does not have to belong to a level. With none, its beneficiaries belong to the partner as a whole and can be placed later.
  if (t.levelId !== "" && !p.levels.some((l) => l.id === t.levelId)) return { value: projects, error: "That level was not found." };
  if (!fw.some((f) => f.id === t.frameworkId)) return { value: projects, error: "Choose how it is sponsored." };
  // Rule (DECISIONS 71): a grouping is a level under the level the beneficiaries belong to, such as Class or House under Branch.
  const below = t.levelId === "" ? new Set<string>() : levelsBelow(p, t.levelId);
  const groupingIds = [...new Set(t.groupingIds ?? [])];
  if (t.levelId === "" && groupingIds.length > 0) return { value: projects, error: "Choose what they belong to first, since groups sit inside it." };
  const wrong = groupingIds.find((g) => !below.has(g));
  if (wrong) return { value: projects, error: `${p.levels.find((l) => l.id === wrong)?.name ?? "That level"} is not under ${p.levels.find((l) => l.id === t.levelId)?.name ?? "that level"}, so it cannot group them.` };
  const clash = p.types.find((x) => x.frameworkId === t.frameworkId);
  const type: BeneficiaryType = { id: uniqueId(name, new Set(p.types.map((x) => x.id))), name, levelId: t.levelId, frameworkId: t.frameworkId, ...(groupingIds.length ? { groupingIds } : {}) };
  const value = withProject(projects, projectId, (x) => ({ ...x, types: [...x.types, type] }));
  return clash ? { value, warning: `"${clash.name}" is sponsored the same way, so a gift could land on either. Give one of them its own framework (duplicate it) so gifts for each go to the right one.` } : { value };
}

export function removeType(projects: Project[], outcomes: Outcome[], projectId: string, typeId: string): Changed<Project[]> {
  if (outcomes.some((o) => o.projectId === projectId && o.typeId === typeId)) return { value: projects, error: "There are beneficiaries of this type. Remove them first." };
  return { value: withProject(projects, projectId, (x) => ({ ...x, types: x.types.filter((t) => t.id !== typeId) })) };
}

// ---- Places (nodes) ----

export function addNode(nodes: Node[], projects: Project[], projectId: string, levelId: string, parentId: string, name: string, fields: Record<string, string> = {}): Changed<Node[]> {
  const p = projects.find((x) => x.id === projectId);
  const level = p?.levels.find((l) => l.id === levelId);
  if (!p || !level) return { value: nodes, error: "Choose a level for the place." };
  const n = clean(name);
  if (n === "") return { value: nodes, error: "Give the place a name." };
  // Rule: a place sits under a place of the level above it, or directly under the project when its level is the first.
  const parent = nodes.find((x) => x.id === parentId && x.projectId === projectId);
  if (level.parentId === "" ? parentId !== "" : !parent || parent.levelId !== level.parentId) return { value: nodes, error: level.parentId === "" ? "A place at the first level sits directly under the project." : "Choose the place it sits under." };
  if (nodes.some((x) => x.projectId === projectId && x.parentId === parentId && x.levelId === levelId && same(x.name, n))) return { value: nodes, error: `There is already a place called "${n}" there.` };
  const node: Node = { id: uniqueId(`${projectId}-${n}`, new Set(nodes.map((x) => x.id))), projectId, levelId, parentId, name: n, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [clean(k), clean(v)]).filter(([k]) => k !== "")) };
  return { value: [...nodes, node] };
}

// Rule: a place with places under it, or with beneficiaries in it, cannot be removed.
export function removeNode(nodes: Node[], outcomes: Outcome[], nodeId: string): Changed<Node[]> {
  if (nodes.some((x) => x.parentId === nodeId)) return { value: nodes, error: "Remove the places under it first." };
  if (outcomes.some((o) => o.nodeId === nodeId || (o.groupIds ?? []).includes(nodeId))) return { value: nodes, error: "There are beneficiaries here. Remove them first." };
  return { value: nodes.filter((x) => x.id !== nodeId) };
}

export function setNodeField(nodes: Node[], nodeId: string, key: string, value: string): Node[] {
  const k = clean(key);
  if (k === "") return nodes;
  return nodes.map((x) => (x.id === nodeId ? { ...x, fields: { ...x.fields, [k]: clean(value) } } : x));
}

// The names from the project down to a place, for showing where something is.
export function pathOf(nodes: Node[], projects: Project[], nodeId: string): string[] {
  const names: string[] = [];
  let cur = nodes.find((x) => x.id === nodeId);
  const project = projects.find((p) => p.id === cur?.projectId);
  while (cur) {
    names.unshift(cur.name);
    cur = nodes.find((x) => x.id === cur?.parentId);
  }
  return project ? [project.name, ...names] : names;
}

// ---- Beneficiaries ----

// Rule (DECISIONS 71, 72): add numbered beneficiaries of a type to a partner. The place and the groups are optional, so beneficiaries can be added first and placed later.
// When a place is given and the type belongs to a level, the place must be of that level. A group must be of a level the type is grouped by, inside that same place,
// with at most one group of each level. Groups need a place, since they are inside it.
export function addBeneficiaries(outcomes: Outcome[], projects: Project[], nodes: Node[], o: { projectId: string; nodeId: string; typeId: string; name: string; count: number; groupIds?: string[] }): Changed<Outcome[]> {
  const p = projects.find((x) => x.id === o.projectId);
  const type = p?.types.find((t) => t.id === o.typeId);
  if (!p || !type) return { value: outcomes, error: "Choose a type of beneficiary." };
  const node = o.nodeId === "" ? undefined : nodes.find((x) => x.id === o.nodeId && x.projectId === o.projectId);
  if (o.nodeId !== "" && !node) return { value: outcomes, error: "That place was not found." };
  if (node && type.levelId !== "" && node.levelId !== type.levelId) return { value: outcomes, error: `${type.name} beneficiaries belong to a ${p.levels.find((l) => l.id === type.levelId)?.name ?? "place"}, not a ${p.levels.find((l) => l.id === node.levelId)?.name ?? "this one"}. Choose a ${p.levels.find((l) => l.id === type.levelId)?.name ?? "place"}, or leave the place empty and place them later.` };
  const groupIds = [...new Set((o.groupIds ?? []).filter((g) => g !== ""))];
  if (groupIds.length > 0 && !node) return { value: outcomes, error: "Choose the place first, since a group is inside a place." };
  const seen = new Set<string>();
  for (const gid of groupIds) {
    const g = nodes.find((x) => x.id === gid && x.projectId === o.projectId);
    if (!node || !g || !(type.groupingIds ?? []).includes(g.levelId)) return { value: outcomes, error: `${g?.name ?? "That group"} is not one of the groups ${type.name} beneficiaries can be in.` };
    if (seen.has(g.levelId)) return { value: outcomes, error: `A beneficiary can be in only one ${p.levels.find((l) => l.id === g.levelId)?.name ?? "group"}.` };
    seen.add(g.levelId);
    let up = g.parentId;
    while (up !== "" && up !== node.id) up = nodes.find((x) => x.id === up)?.parentId ?? "";
    if (up !== node.id) return { value: outcomes, error: `${g.name} is not in ${node.name}.` };
  }
  const r = addOutcomes(outcomes, { name: o.name, count: o.count, type: type.name, cohort: node?.name ?? "", frameworkId: type.frameworkId });
  if (r.error) return r;
  const added = r.value.slice(outcomes.length).map((x) => ({ ...x, projectId: o.projectId, typeId: o.typeId, ...(node ? { nodeId: node.id } : {}), ...(groupIds.length ? { groupIds } : {}) }));
  return { value: [...outcomes, ...added] };
}

// ---- Placing a beneficiary afterwards (DECISIONS 76) ----

// Rule: put a beneficiary in a place of its partner, or take it out of any place when the id is empty. The place must suit the beneficiary's kind. Groups it was in
// that are not inside the new place are dropped.
export function setPlace(outcomes: Outcome[], partners: Project[], nodes: Node[], outcomeId: string, nodeId: string): Changed<Outcome[]> {
  const o = outcomes.find((x) => x.id === outcomeId);
  if (!o || !o.projectId) return { value: outcomes, error: "That beneficiary was not found, or it belongs to no partner." };
  const p = partners.find((x) => x.id === o.projectId);
  const type = p?.types.find((t) => t.id === o.typeId);
  const node = nodeId === "" ? undefined : nodes.find((x) => x.id === nodeId && x.projectId === o.projectId);
  if (nodeId !== "" && !node) return { value: outcomes, error: "That place was not found in this partner." };
  if (node && type && type.levelId !== "" && node.levelId !== type.levelId) return { value: outcomes, error: `${type.name} beneficiaries belong to a ${p?.levels.find((l) => l.id === type.levelId)?.name ?? "place"}, not a ${p?.levels.find((l) => l.id === node.levelId)?.name ?? "this one"}.` };
  const inside = (gid: string): boolean => { let up = nodes.find((x) => x.id === gid)?.parentId ?? ""; while (up !== "" && up !== node?.id) up = nodes.find((x) => x.id === up)?.parentId ?? ""; return node !== undefined && up === node.id; };
  const groupIds = (o.groupIds ?? []).filter(inside);
  return { value: outcomes.map((x) => { if (x.id !== outcomeId) return x; const { nodeId: _n, groupIds: _g, ...rest } = x; return { ...rest, ...(node ? { nodeId: node.id } : {}), ...(groupIds.length ? { groupIds } : {}) }; }) };
}

// Rule: put a beneficiary in one group of a kind (a class, a house), replacing the one it was in, or take it out of that kind of group when the group id is empty. It needs a place first, the group must be inside that place, and the kind of group must be one its type is grouped by.
export function setGroup(outcomes: Outcome[], partners: Project[], nodes: Node[], outcomeId: string, levelId: string, groupId: string): Changed<Outcome[]> {
  const o = outcomes.find((x) => x.id === outcomeId);
  if (!o || !o.projectId) return { value: outcomes, error: "That beneficiary was not found, or it belongs to no partner." };
  if (!o.nodeId) return { value: outcomes, error: "Put the beneficiary in a place first, since a group is inside a place." };
  const p = partners.find((x) => x.id === o.projectId);
  const type = p?.types.find((t) => t.id === o.typeId);
  if (!type || !(type.groupingIds ?? []).includes(levelId)) return { value: outcomes, error: "That kind of group does not apply to this kind of beneficiary." };
  const without = (o.groupIds ?? []).filter((g) => nodes.find((n) => n.id === g)?.levelId !== levelId);
  let next = without;
  if (groupId !== "") {
    const g = nodes.find((x) => x.id === groupId && x.projectId === o.projectId && x.levelId === levelId);
    if (!g) return { value: outcomes, error: "That group was not found." };
    let up = g.parentId;
    while (up !== "" && up !== o.nodeId) up = nodes.find((x) => x.id === up)?.parentId ?? "";
    if (up !== o.nodeId) return { value: outcomes, error: `${g.name} is not in this beneficiary's place.` };
    next = [...without, g.id];
  }
  return { value: outcomes.map((x) => { if (x.id !== outcomeId) return x; const { groupIds: _g, ...rest } = x; return next.length ? { ...rest, groupIds: next } : rest; }) };
}

// ---- The beneficiary's own ID (DECISIONS 75) ----

// Rule: a beneficiary's ID is unique across the organisation, ignoring capitals. Empty clears it.
export function setRef(outcomes: Outcome[], outcomeId: string, ref: string): Changed<Outcome[]> {
  const id = clean(ref);
  if (!outcomes.some((o) => o.id === outcomeId)) return { value: outcomes, error: "That beneficiary was not found." };
  if (id !== "" && outcomes.some((o) => o.id !== outcomeId && same(o.ref ?? "", id))) return { value: outcomes, error: `The ID "${id}" is already used by another beneficiary.` };
  return { value: outcomes.map((o) => { if (o.id !== outcomeId) return o; const { ref: _r, ...rest } = o; return id === "" ? rest : { ...rest, ref: id }; }) };
}

// Rule: give every beneficiary of a partner that has no ID the next number, in name order, such as A-0001, A-0002. Numbers already used are skipped. Ones with an ID keep it.
export function assignRefs(outcomes: Outcome[], projectId: string, prefix: string, start: number): Changed<Outcome[]> {
  const pre = clean(prefix);
  if (pre === "") return { value: outcomes, error: "Give the IDs a prefix, for example A-." };
  if (!Number.isInteger(start) || start < 0 || start > 999999) return { value: outcomes, error: "Start from a whole number." };
  const used = new Set(outcomes.map((o) => (o.ref ?? "").toLowerCase()).filter((x) => x !== ""));
  const todo = outcomes.filter((o) => o.projectId === projectId && (o.ref ?? "") === "").sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  if (todo.length === 0) return { value: outcomes, error: "Every beneficiary of this partner already has an ID." };
  const given = new Map<string, string>();
  let n = start;
  for (const o of todo) {
    let id = `${pre}${String(n).padStart(4, "0")}`;
    while (used.has(id.toLowerCase())) id = `${pre}${String(++n).padStart(4, "0")}`;
    used.add(id.toLowerCase());
    given.set(o.id, id);
    n++;
  }
  return { value: outcomes.map((o) => (given.has(o.id) ? { ...o, ref: given.get(o.id) as string } : o)) };
}

// ---- Roll-up ----

export interface Rollup {
  places: number; // capacity in units, added up
  used: number;
  beneficiaries: number;
}

// Rule: each place adds up the capacity and use of every beneficiary in it, in its groups and under it. A project adds up all of its places.
export function rollupOf(nodes: Node[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], policy?: Policy): { byNode: Map<string, Rollup>; byProject: Map<string, Rollup> } {
  const byNode = new Map<string, Rollup>();
  const byProject = new Map<string, Rollup>();
  const bump = (m: Map<string, Rollup>, key: string, cap: number, used: number) => {
    const r = m.get(key) ?? { places: 0, used: 0, beneficiaries: 0 };
    m.set(key, { places: r.places + cap, used: r.used + used, beneficiaries: r.beneficiaries + 1 });
  };
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  for (const o of outcomes) {
    if (!o.projectId || !o.active) continue;
    const f = fillOf(o, fw, allocations, commitments, policy);
    bump(byProject, o.projectId, capacityOf(o, fw), f.used); // everyone in the partner counts, placed or not (DECISIONS 72)
    if (!o.nodeId) continue;
    // The place it belongs to, the groups it is in, and everything above them, each counted once.
    const ids = new Set<string>();
    for (const start of [o.nodeId, ...(o.groupIds ?? [])]) for (let id = start; id !== "" && parentOf.has(id); id = parentOf.get(id) as string) ids.add(id);
    for (const id of ids) bump(byNode, id, capacityOf(o, fw), f.used);
  }
  return { byNode, byProject };
}

// ---- The partner's profile (DECISIONS 69) ----

const text = (v: unknown, max: number): string => (typeof v === "string" ? clean(v).slice(0, max) : "");
const dateOrEmpty = (v: unknown): string | undefined => { const t = text(v, 10); return t === "" || /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined; };

/**
 * Rule (DECISIONS 69): only active partners take gifts, and a partner may be made active only while its due diligence is approved and, if a
 * review date is set, that date has not passed. A partner whose approval lapses stops receiving new gifts, and what it already holds is kept.
 */
export const isActivePartner = (p: Project, today: string): boolean => p.status === "active" && p.ddStatus === "approved" && (!p.ddReview || today === "" || p.ddReview >= today);

// Rule: a gift's item is offered to a partner only when the partner delivers it. A partner with no items listed delivers anything. Outcomes with no partner (made before partners existed) are always open.
export function partnerAccepts(projects: Project[], projectId: string | undefined, itemId: string, today: string): boolean {
  if (projectId === undefined) return true;
  const p = projects.find((x) => x.id === projectId);
  if (!p) return true;
  return isActivePartner(p, today) && ((p.itemIds ?? []).length === 0 || (p.itemIds ?? []).includes(itemId));
}

/**
 * Rule: create a partner, or update one when an id is given. Only the name and the type are required. A new type is added to the organisation's
 * list. A partner cannot be made active unless its due diligence is approved and in date. Extra fields are kept only if the organisation has defined them.
 * A new partner may copy the levels and beneficiary types of another, so a structure is not built twice.
 */
export function savePartner(s: ProjectState, raw: Record<string, unknown>, id: string, copyFrom: string, today: string): Changed<ProjectState> {
  const name = text(raw["name"], 100);
  const type = text(raw["type"], 60);
  if (name === "") return { value: s, error: "Give the partner a name." };
  if (type === "") return { value: s, error: "Choose a type, or add a new one." };
  const existing = id !== "" ? s.projects.find((p) => p.id === id) : undefined;
  if (id !== "" && !existing) return { value: s, error: "That partner was not found." };
  if (s.projects.some((p) => p.id !== id && same(p.name, name))) return { value: s, error: `There is already a partner called "${name}".` };
  const status = (PARTNER_STATUSES.find((x) => x.id === raw["status"])?.id ?? existing?.status ?? "pending") as PartnerStatus;
  const ddStatus = (DUE_DILIGENCE.find((x) => x.id === raw["ddStatus"])?.id ?? "none") as DueDiligenceStatus;
  const ddReview = dateOrEmpty(raw["ddReview"]);
  const established = dateOrEmpty(raw["established"]);
  const partnershipStart = dateOrEmpty(raw["partnershipStart"]);
  if (ddReview === undefined || established === undefined || partnershipStart === undefined) return { value: s, error: "A date must be written as year, month, day, for example 2026-03-31." };
  const capText = text(raw["capacity"], 10);
  const cap = capText === "" ? undefined : Number(capText);
  if (cap !== undefined && (!Number.isInteger(cap) || cap < 0 || cap > 100000)) return { value: s, error: "Capacity is a whole number of jobs, or leave it empty." };
  const draft: Project = { ...(existing ?? { id: uniqueId(name, new Set(s.projects.map((p) => p.id))), aliases: [], levels: [], types: [] }), name, type, status, ddStatus, ...(ddReview !== "" ? { ddReview } : {}) };
  if (status === "active" && !isActivePartner({ ...draft, status: "active" }, today)) return { value: s, error: ddStatus !== "approved" ? "A partner can only be made active once its due diligence is approved." : "The due diligence approval is past its review date. Update the review date first." };
  const contacts = (Array.isArray(raw["contacts"]) ? raw["contacts"] : []).slice(0, 20).map((c): PartnerContact => { const x = (c ?? {}) as Record<string, unknown>; return { name: text(x["name"], 100), position: text(x["position"], 100), phone: text(x["phone"], 40), mobile: text(x["mobile"], 40), email: text(x["email"], 120), handles: text(x["handles"], 100) }; }).filter((c) => Object.values(c).some((v) => v !== ""));
  const documents = (Array.isArray(raw["documents"]) ? raw["documents"] : []).slice(0, 30).map((d) => { const x = (d ?? {}) as Record<string, unknown>; return { title: text(x["title"], 100), url: text(x["url"], 300) }; }).filter((d) => d.title !== "" || d.url !== "");
  const itemIds = [...new Set((Array.isArray(raw["itemIds"]) ? raw["itemIds"] : []).filter((x): x is string => typeof x === "string" && x !== "").map((x) => x.slice(0, 100)))].slice(0, 1000);
  const customIn = (raw["custom"] ?? {}) as Record<string, unknown>;
  const custom = Object.fromEntries(s.partnerFields.map((f) => [f, text(customIn[f], 300)]).filter(([, v]) => v !== ""));
  const optional = { officialName: text(raw["officialName"], 150), reference: text(raw["reference"], 60), parent: text(raw["parent"], 150), established, partnershipStart, countries: text(raw["countries"], 200), regions: text(raw["regions"], 300), capacityNote: text(raw["capacityNote"], 200), reportVia: text(raw["reportVia"], 100), reportContact: text(raw["reportContact"], 150), language: text(raw["language"], 60), media: text(raw["media"], 400), ddReference: text(raw["ddReference"], 100), notes: text(raw["notes"], 1000) };
  const { officialName: _o, reference: _r, parent: _pa, established: _e, partnershipStart: _ps, countries: _c, regions: _re, capacityNote: _cn, reportVia: _rv, reportContact: _rc, language: _l, media: _m, ddReference: _dr, notes: _n, capacity: _cap, contacts: _ct, documents: _d, itemIds: _i, custom: _cu, ...base } = draft;
  const saved: Project = { ...base, ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== "")), ...(cap !== undefined ? { capacity: cap } : {}), ...(contacts.length ? { contacts } : {}), ...(documents.length ? { documents } : {}), ...(itemIds.length ? { itemIds } : {}), ...(Object.keys(custom).length ? { custom } : {}) };
  // A new partner may start with the levels and types of another.
  const source = existing ? undefined : s.projects.find((p) => p.id === copyFrom);
  const withStructure: Project = source ? { ...saved, levels: source.levels.map((l) => ({ ...l })), types: source.types.map((t) => ({ ...t })) } : saved;
  return { value: { ...s, projects: existing ? s.projects.map((p) => (p.id === id ? withStructure : p)) : [...s.projects, withStructure], partnerTypes: s.partnerTypes.some((t) => same(t, type)) ? s.partnerTypes : [...s.partnerTypes, type] } };
}

// ---- Doing it from a request ----

export interface ProjectState {
  projects: Project[];
  nodes: Node[];
  outcomes: Outcome[];
  partnerTypes: string[]; // the organisation's own list of partner types
  partnerFields: string[]; // the organisation's own extra profile fields, by label
  giftProjects: GiftProject[]; // the projects donors choose, and the partners that deliver them (DECISIONS 76)
}

export const PROJECT_ACTIONS = ["remove-partner", "set-place", "set-group", "set-ref", "assign-refs", "save-gift-project", "remove-gift-project", "assign-crm-name", "save-partner", "add-partner-type", "add-partner-field", "remove-partner-field", "add-level", "move-level", "remove-level", "add-type", "remove-type", "add-node", "remove-node", "set-field", "add-beneficiaries"];
export const MAX_RECORDS = 5000;

/**
 * Rule (DECISIONS 104): removing a partner. It is refused while beneficiaries belong to it, unless the person says to remove them too, and then only when
 * none of them has a gift allocated (`allocatedIds` are the outcomes that do). Its structure (places and groups) goes with it. It is taken off any project
 * a donor can choose, which keeps its other partners. Nothing else is touched, and the partner's gifts are not lost, since gifts belong to outcomes.
 */
export function removePartner(s: ProjectState, projectId: string, withBeneficiaries: boolean, allocatedIds: Set<string>): { state: ProjectState; error?: string; removed?: number } {
  if (!s.projects.some((p) => p.id === projectId)) return { state: s, error: "That partner was not found." };
  const own = s.outcomes.filter((o) => o.projectId === projectId);
  if (own.length > 0 && !withBeneficiaries) return { state: s, error: `${own.length} beneficiar${own.length === 1 ? "y belongs" : "ies belong"} to this partner. Remove them first, or remove the partner together with them.` };
  const held = own.filter((o) => allocatedIds.has(o.id)).length;
  if (held > 0) return { state: s, error: `${held} of its beneficiaries have gifts allocated, so they cannot be removed. Release those gifts first.` };
  return {
    state: {
      ...s,
      projects: s.projects.filter((p) => p.id !== projectId),
      nodes: s.nodes.filter((n) => n.projectId !== projectId),
      outcomes: s.outcomes.filter((o) => o.projectId !== projectId),
      giftProjects: s.giftProjects.map((g) => ({ ...g, partnerIds: g.partnerIds.filter((id) => id !== projectId) })),
    },
    removed: own.length,
  };
}

/**
 * Rule: one place where a request from the screen becomes a change, so the server and the demo behave the same. Returns nothing when the
 * action is not a project action. Text is cut to a sensible length, and the number of places or beneficiaries is capped.
 */
export function applyProjectAction(s: ProjectState, fw: FrameworkTemplate[], body: Record<string, unknown>, today = "", allocatedIds: Set<string> = new Set()): { state: ProjectState; warning?: string; error?: string } | undefined {
  const action = typeof body["action"] === "string" ? body["action"] : "";
  if (!PROJECT_ACTIONS.includes(action)) return undefined;
  const str = (k: string, max = 100): string => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const strings = (k: string): string[] => (Array.isArray(body[k]) ? (body[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50) : []);
  const done = (state: ProjectState, warning?: string) => ({ state, ...(warning ? { warning } : {}) });
  const fail = (error: string) => ({ state: s, error });
  switch (action) {
    case "remove-partner": {
      const r = removePartner(s, str("projectId"), body["withBeneficiaries"] === true, allocatedIds);
      return r.error ? fail(r.error) : done(r.state);
    }
    case "set-place": {
      const r = setPlace(s.outcomes, s.projects, s.nodes, str("outcomeId"), str("nodeId"));
      return r.error ? fail(r.error) : done({ ...s, outcomes: r.value });
    }
    case "set-group": {
      const r = setGroup(s.outcomes, s.projects, s.nodes, str("outcomeId"), str("levelId"), str("groupId"));
      return r.error ? fail(r.error) : done({ ...s, outcomes: r.value });
    }
    case "set-ref": {
      const r = setRef(s.outcomes, str("outcomeId"), str("ref", 40));
      return r.error ? fail(r.error) : done({ ...s, outcomes: r.value });
    }
    case "assign-refs": {
      const r = assignRefs(s.outcomes, str("projectId"), str("prefix", 20), Number(body["start"] ?? 1));
      return r.error ? fail(r.error) : done({ ...s, outcomes: r.value });
    }
    case "save-gift-project": {
      const r = saveGiftProject(s.giftProjects, s.projects, (body["profile"] ?? {}) as Record<string, unknown>, str("giftProjectId"));
      return r.error ? fail(r.error) : done({ ...s, giftProjects: r.value });
    }
    case "remove-gift-project":
      return done({ ...s, giftProjects: removeGiftProject(s.giftProjects, str("giftProjectId")) });
    case "assign-crm-name": {
      const r = assignCrmName(s.giftProjects, str("name", 200), str("giftProjectId"));
      return r.error ? fail(r.error) : done({ ...s, giftProjects: r.value });
    }
    case "save-partner": {
      const r = savePartner(s, (body["profile"] ?? {}) as Record<string, unknown>, str("projectId"), str("copyFrom"), today);
      return r.error ? fail(r.error) : done(r.value);
    }
    case "add-partner-type": {
      const t = clean(str("name", 60));
      if (t === "") return fail("Give the type a name.");
      return s.partnerTypes.some((x) => same(x, t)) ? fail(`There is already a type called "${t}".`) : done({ ...s, partnerTypes: [...s.partnerTypes, t] });
    }
    case "add-partner-field": {
      const f = clean(str("name", 60));
      if (f === "") return fail("Give the field a name.");
      return s.partnerFields.some((x) => same(x, f)) ? fail(`There is already a field called "${f}".`) : done({ ...s, partnerFields: [...s.partnerFields, f] });
    }
    case "remove-partner-field": {
      const f = str("name", 60);
      return done({ ...s, partnerFields: s.partnerFields.filter((x) => x !== f), projects: s.projects.map((p) => { const { [f]: _gone, ...rest } = p.custom ?? {}; return p.custom ? { ...p, custom: rest } : p; }) });
    }
    case "add-level": {
      const r = addLevel(s.projects, str("projectId"), str("name", 60), str("parentId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "move-level": {
      const r = moveLevel(s.projects, s.nodes, str("projectId"), str("levelId"), str("parentId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "remove-level": {
      const r = removeLevel(s.projects, s.nodes, str("projectId"), str("levelId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "add-type": {
      const r = addType(s.projects, str("projectId"), { name: str("name", 60), levelId: str("levelId"), frameworkId: str("frameworkId"), groupingIds: strings("groupingIds") }, fw);
      return r.error ? fail(r.error) : done({ ...s, projects: r.value }, r.warning);
    }
    case "remove-type": {
      const r = removeType(s.projects, s.outcomes, str("projectId"), str("typeId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "add-node": {
      const project = s.projects.find((p) => p.id === str("projectId"));
      if (!project) return fail("That partner was not found.");
      const field = str("field", 60);
      const r = addNode(s.nodes, s.projects, project.id, str("levelId"), str("parentId"), str("name"), field !== "" ? { [field]: str("fieldValue", 200) } : {});
      if (r.error) return fail(r.error);
      return r.value.length > MAX_RECORDS ? fail(`There can be at most ${MAX_RECORDS} places.`) : done({ ...s, nodes: r.value });
    }
    case "remove-node": {
      const r = removeNode(s.nodes, s.outcomes, str("nodeId"));
      return r.error ? fail(r.error) : done({ ...s, nodes: r.value });
    }
    case "set-field":
      return s.nodes.some((x) => x.id === str("nodeId")) ? done({ ...s, nodes: setNodeField(s.nodes, str("nodeId"), str("key", 60), str("value", 200)) }) : fail("That place was not found.");
    default: {
      // Rule (DECISIONS 72): with no type chosen, the name is the kind. A kind of that name is used if the partner has one, otherwise it is made, sponsored
      // as chosen and belonging to no level. So the first beneficiaries need only a name, a number and how they are sponsored.
      let projects = s.projects;
      let typeId = str("typeId");
      let warning: string | undefined;
      if (typeId === "") {
        const project = projects.find((x) => x.id === str("projectId"));
        const kind = clean(str("name"));
        if (!project) return fail("That partner was not found.");
        if (kind === "") return fail("Give the beneficiaries a name, for example Orphan.");
        const have = project.types.find((t) => same(t.name, kind));
        if (have && str("frameworkId") !== "" && have.frameworkId !== str("frameworkId")) return fail(`"${have.name}" is already a kind of beneficiary with a different way of being sponsored. Choose it from the list, or give these another name.`);
        if (have) typeId = have.id;
        else {
          const made = addType(projects, project.id, { name: kind, levelId: "", frameworkId: str("frameworkId") }, fw);
          if (made.error) return fail(made.error);
          projects = made.value;
          warning = made.warning;
          typeId = (projects.find((x) => x.id === project.id)?.types.find((t) => same(t.name, kind)) as BeneficiaryType).id;
        }
      }
      const r = addBeneficiaries(s.outcomes, projects, s.nodes, { projectId: str("projectId"), nodeId: str("nodeId"), typeId, name: str("name"), count: Number(body["count"] ?? 1), groupIds: strings("groupIds") });
      if (r.error) return fail(r.error);
      return r.value.length > MAX_RECORDS ? fail(`There can be at most ${MAX_RECORDS} beneficiaries.`) : done({ ...s, projects, outcomes: r.value }, warning);
    }
  }
}

// The options automatic allocation needs from the setup: how long a plan that stops paying keeps its place, and how a gift's project name finds its project.
export const allocOptions = (projects: Project[], graceDays: number | undefined, today: string, requireRef = false, giftProjects: GiftProject[] = []): AllocOptions & { policy: Policy } => ({
  requireRef,
  policy: { today, graceDays: graceDays ?? DEFAULT_GRACE_DAYS },
  projectIdsFor: (name) => partnersForGift(giftProjects, projects, name).map((p) => p.id),
  partnerOk: (projectId, itemId) => partnerAccepts(projects, projectId, itemId, today),
});

// ---- The allocation summary (the sheet's Step 1, 3, 5 and 6 for every project, DECISIONS 66) ----

export interface ProjectSummary {
  projectId: string; // "" for beneficiaries that belong to no project (made before projects existed)
  name: string;
  beneficiaries: number; // active ones
  capacity: number; // units
  used: number; // sponsored units
  free: number; // units with no sponsor
  inGrace: number; // allocated commitments that are behind but still inside the grace days
  releaseDue: number; // allocated commitments unpaid beyond the grace days, waiting for a manager to approve the release
  waitingParts: number; // parts of gifts directed to this project that have no place yet
}

export interface AllocationSummary {
  rows: ProjectSummary[];
  generalWaiting: { gifts: number; parts: number }; // gifts that can go to any project and have no place yet
  waitingGifts: number; // every gift that holds capacity and has no place
}

/**
 * Rule: for each project, how many beneficiaries and units there are, how many are sponsored and free, how many sponsors are inside the buffer,
 * and the parts of gifts directed to it that wait. Surplus or deficit is free minus waiting (the sheet's Step 6). A gift that names no known
 * project is general and counted on its own line, since it can go anywhere.
 */
export function allocationSummary(projects: Project[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], opts: AllocOptions): AllocationSummary {
  const placed = new Set(allocations.map((a) => a.commitmentKey));
  const waiting = commitments.filter((c) => asksForPlace(c, fw, opts.policy) && !placed.has(c.subscriptionId));
  const projectOfOutcome = new Map(outcomes.map((o) => [o.id, o.projectId ?? ""]));
  const byId = new Map(commitments.map((c) => [c.subscriptionId, c]));
  const keys = [...projects.map((p) => p.id), ...(outcomes.some((o) => !o.projectId) ? [""] : [])];
  const rows = keys.map((id): ProjectSummary => {
    const mine = outcomes.filter((o) => (o.projectId ?? "") === id && o.active);
    let capacity = 0;
    let used = 0;
    for (const o of mine) {
      capacity += capacityOf(o, fw);
      used += fillOf(o, fw, allocations, commitments, opts.policy).used;
    }
    const mineAllocs = allocations.filter((a) => projectOfOutcome.get(a.outcomeId) === id && byId.has(a.commitmentKey));
    const buffered = mineAllocs.filter((a) => opts.policy && inGrace(byId.get(a.commitmentKey) as Commitment, opts.policy)).length;
    const dueRelease = mineAllocs.filter((a) => opts.policy && releaseDue(byId.get(a.commitmentKey) as Commitment, opts.policy)).length;
    const waitingParts = waiting.filter((c) => id !== "" && (opts.projectIdsFor?.(c.projectName) ?? []).includes(id)).reduce((n, c) => n + c.partsPerInstalment, 0); // a gift directed to more than one partner counts for each
    return { projectId: id, name: id === "" ? "Not in a project" : (projects.find((p) => p.id === id)?.name ?? id), beneficiaries: mine.length, capacity, used, free: Math.max(capacity - used, 0), inGrace: buffered, releaseDue: dueRelease, waitingParts };
  });
  const general = waiting.filter((c) => (opts.projectIdsFor?.(c.projectName) ?? []).length === 0);
  return { rows, generalWaiting: { gifts: general.length, parts: general.reduce((n, c) => n + c.partsPerInstalment, 0) }, waitingGifts: waiting.length };
}

// ---- Placing a gift by hand into a place ----

// The place and every place under it.
export function placesUnder(nodes: Node[], nodeId: string): Set<string> {
  const out = new Set<string>([nodeId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) if (!out.has(n.id) && out.has(n.parentId)) { out.add(n.id); grew = true; }
  }
  return out;
}

/**
 * Rule: a person drops a gift on a place. It goes to a beneficiary in that place, or under it, that uses the gift's framework and has room,
 * chosen the same way as automatic allocation. A gift already placed is moved. A person may place a directed gift outside its project:
 * that is their decision.
 */
export function placeInNode(allocations: Allocation[], commitments: Commitment[], outcomes: Outcome[], nodes: Node[], fw: FrameworkTemplate[], commitmentKey: string, nodeId: string, at: string, policy?: Policy): Changed<Allocation[]> {
  const node = nodes.find((x) => x.id === nodeId);
  if (!node) return { value: allocations, error: "That place was not found." };
  const under = placesUnder(nodes, nodeId);
  // A beneficiary is in a place when it belongs to it, or to a group of it, or is in the place or group dropped on.
  return placeAmong(allocations, commitments, outcomes, fw, commitmentKey, (o) => (o.nodeId !== undefined && under.has(o.nodeId)) || (o.groupIds ?? []).some((g) => under.has(g)), node.name, at, policy);
}

// Rule (DECISIONS 73): a person drops a gift on a partner as a whole, for beneficiaries that are not placed in a branch or group. It goes to one of that partner's beneficiaries with room.
export function placeInPartner(allocations: Allocation[], commitments: Commitment[], outcomes: Outcome[], projects: Project[], fw: FrameworkTemplate[], commitmentKey: string, projectId: string, at: string, policy?: Policy): Changed<Allocation[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: allocations, error: "That partner was not found." };
  return placeAmong(allocations, commitments, outcomes, fw, commitmentKey, (o) => o.projectId === projectId, p.name, at, policy);
}

// The shared part: put one gift into one of the beneficiaries that fit, chosen as in automatic allocation. A gift already placed is moved.
function placeAmong(allocations: Allocation[], commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], commitmentKey: string, fits: (o: Outcome) => boolean, where: string, at: string, policy?: Policy): Changed<Allocation[]> {
  const c = commitments.find((x) => x.subscriptionId === commitmentKey);
  if (!c) return { value: allocations, error: "That gift was not found." };
  if (!asksForPlace(c, fw, policy)) return { value: allocations, error: "That gift no longer asks for a place: it is cancelled, fully paid, or unpaid beyond the grace days." };
  const candidates = outcomes.filter((o) => o.active && o.frameworkId === c.frameworkId && fits(o));
  const others = allocations.filter((a) => a.commitmentKey !== commitmentKey);
  const live = new Set(commitments.filter((x) => takesCapacity(x, fw)).map((x) => x.subscriptionId));
  const used = new Map<string, number>();
  for (const a of others) if (live.has(a.commitmentKey)) used.set(a.outcomeId, (used.get(a.outcomeId) ?? 0) + a.parts);
  const target = pickOutcome(candidates, fw, used, c.partsPerInstalment);
  if (!target) return { value: allocations, error: `${where} has no room for ${c.partsPerInstalment} part${c.partsPerInstalment === 1 ? "" : "s"} of this kind.` };
  return { value: [...others, { commitmentKey, outcomeId: target.id, parts: c.partsPerInstalment, how: "manual", at }] };
}

// ---- Beneficiaries made before partners existed (DECISIONS 73) ----

export const isLegacy = (o: Outcome): boolean => o.projectId === undefined;

// Rule: move every beneficiary that belongs to no partner into one, keeping what is allocated to them. They keep their framework and name.
export function adoptLegacy(outcomes: Outcome[], projects: Project[], projectId: string): Changed<Outcome[]> & { moved: number } {
  if (!projects.some((p) => p.id === projectId)) return { value: outcomes, error: "Choose a partner.", moved: 0 };
  const moved = outcomes.filter(isLegacy).length;
  return { value: outcomes.map((o) => (isLegacy(o) ? { ...o, projectId } : o)), moved };
}

// Rule: remove every beneficiary that belongs to no partner, and release the gifts that were allocated to them, so the next allocation places those gifts again.
export function clearLegacy(outcomes: Outcome[], allocations: Allocation[]): { outcomes: Outcome[]; allocations: Allocation[]; removed: number; released: number } {
  const gone = new Set(outcomes.filter(isLegacy).map((o) => o.id));
  const kept = allocations.filter((a) => !gone.has(a.outcomeId));
  return { outcomes: outcomes.filter((o) => !gone.has(o.id)), allocations: kept, removed: gone.size, released: allocations.length - kept.length };
}

// Where automatic allocation would put each waiting gift, shown as a suggestion. Nothing is changed.
export function suggestions(commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], opts: AllocOptions): Map<string, string> {
  const before = new Set(allocations.map((a) => a.commitmentKey));
  const r = autoAllocate(commitments, outcomes, fw, allocations, "", opts);
  return new Map(r.allocations.filter((a) => !before.has(a.commitmentKey)).map((a) => [a.commitmentKey, a.outcomeId]));
}

// ---- Projects: what a donor chooses, and which partners deliver it (DECISIONS 76) ----

// A project is the page of the website a donor gave from (Aghosh, Dadyal Orphan Complex). It is defined in the CRM as a name on the gift. Here it says which
// CRM names it answers to and which partners deliver it. The code calls it a GiftProject because `Project` still means a partner (to be renamed).
export interface GiftProject {
  id: string;
  name: string;
  crmNames: string[]; // other names the CRM uses for it
  partnerIds: string[]; // the partners that deliver it. Any of them can take a gift for it
  notes?: string;
}

// Used when a gift names a project that has no partner yet: the gift waits for a person, instead of being treated as general.
export const NO_PARTNER = "__no_partner__";

export function saveGiftProject(gps: GiftProject[], partners: Project[], raw: Record<string, unknown>, id: string): Changed<GiftProject[]> {
  const name = text(raw["name"], 100);
  if (name === "") return { value: gps, error: "Give the project a name." };
  const existing = id !== "" ? gps.find((g) => g.id === id) : undefined;
  if (id !== "" && !existing) return { value: gps, error: "That project was not found." };
  if (gps.some((g) => g.id !== id && same(g.name, name))) return { value: gps, error: `There is already a project called "${name}".` };
  const crmNames = [...new Set((Array.isArray(raw["crmNames"]) ? raw["crmNames"] : []).map((x) => text(x, 100)).filter((x) => x !== "" && !same(x, name)))].slice(0, 50);
  // A CRM name goes to one project only, so a name taken here is taken off the others.
  const taken = new Set(crmNames.map((x) => x.toLowerCase()));
  const partnerIds = [...new Set((Array.isArray(raw["partnerIds"]) ? raw["partnerIds"] : []).filter((x): x is string => typeof x === "string" && partners.some((p) => p.id === x)))];
  const notes = text(raw["notes"], 1000);
  const gp: GiftProject = { id: existing?.id ?? uniqueId(name, new Set(gps.map((g) => g.id))), name, crmNames, partnerIds, ...(notes !== "" ? { notes } : {}) };
  const others = gps.filter((g) => g.id !== gp.id).map((g) => ({ ...g, crmNames: g.crmNames.filter((x) => !taken.has(x.toLowerCase())) }));
  return { value: existing ? gps.map((g) => (g.id === gp.id ? gp : others.find((o) => o.id === g.id) as GiftProject)) : [...others, gp] };
}

export const removeGiftProject = (gps: GiftProject[], id: string): GiftProject[] => gps.filter((g) => g.id !== id);

/**
 * Rule (DECISIONS 76): the partners a gift goes to, from the project name on it. A project matches by its name or any of its CRM names. Its partners can all take
 * the gift. A project with no partner returns a marker that matches none, so the gift waits for a person. Before a name is set up as a project, a partner whose own
 * name or older alias matches still takes it. No match at all means a general gift, and the list is empty.
 */
export function partnersForGift(gps: GiftProject[], partners: Project[], crmName: string): Project[] {
  const n = clean(crmName);
  if (n === "") return [];
  const hit = gps.filter((g) => same(g.name, n) || g.crmNames.some((x) => same(x, n)));
  if (hit.length > 0) {
    const ids = new Set(hit.flatMap((g) => g.partnerIds));
    const found = partners.filter((p) => ids.has(p.id));
    return found.length > 0 ? found : [{ id: NO_PARTNER, name: "", aliases: [], levels: [], types: [] }];
  }
  return matchProjects(partners, n);
}

export interface CrmName {
  name: string; // as the CRM spells it on the donation lines
  gifts: number; // how many gifts carry it
  giftProjectId: string; // the project it belongs to, "" when it belongs to none (a general gift)
  suggestion: string; // a project id that looks like the same thing, "" when none. Only for names not in a project yet
}

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

// Rule: the names the CRM uses on gifts, with how many gifts each has and the project each belongs to. Names are read from the work orders, so the list is always real.
// For a name in no project, a project that shares a whole word with it is suggested (Aghosh with Aghosh Orphan Homes). A person decides.
export function crmNamesOf(workOrders: { projectName?: string; status: string }[], gps: GiftProject[]): CrmName[] {
  const count = new Map<string, number>();
  for (const w of workOrders) {
    const n = clean(w.projectName ?? "");
    if (n !== "" && w.status !== "excluded") count.set(n, (count.get(n) ?? 0) + 1);
  }
  return [...count.entries()].map(([name, gifts]): CrmName => {
    const own = gps.find((g) => same(g.name, name) || g.crmNames.some((x) => same(x, name)));
    return { name, gifts, giftProjectId: own?.id ?? "", suggestion: own ? "" : (gps.find((g) => words(g.name).some((w) => words(name).includes(w)))?.id ?? "") };
  }).sort((a, b) => b.gifts - a.gifts || a.name.localeCompare(b.name));
}

// Rule: put a CRM name in one project, or in none. It is taken off every other project first.
export function assignCrmName(gps: GiftProject[], crmName: string, giftProjectId: string): Changed<GiftProject[]> {
  const name = clean(crmName);
  if (name === "") return { value: gps, error: "That name is empty." };
  if (giftProjectId !== "" && !gps.some((g) => g.id === giftProjectId)) return { value: gps, error: "That project was not found." };
  return { value: gps.map((g) => { const rest = g.crmNames.filter((x) => !same(x, name)); return g.id === giftProjectId && !same(g.name, name) ? { ...g, crmNames: [...rest, name] } : { ...g, crmNames: rest }; }) };
}

// Rule: a setup from before projects existed has CRM names on its partners. Each distinct name becomes a project with those partners, once, and the partners' own names are cleared.
export function migrateGiftProjects(partners: Project[], gps: GiftProject[]): { partners: Project[]; giftProjects: GiftProject[] } {
  if (gps.length > 0 || !partners.some((p) => p.aliases.length > 0)) return { partners, giftProjects: gps };
  const byName = new Map<string, { name: string; ids: string[] }>();
  for (const p of partners) for (const a of p.aliases) { const k = a.toLowerCase(); const e = byName.get(k) ?? { name: a, ids: [] }; byName.set(k, { ...e, ids: [...new Set([...e.ids, p.id])] }); }
  const taken = new Set<string>();
  const giftProjects = [...byName.values()].map((e): GiftProject => { const id = uniqueId(e.name, taken); taken.add(id); return { id, name: e.name, crmNames: [], partnerIds: e.ids }; });
  return { partners: partners.map((p) => ({ ...p, aliases: [] })), giftProjects };
}

