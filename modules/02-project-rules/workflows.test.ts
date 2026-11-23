/**
 * workflows.test.ts
 *
 * What it does: tests workflows (DECISIONS 130): the plain sentence, the stage badges, the tasks, the starting workflows and which one suits an item, using the item
 * names of the real catalogue. Invented data otherwise. These tests double as examples. Who calls it: vitest. Depends on: workflows.ts, categories.ts and outcome-types.ts.
 */

import { describe, expect, it } from "vitest";
import { isFrameworkTemplate, type FrameworkTemplate } from "./categories";
import { starterOutcomeTypes } from "../05-outcomes/outcome-types";
import { assignToWorkflow, itemsInWorkflow, removeWorkflow, setUnitMode, setUnitRule, unassignItem, unitModeLabels, outcomeName, addStarterWorkflows, addTask, removeTask, setTask, stageChips, STAGES, suggestWorkflowFor, unitJourney } from "./workflows";

const fw = (over: Partial<FrameworkTemplate> = {}): FrameworkTemplate => ({ id: "w", name: "Orphan sponsorship", unit: "orphan", cycle: "quarterly", reportType: "Quarterly orphan update", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
const ok = (r: { frameworks: FrameworkTemplate[] } | { error: string }): FrameworkTemplate[] => { if ("error" in r) throw new Error(r.error); return r.frameworks; };

describe("the unit's journey (DECISIONS 135)", () => {
  const types = starterOutcomeTypes();
  const texts = (f: FrameworkTemplate, t?: (typeof types)[number]) => unitJourney(f, t).map((x) => x.text);
  it("follows one unit through the steps, and says which steps a rule decides", () => {
    const j = unitJourney(fw({ tasks: [{ id: "a", label: "3 month check", afterMonths: 3, photo: false }, { id: "b", label: "6 month update", afterMonths: 6, photo: true }] }), { ...types[0]!, frameworkIds: ["w"] });
    expect(j.map((x) => x.key)).toEqual(["gift", "split", "hold", "outcome", "assign", "deliver", "report"]);
    expect(j.filter((x) => x.rule).map((x) => x.key)).toEqual(["split", "hold", "assign", "report"]);
    expect(j[1]?.text).toBe("Gift split into units, 3 make 1 outcome");
    expect(j[2]?.text).toBe("Released as each payment arrives");
    expect(j[6]?.text).toBe("2 tasks, then quarterly orphan update");
  });
  it("changes with the rules: a whole outcome, held until fully paid, assigned automatically or by suggestion", () => {
    const pump = texts(fw({ unitsPerBeneficiary: 1, instalment: "share_of_whole" }), { ...types[1]!, frameworkIds: ["w"] });
    expect(pump[1]).toBe("1 unit is 1 outcome");
    expect(pump[2]).toBe("Held until fully paid");
    expect(pump[4]).toBe("Assigned to a partner by suggestion");
    expect(texts(fw(), { ...types[0]!, frameworkIds: ["w"] })[4]).toBe("Assigned to a partner automatically");
    expect(texts(fw({ instalment: undefined }))[1]).toBe("Units not set");
  });
  it("never names a kind of outcome or a donor", () => {
    const all = texts(fw({ unit: "pump" }), { ...types[1]!, frameworkIds: ["w"] }).join(" ");
    expect(all).not.toMatch(/pump|donor/i);
  });
});

describe("the stages", () => {
  it("has six stages, and badges that follow the workflow", () => {
    expect(STAGES.map((s) => s.title)).toEqual(["Gift paid", "Outcome", "Released", "Assigned", "Delivering", "Updates and report"]);
    const type = { ...starterOutcomeTypes()[1]!, frameworkIds: ["w"] };
    const chips = stageChips(fw({ instalment: "share_of_whole", unitsPerBeneficiary: 1, unit: "pump" }), type);
    expect(chips[1]?.map((c) => c.text)).toEqual(["1 unit, released when fully paid"]);
    expect(chips[2]?.map((c) => c.text)).toEqual(["Water pump", "Creates a draft"]);
    expect(chips[3]).toEqual([{ tone: "wait", text: "Waits for full payment" }]);
    expect(chips[4]).toEqual([{ tone: "person", text: "Suggested" }]);
    expect(chips[5]?.[1]?.text).toBe("1 needed first");
    expect(stageChips(fw(), undefined)[2]).toEqual([{ tone: "wait", text: "No type yet" }]);
    expect(stageChips(fw(), undefined)[3]).toEqual([{ tone: "auto", text: "Released each month" }]);
  });
});

describe("tasks", () => {
  it("adds, changes and removes tasks, in the order they are due", () => {
    let f = [fw()];
    f = ok(addTask(f, "w", "6 month update with photo", 6, true));
    f = ok(addTask(f, "w", "3 month check", 3, false));
    expect(f[0]?.tasks?.map((t) => t.id)).toEqual(["3-month-check", "6-month-update-with-photo"]);
    f = ok(setTask(f, "w", "3-month-check", { afterMonths: 9, photo: true }));
    expect(f[0]?.tasks?.map((t) => t.afterMonths)).toEqual([6, 9]);
    f = ok(removeTask(f, "w", "6-month-update-with-photo"));
    f = ok(removeTask(f, "w", "3-month-check"));
    expect(f[0]?.tasks).toBeUndefined();
    expect(addTask([fw()], "w", " ", 3, false)).toHaveProperty("error");
    expect(addTask([fw()], "w", "Check", -1, false)).toHaveProperty("error");
    expect(addTask([fw()], "nope", "Check", 1, false)).toHaveProperty("error");
    expect(setTask([fw()], "w", "none", { label: "x" })).toHaveProperty("error");
  });
  it("is accepted by the setup check, and refuses a task that is not valid", () => {
    expect(isFrameworkTemplate(fw({ tasks: [{ id: "a", label: "Check", afterMonths: 3, photo: false }] }))).toBe(true);
    expect(isFrameworkTemplate(fw({ tasks: [{ id: "a", label: "Check", afterMonths: -1, photo: false }] }))).toBe(false);
    expect(isFrameworkTemplate({ ...fw(), tasks: "no" })).toBe(false);
  });
});

describe("the starting workflows", () => {
  it("adds the six workflows with their outcome types and tasks, linking each type", () => {
    const r = addStarterWorkflows([], starterOutcomeTypes());
    expect(r.added).toEqual(["Orphan sponsorship", "Student sponsorship", "Water pump", "House build", "Livelihood", "Activity"]);
    expect(r.frameworks.find((f) => f.id === "water-pump")).toMatchObject({ instalment: "share_of_whole", unit: "pump" });
    expect(r.frameworks.find((f) => f.id === "orphan-sponsorship")?.tasks?.map((t) => t.label)).toEqual(["3 month basic check", "6 month progress update with photo"]);
    expect(r.types.map((t) => t.id)).toEqual(["orphan", "water-pump", "student", "house", "livelihood", "activity"]);
    expect(r.types.find((t) => t.id === "water-pump")?.frameworkIds).toEqual(["water-pump"]);
    expect(r.types.find((t) => t.id === "orphan")?.frameworkIds).toEqual(["orphan-sponsorship"]);
    expect(new Set(r.types.map((t) => t.prefix)).size).toBe(r.types.length); // every prefix is its own
    expect(r.frameworks.every(isFrameworkTemplate)).toBe(true);
  });
  it("never replaces what is there: a workflow with the same id or name is kept, and adding twice adds nothing", () => {
    const mine = [fw({ id: "mine", name: "Water pump", unit: "borehole" })];
    const r = addStarterWorkflows(mine, starterOutcomeTypes());
    expect(r.added).not.toContain("Water pump");
    expect(r.frameworks.find((f) => f.name === "Water pump")?.unit).toBe("borehole");
    const again = addStarterWorkflows(r.frameworks, r.types);
    expect(again.added).toEqual([]);
    expect(again.frameworks).toHaveLength(r.frameworks.length);
  });
});

describe("which workflow suits an item", () => {
  const ids = addStarterWorkflows([], starterOutcomeTypes()).frameworks.map((f) => f.id);
  it("suggests by the item's name, using the real catalogue names", () => {
    const pick = (n: string) => suggestWorkflowFor(n, ids);
    expect(pick("Orphan Sponsorship")).toBe("orphan-sponsorship");
    for (const n of ["Hifz Scholarship: Day Student", "Aalim Scholarship", "School Scholarship", "Uni Scholarship"]) expect(pick(n)).toBe("student-sponsorship");
    for (const n of ["Small Pump", "Large Pump", "Deep Solar Well", "Water Tanker"]) expect(pick(n)).toBe("water-pump");
    for (const n of ["Build A Home", "Build for Education"]) expect(pick(n)).toBe("house-build");
    for (const n of ["Rickshaw", "Trade Startup", "Family Startup"]) expect(pick(n)).toBe("livelihood-start");
    expect(pick("Medical Camp (One Day)")).toBe("activity");
    expect(pick("Orphan Care Home")).toBe(""); // no starting workflow fits, so nothing is guessed
  });
  it("only suggests workflows that exist", () => {
    expect(suggestWorkflowFor("Small Pump", ["orphan-sponsorship"])).toBe("");
  });
});

describe("items in workflows (DECISIONS 131)", () => {
  const base = () => ({ categories: [], itemMap: {}, frameworks: [fw({ id: "a", name: "A" }), fw({ id: "b", name: "B" })], itemFramework: {} });
  it("puts an item in one workflow only, and moving it takes it out of the first", () => {
    const one = assignToWorkflow(base(), "i1", "a").value;
    expect(itemsInWorkflow(one, "a")).toEqual(["i1"]);
    const moved = assignToWorkflow(one, "i1", "b").value;
    expect(itemsInWorkflow(moved, "a")).toEqual([]);
    expect(itemsInWorkflow(moved, "b")).toEqual(["i1"]);
    expect(assignToWorkflow(base(), "i1", "nope").error).toBeDefined();
  });
  it("unassigns an item, and refuses to remove a workflow that still holds items", () => {
    const s = assignToWorkflow(base(), "i1", "a").value;
    expect(removeWorkflow(s, "a").error).toContain("1 item is in this workflow");
    const empty = unassignItem(s, "i1");
    expect(itemsInWorkflow(empty, "a")).toEqual([]);
    const gone = removeWorkflow(empty, "a");
    expect(gone.error).toBeUndefined();
    expect(gone.value.frameworks.map((f) => f.id)).toEqual(["b"]);
    expect(gone.value.categories.some((c) => c.id === "wf-a")).toBe(false);
  });
  it("names the unit modes and the outcome", () => {
    expect(Object.values(unitModeLabels("orphan"))).toEqual(["A share of an orphan", "A whole orphan", "A whole orphan, once paid in full"]);
    expect(outcomeName(fw(), undefined)).toBe("orphan");
    const r = setUnitMode([fw()], "w", "whole");
    expect("frameworks" in r && r.frameworks[0]?.unitsPerBeneficiary).toBe(1);
  });
  it("sets the unit rule from a number and a tick (DECISIONS 132)", () => {
    const ok2 = (r: ReturnType<typeof setUnitRule>) => ("frameworks" in r ? r.frameworks[0] : undefined);
    expect(ok2(setUnitRule([fw()], "w", 4, false))).toMatchObject({ instalment: "per_period", unitsPerBeneficiary: 4 });
    expect(ok2(setUnitRule([fw()], "w", 4, true))).toMatchObject({ instalment: "share_of_whole", unitsPerBeneficiary: 1 });
    expect(setUnitRule([fw()], "w", 0, false)).toHaveProperty("error");
    expect(setUnitRule([fw()], "w", 101, false)).toHaveProperty("error");
  });
});
