/**
 * confirmation.test.ts
 *
 * What it does: tests the Confirmation rules (DECISIONS 202) on invented gifts: the due day, waiting, late, confirmed, rejected with a reason, and an answer that stops counting when the gift is reassigned.
 * These tests double as examples. Who calls it: vitest. Depends on: confirmation.ts.
 */

import { describe, expect, it } from "vitest";
import { addDays, applyConfirmationAction, confirm, confirmationOf, confirmOnBehalf, emptyConfirmations, reject, type ConfirmAssignment } from "./confirmation";

const a: ConfirmAssignment = { key: "sub:S1", partnerId: "trust", at: "2026-11-20T09:00:00Z" };

describe("the due day", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
  });
  it("is the assigned day plus the days allowed", () => {
    expect(confirmationOf(a, [], 3, "2026-11-21").due).toBe("2026-11-23");
  });
});

describe("waiting and late", () => {
  it("waits on time, then is late by the days past due, and can still answer", () => {
    expect(confirmationOf(a, [], 3, "2026-11-23")).toMatchObject({ state: "waiting", lateDays: 0 });
    expect(confirmationOf(a, [], 3, "2026-11-26")).toMatchObject({ state: "waiting", lateDays: 3 });
  });
});

describe("answering", () => {
  it("confirms, and a second answer is refused", () => {
    const r = confirm(emptyConfirmations(), a, "Sample Officer", "2026-11-21T10:00:00Z");
    if ("error" in r) throw new Error(r.error);
    expect(confirmationOf(a, r.value.records, 3, "2026-11-25")).toMatchObject({ state: "confirmed", lateDays: 0, answeredAt: "2026-11-21T10:00:00Z" });
    expect(confirm(r.value, a, "x", "2026-11-22T10:00:00Z")).toEqual({ error: "That gift has already been answered." });
  });
  it("rejects only with a reason, and keeps it", () => {
    expect(reject(emptyConfirmations(), a, "Sample Officer", "  ", "2026-11-21T10:00:00Z")).toHaveProperty("error");
    const r = reject(emptyConfirmations(), a, "Sample Officer", "No room this term", "2026-11-21T10:00:00Z");
    if ("error" in r) throw new Error(r.error);
    expect(confirmationOf(a, r.value.records, 3, "2026-11-25")).toMatchObject({ state: "rejected", reason: "No room this term" });
  });
  it("refuses a gift that is not assigned", () => {
    expect(confirm(emptyConfirmations(), undefined, "x", "t")).toHaveProperty("error");
    expect(reject(emptyConfirmations(), undefined, "x", "why", "t")).toHaveProperty("error");
  });
});

describe("reassigning", () => {
  it("an answer to the old partner does not count for the new one, who starts waiting", () => {
    const r = reject(emptyConfirmations(), a, "Sample Officer", "No room", "2026-11-21T10:00:00Z");
    if ("error" in r) throw new Error(r.error);
    const again: ConfirmAssignment = { key: "sub:S1", partnerId: "backup", at: "2026-11-22T09:00:00Z" };
    expect(confirmationOf(again, r.value.records, 3, "2026-11-22")).toMatchObject({ state: "waiting", due: "2026-11-25" });
  });
  it("an old answer from the same partner before a later assignment does not count either", () => {
    const r = confirm(emptyConfirmations(), a, "Sample Officer", "2026-11-21T10:00:00Z");
    if ("error" in r) throw new Error(r.error);
    expect(confirmationOf({ ...a, at: "2026-12-01T09:00:00Z" }, r.value.records, 3, "2026-12-01").state).toBe("waiting");
  });
});

describe("on the partner's behalf (DECISIONS 231)", () => {
  const stockItem = { id: "PK-1", partnerId: "trust", giftProjectId: "gp", clusterId: "c", itemId: "I1", name: "Pump 1", at: "2026-11-01T00:00:00Z" };
  const asg = { key: "sub:S1", partnerId: "trust", at: "2026-11-20T09:00:00Z", itemId: "I1", giftProjectId: "gp" };
  it("confirms an assignment for a partner holding a parked outcome ready for the benefit, marked as done for it", () => {
    const r = confirmOnBehalf(emptyConfirmations(), [asg], [stockItem], [], "2026-11-20T09:01:00Z");
    expect(r.added).toBe(1);
    expect(r.value.records[0]).toMatchObject({ answer: "confirmed", onBehalf: true });
    expect(confirmationOf(asg, r.value.records, 3, "2026-11-21").state).toBe("confirmed");
  });
  it("leaves a partner with no parked outcome waiting, one whose parked outcome is taken, and one already answered", () => {
    expect(confirmOnBehalf(emptyConfirmations(), [asg], [], [], "x").added).toBe(0);
    expect(confirmOnBehalf(emptyConfirmations(), [asg], [stockItem], [{ stockId: "PK-1" }], "x").added).toBe(0); // the only one is used
    const answered = confirm(emptyConfirmations(), asg, "Sam", "2026-11-20T10:00:00Z");
    expect("value" in answered && confirmOnBehalf(answered.value, [asg], [stockItem], [], "2026-11-20T11:00:00Z").added).toBe(0);
  });
});

describe("the requests the page makes", () => {
  const asg = { key: "sub:S1", partnerId: "trust", at: "2026-11-20T09:00:00Z" };
  it("confirms and rejects by key, a rejection needing its reason, and ignores requests that are not about confirmation", () => {
    const ok = applyConfirmationAction(emptyConfirmations(), [asg], { action: "cnf-confirm", key: "sub:S1" }, "Sam", "2026-11-21T00:00:00Z");
    expect(ok && "value" in ok && ok.value.records).toHaveLength(1);
    expect(applyConfirmationAction(emptyConfirmations(), [asg], { action: "cnf-reject", key: "sub:S1", reason: " " }, "Sam", "x")).toEqual({ error: "Say why the partner cannot take it, so another partner can be chosen." });
    expect(applyConfirmationAction(emptyConfirmations(), [asg], { action: "cnf-confirm", key: "nope" }, "Sam", "x")).toMatchObject({ error: expect.any(String) });
    expect(applyConfirmationAction(emptyConfirmations(), [asg], { action: "asg-run" }, "Sam", "x")).toBeNull();
  });
});

describe("answering a whole batch (DECISIONS 243)", () => {
  const a = (key: string) => ({ key, partnerId: "trust", at: "2026-11-20T09:00:00Z" });
  const three = [a("L1"), a("L2"), a("L3")];
  it("confirms every gift still waiting, and leaves answered ones as they were", () => {
    const one = applyConfirmationAction(emptyConfirmations(), three, { action: "cnf-reject", key: "L2", reason: "No room" }, "Sam", "2026-11-21T00:00:00Z");
    const start = one && "value" in one ? one.value : emptyConfirmations();
    const r = applyConfirmationAction(start, three, { action: "cnf-confirm-batch", keys: ["L1", "L2", "L3", "L3", "nope"] }, "Sam", "2026-11-22T00:00:00Z");
    if (!r || "error" in r) throw new Error("expected a result");
    expect(r.value.records.filter((x) => x.answer === "confirmed").map((x) => x.key)).toEqual(["L1", "L3"]);
    expect(r.value.records.find((x) => x.key === "L2")?.answer).toBe("rejected"); // not overwritten
    expect(r.message).toContain("Confirmed 2 gifts");
    expect(r.message).toContain("2 skipped"); // the one already rejected, and "nope", which is not an assignment
  });
  it("needs a reason to reject a batch, and refuses an empty or fully answered one", () => {
    expect(applyConfirmationAction(emptyConfirmations(), three, { action: "cnf-reject-batch", keys: ["L1"], reason: " " }, "Sam", "x")).toMatchObject({ error: expect.stringContaining("Say why") });
    expect(applyConfirmationAction(emptyConfirmations(), three, { action: "cnf-confirm-batch", keys: [] }, "Sam", "x")).toMatchObject({ error: "No gifts were chosen." });
    const done = applyConfirmationAction(emptyConfirmations(), three, { action: "cnf-confirm-batch", keys: ["L1"] }, "Sam", "t");
    const again = applyConfirmationAction(done && "value" in done ? done.value : emptyConfirmations(), three, { action: "cnf-confirm-batch", keys: ["L1"] }, "Sam", "t2");
    expect(again).toMatchObject({ error: expect.stringContaining("already been answered") });
  });
  it("rejects a batch with the reason on each", () => {
    const r = applyConfirmationAction(emptyConfirmations(), three, { action: "cnf-reject-batch", keys: ["L1", "L2"], reason: " No room " }, "Sam", "t");
    if (!r || "error" in r) throw new Error("expected a result");
    expect(r.value.records.map((x) => [x.key, x.answer, x.reason])).toEqual([["L1", "rejected", "No room"], ["L2", "rejected", "No room"]]);
  });
});
