/**
 * workflows.test.ts
 *
 * What it does: tests workflows (DECISIONS 130): the plain sentence, the stage badges, the tasks, the starting workflows and which one suits an item, using the item
 * names of the real catalogue. Invented data otherwise. These tests double as examples. Who calls it: vitest. Depends on: workflows.ts, categories.ts and outcome-types.ts.
 */

import { describe, expect, it } from "vitest";
import { isFrameworkTemplate, type FrameworkTemplate } from "./categories";
import { starterOutcomeTypes } from "../05-outcomes/outcome-types";
import { reportLoopOf, setReportLoop, mergeWorkflow, addStage, assignOf, confirmDaysOf, setConfirm, flagOf, setFlag, moveStage, removeStage, setAssign, setStage, totalDays, assignToWorkflow, itemsInWorkflow, removeWorkflow, setUnitMode, setUnitRule, unassignItem, unitModeLabels, outcomeName, addStarterWorkflows, addTask, removeTask, setTask, suggestWorkflowFor } from "./workflows";

const fw = (over: Partial<FrameworkTemplate> = {}): FrameworkTemplate => ({ id: "w", name: "Orphan sponsorship", unit: "orphan", cycle: "quarterly", reportType: "Quarterly orphan update", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
const ok = (r: { frameworks: FrameworkTemplate[] } | { error: string }): FrameworkTemplate[] => { if ("error" in r) throw new Error(r.error); return r.frameworks; };

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

describe("assigned for implementation (DECISIONS 137)", () => {
  const stages = (f: FrameworkTemplate[]) => f[0]?.stages?.map((x) => x.id);
  it("adds, changes, moves and removes the partner's stages, and adds up the days", () => {
    let f = [fw()];
    f = ok(addStage(f, "w", "Site visit", 14));
    f = ok(addStage(f, "w", "Installed", 30));
    expect(stages(f)).toEqual(["site-visit", "installed"]);
    expect(totalDays(f[0]!)).toBe(44);
    f = ok(setStage(f, "w", "installed", { needs: "Location, GPS , ,Photo of site", photo: true, canPause: false, tell: "Your gift has been assigned a location.", days: 20 }));
    expect(f[0]?.stages?.[1]).toMatchObject({ needs: ["Location", "GPS", "Photo of site"], photo: true, canPause: false, days: 20 });
    f = ok(moveStage(f, "w", "installed", -1));
    expect(stages(f)).toEqual(["installed", "site-visit"]);
    expect(stages(ok(moveStage(f, "w", "installed", -1)))).toEqual(["installed", "site-visit"]); // the first cannot go up
    f = ok(removeStage(ok(removeStage(f, "w", "installed")), "w", "site-visit"));
    expect(f[0]?.stages).toBeUndefined();
    expect(isFrameworkTemplate(fw({ stages: [{ id: "a", label: "A", days: 3, needs: [], photo: false, canPause: true, tell: "" }] }))).toBe(true);
    expect(isFrameworkTemplate(fw({ stages: [{ id: "a", label: "A", days: -1, needs: [], photo: false, canPause: true, tell: "" }] }))).toBe(false);
  });
  it("refuses a stage with no name, bad days or one that is not there", () => {
    expect(addStage([fw()], "w", " ", 3)).toHaveProperty("error");
    expect(addStage([fw()], "w", "Visit", 400)).toHaveProperty("error");
    expect(addStage([fw()], "nope", "Visit", 3)).toHaveProperty("error");
    expect(setStage([fw()], "w", "none", { days: 2 })).toHaveProperty("error");
  });
  it("hands over by the workflow's own setting, else the type's, else by suggestion; the starting workflows carry stages", () => {
    const types = starterOutcomeTypes();
    expect(assignOf(fw(), undefined)).toBe("suggest");
    expect(assignOf(fw(), { ...types[0]!, assign: "auto" })).toBe("auto");
    expect(assignOf(fw({ assign: "suggest" }), { ...types[0]!, assign: "auto" })).toBe("suggest");
    expect(ok(setAssign([fw()], "w", "auto"))[0]?.assign).toBe("auto");
    const start = addStarterWorkflows([], types).frameworks;
    expect(start.find((x) => x.id === "orphan-sponsorship")?.assign).toBe("auto");
    expect(start.find((x) => x.id === "water-pump")?.assign).toBe("suggest");
    expect(start.every((x) => (x.stages ?? []).length === 3 && isFrameworkTemplate(x))).toBe(true);
  });
  it("has three yes or no decisions that are yes until turned off (DECISIONS 138)", () => {
    for (const k of ["reassign", "urgent", "approve", "feedback"] as const) {
      expect(flagOf(fw(), k)).toBe(true);
      const off = ok(setFlag([fw()], "w", k, false))[0]!;
      expect(flagOf(off, k)).toBe(false);
      expect(isFrameworkTemplate(off)).toBe(true);
    }
    expect(isFrameworkTemplate({ ...fw(), urgent: "yes" })).toBe(false);
    expect(setFlag([fw()], "nope", "urgent", false)).toHaveProperty("error");
  });
  it("sets the days a partner has to confirm, 3 unless set, and what the donor is told (DECISIONS 139)", () => {
    expect(confirmDaysOf(fw())).toBe(3);
    const f = ok(setConfirm([fw()], "w", { days: 5, tell: "Accepted." }))[0]!;
    expect(confirmDaysOf(f)).toBe(5);
    expect(f.confirmTell).toBe("Accepted.");
    expect(isFrameworkTemplate(f)).toBe(true);
    expect(setConfirm([fw()], "w", { days: 61 })).toHaveProperty("error");
    expect(setConfirm([fw()], "w", { days: 1.5 })).toHaveProperty("error");
  });
});

describe("merging two workflows that differ only in units per beneficiary (DECISIONS 188)", () => {
  const parts = fw({ id: "sponsorship-shared-parts", name: "Sponsorship: shared parts", unitsPerBeneficiary: 3 });
  const whole = fw({ id: "sponsorship-whole", name: "Sponsorship: whole", unitsPerBeneficiary: 1 });
  const setup = () => {
    let s = { categories: [], itemMap: {}, frameworks: [parts, whole], itemFramework: {} } as import("./categories").Setup;
    for (const [item, w] of [["I10", "sponsorship-shared-parts"], ["I13", "sponsorship-whole"], ["I20", "sponsorship-whole"]] as const) s = assignToWorkflow(s, item, w).value;
    return s;
  };
  it("moves every item to the other workflow, keeps each item's own units, and removes the emptied workflow", () => {
    const r = mergeWorkflow(setup(), {}, "sponsorship-whole", "sponsorship-shared-parts");
    expect(r.error).toBeUndefined();
    expect(r.value.moved).toBe(2);
    expect(itemsInWorkflow(r.value.setup, "sponsorship-shared-parts").sort()).toEqual(["I10", "I13", "I20"]);
    expect(r.value.setup.frameworks.map((f) => f.id)).toEqual(["sponsorship-shared-parts"]); // the whole workflow is gone
    expect(r.value.itemUnits).toEqual({ I13: 1, I20: 1 }); // they keep what the old workflow gave them, so their gifts do not change
  });
  it("keeps a number an item already has, and adds none when the two workflows agree", () => {
    expect(mergeWorkflow(setup(), { I13: 2 }, "sponsorship-whole", "sponsorship-shared-parts").value.itemUnits).toEqual({ I13: 2, I20: 1 });
    const same = { ...setup(), frameworks: [parts, { ...whole, unitsPerBeneficiary: 3 }] };
    expect(mergeWorkflow(same, {}, "sponsorship-whole", "sponsorship-shared-parts").value.itemUnits).toEqual({});
  });
  it("refuses a missing workflow, the same workflow, and changes nothing", () => {
    expect(mergeWorkflow(setup(), {}, "nope", "sponsorship-shared-parts").error).toBe("That workflow was not found.");
    expect(mergeWorkflow(setup(), {}, "sponsorship-whole", "sponsorship-whole").error).toBe("Choose a different workflow to merge into.");
    const s = setup();
    expect(mergeWorkflow(s, {}, "sponsorship-whole", "nope").value.setup).toBe(s);
  });
  it("merges an empty workflow too, moving nothing", () => {
    const empty = { categories: [], itemMap: {}, frameworks: [parts, whole], itemFramework: {} } as import("./categories").Setup;
    expect(mergeWorkflow(empty, {}, "sponsorship-whole", "sponsorship-shared-parts").value.moved).toBe(0);
  });
});

describe("the reporting loop of a living workflow (decision 317)", () => {
  const f = (over = {}) => ({ id: "w", name: "Sponsorship", unit: "orphan", cycle: "monthly" as const, reportType: "Update", unitsPerBeneficiary: 1, instalment: "per_period" as const, ...over });
  it("loops on its cycle when the workflow is living, and not when it releases on full payment or reports once", () => {
    expect(reportLoopOf(f())).toBe("monthly");
    expect(reportLoopOf(f({ instalment: "share_of_whole" }))).toBeNull();
    expect(reportLoopOf(f({ cycle: "on_delivery" }))).toBeNull();
  });
  it("switching the loop on gives a monthly cycle, and off takes the report back to once", () => {
    const off = setReportLoop([f()], "w", false) as { frameworks: { cycle: string }[] };
    expect(off.frameworks[0]?.cycle).toBe("on_delivery");
    const on = setReportLoop(off.frameworks as never, "w", true) as { frameworks: { cycle: string }[] };
    expect(on.frameworks[0]?.cycle).toBe("monthly");
  });
});
