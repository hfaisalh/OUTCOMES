/**
 * allocate-page.test.ts
 *
 * What it does: tests the Allocate page (DECISIONS 175) on invented gifts, children and a project: the counts, the places with how full each is, the gifts with where each went or why not, the filter, the empty
 * states, and that names are never trusted as HTML. These tests double as examples. Who calls it: vitest. Depends on: allocate-page.ts.
 */

import { describe, expect, it } from "vitest";
import { allocatePage } from "./allocate-page";
import type { View } from "./pages";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import type { Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import type { Project } from "../modules/06-projects/projects";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T-${key}`, paidDate: `2026-10-${key.slice(-2)}`, supporterId: "S1", supporterName: "Invented Donor", group: "", itemId: "I10", itemName: "Orphan Sponsorship Monthly", amount: 30, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "sponsorship", status: "ready", projectName: "Aghosh", ...over,
});
const child = (id: string, name: string): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility: "ready", eligibilityNote: "", partnerId: "", partnerRef: "", memberIds: [] });
const partner = { id: "trust", name: "Trust", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved" } as Project;
const view = (over: Partial<View> = {}): View => ({
  workOrders: [wo("G01"), wo("G02"), wo("G03")], projects: [partner], today: "2026-11-24", frameworks: [{ id: "wf", unitsPerBeneficiary: 3 } as FrameworkTemplate], outcomeTypes: [],
  giftProjects: [{ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: ["trust"], clusters: [{ id: "c1", name: "Class 1", label: "Class", parentId: "", place: "", status: "active" }] }],
  beneficiaries: { records: [child("B1", "Amina"), child("B2", "Bilal")], counters: {} },
  enrolments: { records: [{ id: "EN-1", beneficiaryId: "B1", giftProjectId: "aghosh", clusterId: "c1", itemId: "I10", role: "", status: "active", since: "2026-11-01" }, { id: "EN-2", beneficiaryId: "B2", giftProjectId: "aghosh", clusterId: "c1", itemId: "I10", role: "", status: "active", since: "2026-11-01" }], counter: 2 },
  assignments: { records: ["G01", "G02", "G03"].map((key) => ({ key, partnerId: "trust", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto" as const, at: "2026-11-02T00:00:00Z" })) },
  ...over,
}) as View;

describe("the Allocate page", () => {
  it("counts the assigned gifts, those placed, outcomes created and those waiting", () => {
    const html = allocatePage(view());
    expect(html).toContain("<h1>Allocate</h1>");
    expect(html).toContain("<b>3</b><span>Assigned gifts</span>");
    expect(html).toContain("<b>0</b><span>Placed in a place</span>");
    expect(html).toContain("<b>0</b><span>Outcomes created</span>");
    expect(html).toContain("<b>0</b><span>Wait, no open place</span>");
    expect(html).toContain('data-plc="run"');
    expect(html).toContain('data-plc="reset" disabled');
  });
  it("lists every open place, with its project and cluster and how full it is out of the units that make a child", () => {
    const html = allocatePage(view());
    expect(html).toContain("<td>Amina <span class=\"muted\">EN-1</span></td>");
    expect(html).toContain("Aghosh › Class 1");
    expect(html).toContain('<td class="num">0 of 3</td>');
    expect(html).toContain('<span class="pill muted">Open</span>');
    const placed = allocatePage(view({ placements: { counter: 0, records: [{ key: "G01", kind: "place", enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto", at: "x" }] } }));
    expect(placed).toContain('<td class="num">3 of 3</td>');
    expect(placed).toContain('<span class="pill">Full</span>');
  });
  it("shows where each gift would go and the places it could fill, the open ones chosen from a list", () => {
    const html = allocatePage(view());
    expect(html).toContain("Suggested: Amina");
    expect(html).toContain("Fills a place for Amina (0 of 3 units taken)");
    expect(html).toContain('<option value="EN-2">Bilal (0 of 3)</option>');
  });
  it("shows a placed gift with the child and a button to take it back, and a gift that waits with the reason", () => {
    const placed = allocatePage(view({ placements: { counter: 0, records: [{ key: "G01", kind: "place", enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto", at: "x" }] } }));
    expect(placed).toContain('<span class="pill">Placed</span>');
    expect(placed).toContain('data-plc="unplace" data-key="G01"');
    expect(placed).not.toContain('data-plc="reset" disabled');
    const none = allocatePage(view({ enrolments: { records: [], counter: 0 } }));
    expect(none).toContain("<b>3</b><span>Wait, no open place</span>");
    expect(none).toContain("<b>Why gifts wait:</b> 3 no approved beneficiary is enrolled in the gift&#39;s project");
    expect(none).toContain("No place is open. Enrol approved beneficiaries");
  });
  it("says which project and benefit the waiting gifts belong to, and names an item with no type", () => {
    const none = allocatePage(view({ enrolments: { records: [], counter: 0 } }));
    expect(none).toContain("<b>Waiting, by project and benefit:</b> Aghosh · Orphan Sponsorship Monthly (3)");
    const untyped = allocatePage(view({ workOrders: [wo("G01", { itemId: "I77", itemName: "Mystery Item" })], assignments: { records: [{ key: "G01", partnerId: "trust", giftProjectId: "", itemId: "I77", parts: 1, how: "auto", at: "x" }] } }));
    expect(untyped).toContain("1 the item has no type yet (choose one on the Benefits page)");
    expect(untyped).toContain("No project · Mystery Item (1)");
  });
  it("creates an outcome for a gift-first type, shown without a place", () => {
    const pump = view({ workOrders: [wo("G01", { itemId: "I11", itemName: "Small Pump" })], itemKinds: { I11: "build" }, assignments: { records: [{ key: "G01", partnerId: "trust", giftProjectId: "aghosh", itemId: "I11", parts: 1, how: "auto", at: "x" }] } });
    const html = allocatePage(pump);
    expect(html).toContain("Outcome, no place needed");
    expect(html).toContain("Creates an outcome. Its recipients are enrolled after.");
  });
  it("filters to the gifts that wait or are placed, and says so when nothing is assigned", () => {
    const placements = { counter: 0, records: [{ key: "G01", kind: "place" as const, enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 1, how: "auto" as const, at: "x" }] };
    expect(allocatePage(view({ placements, allocFilter: "placed" }))).not.toContain('data-key="G02"');
    expect(allocatePage(view({ placements, allocFilter: "open" }))).not.toContain('data-plc="unplace" data-key="G01"');
    expect(allocatePage(view({ assignments: { records: [] } }))).toContain("No gift has been assigned yet.");
  });
  it("never trusts a name as HTML", () => {
    const html = allocatePage(view({ beneficiaries: { records: [child("B1", "<img src=x onerror=alert(1)>"), child("B2", "Bilal")], counters: {} } }));
    expect(html).not.toContain("<img src=x");
  });
});
