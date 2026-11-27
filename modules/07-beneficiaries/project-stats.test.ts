/**
 * project-stats.test.ts
 *
 * What it does: shows the figures of a project (DECISIONS 245) on invented data: places, taken and vacant, people, clusters, roles, and what needs set-up.
 */
import { describe, expect, it } from "vitest";
import { projectStats } from "./project-stats";
import type { GiftProject } from "../06-projects/projects";
import type { Enrolment, Enrolments } from "./enrolments";

const en = (id: string, who: string, cluster: string, over: Partial<Enrolment> = {}): Enrolment => ({ id, beneficiaryId: who, giftProjectId: "p", clusterId: cluster, itemId: "I1", role: "", status: "active", since: "2026-09-01", ...over });
const gp = (over: Partial<GiftProject> = {}): GiftProject => ({
  id: "p", name: "Aghosh", crmNames: [], partnerIds: ["a", "b"], itemIds: ["I1", "I2"],
  clusters: [
    { id: "home", name: "Home", label: "Home", parentId: "", place: "", capacity: 10, status: "active", roles: ["Principal"] },
    { id: "c1", name: "Class 1", label: "Class", parentId: "home", place: "", status: "active" },
    { id: "far", name: "Far home", label: "Home", parentId: "", place: "", capacity: 2, status: "active" },
    { id: "old", name: "Closed home", label: "Home", parentId: "", place: "", capacity: 50, status: "closed" },
  ], ...over,
}) as GiftProject;
const enr = (records: Enrolment[]): Enrolments => ({ records, counter: records.length });

describe("the figures of a project", () => {
  it("adds up the places of its top clusters, the ones taken inside them, and what is vacant in each", () => {
    const s = projectStats(gp(), enr([en("1", "P1", "home"), en("2", "P2", "c1"), en("3", "P3", "far"), en("4", "P4", "far"), en("5", "P5", "far"), en("6", "P6", "home", { role: "Principal" })]));
    expect(s.capacity).toBe(12); // the closed cluster does not count
    expect(s.taken).toBe(5); // the role holder takes no place
    expect(s.vacant).toBe(8); // 8 free at Home, none at Far home (3 taken of 2 does not hide the 8)
    expect(s.beneficiaries).toBe(6); // the role holder is a person in the project too
    expect(s.clusters).toBe(3);
    expect(s.roles).toBe(1);
    expect(s.benefits).toBe(2);
    expect(s.partners).toBe(2);
    expect(s.setup).toBe("ready");
  });
  it("counts a person enrolled twice once, and leaves out ended enrolments and other projects", () => {
    const s = projectStats(gp(), enr([en("1", "P1", "home"), en("2", "P1", "c1", { itemId: "I2" }), en("3", "P2", "home", { status: "ended" }), en("4", "P3", "home", { giftProjectId: "other" })]));
    expect(s.beneficiaries).toBe(1);
    expect(s.taken).toBe(2); // both of P1's enrolments sit in the cluster, as the capacity rule counts them
  });
  it("has no capacity figure when no top cluster has one, and says what needs set-up", () => {
    const s = projectStats(gp({ clusters: [{ id: "h", name: "H", label: "", parentId: "", place: "", status: "active" }], partnerIds: [], auto: true }), enr([]));
    expect(s.capacity).toBeUndefined();
    expect(s.vacant).toBeUndefined();
    expect(s.setup).toBe("no-partner");
    expect(projectStats(gp({ auto: true }), enr([])).setup).toBe("automatic");
    expect(projectStats(gp({ clusters: undefined, itemIds: undefined }), enr([])).benefits).toBe(0);
  });
});
