/**
 * credits.test.ts
 *
 * What it does: tests the credit chain and the report recipient on invented people and groups. The
 * example is a rep at a company branch: the agent, the branch, the company.
 */

import { describe, expect, it } from "vitest";
import { creditedIds, noIndividualDonor, readCredits, reportTo, supporterKindOf } from "./credits";

const chain = [
  { role: "agent", id: "A1", name: "Sample Rep" },
  { role: "group", id: "G1", name: "Sample Branch" },
  { role: "organisation", id: "O1", name: "Sample Company" },
];

describe("readCredits", () => {
  it("reads numbered levels, nearest first, and skips empty ones", () => {
    expect(readCredits({ credit_1_role: "agent", credit_1_id: "A1", credit_1_name: "Sample Rep", credit_3_id: "O1" })).toEqual([
      { role: "agent", id: "A1", name: "Sample Rep" },
      { role: "", id: "O1", name: "" },
    ]);
  });
  it("gives an empty chain when the feed has no credit columns", () => {
    expect(readCredits({ line_id: "L1" })).toEqual([]);
  });
});

describe("supporterKindOf", () => {
  it("understands the kinds and treats anything else as individual", () => {
    expect([supporterKindOf("Organisation"), supporterKindOf("organization"), supporterKindOf("group"), supporterKindOf(""), supporterKindOf("x")]).toEqual(["organisation", "organisation", "group", "individual", "individual"]);
  });
});

describe("reportTo", () => {
  it("sends the report to an individual donor even when there is a chain", () => {
    expect(reportTo({ supporterId: "D1", supporterName: "Sample Donor", credits: chain })).toEqual({ id: "D1", name: "Sample Donor", role: "donor" });
  });
  it("sends it to an organisation that gives in its own right", () => {
    expect(reportTo({ supporterId: "O9", supporterName: "Sample Trust", supporterKind: "organisation", credits: chain })?.role).toBe("donor");
  });
  it("sends a group's own gift to the nearest credit, the agent when named", () => {
    expect(reportTo({ supporterId: "G1", supporterName: "Sample Branch", supporterKind: "group", credits: chain })).toEqual({ id: "A1", name: "Sample Rep", role: "agent" });
  });
  it("falls back to the group when no agent is named", () => {
    expect(reportTo({ supporterId: "G1", supporterName: "Sample Branch", supporterKind: "group", credits: chain.slice(1) })?.id).toBe("G1");
  });
  it("stays with the donor when there is no credit at all, and gives nothing when there is no donor either", () => {
    expect(reportTo({ supporterId: "G1", supporterName: "Sample Branch", supporterKind: "group" })?.role).toBe("donor");
    expect(reportTo({ supporterId: "", supporterName: "" })).toBeNull();
  });
});

describe("noIndividualDonor and creditedIds", () => {
  it("flags a group's own gift and a line with no donor, not an individual or an organisation", () => {
    expect(noIndividualDonor({ supporterId: "G1", supporterName: "B", supporterKind: "group" })).toBe(true);
    expect(noIndividualDonor({ supporterId: "", supporterName: "" })).toBe(true);
    expect(noIndividualDonor({ supporterId: "D1", supporterName: "X" })).toBe(false);
    expect(noIndividualDonor({ supporterId: "O1", supporterName: "X", supporterKind: "organisation" })).toBe(false);
  });
  it("lists every id a gift is credited to, for roll-ups", () => {
    expect(creditedIds({ supporterId: "D1", supporterName: "X", credits: chain })).toEqual(["A1", "G1", "O1"]);
    expect(creditedIds({ supporterId: "D1", supporterName: "X" })).toEqual([]);
  });
});
