/**
 * clusters.test.ts
 *
 * What it does: tests the clusters of a project (DECISIONS 158, 161): clusters and sub clusters with their own label, place, roles and status, capacity on the top cluster only and shared evenly down,
 * the tree, what cannot be removed, and reading what older projects saved with levels. Uses Faisal's examples: a university with faculties, a school with classes. Invented data.
 * These tests double as examples. Who calls it: vitest. Depends on: clusters.ts.
 */

import { describe, expect, it } from "vitest";
import { addCluster, applyClusterAction, clusterRows, clusterStateOf, emptyClusters, evenShare, insideCount, pathOf, removeCluster, setCluster, subRows, suggestLabel, type ClusterState } from "./clusters";

const ok = (r: { value: ClusterState } | { error: string } | null): ClusterState => { if (r === null) throw new Error("not a cluster request"); if ("error" in r) throw new Error(r.error); return r.value; };

// Lahore University (capacity 40) with two faculties, one holding two departments, and Al-Noor School with a class.
const sample = (): ClusterState => {
  let s = ok(addCluster(emptyClusters(), { name: "Lahore University", label: "University", place: "Lahore", capacity: "40", roles: "Principal" }));
  s = ok(addCluster(s, { name: "Science", label: "Faculty", parentId: "lahore-university" }));
  s = ok(addCluster(s, { name: "Arts", parentId: "lahore-university" })); // takes the label its sister uses
  s = ok(addCluster(s, { name: "Physics", label: "Department", parentId: "science" }));
  s = ok(addCluster(s, { name: "Chemistry", parentId: "science" }));
  return ok(addCluster(s, { name: "Al-Noor School", label: "School" }));
};

describe("clusters and sub clusters", () => {
  it("adds a top cluster with its own place, capacity and roles, and sub clusters of any depth inside it", () => {
    const s = sample();
    expect(s.clusters[0]).toEqual({ id: "lahore-university", name: "Lahore University", label: "University", parentId: "", place: "Lahore", capacity: 40, status: "active", roles: ["Principal"] });
    expect(s.clusters.find((c) => c.id === "physics")).toMatchObject({ parentId: "science", label: "Department" });
  });
  it("suggests the label brothers and sisters use, so names stay the same without a setup step", () => {
    const s = sample();
    expect(s.clusters.find((c) => c.id === "arts")?.label).toBe("Faculty");
    expect(s.clusters.find((c) => c.id === "chemistry")?.label).toBe("Department");
    expect(suggestLabel(s, "lahore-university")).toBe("Faculty");
    expect(suggestLabel(s, "al-noor-school")).toBe("Faculty"); // nothing inside yet: what other clusters one step down use
    expect(suggestLabel(emptyClusters(), "")).toBe("");
  });
  it("refuses a missing name, a missing parent, a repeated name or a bad capacity, and drops a capacity given to a sub cluster", () => {
    const s = sample();
    expect(addCluster(s, { name: "" })).toHaveProperty("error");
    expect(addCluster(s, { name: "Zed", parentId: "nope" })).toHaveProperty("error");
    expect(addCluster(s, { name: "science", parentId: "lahore-university" })).toHaveProperty("error"); // a name is used once inside the same cluster
    expect(addCluster(s, { name: "Science", parentId: "al-noor-school" })).toHaveProperty("value"); // but may be used inside another
    expect(addCluster(s, { name: "Big", capacity: "-1" })).toHaveProperty("error");
    expect(addCluster(s, { name: "Big", capacity: "2.5" })).toHaveProperty("error");
    expect(addCluster(s, { name: "Many", roles: "a1,b2,c3,d4,e5,f6,g7,h8,i9" })).toHaveProperty("error");
    expect(ok(addCluster(s, { name: "Law", parentId: "lahore-university", capacity: "9" })).clusters.find((c) => c.id === "law")?.capacity).toBeUndefined();
  });
  it("changes a cluster's name, label, place, roles and status, and capacity on a top cluster only", () => {
    let s = sample();
    s = ok(setCluster(s, "lahore-university", { name: "LU", label: "Campus", place: "Johar Town", capacity: "50", status: "closed", roles: "Principal, Registrar, principal" }));
    expect(s.clusters[0]).toMatchObject({ name: "LU", label: "Campus", place: "Johar Town", capacity: 50, status: "closed", roles: ["Principal", "Registrar"] });
    s = ok(setCluster(s, "lahore-university", { capacity: "", roles: "" }));
    expect(s.clusters[0]?.capacity).toBeUndefined();
    expect(s.clusters[0]?.roles).toBeUndefined();
    expect(setCluster(s, "physics", { capacity: "10" })).toHaveProperty("error"); // capacity is on the top cluster
    expect(setCluster(s, "physics", { status: "deleted" })).toHaveProperty("error");
    expect(setCluster(s, "physics", { name: "x" })).toHaveProperty("error");
    expect(setCluster(s, "nope", { name: "Fine" })).toHaveProperty("error");
  });
});

describe("capacity shared evenly down", () => {
  it("divides the total by the number of clusters at each step down, as a guide", () => {
    const s = sample();
    expect(evenShare(s, "lahore-university")).toBe(40);
    expect(evenShare(s, "science")).toBe(20); // 40 over 2 faculties
    expect(evenShare(s, "arts")).toBe(20);
    expect(evenShare(s, "physics")).toBe(10); // 20 over 2 departments
    expect(evenShare(s, "al-noor-school")).toBeUndefined(); // no total set
    expect(evenShare(s, "nope")).toBeUndefined();
  });
});

describe("the tree and removal", () => {
  it("lists the clusters as a tree, each sub cluster under the one it is in", () => {
    expect(clusterRows(sample()).map((r) => `${"-".repeat(r.depth)}${r.cluster.name}`)).toEqual(["Al-Noor School", "Lahore University", "-Arts", "-Science", "--Chemistry", "--Physics"]);
  });
  it("refuses to remove a cluster that holds sub clusters or beneficiaries", () => {
    let s = sample();
    expect(removeCluster(s, "science")).toHaveProperty("error"); // two departments are inside
    expect(removeCluster(s, "physics", 3)).toHaveProperty("error"); // 3 beneficiaries are in it
    s = ok(removeCluster(s, "physics"));
    expect(s.clusters.some((c) => c.id === "physics")).toBe(false);
    expect(removeCluster(s, "nope")).toHaveProperty("error");
  });
});

describe("what is inside a cluster", () => {
  it("lists the sub clusters of one cluster as a tree, depth 0 for those directly inside, and counts them all the way down", () => {
    const s = sample();
    expect(subRows(s, "lahore-university").map((r) => `${"-".repeat(r.depth)}${r.cluster.name}`)).toEqual(["Arts", "Science", "-Chemistry", "-Physics"]);
    expect(insideCount(s, "lahore-university")).toBe(4);
    expect(insideCount(s, "science")).toBe(2);
    expect(insideCount(s, "al-noor-school")).toBe(0);
  });
  it("gives the path from the top cluster down, for the line across the top of a cluster window", () => {
    expect(pathOf(sample(), "physics").map((c) => c.name)).toEqual(["Lahore University", "Science", "Physics"]);
    expect(pathOf(sample(), "nope")).toEqual([]);
  });
});

describe("requests and older projects", () => {
  it("applies the page's requests, and is not a cluster request for anything else", () => {
    let s = ok(applyClusterAction(emptyClusters(), { action: "cluster-add", name: "Tent village 1", place: "North", capacity: "20" }));
    expect(s.clusters[0]).toMatchObject({ name: "Tent village 1", capacity: 20 });
    s = ok(applyClusterAction(s, { action: "cluster-set", clusterId: s.clusters[0]!.id, status: "closed", roles: "Camp manager" }));
    expect(s.clusters[0]).toMatchObject({ status: "closed", roles: ["Camp manager"] });
    expect(applyClusterAction(s, { action: "cluster-remove", clusterId: s.clusters[0]!.id }, () => 2)).toHaveProperty("error");
    expect(applyClusterAction(s, { action: "save-gift-project" })).toBeNull();
  });
  it("reads a project saved with levels: the level name becomes the label, and a sub cluster's capacity is dropped", () => {
    const s = clusterStateOf(
      [{ id: "block", name: "Block", parentId: "" }, { id: "classroom", name: "Classroom", parentId: "block" }],
      [{ id: "block-a", name: "Block A", levelId: "block", parentId: "", place: "Lahore", capacity: 60, status: "active" } as never, { id: "5a", name: "5A", levelId: "classroom", parentId: "block-a", place: "", capacity: 30, status: "active" } as never],
    );
    expect(s.clusters.map((c) => [c.name, c.label, c.capacity])).toEqual([["Block A", "Block", 60], ["5A", "Classroom", undefined]]);
    expect(s.clusters.some((c) => "levelId" in c)).toBe(false);
    expect(clusterStateOf(undefined, undefined)).toEqual({ clusters: [] });
  });
});
