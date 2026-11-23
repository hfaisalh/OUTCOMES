/**
 * clusters.ts
 *
 * What it does: the clusters of a project (DECISIONS 152, 158). A cluster organises a cohort of beneficiaries inside a project: a region, a classroom of a care home, a tent village of a flood
 * relief project, a medical camp of an eye clinic project. A project defines its own levels (Region, then Classroom) and places clusters in them. A cluster has a name, a level, the cluster
 * it sits in (if its level has one above), a place, a capacity or target, and a status. A cluster has no configuration link to benefits: it only groups beneficiaries.
 * Who calls it: the Clusters tab of the project window (app/project-form.ts) and the project actions (modules/06-projects/projects.ts). Depends on: nothing. Pure functions: no database, no screen.
 *
 * Rules:
 * - Levels are a chain: the first has nothing above it, each other level sits under one level (usually the one before). At most 6 levels, and a name is used once.
 * - A cluster belongs to one level. If that level sits under another, the cluster sits inside a cluster of that level above, and must say which. A cluster of the first level sits in nothing.
 * - A name is used once among the clusters inside the same cluster (or among the first level).
 * - A level that clusters use cannot be removed. A cluster that holds clusters cannot be removed. (When beneficiaries are placed in clusters, one that holds beneficiaries cannot be removed either.)
 * - Capacity is optional: a whole number from 0 to 100000.
 * - Nothing is changed in place: every function returns a new value.
 */

export interface ClusterLevel { id: string; name: string; parentId: string } // parentId "" is the first level
export type ClusterStatus = "active" | "closed";
export interface Cluster { id: string; name: string; levelId: string; parentId: string; place: string; capacity?: number; status: ClusterStatus } // parentId "" sits in nothing

export interface ClusterState { levels: ClusterLevel[]; clusters: Cluster[] }
type Result = { value: ClusterState } | { error: string };

export const MAX_CLUSTER_LEVELS = 6;
const clean = (s: unknown): string => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
const uniqueId = (base: string, taken: string[]): string => { const root = slug(base); let id = root; for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`; return id; };

export const emptyClusters = (): ClusterState => ({ levels: [], clusters: [] });

// ---- Levels ----
export function addLevel(s: ClusterState, name: string, parentId = ""): Result {
  const n = clean(name).slice(0, 40);
  if (n.length < 2) return { error: "Give the level a name, for example Classroom." };
  if (s.levels.length >= MAX_CLUSTER_LEVELS) return { error: `A project has at most ${MAX_CLUSTER_LEVELS} levels.` };
  if (s.levels.some((l) => same(l.name, n))) return { error: `There is already a level called ${n}.` };
  const parent = s.levels.length === 0 ? "" : parentId !== "" ? parentId : (s.levels[s.levels.length - 1] as ClusterLevel).id; // by default under the last level
  if (parent !== "" && !s.levels.some((l) => l.id === parent)) return { error: "The level above was not found." };
  return { value: { ...s, levels: [...s.levels, { id: uniqueId(n, s.levels.map((l) => l.id)), name: n, parentId: parent }] } };
}

export function renameLevel(s: ClusterState, id: string, name: string): Result {
  const n = clean(name).slice(0, 40);
  if (!s.levels.some((l) => l.id === id)) return { error: "That level was not found." };
  if (n.length < 2) return { error: "Give the level a name." };
  if (s.levels.some((l) => l.id !== id && same(l.name, n))) return { error: `There is already a level called ${n}.` };
  return { value: { ...s, levels: s.levels.map((l) => (l.id === id ? { ...l, name: n } : l)) } };
}

// Rule: a level that clusters use cannot be removed. Removing a level with levels under it moves them up one, so the chain stays whole.
export function removeLevel(s: ClusterState, id: string): Result {
  const l = s.levels.find((x) => x.id === id);
  if (!l) return { error: "That level was not found." };
  const used = s.clusters.filter((c) => c.levelId === id).length;
  if (used > 0) return { error: `${used} cluster${used === 1 ? " uses" : "s use"} this level, so it cannot be removed.` };
  return { value: { ...s, levels: s.levels.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: l.parentId } : x)) } };
}

// ---- Clusters ----
const validCapacity = (c: unknown): number | undefined | "bad" => {
  const t = typeof c === "number" ? String(c) : clean(c);
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : "bad";
};

export function addCluster(s: ClusterState, raw: { name: unknown; levelId: unknown; parentId?: unknown; place?: unknown; capacity?: unknown }): Result {
  const name = clean(raw.name).slice(0, 80);
  const levelId = clean(raw.levelId);
  const parentId = clean(raw.parentId);
  const level = s.levels.find((l) => l.id === levelId);
  if (name.length < 2) return { error: "Give the cluster a name." };
  if (!level) return { error: "Choose a level." };
  if (level.parentId === "") { if (parentId !== "") return { error: "A cluster of the first level sits in nothing." }; }
  else {
    const parent = s.clusters.find((c) => c.id === parentId);
    if (!parent) return { error: `Choose the ${s.levels.find((l) => l.id === level.parentId)?.name ?? "cluster"} it is in.` };
    if (parent.levelId !== level.parentId) return { error: `A ${level.name} sits in a ${s.levels.find((l) => l.id === level.parentId)?.name ?? "cluster of the level above"}.` };
  }
  if (s.clusters.some((c) => c.parentId === parentId && c.levelId === levelId && same(c.name, name))) return { error: `There is already a ${level.name} called ${name} here.` };
  const capacity = validCapacity(raw.capacity);
  if (capacity === "bad") return { error: "Capacity is a whole number, or leave it empty." };
  const cluster: Cluster = { id: uniqueId(`${level.name}-${name}`, s.clusters.map((c) => c.id)), name, levelId, parentId, place: clean(raw.place).slice(0, 120), ...(capacity !== undefined ? { capacity } : {}), status: "active" };
  return { value: { ...s, clusters: [...s.clusters, cluster] } };
}

// Rule: a cluster can change its name, place, capacity and status. Its level and the cluster it is in do not change (remove it and add it again instead).
export function setCluster(s: ClusterState, id: string, patch: { name?: unknown; place?: unknown; capacity?: unknown; status?: unknown }): Result {
  const c = s.clusters.find((x) => x.id === id);
  if (!c) return { error: "That cluster was not found." };
  const next: Cluster = { ...c };
  if (patch.name !== undefined) {
    const n = clean(patch.name).slice(0, 80);
    if (n.length < 2) return { error: "Give the cluster a name." };
    if (s.clusters.some((x) => x.id !== id && x.parentId === c.parentId && x.levelId === c.levelId && same(x.name, n))) return { error: `There is already one called ${n} here.` };
    next.name = n;
  }
  if (patch.place !== undefined) next.place = clean(patch.place).slice(0, 120);
  if (patch.capacity !== undefined) {
    const cap = validCapacity(patch.capacity);
    if (cap === "bad") return { error: "Capacity is a whole number, or leave it empty." };
    if (cap === undefined) delete next.capacity; else next.capacity = cap;
  }
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "closed") return { error: "That status is not known." };
    next.status = patch.status;
  }
  return { value: { ...s, clusters: s.clusters.map((x) => (x.id === id ? next : x)) } };
}

// Rule: a cluster that holds clusters cannot be removed. `held` is the number of beneficiaries in it, which blocks removal once beneficiaries are placed in clusters.
export function removeCluster(s: ClusterState, id: string, held = 0): Result {
  if (!s.clusters.some((c) => c.id === id)) return { error: "That cluster was not found." };
  const inside = s.clusters.filter((c) => c.parentId === id).length;
  if (inside > 0) return { error: `${inside} cluster${inside === 1 ? " is" : "s are"} inside it. Remove ${inside === 1 ? "that one" : "those"} first.` };
  if (held > 0) return { error: `${held} beneficiar${held === 1 ? "y is" : "ies are"} in it, so it cannot be removed.` };
  return { value: { ...s, clusters: s.clusters.filter((c) => c.id !== id) } };
}

// The clusters as a tree, in order, with how deep each is, for one row each on the page. First level by name, then each one's clusters under it.
export interface ClusterRow { cluster: Cluster; depth: number; levelName: string }
export function clusterRows(s: ClusterState): ClusterRow[] {
  const out: ClusterRow[] = [];
  const walk = (parentId: string, depth: number): void => {
    const here = s.clusters.filter((c) => c.parentId === parentId).sort((a, b) => a.levelId.localeCompare(b.levelId) || a.name.localeCompare(b.name));
    for (const c of here) { out.push({ cluster: c, depth, levelName: s.levels.find((l) => l.id === c.levelId)?.name ?? "" }); walk(c.id, depth + 1); }
  };
  walk("", 0);
  return out;
}

// The levels in order, first level first, with the level above each.
export function orderedLevels(s: ClusterState): ClusterLevel[] {
  const out: ClusterLevel[] = [];
  let parent = "";
  for (let i = 0; i < s.levels.length; i++) { const next = s.levels.find((l) => l.parentId === parent && !out.includes(l)); if (!next) break; out.push(next); parent = next.id; }
  for (const l of s.levels) if (!out.includes(l)) out.push(l);
  return out;
}

/**
 * The requests the page makes on clusters, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about clusters.
 */
export function applyClusterAction(s: ClusterState, body: Record<string, unknown>, held: (clusterId: string) => number = () => 0): Result | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "cluster-level-add": return addLevel(s, str("name"), str("parentId"));
    case "cluster-level-rename": return renameLevel(s, str("levelId"), str("name"));
    case "cluster-level-remove": return removeLevel(s, str("levelId"));
    case "cluster-add": return addCluster(s, { name: body["name"], levelId: body["levelId"], parentId: body["parentId"], place: body["place"], capacity: body["capacity"] });
    case "cluster-set": return setCluster(s, str("clusterId"), { ...(typeof body["name"] === "string" ? { name: body["name"] } : {}), ...(typeof body["place"] === "string" ? { place: body["place"] } : {}), ...(body["capacity"] !== undefined ? { capacity: body["capacity"] } : {}), ...(typeof body["status"] === "string" ? { status: body["status"] } : {}) });
    case "cluster-remove": return removeCluster(s, str("clusterId"), held(str("clusterId")));
    default: return null;
  }
}
