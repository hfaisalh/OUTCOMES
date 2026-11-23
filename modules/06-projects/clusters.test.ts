/**
 * clusters.test.ts
 *
 * What it does: tests the clusters of a project (DECISIONS 158): levels, clusters in levels, the tree, and what cannot be removed. Uses the examples from Faisal: classrooms of a care home,
 * tent villages of a flood relief project, regions. Invented data. These tests double as examples. Who calls it: vitest. Depends on: clusters.ts.
 */

import { describe, expect, it } from "vitest";
import { addCluster, addLevel, applyClusterAction, clusterRows, emptyClusters, orderedLevels, removeCluster, removeLevel, renameLevel, setCluster, type ClusterState } from "./clusters";

const ok = (r: { value: ClusterState } | { error: string } | null): ClusterState => { if (r === null) throw new Error("not a cluster request"); if ("error" in r) throw new Error(r.error); return r.value; };

describe("levels", () => {
  it("adds levels in a chain, the first with nothing above it, and refuses a missing, repeated or too many names", () => {
    let s = ok(addLevel(emptyClusters(), "Region"));
    s = ok(addLevel(s, "Classroom"));
    expect(s.levels).toEqual([{ id: "region", name: "Region", parentId: "" }, { id: "classroom", name: "Classroom", parentId: "region" }]);
    expect(addLevel(s, "region")).toHaveProperty("error"); // a name is used once
    expect(addLevel(s, "x")).toHaveProperty("error");
    expect(addLevel(s, "Desk", "nope")).toHaveProperty("error");
    let many = emptyClusters();
    for (const n of ["One", "Two", "Three", "Four", "Five", "Six"]) many = ok(addLevel(many, n));
    expect(addLevel(many, "Seven")).toHaveProperty("error"); // at most six
  });
  it("renames a level, and removes one that nothing uses, moving the levels under it up one", () => {
    let s = ok(addLevel(ok(addLevel(ok(addLevel(emptyClusters(), "Region")), "Classroom")), "Desk"));
    s = ok(renameLevel(s, "classroom", "Class"));
    expect(s.levels[1]?.name).toBe("Class");
    expect(renameLevel(s, "classroom", "Region")).toHaveProperty("error");
    s = ok(removeLevel(s, "classroom"));
    expect(s.levels.map((l) => [l.id, l.parentId])).toEqual([["region", ""], ["desk", "region"]]); // the chain stays whole
    expect(removeLevel(s, "nope")).toHaveProperty("error");
  });
});

describe("clusters", () => {
  const care = (): ClusterState => ok(addLevel(ok(addLevel(emptyClusters(), "Block")), "Classroom"));
  it("adds a cluster of the first level, and a cluster inside the one above it, with a place and a capacity", () => {
    let s = ok(addCluster(care(), { name: "Block A", levelId: "block", place: "Lahore" }));
    s = ok(addCluster(s, { name: "5A", levelId: "classroom", parentId: "block-block-a", place: "Ground floor", capacity: "30" }));
    expect(s.clusters).toEqual([
      { id: "block-block-a", name: "Block A", levelId: "block", parentId: "", place: "Lahore", status: "active" },
      { id: "classroom-5a", name: "5A", levelId: "classroom", parentId: "block-block-a", place: "Ground floor", capacity: 30, status: "active" },
    ]);
  });
  it("refuses a cluster with no name, no level, in the wrong place, repeated, or with a bad capacity", () => {
    const s = ok(addCluster(care(), { name: "Block A", levelId: "block" }));
    expect(addCluster(s, { name: "", levelId: "block" })).toHaveProperty("error");
    expect(addCluster(s, { name: "B", levelId: "nope" })).toHaveProperty("error");
    expect(addCluster(s, { name: "5A", levelId: "classroom" })).toHaveProperty("error"); // must say which block it is in
    expect(addCluster(s, { name: "5A", levelId: "classroom", parentId: "nope" })).toHaveProperty("error");
    expect(addCluster(s, { name: "Block B", levelId: "block", parentId: "block-block-a" })).toHaveProperty("error"); // the first level sits in nothing
    expect(addCluster(s, { name: "block a", levelId: "block" })).toHaveProperty("error"); // a name is used once here
    expect(addCluster(s, { name: "Block C", levelId: "block", capacity: "-1" })).toHaveProperty("error");
    expect(addCluster(s, { name: "Block C", levelId: "block", capacity: "2.5" })).toHaveProperty("error");
    expect(ok(addCluster(s, { name: "Block C", levelId: "block", capacity: "" })).clusters[1]?.capacity).toBeUndefined(); // capacity is optional
  });
  it("lets the same name be used inside different clusters", () => {
    let s = ok(addCluster(ok(addCluster(care(), { name: "Block A", levelId: "block" })), { name: "Block B", levelId: "block" }));
    s = ok(addCluster(s, { name: "5A", levelId: "classroom", parentId: "block-block-a" }));
    expect(ok(addCluster(s, { name: "5A", levelId: "classroom", parentId: "block-block-b" })).clusters).toHaveLength(4);
    expect(addCluster(s, { name: "5a", levelId: "classroom", parentId: "block-block-a" })).toHaveProperty("error");
  });
  it("changes a cluster's name, place, capacity and status, not its level, and refuses bad values", () => {
    let s = ok(addCluster(care(), { name: "Block A", levelId: "block", capacity: 10 }));
    s = ok(setCluster(s, "block-block-a", { name: "Main block", place: "Lahore", capacity: "12", status: "closed" }));
    expect(s.clusters[0]).toMatchObject({ name: "Main block", place: "Lahore", capacity: 12, status: "closed", levelId: "block" });
    s = ok(setCluster(s, "block-block-a", { capacity: "" }));
    expect(s.clusters[0]?.capacity).toBeUndefined();
    expect(setCluster(s, "block-block-a", { status: "deleted" })).toHaveProperty("error");
    expect(setCluster(s, "block-block-a", { name: "x" })).toHaveProperty("error");
    expect(setCluster(s, "nope", { name: "Fine" })).toHaveProperty("error");
  });
  it("lists the clusters as a tree, each cluster under the one it is in", () => {
    let s = ok(addCluster(ok(addCluster(care(), { name: "Block B", levelId: "block" })), { name: "Block A", levelId: "block" }));
    s = ok(addCluster(s, { name: "6B", levelId: "classroom", parentId: "block-block-a" }));
    s = ok(addCluster(s, { name: "5A", levelId: "classroom", parentId: "block-block-a" }));
    expect(clusterRows(s).map((r) => `${"-".repeat(r.depth)}${r.levelName}: ${r.cluster.name}`)).toEqual(["Block: Block A", "-Classroom: 5A", "-Classroom: 6B", "Block: Block B"]);
  });
  it("refuses to remove a level clusters use or a cluster that holds clusters or beneficiaries", () => {
    let s = ok(addCluster(ok(addCluster(care(), { name: "Block A", levelId: "block" })), { name: "5A", levelId: "classroom", parentId: "block-block-a" }));
    expect(removeLevel(s, "classroom")).toHaveProperty("error");
    expect(removeCluster(s, "block-block-a")).toHaveProperty("error"); // 5A is inside it
    expect(removeCluster(s, "classroom-5a", 3)).toHaveProperty("error"); // 3 beneficiaries are in it
    s = ok(removeCluster(s, "classroom-5a"));
    s = ok(removeCluster(s, "block-block-a"));
    expect(s.clusters).toEqual([]);
    expect(removeCluster(s, "nope")).toHaveProperty("error");
  });
});

describe("requests and order", () => {
  it("applies the page's requests, and is not a cluster request for anything else", () => {
    let s = ok(applyClusterAction(emptyClusters(), { action: "cluster-level-add", name: "Tent village" }));
    s = ok(applyClusterAction(s, { action: "cluster-add", name: "Tent village 1", levelId: "tent-village", place: "North", capacity: "20" }));
    expect(s.clusters[0]).toMatchObject({ name: "Tent village 1", capacity: 20 });
    s = ok(applyClusterAction(s, { action: "cluster-set", clusterId: s.clusters[0]!.id, status: "closed" }));
    expect(s.clusters[0]?.status).toBe("closed");
    expect(applyClusterAction(s, { action: "cluster-remove", clusterId: s.clusters[0]!.id }, () => 2)).toHaveProperty("error");
    expect(applyClusterAction(s, { action: "cluster-level-rename", levelId: "tent-village", name: "Village" })).toHaveProperty("value");
    expect(applyClusterAction(s, { action: "save-gift-project" })).toBeNull();
  });
  it("puts the levels in order, first level first", () => {
    const s: ClusterState = { levels: [{ id: "b", name: "B", parentId: "a" }, { id: "a", name: "A", parentId: "" }, { id: "c", name: "C", parentId: "b" }], clusters: [] };
    expect(orderedLevels(s).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});
