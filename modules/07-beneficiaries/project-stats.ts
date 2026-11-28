/**
 * project-stats.ts
 *
 * What it does: the figures of one project for the Projects list (DECISIONS 245): the people enrolled in it, its clusters, the capacity of its top clusters and how many are enrolled and vacant, who is waiting, and the roles it needs.
 * Who calls it: app/projects/projects-page.ts. Depends on: the project and cluster types (module 6) and the enrolment rules (activeIn). Pure: no database, no page, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Places are the capacity set on a project's top clusters (DECISIONS 161). A cluster with no capacity set adds none, and a project with none has no capacity figure (shown as a dash), never zero.
 * - A place is taken by an active enrolment inside the top cluster or under it. Role holders do not take a place (DECISIONS 167).
 * - Vacant places are counted for each top cluster on its own (never below 0), so an overfull cluster does not hide the room in another.
 * - A project needs set-up when it was made automatically from a gift (and not saved by a person since) or has no partner to deliver it.
 */
import { clusterStateOf } from "../06-projects/clusters.js";
import type { GiftProject } from "../06-projects/projects.js";
import type { Register } from "./beneficiaries.js";
import { activeIn, type Enrolments } from "./enrolments.js";
import { poolOf } from "./waiting.js";

export interface ProjectStats {
  beneficiaries: number; // distinct people or households with an active enrolment in the project
  clusters: number; // active clusters, at any depth
  capacity: number | undefined; // places in the top clusters that have a capacity, undefined when none has
  taken: number;
  vacant: number | undefined;
  waiting: number; // ready and meant for this project, in line for a vacancy (DECISIONS 246)
  review: number; // meant for this project, but a person has to look at the record first
  roles: number; // roles the clusters need, added up
  benefits: number; // benefits it offers, 0 meaning any
  partners: number;
  setup: "ready" | "automatic" | "no-partner"; // what needs doing, if anything
}

export function projectStats(g: GiftProject, enr: Enrolments, reg?: Register): ProjectStats {
  const pool = reg ? poolOf(reg, enr, g.id) : { waiting: [], review: [] };
  const state = clusterStateOf(g.levels, g.clusters);
  const live = state.clusters.filter((c) => c.status === "active");
  const tops = live.filter((c) => c.parentId === "" && c.capacity !== undefined);
  let taken = 0, vacant = 0;
  for (const t of tops) {
    const n = activeIn(enr, state, g.id, t.id, true).length;
    taken += n;
    vacant += Math.max(0, (t.capacity as number) - n);
  }
  return {
    beneficiaries: new Set(enr.records.filter((e) => e.status === "active" && e.giftProjectId === g.id).map((e) => e.beneficiaryId)).size,
    clusters: live.length,
    capacity: tops.length > 0 ? tops.reduce((n, t) => n + (t.capacity as number), 0) : undefined,
    taken,
    vacant: tops.length > 0 ? vacant : undefined,
    waiting: pool.waiting.length,
    review: pool.review.length,
    roles: live.reduce((n, c) => n + (c.roles?.length ?? 0), 0),
    benefits: (g.itemIds ?? []).length,
    partners: g.partnerIds.length,
    setup: g.partnerIds.length === 0 ? "no-partner" : g.auto ? "automatic" : "ready",
  };
}
