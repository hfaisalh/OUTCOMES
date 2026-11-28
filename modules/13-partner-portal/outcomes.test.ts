/**
 * outcomes.test.ts
 *
 * What it does: tests how a partner follows each gift (DECISIONS 251): where a gift stands (to answer, confirmed, allocated, complete, refused), what it funds, the last step, the counts for the journey strip, and that nothing about a donor is carried.
 * Invented gifts. These tests double as examples. Who calls it: vitest. Depends on: outcomes.ts.
 */
import { describe, expect, it } from "vitest";
import { partnerOutcomes, pipeline } from "./outcomes";
import type { PartnerSlice } from "./scope";

const gift = (key: string, at: string, batch = 1) => ({ key, partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto" as const, at: `${at}T00:00:00Z`, batch });
const slice = (): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha" },
  giftProjects: [{ id: "g1", name: "Orphan homes", itemIds: [], clusters: [] }],
  beneficiaries: [{ id: "PRS-1", name: "Amina Khan" } as never],
  enrolments: [{ id: "EN-1", beneficiaryId: "PRS-1", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }],
  assignments: [gift("sub:1", "2026-11-01"), gift("sub:2", "2026-11-02"), gift("sub:3", "2026-11-03"), gift("sub:4", "2026-11-04"), gift("sub:5", "2026-11-05")],
  confirmations: [
    { key: "sub:2", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" },
    { key: "sub:3", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" },
    { key: "sub:4", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" },
    { key: "sub:5", partnerId: "p1", answer: "rejected", at: "x", by: "A", reason: "Full" },
  ],
  progress: [
    { key: "sub:3", kind: "phase", id: "site-visit", at: "x", by: "A" },
    { key: "sub:4", kind: "stage", id: "complete", at: "x", by: "A" },
    { key: "p1|1", kind: "batch", id: "closed", at: "x", by: "A" },
  ],
  allocations: [
    { key: "sub:3", kind: "beneficiary", enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "x" },
    { key: "sub:4", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0007", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "x" },
  ],
  itemNames: { S: "Orphan Sponsorship Monthly" }, gifts: { "sub:3": { reference: "sub:3", recurring: true, units: 1, planned: 12, paid: 3, cause: "Orphans", intention: "", tribute: "For Aisha", phases: [], review: true, feedback: true, completeWithin: 0, answerBy: "2026-11-04" } },
});

describe("following a gift", () => {
  const rows = partnerOutcomes(slice());
  const by = (k: string) => rows.find((r) => r.key === k)!;

  it("puts each gift at the furthest point it has reached", () => {
    expect(["sub:1", "sub:2", "sub:3", "sub:4", "sub:5"].map((k) => by(k).standing)).toEqual(["to-answer", "confirmed", "allocated", "complete", "refused"]);
  });
  it("says what it funds, the last step, and why a refusal was made", () => {
    expect(by("sub:3")).toMatchObject({ funds: "Amina Khan", step: "Site visit", benefit: "Orphan Sponsorship Monthly", project: "Orphan homes", batch: 1 });
    expect(by("sub:4")).toMatchObject({ funds: "OUT-0007", step: "Completed" });
    expect(by("sub:5").reason).toBe("Full");
    expect(by("sub:1")).toMatchObject({ funds: "", step: "" });
  });
  it("lists the newest gift first and counts the journey", () => {
    expect(rows.map((r) => r.key)).toEqual(["sub:5", "sub:4", "sub:3", "sub:2", "sub:1"]);
    expect(pipeline(rows)).toEqual({ refused: 1, "to-answer": 1, confirmed: 1, allocated: 1, complete: 1 });
  });
  it("carries what the partner may know about each gift, and nothing for a gift that has none", () => {
    expect(by("sub:3").detail).toMatchObject({ tribute: "For Aisha", planned: 12 });
    expect(by("sub:1").detail).toBeUndefined();
  });
  it("carries no donor detail", () => {
    expect(Object.keys(rows[0]!).sort()).toEqual(["batch", "benefit", "detail", "funds", "key", "project", "reason", "since", "standing", "step"]);
  });
});

describe("work sent back at review (decision 321)", () => {
  const withReject = (extra: { key: string; kind: "phase"; id: string; at: string; by: string }[] = []): PartnerSlice => {
    const s = slice();
    s.gifts["sub:3"] = { ...s.gifts["sub:3"]!, phases: [{ label: "Site visit", days: 10 }, { label: "Photo update", days: 30 }] };
    s.progress = [...s.progress.filter((r) => r.key !== "sub:3"), { key: "sub:3", kind: "phase", id: "visit", at: "2026-11-05T00:00:00Z", by: "A" }, { key: "sub:3", kind: "phase", id: "photo", at: "2026-11-10T00:00:00Z", by: "A" }, { key: "sub:3", kind: "reject", id: "review", at: "2026-11-12T10:00:00Z", by: "MWF", reason: "The photo is blurred" } as never, ...extra];
    return s;
  };
  it("tells the partner why, which phase to put right and the last day", () => {
    const row = partnerOutcomes(withReject()).find((r) => r.key === "sub:3")!;
    expect(row.sentBack).toEqual({ reason: "The photo is blurred", phase: "Photo update", due: "2026-12-12" });
    expect(row.step).not.toBe("Review"); // a rejection is not a step the partner took
  });
  it("stops telling it once the partner has done a phase again", () => {
    const row = partnerOutcomes(withReject([{ key: "sub:3", kind: "phase", id: "photo", at: "2026-11-15T00:00:00Z", by: "A" }])).find((r) => r.key === "sub:3")!;
    expect(row.sentBack).toBeUndefined();
  });
  it("says nothing to a gift that was not rejected", () => {
    expect(partnerOutcomes(slice()).find((r) => r.key === "sub:3")!.sentBack).toBeUndefined();
  });
});
