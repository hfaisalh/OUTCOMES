/** automation.test.ts: the settings, the partner inbox and the daily sweep, with invented gifts (decision 326). Examples of the rules. */
import { describe, expect, it } from "vitest";
import { autoRulesOf, DEFAULT_AUTO, setAutoRule } from "./rules";
import { addMessages, markRead, unreadCount, forPartner, sentBackMessage } from "./messages";
import { applySweep, sweep } from "./sweep";

const TODAY = "2026-12-01";
const rules = autoRulesOf({});
const asg = (key: string, partnerId: string, batch = 1) => ({ key, partnerId, giftProjectId: "g", itemId: "I", parts: 1, how: "auto" as const, at: "2026-11-20T00:00:00Z", batch });

describe("the settings", () => {
  it("start safe: reminders on, scheduled assign and allocate off", () => {
    expect(DEFAULT_AUTO).toMatchObject({ remind: true, assign: false, allocate: false, remindBefore: 1, remindLate: true });
  });
  it("sets a yes or no and the days, and refuses nonsense", () => {
    expect(setAutoRule({}, "allocate", true)).toEqual({ value: { ...DEFAULT_AUTO, allocate: true } });
    expect(setAutoRule({}, "remindBefore", "3")).toEqual({ value: { ...DEFAULT_AUTO, remindBefore: 3 } });
    expect("error" in setAutoRule({}, "remindBefore", 30)).toBe(true);
    expect("error" in setAutoRule({}, "allocate", "yes")).toBe(true);
    expect("error" in setAutoRule({}, "nothing", true)).toBe(true);
  });
});

describe("the partner inbox", () => {
  const m = (id: string, partnerId = "p1", at = "2026-12-01T00:00:00Z") => ({ id, partnerId, at, kind: "reminder" as const, title: "t", text: "x" });
  it("does not add a message whose key is already there, so a job run twice does not double the reminders", () => {
    const one = addMessages([], [m("a"), m("a")]);
    expect(one.added).toBe(1);
    expect(addMessages(one.value, [m("a"), m("b")]).added).toBe(1);
  });
  it("keeps only the latest 100 of a partner and never touches another partner", () => {
    const many = Array.from({ length: 105 }, (_, i) => m(`k${i}`, "p1", `2026-12-01T00:${String(i % 60).padStart(2, "0")}:00Z`));
    const r = addMessages([], [...many, m("other", "p2")]).value;
    expect(r.filter((x) => x.partnerId === "p1")).toHaveLength(100);
    expect(r.some((x) => x.partnerId === "p2")).toBe(true);
  });
  it("marks a partner's messages read, only its own", () => {
    const list = addMessages([], [m("a"), m("b", "p2")]).value;
    expect(unreadCount(list, "p1")).toBe(1);
    const after = markRead(list, "p1", "all");
    expect(unreadCount(after, "p1")).toBe(0);
    expect(unreadCount(after, "p2")).toBe(1);
    expect(forPartner(after, "p1")).toHaveLength(1);
  });
  it("holds no donor details: the benefit, the phase, MWF's reason and the day", () => {
    const s = sentBackMessage("p1", "Orphan Sponsorship Monthly", "Photo update", "The photo is blurred.", "2026-12-24", "2026-12-01T00:00:00Z", "sub:1");
    expect(s.text).toBe("MWF sent back the work for Orphan Sponsorship Monthly. The photo is blurred. Please put right: Photo update, by 24/12/26.");
  });
});

describe("the daily sweep", () => {
  const waiting = [
    { key: "a", partnerId: "p1", due: "2026-12-02", lateDays: 0 }, // due tomorrow
    { key: "b", partnerId: "p1", due: "2026-12-02", lateDays: 0 },
    { key: "c", partnerId: "p2", due: "2026-11-28", lateDays: 3 }, // late
    { key: "d", partnerId: "p3", due: "2026-11-25", lateDays: 6, moveAfterDays: 5 }, // late enough to move
    { key: "e", partnerId: "p3", due: "2026-11-30", lateDays: 1, moveAfterDays: 5 }, // late, not enough to move
  ];
  it("reminds each partner once for a deadline, not once for each gift", () => {
    const r = sweep({ today: TODAY, rules, waiting, phases: [] });
    const reminders = r.messages.filter((x) => x.kind === "reminder");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.text).toBe("2 gifts to accept or refuse are due by 02/12/26.");
  });
  it("tells a partner it is late, and does not remind about a gift that is moving", () => {
    const r = sweep({ today: TODAY, rules, waiting, phases: [] });
    expect(r.messages.find((x) => x.kind === "late" && x.partnerId === "p2")?.text).toBe("1 gift still to accept or refuse is past its day.");
    expect(r.messages.filter((x) => x.partnerId === "p3" && x.kind === "late")).toHaveLength(1); // only e, not d
  });
  it("moves only the gifts that are unanswered and late enough, when the workflow sets the days", () => {
    const r = sweep({ today: TODAY, rules, waiting, phases: [] });
    expect(r.moves).toEqual([{ key: "d", partnerId: "p3", days: 5 }]);
    expect(sweep({ today: TODAY, rules, waiting: waiting.map(({ moveAfterDays: _m, ...w }) => w), phases: [] }).moves).toEqual([]); // off until set
  });
  it("sends nothing when reminders are off, but still moves", () => {
    const r = sweep({ today: TODAY, rules: { ...rules, remind: false }, waiting, phases: [] });
    expect(r.messages.map((x) => x.kind)).toEqual(["moved"]);
    expect(r.moves).toHaveLength(1);
  });
  it("reminds a partner of phases due, on the day set", () => {
    const r = sweep({ today: TODAY, rules: { ...rules, remindBefore: 0 }, waiting: [], phases: [{ key: "x", partnerId: "p1", due: TODAY, lateDays: 0 }] });
    expect(r.messages[0]?.text).toBe("1 gift with work to finish is due by 01/12/26.");
  });
  it("applies a move as a refusal in the partner's name, takes the gift back and tells the partner, once", () => {
    const state = { confirmations: { records: [] }, assignments: { records: [asg("d", "p3"), asg("e", "p3"), asg("a", "p1")] }, messages: [] };
    const r = applySweep(state, { today: TODAY, rules, waiting, phases: [] }, `${TODAY}T03:00:00Z`);
    expect(r.moved).toBe(1);
    expect(r.value.assignments.records.map((x) => x.key).sort()).toEqual(["a", "e"]); // d is taken back, the others stay
    expect(r.value.confirmations.records[0]).toMatchObject({ key: "d", partnerId: "p3", answer: "rejected", by: "Automation", reason: "No answer within 5 days of the deadline" });
    expect(r.value.messages.some((x) => x.kind === "moved" && x.partnerId === "p3")).toBe(true);
    const again = applySweep(r.value, { today: TODAY, rules, waiting, phases: [] }, `${TODAY}T04:00:00Z`);
    expect(again.value.messages).toHaveLength(r.value.messages.length); // the same day's messages are not added twice
  });
});

import { newBatchMessages, sweepInput } from "./input";

describe("what the sweep is built from", () => {
  const fw = { id: "wf", name: "Pump", unit: "pump", cycle: "on_delivery" as const, reportType: "", unitsPerBeneficiary: 1, confirmDays: 5, moveAfterDays: 3 };
  it("lists gifts still waiting, with the workflow's days to answer and to move, and leaves out answered ones", () => {
    const r = sweepInput({ today: TODAY, rules, assignments: [asg("a", "p1"), asg("b", "p1")], confirmations: [{ key: "b", partnerId: "p1", answer: "confirmed", at: "2026-11-21T00:00:00Z", by: "P", reason: "" }], frameworks: [fw], frameworkOf: () => "wf", standings: [] });
    expect(r.waiting).toEqual([{ key: "a", partnerId: "p1", due: "2026-11-25", lateDays: 6, moveAfterDays: 3 }]); // assigned 20/11, five days to answer
  });
  it("tells a partner once for each batch it was given gifts in", () => {
    const m = newBatchMessages([asg("a", "p1")], [asg("a", "p1"), asg("b", "p1", 2), asg("c", "p1", 2), asg("d", "p2", 1)], `${TODAY}T09:00:00Z`);
    expect(m.map((x) => x.text)).toEqual(["2 gifts have been assigned to you in batch 2. Please accept or refuse them in the days set.", "1 gift has been assigned to you in batch 1. Please accept or refuse it in the days set."]);
  });
});
