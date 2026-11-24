/**
 * clusters.ts
 *
 * What it does: the clusters of a project (DECISIONS 152, 158, 161). A cluster is a master distribution of a project: a school, a university, a care home, a region, a tent village.
 * Inside a cluster there are sub clusters, as many as are needed, to any depth: a faculty, a department, a classroom, a hostel. Each cluster or sub cluster has its own name, its own label
 * (what it is called, for example Home or Classroom), its own place, status and roles (the people it needs, for example Principal or Warden). There is no shared chain of levels: how deep a
 * cluster is comes from where it sits. A cluster has no configuration link to benefits: it only groups beneficiaries, who are enrolled into a node later.
 * Who calls it: the Clusters tab of the project window (app/clusters-tab.ts) and the project actions (modules/06-projects/projects.ts). Depends on: nothing. Pure functions: no database, no screen.
 *
 * Rules:
 * - A cluster of the top sits in nothing. A sub cluster sits inside one cluster, chosen by pressing "add sub cluster" on that cluster.
 * - A name is used once among the clusters inside the same cluster (or among the top ones).
 * - Rule (Faisal, 24/11/2026): capacity is set on the top cluster only, as the total. Sub clusters have none. The total is shared evenly downstream as a guide (evenShare), never a limit.
 * - The label is free text, up to 40 characters. A new sub cluster is suggested the label its brothers and sisters use, so names stay the same without a setup step.
 * - Roles are names of the people a cluster needs (Principal, Warden), up to 8, each up to 40 characters. Who holds them comes with the beneficiary register.
 * - A cluster that holds sub clusters cannot be removed. (When beneficiaries are enrolled, one that holds beneficiaries cannot be removed either.)
 * - Older projects stored a shared chain of levels. clusterStateOf turns those into labels, so nothing saved is lost.
 * - Nothing is changed in place: every function returns a new value.
 */

// Kept only to read what older projects saved.
export interface ClusterLevel { id: string; name: string; parentId: string }
export type ClusterStatus = "active" | "closed";
export interface Cluster {
  id: string;
  name: string;
  label: string; // what it is called: Home, Classroom, Faculty. "" when not said
  parentId: string; // "" sits in nothing (a top cluster)
  place: string;
  capacity?: number; // top clusters only
  status: ClusterStatus;
  roles?: string[]; // the people it needs, for example Principal
  levelId?: string; // older: the level it was in. Turned into the label by clusterStateOf
}

export interface ClusterState { clusters: Cluster[] }
type Result = { value: ClusterState } | { error: string };

export const MAX_ROLES = 8;
const clean = (s: unknown): string => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
const uniqueId = (base: string, taken: string[]): string => { const root = slug(base); let id = root; for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`; return id; };

export const emptyClusters = (): ClusterState => ({ clusters: [] });

// Rule: older projects saved levels. The level's name becomes the cluster's label, and the capacity of a sub cluster is dropped (capacity is on the top cluster only).
export function clusterStateOf(levels: ClusterLevel[] | undefined, clusters: Cluster[] | undefined): ClusterState {
  return {
    clusters: (clusters ?? []).map((c) => {
      const { levelId, ...rest } = c;
      const label = rest.label ?? levels?.find((l) => l.id === levelId)?.name ?? "";
      const next: Cluster = { ...rest, label, parentId: rest.parentId ?? "" };
      if (next.parentId !== "") delete next.capacity;
      return next;
    }),
  };
}

const validCapacity = (c: unknown): number | undefined | "bad" => {
  const t = typeof c === "number" ? String(c) : clean(c);
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : "bad";
};

// Roles come as a list or as one text with commas ("Principal, Warden").
export function cleanRoles(raw: unknown): string[] | "bad" {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const out: string[] = [];
  for (const r of list) {
    const n = clean(r).slice(0, 40);
    if (n !== "" && !out.some((x) => same(x, n))) out.push(n);
  }
  return out.length > MAX_ROLES ? "bad" : out;
}

const depthOf = (s: ClusterState, c: Cluster): number => { let d = 0; for (let p = s.clusters.find((x) => x.id === c.parentId); p; p = s.clusters.find((x) => x.id === p?.parentId)) d++; return d; };

// The label a new cluster inside `parentId` is suggested: what its brothers and sisters use, else what other clusters at that depth use, else nothing.
export function suggestLabel(s: ClusterState, parentId: string): string {
  const sib = s.clusters.find((c) => c.parentId === parentId && c.label !== "");
  if (sib) return sib.label;
  const parent = s.clusters.find((c) => c.id === parentId);
  const depth = parent ? depthOf(s, parent) + 1 : 0;
  return s.clusters.find((c) => c.label !== "" && depthOf(s, c) === depth)?.label ?? "";
}

export function addCluster(s: ClusterState, raw: { name: unknown; label?: unknown; parentId?: unknown; place?: unknown; capacity?: unknown; roles?: unknown }): Result {
  const name = clean(raw.name).slice(0, 80);
  const parentId = clean(raw.parentId);
  if (name.length < 2) return { error: "Give the cluster a name." };
  if (parentId !== "" && !s.clusters.some((c) => c.id === parentId)) return { error: "The cluster it sits in was not found." };
  if (s.clusters.some((c) => c.parentId === parentId && same(c.name, name))) return { error: `There is already one called ${name} here.` };
  const capacity = validCapacity(raw.capacity);
  if (capacity === "bad") return { error: "Capacity is a whole number, or leave it empty." };
  const roles = cleanRoles(raw.roles ?? "");
  if (roles === "bad") return { error: `A cluster has at most ${MAX_ROLES} roles.` };
  const label = raw.label === undefined ? suggestLabel(s, parentId) : clean(raw.label).slice(0, 40);
  const cluster: Cluster = { id: uniqueId(name, s.clusters.map((c) => c.id)), name, label, parentId, place: clean(raw.place).slice(0, 120), ...(capacity !== undefined && parentId === "" ? { capacity } : {}), status: "active", ...(roles.length ? { roles } : {}) };
  return { value: { clusters: [...s.clusters, cluster] } };
}

// Rule: a cluster can change its name, label, place, capacity (top cluster only), status and roles. Where it sits does not change (remove it and add it again instead).
export function setCluster(s: ClusterState, id: string, patch: { name?: unknown; label?: unknown; place?: unknown; capacity?: unknown; status?: unknown; roles?: unknown }): Result {
  const c = s.clusters.find((x) => x.id === id);
  if (!c) return { error: "That cluster was not found." };
  const next: Cluster = { ...c };
  if (patch.name !== undefined) {
    const n = clean(patch.name).slice(0, 80);
    if (n.length < 2) return { error: "Give the cluster a name." };
    if (s.clusters.some((x) => x.id !== id && x.parentId === c.parentId && same(x.name, n))) return { error: `There is already one called ${n} here.` };
    next.name = n;
  }
  if (patch.label !== undefined) next.label = clean(patch.label).slice(0, 40);
  if (patch.place !== undefined) next.place = clean(patch.place).slice(0, 120);
  if (patch.capacity !== undefined) {
    const cap = validCapacity(patch.capacity);
    if (cap === "bad") return { error: "Capacity is a whole number, or leave it empty." };
    if (cap !== undefined && c.parentId !== "") return { error: "Capacity is set on the cluster, not on its sub clusters. It is shared evenly down." };
    if (cap === undefined) delete next.capacity; else next.capacity = cap;
  }
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "closed") return { error: "That status is not known." };
    next.status = patch.status;
  }
  if (patch.roles !== undefined) {
    const roles = cleanRoles(patch.roles);
    if (roles === "bad") return { error: `A cluster has at most ${MAX_ROLES} roles.` };
    if (roles.length) next.roles = roles; else delete next.roles;
  }
  return { value: { clusters: s.clusters.map((x) => (x.id === id ? next : x)) } };
}

// Rule: a cluster that holds sub clusters cannot be removed. `held` is the number of beneficiaries in it, which blocks removal once beneficiaries are enrolled.
export function removeCluster(s: ClusterState, id: string, held = 0): Result {
  if (!s.clusters.some((c) => c.id === id)) return { error: "That cluster was not found." };
  const inside = s.clusters.filter((c) => c.parentId === id).length;
  if (inside > 0) return { error: `${inside} sub cluster${inside === 1 ? " is" : "s are"} inside it. Remove ${inside === 1 ? "that one" : "those"} first.` };
  if (held > 0) return { error: `${held} beneficiar${held === 1 ? "y is" : "ies are"} in it, so it cannot be removed.` };
  return { value: { clusters: s.clusters.filter((c) => c.id !== id) } };
}

/**
 * Rule (Faisal, 24/11/2026): the total capacity of a top cluster is shared evenly down through its sub clusters, as a guide. A sub cluster's share is the top total divided by the number of
 * clusters at each step down (40 places over 4 classrooms is 10 each; over 2 faculties of 2 departments each, 10 per department). Undefined when the top cluster has no capacity.
 */
export function evenShare(s: ClusterState, id: string): number | undefined {
  let c = s.clusters.find((x) => x.id === id);
  if (!c) return undefined;
  let divisor = 1;
  while (c.parentId !== "") {
    const parentId: string = c.parentId;
    divisor *= Math.max(1, s.clusters.filter((x) => x.parentId === parentId).length);
    const up: Cluster | undefined = s.clusters.find((x) => x.id === parentId);
    if (!up) return undefined;
    c = up;
  }
  return c.capacity === undefined ? undefined : Math.round((c.capacity / divisor) * 10) / 10;
}

// The clusters as a tree, in order, with how deep each is, for one row each on the page. Top clusters by name, then each one's sub clusters under it.
export interface ClusterRow { cluster: Cluster; depth: number }
export function clusterRows(s: ClusterState): ClusterRow[] {
  const out: ClusterRow[] = [];
  const walk = (parentId: string, depth: number): void => {
    const here = s.clusters.filter((c) => c.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of here) { out.push({ cluster: c, depth }); walk(c.id, depth + 1); }
  };
  walk("", 0);
  return out;
}

/**
 * The requests the page makes on clusters, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about clusters.
 */
export function applyClusterAction(s: ClusterState, body: Record<string, unknown>, held: (clusterId: string) => number = () => 0): Result | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "cluster-add": return addCluster(s, { name: body["name"], ...(body["label"] !== undefined ? { label: body["label"] } : {}), parentId: body["parentId"], place: body["place"], capacity: body["capacity"], roles: body["roles"] });
    case "cluster-set": return setCluster(s, str("clusterId"), { ...(typeof body["name"] === "string" ? { name: body["name"] } : {}), ...(typeof body["label"] === "string" ? { label: body["label"] } : {}), ...(typeof body["place"] === "string" ? { place: body["place"] } : {}), ...(body["capacity"] !== undefined ? { capacity: body["capacity"] } : {}), ...(typeof body["status"] === "string" ? { status: body["status"] } : {}), ...(typeof body["roles"] === "string" ? { roles: body["roles"] } : {}) });
    case "cluster-remove": return removeCluster(s, str("clusterId"), held(str("clusterId")));
    default: return null;
  }
}
