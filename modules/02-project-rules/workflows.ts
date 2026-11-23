/**
 * workflows.ts
 *
 * What it does: workflows (DECISIONS 130). A workflow is what happens to a kind of gift from payment to donor report: what a payment buys, what the gift becomes
 * (its outcome type), when it is released, how it is assigned to a partner, how it is delivered, and the updates and report after. It is one thing to configure,
 * made from a framework template (how a gift counts, the report) and its outcome type (the profile, the source rule, the assignment). Each item has its own workflow.
 * A category is only a label for reporting. This module holds the pure parts: the tasks, the plain sentence, the six stages, the starter workflows and which workflow
 * suits an item by its name.
 * Who calls it: the Workflows page (app/workflows-page.ts) and the demo (app/main.ts). Depends on: categories.ts and outcome-types.ts. Pure: no database, no screen.
 *
 * Rules:
 * - A payment buys either a month of support (per period: sponsorships) or a share of one whole (a pump, a house). That decides whether a gift waits to be fully paid.
 * - A workflow has at most one outcome type, found through the type's frameworks. With none, the stages that need one say so.
 * - Tasks are configuration for now: they say what will be asked and when. Nothing creates them yet.
 * - Starting workflows are only added when missing, by id or by name, so nothing a person built is replaced.
 */

import type { Changed, Cycle, FrameworkTemplate, InstalmentRule, Setup, WorkflowTask } from "./categories.js";
import { CYCLE_LABELS, resolveFrameworkId } from "./categories.js";
import { typeForFramework, type OutcomeType } from "../05-outcomes/outcome-types.js";

export type { WorkflowTask };

export const STAGES: { n: number; title: string; hint: string }[] = [
  { n: 1, title: "Gift paid", hint: "What a payment buys" },
  { n: 2, title: "Outcome", hint: "What the gift becomes" },
  { n: 3, title: "Released", hint: "When it can go on" },
  { n: 4, title: "Assigned", hint: "To a partner" },
  { n: 5, title: "Delivering", hint: "The partner does the work" },
  { n: 6, title: "Updates and report", hint: "What the donor hears" },
];

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

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

// Rule: the workflow in one plain sentence, so it can be checked without reading the fields.
export function workflowSentence(fw: FrameworkTemplate, type: OutcomeType | undefined, itemNames: string[]): string {
  const items = itemNames.length ? (itemNames.length > 2 ? `${itemNames.slice(0, 2).join(", ")} and ${itemNames.length - 2} more` : itemNames.join(" and ")) : "no items yet";
  const mode = unitModeOf(fw);
  // Rule (DECISIONS 133): the sentence uses general terms (outcome, unit) and never the name of a kind of outcome, and says nothing about donors.
  const units = mode === undefined ? "How units are allocated to an outcome is not set yet."
    : mode === "once" ? "One unit is one whole outcome, released when it is fully paid."
    : fw.unitsPerBeneficiary === 1 ? "One unit is one whole outcome."
    : `One outcome is made of ${fw.unitsPerBeneficiary} units.`;
  const outcome = type ? `${type.source === "pick_existing" ? "It picks an existing" : "It creates a new"} ${lower(type.name)}${mode === "once" ? " once fully paid" : ""}, assigned to a partner ${type.assign === "auto" ? "automatically when the partner has capacity" : "by suggestion for a person to confirm"}.` : "It has no outcome type yet, so a gift cannot become an outcome.";
  const tasks = (fw.tasks ?? []).length ? ` ${plural((fw.tasks ?? []).length, "follow-up task")} ${(fw.tasks ?? []).length === 1 ? "is" : "are"} then due, and a ${fw.reportType ? lower(fw.reportType) : "report"} is sent.` : ` A ${fw.reportType ? lower(fw.reportType) : "report"} is sent.`;
  return `Items in this workflow (${items}) follow these rules. ${units} ${outcome}${tasks}`;
}

export interface StageChip { tone: "auto" | "wait" | "person" | "plain"; text: string }

// Rule: the short badges on each stage of the flow, worked out from the workflow and its outcome type.
export function stageChips(fw: FrameworkTemplate, type: OutcomeType | undefined): Record<number, StageChip[]> {
  const mode = unitModeOf(fw);
  const wait = mode === "once";
  const tasks = fw.tasks ?? [];
  return {
    1: mode ? [{ tone: "plain", text: mode === "once" ? "1 unit, released when fully paid" : fw.unitsPerBeneficiary === 1 ? "1 unit is 1 outcome" : `${fw.unitsPerBeneficiary} units make 1 outcome` }] : [{ tone: "wait", text: "Not set" }],
    2: [{ tone: type ? "auto" : "wait", text: type ? type.name : "No type yet" }, ...(type ? [{ tone: "plain" as const, text: type.source === "pick_existing" ? "Picks existing" : "Creates a draft" }] : [])],
    3: [{ tone: wait ? "wait" : "auto", text: wait ? "Waits for full payment" : "Released each month" }],
    4: [{ tone: type?.assign === "auto" ? "auto" : "person", text: type?.assign === "auto" ? "Automatic" : "Suggested" }],
    5: [{ tone: "person", text: "Partner works it" }, ...(type ? [{ tone: "plain" as const, text: `${type.fields.filter((f) => f.required).length} needed first` }] : [])],
    6: tasks.length ? tasks.slice(0, 3).map((t) => ({ tone: "wait" as const, text: t.label })) : [{ tone: "plain", text: fw.reportType || "A report" }, { tone: "plain", text: CYCLE_LABELS[fw.cycle] }],
  };
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
    { id: "activity", name: "Activity", prefix: "ACT", icon: "medical", source: "create_new", assign: "suggest", frameworkIds: [], fields: [f("place", "Place", "text", true, true), f("date", "Date", "date", false, true), f("people-reached", "People reached", "number", false, true), f("photos", "Photos", "photo", false, true)] },
  ];
}

const mkWorkflow = (s: Starter): FrameworkTemplate => ({
  id: s.id, name: s.name, unit: s.unit, cycle: s.cycle, reportType: s.report, instalment: s.rule, unitsPerBeneficiary: s.units,
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
