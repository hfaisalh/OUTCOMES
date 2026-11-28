/**
 * order.test.ts
 *
 * What it does: tests the allocation order as settings (DECISIONS 293): repairing a saved list, moving and switching off steps, and the comparison a gift uses to choose a place. Invented places.
 * Who calls it: vitest. Depends on: order.ts.
 */
import { describe, expect, it } from "vitest";
import { comparePlaces, DEFAULT_STEPS, normaliseSteps, orderText, reorder, setStepOn, type PlaceFacts } from "./order";

const place = (own: boolean, priority: boolean, used: number): PlaceFacts => ({ own, priority, used });

describe("repairing a saved order", () => {
  it("keeps known steps once each in the saved order and adds a missing one on at the end", () => {
    expect(normaliseSteps([{ id: "fill", on: true }, { id: "own", on: false }, { id: "fill", on: false }, { id: "nope" }])).toEqual([{ id: "fill", on: true }, { id: "own", on: false }, { id: "priority", on: true }]);
  });
  it("gives the usual order for nothing or for rubbish", () => {
    expect(normaliseSteps(undefined)).toEqual(DEFAULT_STEPS);
    expect(normaliseSteps("x")).toEqual(DEFAULT_STEPS);
    expect(normaliseSteps([null, 3])).toEqual(DEFAULT_STEPS);
  });
});

describe("moving and switching off", () => {
  it("moves a step to a position, and changes nothing for an unknown step or a position outside", () => {
    expect(reorder(DEFAULT_STEPS, "fill", 0).map((s) => s.id)).toEqual(["fill", "own", "priority"]);
    expect(reorder(DEFAULT_STEPS, "own", 2).map((s) => s.id)).toEqual(["priority", "fill", "own"]);
    expect(reorder(DEFAULT_STEPS, "own", 9)).toBe(DEFAULT_STEPS);
    expect(reorder(DEFAULT_STEPS, "nope" as never, 0)).toBe(DEFAULT_STEPS);
  });
  it("switches a step off and on", () => {
    expect(setStepOn(DEFAULT_STEPS, "priority", false).find((s) => s.id === "priority")?.on).toBe(false);
  });
});

describe("choosing between two places", () => {
  const own = place(true, false, 2), prio = place(false, true, 2), empty = place(false, false, 0);
  it("the usual order: own first, then priority, then the least funded", () => {
    const sorted = [empty, prio, own].sort((a, b) => comparePlaces(DEFAULT_STEPS, a, b));
    expect(sorted).toEqual([own, prio, empty]);
  });
  it("a different order gives a different winner", () => {
    const priorityFirst = reorder(DEFAULT_STEPS, "priority", 0);
    expect([own, prio].sort((a, b) => comparePlaces(priorityFirst, a, b))[0]).toBe(prio);
    const fillFirst = reorder(DEFAULT_STEPS, "fill", 0);
    expect([own, prio, empty].sort((a, b) => comparePlaces(fillFirst, a, b))[0]).toBe(empty);
  });
  it("a step that is off is skipped, so the next one decides", () => {
    const noOwn = setStepOn(DEFAULT_STEPS, "own", false);
    expect([own, prio].sort((a, b) => comparePlaces(noOwn, a, b))[0]).toBe(prio);
    const none = DEFAULT_STEPS.map((s) => ({ ...s, on: false }));
    expect(comparePlaces(none, own, empty)).toBe(0); // a tie: the earliest enrolled decides, in allocation.ts
  });
  it("says the order in words", () => {
    expect(orderText(DEFAULT_STEPS)).toBe("the partner's own beneficiaries, then beneficiaries marked priority, then the place with the least funded");
    expect(orderText(DEFAULT_STEPS.map((s) => ({ ...s, on: false })))).toContain("only the earliest enrolled");
  });
});
