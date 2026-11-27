/**
 * cluster-people.test.ts
 *
 * What it does: tests the Beneficiaries tab of a cluster (DECISIONS 167) on invented people: the list of who is enrolled here and below, the capacity count on a master cluster, the form (benefit, beneficiary,
 * role), the messages when there is nothing to choose, and that names are never trusted as HTML. These tests double as examples. Who calls it: vitest. Depends on: cluster-people.ts and clusters-tab.ts.
 */

import { describe, expect, it } from "vitest";
import { clusterPeopleHtml, peopleCount, type PeopleContext } from "./cluster-people";
import { clustersTabHtml, clusterUi } from "./clusters-tab";
import type { ClusterState } from "../modules/06-projects/clusters";
import type { Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import type { Enrolment } from "../modules/07-beneficiaries/enrolments";

const state: ClusterState = { clusters: [
  { id: "home", name: "Aghosh Home", label: "Home", parentId: "", place: "", capacity: 10, status: "active", roles: ["Principal"] },
  { id: "class-1", name: "Class 1", label: "Class", parentId: "home", place: "", status: "active" },
  { id: "class-2", name: "Class 2", label: "Class", parentId: "home", place: "", status: "closed" },
] };
const person = (id: string, name: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility: "ready", eligibilityNote: "", partnerId: "", partnerRef: "", memberIds: [], ...over });
const enr = (id: string, b: string, clusterId: string, role = ""): Enrolment => ({ id, beneficiaryId: b, giftProjectId: "aghosh", clusterId, itemId: "I10", role, status: "active", since: "2026-11-24" });
const ctx = (over: Partial<PeopleContext> = {}): PeopleContext => ({
  projectId: "aghosh", items: [{ id: "I10", name: "Orphan Sponsorship Monthly" }],
  beneficiaries: [person("PRS-0001", "Ayesha Khan"), person("PRS-0002", "Eman Ali", { eligibility: "review" }), person("PRS-0003", "Old", { status: "inactive" })],
  enrolments: [enr("EN-0001", "PRS-0001", "class-1"), enr("EN-0002", "PRS-0002", "home", "Principal")], ...over,
});

describe("the Beneficiaries tab of a cluster", () => {
  it("lists who is enrolled in the cluster and everything inside it, with benefit, role, where and since", () => {
    const html = clusterPeopleHtml(state, state.clusters[0]!, ctx());
    expect(html).toContain("<b>Ayesha Khan</b>");
    expect(html).toContain("Orphan Sponsorship Monthly");
    expect(html).toContain("Class 1"); // where, for one inside a sub cluster
    expect(html).toContain("Here"); // the principal is enrolled in the master cluster itself
    expect(html).toContain("Principal");
    expect(html).toContain('data-cl="enr-end" data-id="EN-0001"');
    expect(html).toContain('<select data-cl="enr-move" data-id="EN-0001"');
  });
  it("shows only what is in a sub cluster on that sub cluster, and says when nobody is", () => {
    const sub = clusterPeopleHtml(state, state.clusters[1]!, ctx());
    expect(sub).toContain("Ayesha Khan");
    expect(sub).not.toContain("Eman Ali</b>");
    expect(clusterPeopleHtml(state, state.clusters[0]!, ctx({ enrolments: [] }))).toContain("Nobody is enrolled here yet.");
  });
  it("says how many of the master cluster's places are taken, not counting a role holder, and offers only open clusters to move to", () => {
    const html = clusterPeopleHtml(state, state.clusters[1]!, ctx());
    expect(html).toContain("<b>1</b> of <b>10</b> enrolled in Aghosh Home (capacity).");
    expect(peopleCount(state, ctx(), "home")).toBe(1);
    expect(html).toContain('<option value="home">Aghosh Home</option>');
    expect(html).not.toContain('<option value="class-2">'); // closed
  });
  it("offers the benefits, the active beneficiaries with their admission decision, and the roles this cluster lists", () => {
    const html = clusterPeopleHtml(state, state.clusters[0]!, ctx());
    expect(html).toContain('<select id="en-item"');
    expect(html).toContain("Ayesha Khan (PRS-0001) · Ready");
    expect(html).toContain("Eman Ali (PRS-0002) · Needs review");
    expect(html).not.toContain("Old (PRS-0003)"); // inactive
    expect(html).toContain('<option value="Principal">Principal</option>');
    expect(html).toContain('data-cl="enr-add" data-id="home"');
    expect(clusterPeopleHtml(state, state.clusters[1]!, ctx())).not.toContain('<option value="Principal">'); // Class 1 lists no role
  });
  it("says what to do first when the project offers no benefit or the register is empty", () => {
    expect(clusterPeopleHtml(state, state.clusters[0]!, ctx({ items: [] }))).toContain("No benefit of this project takes a person");
    expect(clusterPeopleHtml(state, state.clusters[0]!, ctx({ beneficiaries: [] }))).toContain("The register is empty");
  });
  it("appears as a third tab with its count, only when the tab is given the register", () => {
    clusterUi.node = "home"; clusterUi.nodeTab = "people";
    const html = clustersTabHtml(state, "", ctx());
    expect(html).toContain('data-cl="node-tab" data-tab="people">Beneficiaries <span class="muted">(1)</span>');
    expect(html).toContain("Enrol someone in Aghosh Home");
    clusterUi.nodeTab = "details";
    expect(clustersTabHtml(state)).not.toContain('data-tab="people"');
    clusterUi.node = ""; clusterUi.nodeTab = "details";
  });
  it("has a history button on a place that has had a gift, with how many, and none on a place that has not (DECISIONS 186)", () => {
    const allocations = [{ key: "sub:1", kind: "beneficiary" as const, enrolmentId: "EN-0001", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto" as const, at: "2026-01-01T00:00:00Z", to: "2026-03-01", endReason: "paused" as const }, { key: "sub:2", kind: "beneficiary" as const, enrolmentId: "EN-0001", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto" as const, at: "2026-04-01T00:00:00Z" }];
    const html = clusterPeopleHtml(state, state.clusters[0]!, ctx({ allocations }));
    expect(html).toContain('data-hist="enrolment" data-id="EN-0001"');
    expect(html).toContain("History (2)");
    expect(html).not.toContain('data-hist="enrolment" data-id="EN-0002"'); // the principal has had no gift
    expect(clusterPeopleHtml(state, state.clusters[0]!, ctx())).not.toContain("data-hist=");
  });
  it("never trusts a name as HTML", () => {
    const html = clusterPeopleHtml(state, state.clusters[0]!, ctx({ beneficiaries: [person("PRS-0001", "<img src=x onerror=alert(1)>")] }));
    expect(html).not.toContain("<img src=x");
  });
});
