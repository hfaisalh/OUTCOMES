/**
 * readiness.test.ts
 *
 * What it does: tests the check that each gift item is connected end to end (DECISIONS 156): workflow, type, a partner that can take it, which projects offer it, and what is missing.
 * Custom Amount items are left for later. Invented data. These tests double as examples. Who calls it: vitest. Depends on: readiness.ts.
 */

import { describe, expect, it } from "vitest";
import type { GiftProject, Project } from "./projects";
import { itemReadiness, readySummary, type ReadinessInput } from "./readiness";

const partner = (id: string, over: Partial<Project> = {}): Project => ({ id, name: id.toUpperCase(), status: "active", ddStatus: "approved", aliases: [], levels: [], types: [], ...over });
const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  items: [{ id: "PUMP", name: "Small Pump" }, { id: "SPONSOR", name: "Orphan Sponsorship" }, { id: "TENT", name: "Tent" }, { id: "CUSTOM", name: "Custom Amount" }],
  workflowOf: (id) => (id === "TENT" ? "" : "w"),
  typeOf: (id) => (id === "SPONSOR" ? "" : "build"),
  customItemIds: new Set(["CUSTOM"]),
  partners: [partner("a", { itemIds: ["PUMP"] }), partner("b")],
  giftProjects: [],
  today: "2026-11-23",
  ...over,
});
const by = (rows: ReturnType<typeof itemReadiness>, id: string) => rows.find((r) => r.itemId === id)!;

describe("items connected end to end", () => {
  it("is ready when it has a workflow, a type and a partner that can take it", () => {
    const r = by(itemReadiness(base()), "PUMP");
    expect(r).toMatchObject({ hasWorkflow: true, type: "build", ready: true, missing: [] });
    expect(r.partners).toEqual(["A", "B"]); // A delivers the pump and B delivers anything
  });
  it("says what is missing, in plain words", () => {
    const rows = itemReadiness(base());
    expect(by(rows, "SPONSOR").missing).toEqual(["No type"]);
    expect(by(rows, "TENT").missing).toEqual(["No workflow"]);
    const none = itemReadiness(base({ partners: [] }));
    expect(by(none, "PUMP").missing).toEqual(["No partner can take it"]);
    expect(by(none, "PUMP").ready).toBe(false);
    expect(by(itemReadiness(base({ workflowOf: () => "", typeOf: () => "", partners: [] })), "PUMP").missing).toEqual(["No workflow", "No type", "No partner can take it"]);
  });
  it("does not count a partner that is not active, not approved, or has its capacity for the item set to 0", () => {
    const partners = [partner("hold", { status: "on_hold" }), partner("pending", { ddStatus: "pending" }), partner("zero", { benefitTerms: { PUMP: { capacity: 0 } } })];
    expect(by(itemReadiness(base({ partners })), "PUMP").partners).toEqual([]);
    expect(by(itemReadiness(base({ partners })), "SPONSOR").partners).toEqual(["ZERO"]); // its 0 only stops the pump
  });
  it("leaves a Custom Amount item for later: never ready, never missing anything", () => {
    const rows = itemReadiness(base());
    expect(by(rows, "CUSTOM")).toMatchObject({ custom: true, ready: false, missing: [] });
    expect(readySummary(rows)).toEqual({ ready: 1, checked: 3, custom: 1 }); // only the pump is ready of the three checked
  });
  it("lists the projects that offer an item by name, and counts the open ones that offer any", () => {
    const gps: GiftProject[] = [
      { id: "d", name: "Dadyal", crmNames: [], partnerIds: [], itemIds: ["PUMP", "SPONSOR"] },
      { id: "a", name: "Aghosh", crmNames: [], partnerIds: [], itemIds: ["SPONSOR"] },
      { id: "o1", name: "Open one", crmNames: [], partnerIds: [] },
      { id: "o2", name: "Open two", crmNames: [], partnerIds: [], auto: true },
    ];
    const rows = itemReadiness(base({ giftProjects: gps }));
    expect(by(rows, "PUMP").projects).toEqual(["Dadyal"]);
    expect(by(rows, "SPONSOR").projects).toEqual(["Dadyal", "Aghosh"]);
    expect(by(rows, "TENT").projects).toEqual([]);
    expect(by(rows, "TENT").openProjects).toBe(2); // two projects offer any item
  });
});
