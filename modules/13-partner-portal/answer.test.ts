/**
 * answer.test.ts
 *
 * What it does: tests that a partner answers only its own gifts (DECISIONS 254): accept one, refuse one with a reason, accept or refuse a batch, never another partner's gift, and never clear the answers.
 * Invented gifts. These tests double as examples. Who calls it: vitest. Depends on: answer.ts.
 */
import { describe, expect, it } from "vitest";
import { partnerAnswer } from "./answer";
import type { Assignment } from "../08-assignment/assignment";
import type { Confirmations } from "../11-confirmation/confirmation";

const gift = (key: string, partnerId: string, batch = 1): Assignment => ({ key, partnerId, giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "2026-11-01T00:00:00Z", batch });
const assignments = [gift("sub:1", "p1"), gift("sub:2", "p1"), gift("sub:3", "p2")];
const empty: Confirmations = { records: [] };
const run = (body: Record<string, unknown>, existing = empty) => partnerAnswer(existing, assignments, "p1", body, "Sara", "2026-11-02T10:00:00Z");

describe("a partner answers for itself", () => {
  it("accepts one gift and records who", () => {
    const r = run({ action: "cnf-confirm", key: "sub:1" });
    expect("value" in r && r.value.records).toMatchObject([{ key: "sub:1", partnerId: "p1", answer: "confirmed", by: "Sara" }]);
    expect("message" in r && r.message).toBe("Accepted.");
  });
  it("refuses one gift only with a reason, and says what happens next", () => {
    expect("error" in run({ action: "cnf-reject", key: "sub:1" })).toBe(true);
    const r = run({ action: "cnf-reject", key: "sub:1", reason: "No room" });
    expect("value" in r && r.value.records[0]).toMatchObject({ answer: "rejected", reason: "No room" });
    expect("message" in r && r.message).toContain("another partner");
  });
  it("accepts or refuses a whole batch", () => {
    const yes = run({ action: "cnf-confirm-batch", keys: ["sub:1", "sub:2"] });
    expect("value" in yes && yes.value.records.map((x) => x.answer)).toEqual(["confirmed", "confirmed"]);
    expect("message" in yes && yes.message).toBe("Accepted 2 gifts.");
    const no = run({ action: "cnf-reject-batch", keys: ["sub:1", "sub:2"], reason: "Closed for Eid" });
    expect("value" in no && no.value.records.map((x) => x.answer)).toEqual(["rejected", "rejected"]);
  });
  it("cannot answer another partner's gift, or the same gift twice", () => {
    expect(run({ action: "cnf-confirm", key: "sub:3" })).toEqual({ error: "That gift has not been assigned to a partner." });
    const once = run({ action: "cnf-confirm", key: "sub:1" });
    if (!("value" in once)) throw new Error("setup");
    expect(run({ action: "cnf-confirm", key: "sub:1" }, once.value)).toEqual({ error: "That gift has already been answered." });
    const mixed = run({ action: "cnf-confirm-batch", keys: ["sub:1", "sub:3"] });
    expect("message" in mixed && mixed.message).toContain("1 skipped");
  });
  it("is never allowed to clear the answers or do anything else", () => {
    expect(run({ action: "cnf-reset" })).toEqual({ error: "That request is not open to a partner." });
    expect(run({ action: "asg-assign" })).toEqual({ error: "That request is not open to a partner." });
  });
});
