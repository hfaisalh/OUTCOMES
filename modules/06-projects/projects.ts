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
 * - A project defines its own levels. A level sits under another level, or directly under the project. Names and depth are the project's own.
 * - A node is one place in the structure (Lahore, Block A, Class 5A) at one level, under a node of the parent level.
 * - A beneficiary type says which level its beneficiaries live at and which framework sponsors them. Teachers can live at Branch
 *   and children at Class. Two types in one project should not share a framework, or a gift for one could land on the other (a warning is given).
 * - Beneficiaries are added in numbers to a node of the right level, as dummy numbered records for now (profile fields come later).
 * - Nothing is changed in place: every function returns a new value.
 */

import { slugify, type FrameworkTemplate } from "../02-project-rules/categories.js";
import { addOutcomes, capacityOf, fillOf, type Allocation, type Outcome } from "../05-outcomes/outcomes.js";
import type { Commitment } from "../04b-commitments/commitments.js";

export interface Level {
  id: string;
  name: string;
  parentId: string; // "" means directly under the project
}

export interface BeneficiaryType {
  id: string;
  name: string; // child, teacher, warden
  levelId: string; // where its beneficiaries live
  frameworkId: string; // how they are sponsored
}

export interface Project {
  id: string;
  name: string;
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
  const project: Project = { id: uniqueId(n, new Set(projects.map((p) => p.id))), name: n, aliases: aliases.map(clean).filter((a) => a !== ""), levels: [], types: [] };
  return { value: [...projects, project] };
}

// Rule: a gift's project name is matched to a project by its name or one of its aliases, ignoring capitals. No match means a general gift.
export function matchProject(projects: Project[], crmName: string): Project | undefined {
  const n = clean(crmName);
  if (n === "") return undefined;
  return projects.find((p) => same(p.name, n) || p.aliases.some((a) => same(a, n)));
}

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
  // Rule: a level has one child level, so the structure is a single chain (Branch, then Block, then Class). Branching levels can come later.
  if (p.levels.some((l) => l.parentId === parentId)) return { value: projects, error: parentId === "" ? "The first level is already there." : "That level already has a level under it." };
  const level: Level = { id: uniqueId(n, new Set(p.levels.map((l) => l.id))), name: n, parentId };
  return { value: withProject(projects, projectId, (x) => ({ ...x, levels: [...x.levels, level] })) };
}

// Rule: a level that is in use (it has places, a level under it, or a type living at it) cannot be removed.
export function removeLevel(projects: Project[], nodes: Node[], projectId: string, levelId: string): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: projects, error: "That project was not found." };
  if (p.levels.some((l) => l.parentId === levelId)) return { value: projects, error: "Remove the level under it first." };
  if (p.types.some((t) => t.levelId === levelId)) return { value: projects, error: "A type of beneficiary lives at this level. Remove or move it first." };
  if (nodes.some((nd) => nd.projectId === projectId && nd.levelId === levelId)) return { value: projects, error: "There are places at this level. Remove them first." };
  return { value: withProject(projects, projectId, (x) => ({ ...x, levels: x.levels.filter((l) => l.id !== levelId) })) };
}

// The levels in order, from the top of the structure to the bottom.
export function orderedLevels(p: Project): Level[] {
  const out: Level[] = [];
  let parent = "";
  for (let i = 0; i < p.levels.length; i++) {
    const next = p.levels.find((l) => l.parentId === parent);
    if (!next) break;
    out.push(next);
    parent = next.id;
  }
  return out;
}

// ---- Beneficiary types ----

export function addType(projects: Project[], projectId: string, t: { name: string; levelId: string; frameworkId: string }, fw: FrameworkTemplate[]): Changed<Project[]> {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { value: projects, error: "That project was not found." };
  const name = clean(t.name);
  if (name === "") return { value: projects, error: "Give the type a name, such as child or teacher." };
  if (p.types.some((x) => same(x.name, name))) return { value: projects, error: `There is already a type called "${name}".` };
  if (!p.levels.some((l) => l.id === t.levelId)) return { value: projects, error: "Choose the level its beneficiaries live at." };
  if (!fw.some((f) => f.id === t.frameworkId)) return { value: projects, error: "Choose how it is sponsored." };
  const clash = p.types.find((x) => x.frameworkId === t.frameworkId);
  const type: BeneficiaryType = { id: uniqueId(name, new Set(p.types.map((x) => x.id))), name, levelId: t.levelId, frameworkId: t.frameworkId };
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
  if (outcomes.some((o) => o.nodeId === nodeId)) return { value: nodes, error: "There are beneficiaries here. Remove them first." };
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

// Rule: add numbered beneficiaries of a type to a place of the level the type lives at. They take the type's framework.
export function addBeneficiaries(outcomes: Outcome[], projects: Project[], nodes: Node[], o: { projectId: string; nodeId: string; typeId: string; name: string; count: number }): Changed<Outcome[]> {
  const p = projects.find((x) => x.id === o.projectId);
  const type = p?.types.find((t) => t.id === o.typeId);
  const node = nodes.find((x) => x.id === o.nodeId && x.projectId === o.projectId);
  if (!p || !type) return { value: outcomes, error: "Choose a type of beneficiary." };
  if (!node) return { value: outcomes, error: "Choose the place to add them to." };
  if (node.levelId !== type.levelId) return { value: outcomes, error: `${type.name} beneficiaries live at the ${p.levels.find((l) => l.id === type.levelId)?.name ?? "level"} level, not ${p.levels.find((l) => l.id === node.levelId)?.name ?? "this one"}.` };
  const r = addOutcomes(outcomes, { name: o.name, count: o.count, type: type.name, cohort: node.name, frameworkId: type.frameworkId });
  if (r.error) return r;
  const added = r.value.slice(outcomes.length).map((x) => ({ ...x, projectId: o.projectId, nodeId: o.nodeId, typeId: o.typeId }));
  return { value: [...outcomes, ...added] };
}

// ---- Roll-up ----

export interface Rollup {
  places: number; // capacity in units, added up
  used: number;
  beneficiaries: number;
}

// Rule: each place adds up the capacity and use of every beneficiary in it and under it. A project adds up all of its places.
export function rollupOf(nodes: Node[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[]): { byNode: Map<string, Rollup>; byProject: Map<string, Rollup> } {
  const byNode = new Map<string, Rollup>();
  const byProject = new Map<string, Rollup>();
  const bump = (m: Map<string, Rollup>, key: string, cap: number, used: number) => {
    const r = m.get(key) ?? { places: 0, used: 0, beneficiaries: 0 };
    m.set(key, { places: r.places + cap, used: r.used + used, beneficiaries: r.beneficiaries + 1 });
  };
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  for (const o of outcomes) {
    if (!o.projectId || !o.nodeId || !o.active) continue;
    const f = fillOf(o, fw, allocations, commitments);
    bump(byProject, o.projectId, capacityOf(o, fw), f.used);
    for (let id = o.nodeId; id !== "" && parentOf.has(id); id = parentOf.get(id) as string) bump(byNode, id, capacityOf(o, fw), f.used);
  }
  return { byNode, byProject };
}
