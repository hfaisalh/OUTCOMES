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
import { addOutcomes, autoAllocate, capacityOf, DEFAULT_BUFFER_MONTHS, fillOf, inBuffer, pickOutcome, takesCapacity, type AllocOptions, type Allocation, type Outcome, type Policy } from "../05-outcomes/outcomes.js";
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
  if (node.levelId !== type.levelId) return { value: outcomes, error: `${type.name} beneficiaries live at the ${p.levels.find((l) => l.id === type.levelId)?.name ?? "level"} level, not ${p.levels.find((l) => l.id === node.levelId)?.name ?? "this one"}. Choose a place at that level, or add one on the Structure tab.` };
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
export function rollupOf(nodes: Node[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], commitments: Commitment[], policy?: Policy): { byNode: Map<string, Rollup>; byProject: Map<string, Rollup> } {
  const byNode = new Map<string, Rollup>();
  const byProject = new Map<string, Rollup>();
  const bump = (m: Map<string, Rollup>, key: string, cap: number, used: number) => {
    const r = m.get(key) ?? { places: 0, used: 0, beneficiaries: 0 };
    m.set(key, { places: r.places + cap, used: r.used + used, beneficiaries: r.beneficiaries + 1 });
  };
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
  for (const o of outcomes) {
    if (!o.projectId || !o.nodeId || !o.active) continue;
    const f = fillOf(o, fw, allocations, commitments, policy);
    bump(byProject, o.projectId, capacityOf(o, fw), f.used);
    for (let id = o.nodeId; id !== "" && parentOf.has(id); id = parentOf.get(id) as string) bump(byNode, id, capacityOf(o, fw), f.used);
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

// The level a new place gets: the first level when it sits at the top of the project, otherwise the level under its parent's.
export function levelForNewNode(p: Project, nodes: Node[], parentId: string): string | undefined {
  const levels = orderedLevels(p);
  if (parentId === "") return levels[0]?.id;
  const parent = nodes.find((x) => x.id === parentId);
  const at = levels.findIndex((l) => l.id === parent?.levelId);
  return at >= 0 ? levels[at + 1]?.id : undefined;
}

export interface ProjectState {
  projects: Project[];
  nodes: Node[];
  outcomes: Outcome[];
  partnerTypes: string[]; // the organisation's own list of partner types
  partnerFields: string[]; // the organisation's own extra profile fields, by label
}

export const PROJECT_ACTIONS = ["toggle-crm-name", "save-partner", "add-partner-type", "add-partner-field", "remove-partner-field", "add-level", "remove-level", "add-type", "remove-type", "add-node", "remove-node", "set-field", "add-beneficiaries"];
export const MAX_RECORDS = 5000;

/**
 * Rule: one place where a request from the screen becomes a change, so the server and the demo behave the same. Returns nothing when the
 * action is not a project action. Text is cut to a sensible length, and the number of places or beneficiaries is capped.
 */
export function applyProjectAction(s: ProjectState, fw: FrameworkTemplate[], body: Record<string, unknown>, today = ""): { state: ProjectState; warning?: string; error?: string } | undefined {
  const action = typeof body["action"] === "string" ? body["action"] : "";
  if (!PROJECT_ACTIONS.includes(action)) return undefined;
  const str = (k: string, max = 100): string => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  const done = (state: ProjectState, warning?: string) => ({ state, ...(warning ? { warning } : {}) });
  const fail = (error: string) => ({ state: s, error });
  switch (action) {
    case "toggle-crm-name": {
      const r = setCrmName(s.projects, str("name", 200), str("projectId"), body["on"] === true);
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
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
    case "remove-level": {
      const r = removeLevel(s.projects, s.nodes, str("projectId"), str("levelId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "add-type": {
      const r = addType(s.projects, str("projectId"), { name: str("name", 60), levelId: str("levelId"), frameworkId: str("frameworkId") }, fw);
      return r.error ? fail(r.error) : done({ ...s, projects: r.value }, r.warning);
    }
    case "remove-type": {
      const r = removeType(s.projects, s.outcomes, str("projectId"), str("typeId"));
      return r.error ? fail(r.error) : done({ ...s, projects: r.value });
    }
    case "add-node": {
      const project = s.projects.find((p) => p.id === str("projectId"));
      const levelId = project ? levelForNewNode(project, s.nodes, str("parentId")) : undefined;
      if (!project || !levelId) return fail("There is no level for a place there. Add a level first.");
      const field = str("field", 60);
      const r = addNode(s.nodes, s.projects, project.id, levelId, str("parentId"), str("name"), field !== "" ? { [field]: str("fieldValue", 200) } : {});
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
      const r = addBeneficiaries(s.outcomes, s.projects, s.nodes, { projectId: str("projectId"), nodeId: str("nodeId"), typeId: str("typeId"), name: str("name"), count: Number(body["count"] ?? 1) });
      if (r.error) return fail(r.error);
      return r.value.length > MAX_RECORDS ? fail(`There can be at most ${MAX_RECORDS} beneficiaries.`) : done({ ...s, outcomes: r.value });
    }
  }
}

// The options automatic allocation needs from the setup: how long a plan that stops paying keeps its place, and how a gift's project name finds its project.
export const allocOptions = (projects: Project[], bufferMonths: number | undefined, today: string): AllocOptions => ({
  policy: { today, bufferMonths: bufferMonths ?? DEFAULT_BUFFER_MONTHS },
  projectIdsFor: (name) => matchProjects(projects, name).map((p) => p.id),
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
  inBuffer: number; // allocated commitments that are behind but still inside the buffer
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
  const holding = commitments.filter((c) => takesCapacity(c, fw, opts.policy));
  const placed = new Set(allocations.map((a) => a.commitmentKey));
  const waiting = holding.filter((c) => !placed.has(c.subscriptionId));
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
    const buffered = allocations.filter((a) => projectOfOutcome.get(a.outcomeId) === id && byId.has(a.commitmentKey) && opts.policy && inBuffer(byId.get(a.commitmentKey) as Commitment, opts.policy)).length;
    const waitingParts = waiting.filter((c) => id !== "" && (opts.projectIdsFor?.(c.projectName) ?? []).includes(id)).reduce((n, c) => n + c.partsPerInstalment, 0); // a gift directed to more than one partner counts for each
    return { projectId: id, name: id === "" ? "Not in a project" : (projects.find((p) => p.id === id)?.name ?? id), beneficiaries: mine.length, capacity, used, free: Math.max(capacity - used, 0), inBuffer: buffered, waitingParts };
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
  const c = commitments.find((x) => x.subscriptionId === commitmentKey);
  const node = nodes.find((x) => x.id === nodeId);
  if (!c) return { value: allocations, error: "That gift was not found." };
  if (!node) return { value: allocations, error: "That place was not found." };
  if (!takesCapacity(c, fw, policy)) return { value: allocations, error: "That gift no longer holds a place." };
  const under = placesUnder(nodes, nodeId);
  const candidates = outcomes.filter((o) => o.active && o.frameworkId === c.frameworkId && o.nodeId !== undefined && under.has(o.nodeId));
  const others = allocations.filter((a) => a.commitmentKey !== commitmentKey);
  const live = new Set(commitments.filter((x) => takesCapacity(x, fw, policy)).map((x) => x.subscriptionId));
  const used = new Map<string, number>();
  for (const a of others) if (live.has(a.commitmentKey)) used.set(a.outcomeId, (used.get(a.outcomeId) ?? 0) + a.parts);
  const target = pickOutcome(candidates, fw, used, c.partsPerInstalment);
  if (!target) return { value: allocations, error: `${node.name} has no room for ${c.partsPerInstalment} part${c.partsPerInstalment === 1 ? "" : "s"} of this kind.` };
  return { value: [...others, { commitmentKey, outcomeId: target.id, parts: c.partsPerInstalment, how: "manual", at }] };
}

// Where automatic allocation would put each waiting gift, shown as a suggestion. Nothing is changed.
export function suggestions(commitments: Commitment[], outcomes: Outcome[], fw: FrameworkTemplate[], allocations: Allocation[], opts: AllocOptions): Map<string, string> {
  const before = new Set(allocations.map((a) => a.commitmentKey));
  const r = autoAllocate(commitments, outcomes, fw, allocations, "", opts);
  return new Map(r.allocations.filter((a) => !before.has(a.commitmentKey)).map((a) => [a.commitmentKey, a.outcomeId]));
}

// ---- Matching the names the CRM uses to projects (DECISIONS 67) ----

export interface CrmName {
  name: string; // as the CRM spells it on the donation lines
  gifts: number; // how many gifts carry it
  projectIds: string[]; // the partners it goes to, none for general (any partner)
  suggestion: string; // a partner id that looks like the same thing, "" when none. Only for names not matched yet
}

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/**
 * Rule: the names the CRM uses on gifts, with how many gifts each has and where each goes now. Names are read from the work orders, so the
 * list is always real. A name that already matches a project (by its name or an alias) shows that project. For one that does not, a project
 * that shares a whole word with it is suggested (Aghosh with Aghosh Orphan Homes). A person decides: nothing is matched by itself.
 */
export function crmProjectNames(workOrders: { projectName?: string; status: string }[], projects: Project[]): CrmName[] {
  const count = new Map<string, number>();
  for (const w of workOrders) {
    const n = clean(w.projectName ?? "");
    if (n !== "" && w.status !== "excluded") count.set(n, (count.get(n) ?? 0) + 1);
  }
  return [...count.entries()].map(([name, gifts]): CrmName => {
    const matched = matchProjects(projects, name);
    const suggestion = matched.length > 0 ? "" : (projects.find((p) => words(p.name).some((w) => words(name).includes(w)))?.id ?? "");
    return { name, gifts, projectIds: matched.map((m) => m.id), suggestion };
  }).sort((a, b) => b.gifts - a.gifts || a.name.localeCompare(b.name));
}

// Rule (DECISIONS 68): turn one partner's answer to a CRM name on or off. A name can go to several partners, and to none (general).
export function setCrmName(projects: Project[], crmName: string, projectId: string, on: boolean): Changed<Project[]> {
  const name = clean(crmName);
  if (name === "") return { value: projects, error: "That name is empty." };
  if (!projects.some((p) => p.id === projectId)) return { value: projects, error: "That partner was not found." };
  const value = projects.map((p) => {
    if (p.id !== projectId) return p;
    const aliases = p.aliases.filter((x) => !same(x, name));
    // A partner already answers to its own name, so nothing is added for that.
    return on && !same(p.name, name) ? { ...p, aliases: [...aliases, name] } : { ...p, aliases };
  });
  return { value };
}

