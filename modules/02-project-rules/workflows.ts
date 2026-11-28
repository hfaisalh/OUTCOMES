/**
 * workflows.ts
 *
 * What it does: workflows (DECISIONS 130). A workflow is what happens to a kind of gift from payment to donor report: what a payment buys, what the gift becomes
 * (its outcome type), when it is released, how it is assigned to a partner, how it is delivered, and the updates and report after. It is one thing to configure,
 * made from a framework template (how a gift counts, the report) and its outcome type (the profile, the source rule, the assignment). Each item has its own workflow.
 * A category is only a label for reporting. This module holds the pure parts: the tasks, the plain sentence, the six stages, the starter workflows and which workflow
 * suits an item by its name.
 * Who calls it: the Workflows page (app/setup/workflows-page.ts) and the demo (app/main.ts). Depends on: categories.ts and outcome-types.ts. Pure: no database, no screen.
 *
 * Rules:
 * - A payment buys either a month of support (per period: sponsorships) or a share of one whole (a pump, a house). That decides whether a gift waits to be fully paid.
 * - A workflow has at most one outcome type, found through the type's frameworks. With none, the stages that need one say so.
 * - Tasks are configuration for now: they say what will be asked and when. Nothing creates them yet.
 * - Starting workflows are only added when missing, by id or by name, so nothing a person built is replaced.
 */

import type { Changed, Cycle, Fulfilled, FrameworkTemplate, ImplStage, InstalmentRule, Setup, WorkflowTask } from "./categories.js";
import { FULFILLED_LABELS, resolveFrameworkId } from "./categories.js";
import { typeForFramework, type OutcomeType } from "../05-outcomes/outcome-types.js";

export type { WorkflowTask };


// How a unit supports an outcome (DECISIONS 131). A unit is what a gift counts as, already set on the Gifts side, so this says nothing about instalments.
// share: several units together support one outcome (3 units support one orphan). whole: one unit supports one whole outcome, month by month. once: one unit funds one
// whole outcome once it is fully paid (a pump, a house).
export type UnitMode = "share" | "whole" | "once";

export const unitModeOf = (fw: FrameworkTemplate): UnitMode | undefined => (fw.instalment === undefined ? undefined : fw.instalment === "share_of_whole" ? "once" : fw.unitsPerBeneficiary > 1 ? "share" : "whole");

// Rule: the name of the outcome, from its outcome type (Orphan, Water pump), else the workflow's unit, else "outcome".
export const outcomeName = (fw: FrameworkTemplate, type: OutcomeType | undefined): string => (type ? type.name.toLowerCase() : fw.unit || "outcome");
const article = (word: string): string => (/^[aeiou]/i.test(word) ? "an" : "a");

// The three answers to "A unit supports", worded with the outcome's name.
export function unitModeLabels(name: string): Record<UnitMode, string> {
  return { share: `A share of ${article(name)} ${name}`, whole: `A whole ${name}`, once: `A whole ${name}, once paid in full` };
}

// Rule: choosing how a unit supports sets the workflow's rule and number: a share needs 2 or more units to make one outcome, the others are 1.
export function setUnitMode(frameworks: FrameworkTemplate[], id: string, mode: UnitMode, shares = 3): Edited {
  return editWf(frameworks, id, (f) => {
    if (mode === "share" && (!Number.isInteger(shares) || shares < 2 || shares > 100)) return "A share needs 2 to 100 units to make one outcome.";
    const units = mode === "share" ? shares : 1;
    return { ...f, instalment: mode === "once" ? "share_of_whole" : "per_period", unitsPerBeneficiary: units };
  });
}

// Rule (DECISIONS 132): the unit rule is a number and a tick. The number is how many units make one outcome (1 is complete, 2 or more is split between donors).
// The tick holds the outcome back until it is fully paid, and then the outcome is one whole unit.
export function setUnitRule(frameworks: FrameworkTemplate[], id: string, units: number, fullyPaid: boolean): Edited {
  return editWf(frameworks, id, (f) => {
    if (!Number.isInteger(units) || units < 1 || units > 100) return "Units in one outcome are a whole number from 1 to 100.";
    return { ...f, instalment: fullyPaid ? "share_of_whole" : "per_period", unitsPerBeneficiary: fullyPaid ? 1 : units };
  });
}


// ---- Tasks ----
const taskId = (label: string, taken: string[]): string => {
  const root = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
  let id = root;
  for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`;
  return id;
};

export type Edited = { frameworks: FrameworkTemplate[] } | { error: string };
const editWf = (frameworks: FrameworkTemplate[], id: string, change: (f: FrameworkTemplate) => FrameworkTemplate | string): Edited => {
  const f = frameworks.find((x) => x.id === id);
  if (!f) return { error: "That workflow was not found." };
  const next = change(f);
  return typeof next === "string" ? { error: next } : { frameworks: frameworks.map((x) => (x.id === id ? next : x)) };
};

export const addTask = (frameworks: FrameworkTemplate[], id: string, label: string, afterMonths: number, photo: boolean): Edited =>
  editWf(frameworks, id, (f) => {
    const l = label.trim();
    if (l.length < 2) return "Give the task a name.";
    if (!Number.isInteger(afterMonths) || afterMonths < 0 || afterMonths > 120) return "The months are a whole number from 0 to 120.";
    if ((f.tasks ?? []).length >= 30) return "A workflow has at most 30 tasks.";
    return { ...f, tasks: [...(f.tasks ?? []), { id: taskId(l, (f.tasks ?? []).map((t) => t.id)), label: l.slice(0, 80), afterMonths, photo }].sort((a, b) => a.afterMonths - b.afterMonths) };
  });

export const setTask = (frameworks: FrameworkTemplate[], id: string, tid: string, patch: Partial<Pick<WorkflowTask, "label" | "afterMonths" | "photo">>): Edited =>
  editWf(frameworks, id, (f) => {
    if (!(f.tasks ?? []).some((t) => t.id === tid)) return "That task was not found.";
    if (patch.label !== undefined && patch.label.trim().length < 2) return "Give the task a name.";
    if (patch.afterMonths !== undefined && (!Number.isInteger(patch.afterMonths) || patch.afterMonths < 0 || patch.afterMonths > 120)) return "The months are a whole number from 0 to 120.";
    return { ...f, tasks: (f.tasks ?? []).map((t) => (t.id === tid ? { ...t, ...(patch.label !== undefined ? { label: patch.label.trim().slice(0, 80) } : {}), ...(patch.afterMonths !== undefined ? { afterMonths: patch.afterMonths } : {}), ...(patch.photo !== undefined ? { photo: patch.photo } : {}) } : t)).sort((a, b) => a.afterMonths - b.afterMonths) };
  });

export const removeTask = (frameworks: FrameworkTemplate[], id: string, tid: string): Edited =>
  editWf(frameworks, id, (f) => {
    const left = (f.tasks ?? []).filter((t) => t.id !== tid);
    const { tasks: _t, ...rest } = f;
    return left.length ? { ...f, tasks: left } : rest;
  });

// ---- The reporting loop of a living gift (DECISIONS 317) ----
// Rule: a living workflow (a unit is one period, a sponsorship) repeats its report on its cycle for as long as payments keep coming. After each report the gift goes back to the report step for the next round. It leaves the loop, and goes on to feedback, only when the gift stops (cancelled, paused or completed) or the term of its plan has ended. A workflow whose cycle is "on delivery" does not loop, and neither does one that releases only when fully paid.
// Returns the cycle the report repeats on, or null when the workflow does not loop.
export function reportLoopOf(fw: FrameworkTemplate): Cycle | null {
  return unitModeOf(fw) !== "once" && fw.instalment !== undefined && fw.cycle !== "on_delivery" ? fw.cycle : null;
}
// Switching the loop on gives the report a monthly cycle when it had none; switching it off takes the report back to once, on delivery.
export const setReportLoop = (frameworks: FrameworkTemplate[], id: string, on: boolean): Edited => editWf(frameworks, id, (f) => ({ ...f, cycle: on ? (f.cycle === "on_delivery" ? "monthly" : f.cycle) : "on_delivery" }));

// ---- Fulfilled when (DECISIONS 316) ----
// Rule: the stage at which a gift counts as fulfilled, for the Dashboard and the time to fulfil: the workflow's own setting, else allocated for a unit that is one period (a sponsorship is fulfilled once a beneficiary is funded, and the workflow carries on with its reports), else complete (a build).
export const fulfilledOf = (fw: FrameworkTemplate | undefined): Fulfilled => fw?.fulfilled ?? (fw?.instalment === "per_period" ? "allocated" : "complete");
export const setFulfilled = (frameworks: FrameworkTemplate[], id: string, fulfilled: string): Edited => (fulfilled in FULFILLED_LABELS ? editWf(frameworks, id, (f) => ({ ...f, fulfilled: fulfilled as Fulfilled })) : { error: "That stage is not known." } as Edited);

// ---- Assigned for implementation (DECISIONS 137) ----
// Rule: how a released work order is handed to a partner: the workflow's own setting, else the outcome type's old setting, else suggested to a person.
export const assignOf = (fw: FrameworkTemplate, type: OutcomeType | undefined): "auto" | "suggest" => fw.assign ?? type?.assign ?? "suggest";

// Rule (DECISIONS 138): three yes or no decisions, each yes unless a person turns it off. A person may reassign a work order from one partner to another. An urgent gift jumps to
// high priority. MWF approves a report before the donor sees the data (until then the donor only hears that a phase changed).
export type WorkflowFlag = "reassign" | "urgent" | "approve" | "feedback";
export const flagOf = (fw: FrameworkTemplate, flag: WorkflowFlag): boolean => fw[flag] ?? true;
export const setFlag = (frameworks: FrameworkTemplate[], id: string, flag: WorkflowFlag, on: boolean): Edited => editWf(frameworks, id, (f) => ({ ...f, [flag]: on }));

// Rule (DECISIONS 139): the partner confirms an assigned batch (approves or rejects it) within so many days, 0 to 60, 3 unless set. A rejected batch goes back to assignment.
export const confirmDaysOf = (fw: FrameworkTemplate): number => fw.confirmDays ?? 3;
export const setConfirm = (frameworks: FrameworkTemplate[], id: string, patch: { days?: number; tell?: string }): Edited =>
  editWf(frameworks, id, (f) => {
    if (patch.days !== undefined && (!Number.isInteger(patch.days) || patch.days < 0 || patch.days > 60)) return "The days to confirm are a whole number from 0 to 60.";
    return { ...f, ...(patch.days !== undefined ? { confirmDays: patch.days } : {}), ...(patch.tell !== undefined ? { confirmTell: patch.tell.slice(0, 200) } : {}) };
  });

export const setAssign = (frameworks: FrameworkTemplate[], id: string, assign: "auto" | "suggest"): Edited => editWf(frameworks, id, (f) => ({ ...f, assign }));

const stageId = (label: string, taken: string[]): string => taskId(label, taken);
const asNeeds = (text: string): string[] => text.split(/[,\n]/).map((x) => x.trim().slice(0, 60)).filter((x) => x !== "").slice(0, 20);

// Rule: an implementation stage has a name and a number of days allowed (0 to 365), counted from the stage before. At most 20 stages.
export const addStage = (frameworks: FrameworkTemplate[], id: string, label: string, days: number): Edited =>
  editWf(frameworks, id, (f) => {
    const l = label.trim();
    if (l.length < 2) return "Give the stage a name.";
    if (!Number.isInteger(days) || days < 0 || days > 365) return "The days are a whole number from 0 to 365.";
    if ((f.stages ?? []).length >= 20) return "A workflow has at most 20 implementation stages.";
    const stage: ImplStage = { id: stageId(l, (f.stages ?? []).map((x) => x.id)), label: l.slice(0, 60), days, needs: [], photo: false, canPause: true, tell: "" };
    return { ...f, stages: [...(f.stages ?? []), stage] };
  });

export const setStage = (frameworks: FrameworkTemplate[], id: string, sid: string, patch: { label?: string; days?: number; needs?: string; photo?: boolean; canPause?: boolean; tell?: string }): Edited =>
  editWf(frameworks, id, (f) => {
    const cur = (f.stages ?? []).find((x) => x.id === sid);
    if (!cur) return "That stage was not found.";
    if (patch.label !== undefined && patch.label.trim().length < 2) return "Give the stage a name.";
    if (patch.days !== undefined && (!Number.isInteger(patch.days) || patch.days < 0 || patch.days > 365)) return "The days are a whole number from 0 to 365.";
    const next: ImplStage = { ...cur, ...(patch.label !== undefined ? { label: patch.label.trim().slice(0, 60) } : {}), ...(patch.days !== undefined ? { days: patch.days } : {}), ...(patch.needs !== undefined ? { needs: asNeeds(patch.needs) } : {}), ...(patch.photo !== undefined ? { photo: patch.photo } : {}), ...(patch.canPause !== undefined ? { canPause: patch.canPause } : {}), ...(patch.tell !== undefined ? { tell: patch.tell.slice(0, 200) } : {}) };
    return { ...f, stages: (f.stages ?? []).map((x) => (x.id === sid ? next : x)) };
  });

export const removeStage = (frameworks: FrameworkTemplate[], id: string, sid: string): Edited =>
  editWf(frameworks, id, (f) => {
    const left = (f.stages ?? []).filter((x) => x.id !== sid);
    const { stages: _s, ...rest } = f;
    return left.length ? { ...f, stages: left } : rest;
  });

// Rule: a stage moves one place up (-1) or down (1). The first cannot go up and the last cannot go down.
export const moveStage = (frameworks: FrameworkTemplate[], id: string, sid: string, by: -1 | 1): Edited =>
  editWf(frameworks, id, (f) => {
    const list = [...(f.stages ?? [])];
    const i = list.findIndex((x) => x.id === sid);
    if (i < 0) return "That stage was not found.";
    const j = i + by;
    if (j < 0 || j >= list.length) return { ...f };
    [list[i], list[j]] = [list[j] as ImplStage, list[i] as ImplStage];
    return { ...f, stages: list };
  });

// The days a whole implementation is allowed: the stages added up.
export const totalDays = (fw: FrameworkTemplate): number => (fw.stages ?? []).reduce((n, x) => n + x.days, 0);

// ---- Starting workflows ----
interface Starter { id: string; name: string; unit: string; units: number; rule: InstalmentRule; cycle: Cycle; report: string; typeId: string; tasks: [string, number, boolean][]; words: RegExp }

const STARTERS: Starter[] = [
  { id: "orphan-sponsorship", name: "Orphan sponsorship", unit: "orphan", units: 3, rule: "per_period", cycle: "quarterly", report: "Quarterly orphan update", typeId: "orphan", tasks: [["3 month basic check", 3, false], ["6 month progress update with photo", 6, true]], words: /orphan sponsor/i },
  { id: "student-sponsorship", name: "Student sponsorship", unit: "student", units: 1, rule: "per_period", cycle: "quarterly", report: "Quarterly student update", typeId: "student", tasks: [["3 month basic check", 3, false], ["6 month progress update with photo", 6, true]], words: /hifz|aalim|alim|scholarship|school|uni(versity)?\b|student|education scholar/i },
  { id: "water-pump", name: "Water pump", unit: "pump", units: 1, rule: "share_of_whole", cycle: "on_delivery", report: "Handover report", typeId: "water-pump", tasks: [["Site visit", 0, false], ["Installation update with GPS and photos", 1, true], ["Handover report", 3, true]], words: /pump|well|tanker|water/i },
  { id: "house-build", name: "House build", unit: "house", units: 1, rule: "share_of_whole", cycle: "on_delivery", report: "Completion report", typeId: "house", tasks: [["Plot survey", 0, true], ["Build progress", 3, true], ["Completion report", 6, true]], words: /build a home|build for|house|shelter|rebuild/i },
  { id: "livelihood-start", name: "Livelihood", unit: "livelihood", units: 1, rule: "share_of_whole", cycle: "half_yearly", report: "Livelihood update", typeId: "livelihood", tasks: [["Beneficiary check", 0, false], ["Handover", 1, true], ["3 month follow up", 3, true]], words: /rickshaw|rikshaw|start ?up|trade|livelihood|cart/i },
  { id: "activity", name: "Activity", unit: "activity", units: 1, rule: "share_of_whole", cycle: "on_delivery", report: "Activity report", typeId: "activity", tasks: [["Delivery report with photos", 0, true]], words: /medical|camp|activity|event|iftar|meal/i },
];

// The outcome types the starting workflows need beyond the two that exist (Orphan and Water pump). Fields are plain examples a person can change.
export function extraStarterTypes(): OutcomeType[] {
  const f = (id: string, label: string, kind: OutcomeType["fields"][number]["kind"], required = false, inReport = false) => ({ id, label, kind, required, inReport });
  return [
    { id: "student", name: "Student", prefix: "STU", icon: "student", source: "pick_existing", assign: "auto", frameworkIds: [], fields: [f("full-name", "Full name", "text", true, true), f("date-of-birth", "Date of birth", "date", true, true), f("institute", "Institute or school", "text", false, true), f("course", "Course or level", "text", false, true), f("photo", "Photo", "photo", false, true)] },
    { id: "house", name: "House", prefix: "HSE", icon: "house", source: "create_new", assign: "suggest", frameworkIds: [], fields: [f("location", "Location", "text", true, true), f("gps-location", "GPS location", "gps", false, true), f("family-name", "Family name", "text", false, true), f("photos", "Photos", "photo", false, true), f("notes", "Notes", "longtext")] },
    { id: "livelihood", name: "Livelihood", prefix: "LVH", icon: "rickshaw", source: "create_new", assign: "suggest", frameworkIds: [], fields: [f("beneficiary-name", "Beneficiary name", "text", true, true), f("location", "Location", "text", false, true), f("what-was-given", "What was given", "text", false, true), f("photos", "Photos", "photo", false, true)] },
    { id: "activity", name: "Activity", prefix: "ACT", icon: "medical", source: "create_new", assign: "suggest", frameworkIds: [], fields: [f("place", "Location", "text", true, true), f("date", "Date", "date", false, true), f("people-reached", "People reached", "number", false, true), f("photos", "Photos", "photo", false, true)] },
  ];
}

// The icon each starting workflow begins with. Any workflow can be given another.
const STARTER_ICONS: Record<string, string> = { "orphan-sponsorship": "orphan", "student-sponsorship": "student", "water-pump": "pump", "house-build": "house", "livelihood-start": "rickshaw", activity: "medical" };
// The implementation stages a starting workflow begins with. A person changes them to match how the partners work.
const startStages = (): ImplStage[] => [
  { id: "basic-details", label: "Basic details", days: 7, needs: [], photo: false, canPause: true, tell: "Your gift has been allocated to an outcome." },
  { id: "in-delivery", label: "In delivery", days: 30, needs: ["Location", "Beneficiaries"], photo: false, canPause: true, tell: "Your gift is being delivered." },
  { id: "delivered", label: "Delivered", days: 14, needs: [], photo: true, canPause: false, tell: "Your gift has been delivered. The report follows once it is approved." },
];
const mkWorkflow = (s: Starter): FrameworkTemplate => ({
  confirmTell: "Your gift has been accepted by a partner.", assign: s.typeId === "orphan" || s.typeId === "student" ? "auto" : "suggest", stages: startStages(),
  id: s.id, ...(STARTER_ICONS[s.id] ? { icon: STARTER_ICONS[s.id] } : {}), name: s.name, unit: s.unit, cycle: s.cycle, reportType: s.report, instalment: s.rule, unitsPerBeneficiary: s.units,
  tasks: s.tasks.reduce<WorkflowTask[]>((all, [label, afterMonths, photo]) => [...all, { id: taskId(label, all.map((t) => t.id)), label, afterMonths, photo }], []),
});

/**
 * Rule: adds the starting workflows (Orphan sponsorship, Student sponsorship, Water pump, House build, Livelihood, Activity) and the outcome types they need, linking each
 * type to its workflow. A workflow or type is skipped when one with its id or name is already there, so nothing built by hand is replaced. Returns what was added.
 */
export function addStarterWorkflows(frameworks: FrameworkTemplate[], types: OutcomeType[]): { frameworks: FrameworkTemplate[]; types: OutcomeType[]; added: string[] } {
  let fws = [...frameworks];
  let ts = [...types];
  const added: string[] = [];
  const allTypes = [...ts, ...extraStarterTypes().filter((x) => !ts.some((t) => t.id === x.id || t.name.toLowerCase() === x.name.toLowerCase()))];
  ts = allTypes;
  for (const s of STARTERS) {
    if (fws.some((f) => f.id === s.id || f.name.toLowerCase() === s.name.toLowerCase())) continue;
    fws = [...fws, mkWorkflow(s)];
    added.push(s.name);
    ts = ts.map((t) => ({ ...t, frameworkIds: t.id === s.typeId ? [...new Set([...t.frameworkIds.filter((x) => x !== s.id), s.id])] : t.frameworkIds.filter((x) => x !== s.id) }));
  }
  return { frameworks: fws, types: ts, added };
}

/**
 * Rule: the workflow that suits an item by its name, among the workflows that exist. Only the starting workflows are suggested for, by their ids, so a person's own
 * workflows are never guessed. Blank when none fits.
 */
export function suggestWorkflowFor(itemName: string, existingIds: string[]): string {
  for (const s of STARTERS) if (existingIds.includes(s.id) && s.words.test(itemName)) return s.id;
  return "";
}

export const outcomeTypeOf = (types: OutcomeType[], frameworkId: string): OutcomeType | undefined => typeForFramework(types, frameworkId);

/**
 * Rule: after the starting workflows were added to the setup, add the outcome types they need and link each to its workflow. Only a workflow that exists is linked, and
 * a type that is already linked to another workflow is left alone, so a person's links are never changed. Returns the types.
 */
export function linkStarterTypes(types: OutcomeType[], frameworkIds: string[]): OutcomeType[] {
  let ts = [...types, ...extraStarterTypes().filter((x) => !types.some((t) => t.id === x.id || t.name.toLowerCase() === x.name.toLowerCase()))];
  for (const s of STARTERS) {
    if (!frameworkIds.includes(s.id) || ts.some((t) => t.frameworkIds.includes(s.id))) continue;
    ts = ts.map((t) => (t.id === s.typeId && t.frameworkIds.length === 0 ? { ...t, frameworkIds: [s.id] } : t));
  }
  return ts;
}

// ---- Items in workflows (DECISIONS 131) ----
// Each workflow has an automatic category behind the scenes (`wf-` and its id), so routing keeps working while categories are hidden. A person never sees it.
const autoCategoryId = (workflowId: string): string => `wf-${workflowId}`;

/**
 * Rule: put an item in a workflow. An item is in one workflow only, so this replaces any earlier one. The workflow must exist. Returns the setup.
 */
export function assignToWorkflow(s: Setup, itemId: string, workflowId: string): Changed<Setup> {
  const wf = s.frameworks.find((f) => f.id === workflowId);
  if (!wf) return { value: s, error: "That workflow was not found." };
  const catId = autoCategoryId(workflowId);
  const categories = s.categories.some((c) => c.id === catId) ? s.categories.map((c) => (c.id === catId ? { ...c, name: wf.name, frameworkId: workflowId } : c)) : [...s.categories, { id: catId, name: wf.name, keywords: [], frameworkId: workflowId }];
  return { value: { ...s, categories, itemMap: { ...s.itemMap, [itemId]: catId }, itemFramework: { ...s.itemFramework, [itemId]: workflowId } } };
}

// Rule: take an item out of its workflow, so it is unassigned again and its gifts are unrouted.
export function unassignItem(s: Setup, itemId: string): Setup {
  const { [itemId]: _m, ...itemMap } = s.itemMap;
  const { [itemId]: _f, ...itemFramework } = s.itemFramework;
  return { ...s, itemMap, itemFramework };
}

// The items a workflow holds, by item id: its own, or through a category that gives it.
export function itemsInWorkflow(s: Setup, workflowId: string): string[] {
  const ids = new Set([...Object.keys(s.itemMap), ...Object.keys(s.itemFramework)]);
  return [...ids].filter((id) => resolveFrameworkId(s, id) === workflowId);
}

/**
 * Rule: a workflow with items in it cannot be removed (drag them out first). Removing one takes its automatic category with it, and any category that pointed to it
 * is left with no default workflow.
 */
export function removeWorkflow(s: Setup, id: string): Changed<Setup> {
  const n = itemsInWorkflow(s, id).length;
  if (n > 0) return { value: s, error: `${n} item${n === 1 ? " is" : "s are"} in this workflow. Drag ${n === 1 ? "it" : "them"} out first, to Unassigned or to another workflow.` };
  return { value: { ...s, frameworks: s.frameworks.filter((f) => f.id !== id), categories: s.categories.filter((c) => c.id !== autoCategoryId(id)).map((c) => (c.frameworkId === id ? { ...c, frameworkId: "" } : c)) } };
}

/**
 * Rule (DECISIONS 188): merge one workflow into another. Two workflows that follow the same flow and differ only in how many units make one beneficiary (Sponsorship: shared parts is 3, Sponsorship: whole is 1) do not need to
 * be two. Every item in `fromId` moves to `intoId`. An item whose workflow gave a different number of units keeps that number as its own (itemUnits), so nothing about its gifts changes. Then the emptied workflow is
 * removed. Returns the new setup, the item numbers to keep, and how many items moved.
 */
export function mergeWorkflow(s: Setup, itemUnits: Record<string, number>, fromId: string, intoId: string): { value: { setup: Setup; itemUnits: Record<string, number>; moved: number }; error?: string } {
  const empty = { setup: s, itemUnits, moved: 0 };
  const from = s.frameworks.find((f) => f.id === fromId);
  const into = s.frameworks.find((f) => f.id === intoId);
  if (!from || !into) return { value: empty, error: "That workflow was not found." };
  if (fromId === intoId) return { value: empty, error: "Choose a different workflow to merge into." };
  let setup = s;
  const units = { ...itemUnits };
  const items = itemsInWorkflow(s, fromId);
  for (const id of items) {
    const r = assignToWorkflow(setup, id, intoId);
    if (r.error) return { value: empty, error: r.error };
    setup = r.value;
    if (from.unitsPerBeneficiary !== into.unitsPerBeneficiary && units[id] === undefined) units[id] = from.unitsPerBeneficiary; // keep what the old workflow gave it
  }
  const removed = removeWorkflow(setup, fromId);
  if (removed.error) return { value: empty, error: removed.error };
  return { value: { setup: removed.value, itemUnits: units, moved: items.length } };
}
