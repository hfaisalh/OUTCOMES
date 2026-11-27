/**
 * sample-setup.ts
 *
 * What it does: loads and removes a complete, invented sample setup (DECISIONS 168, 169) so the whole chain can be tried, and the workflow tested, without real data. It builds a set that covers every scenario
 * the workflow has to place: partners (one with a small capacity so a gift overflows to the next, a lapsed one and one that does not deliver the item, so both are skipped), projects with their clusters (a home with
 * classes, a home that is full, a home that is closed, a university three levels deep, villages, a camp, a mosque site), and beneficiaries (children with every admission decision, students, a widow, a principal, a
 * warden and a dean in roles, households, a possible duplicate, an inactive child, a child waiting with nowhere to go), enrolled through the same rules as a person's.
 * It is built from the items that exist, using each item's type: person items go to the sponsorship project, build items to the village project, the rest to the relief project. A group with no items is skipped.
 * Every other item is covered too (DECISIONS 171): one general partner delivers all of them with generous room, an untyped item gets a general project, and a real project that has no partner is given the general
 * partner, so every gift in every workflow has somewhere to go. One item is left uncovered on purpose (when there are more than five), so a gift that waits with "no partner delivers it" can still be seen.
 * Scaled to the real gifts (DECISIONS 176): for every sponsorship-type item the real gifts need, invented children are enrolled in a large home, enough to hold them (the units the gifts need, divided by the units
 * that make one whole child, plus two), so the real gifts have places to fill. A real project is chosen by what its name means first (orphan, water, flood), then by how many gifts carry the items.
 * Where real gifts exist, the invented clusters and partners are attached to the real project whose gifts carry those items (so real gifts land in invented places), and a project of its own is made only when there is none.
 * Who calls it: the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), from the buttons on the Organisation settings page. Depends on: projects.ts, clusters.ts, beneficiaries.ts, enrolments.ts,
 * benefits.ts and kind-features.ts. Pure functions: no database, no screen.
 *
 * Rules:
 * - Everything is invented: names carry the word Sample, and nothing real is used. Real children's data is never loaded this way (it would use the import, kept out of the repository).
 * - Everything made is marked as sample (partners by a reference starting SAMPLE-, the rest by a sample flag, a real project it was attached to by sampleAttached), so Remove takes away exactly that and nothing else.
 * - A real project is attached only when it has no clusters of its own. Its own partners, items and gifts are never changed.
 * - Loading twice adds nothing: if the sample is already there it says so. A partner that already exists by name (the one-click sample partner) is reused.
 * - Enrolments go through the same rules as a person's (who a type takes, approval first, capacity, roles). Any refused is reported, not hidden.
 * - Removing also clears any assignment to a partner it removed, and any placement in a place it removed (DECISIONS 184), so nothing points at something that is gone. Removing leaves a sample beneficiary that a real enrolment still holds, and a partner a real project still uses, and says so.
 */

import { kindOf } from "../02-project-rules/benefits.js";
import type { SavedFeatures } from "../02-project-rules/kind-features.js";
import { addCluster, clusterStateOf, setCluster, type Cluster, type ClusterState } from "../06-projects/clusters.js";
import { itemsSeenWith, saveGiftProject, savePartner, type GiftProject, type Project, type ProjectState } from "../06-projects/projects.js";
import { addBeneficiary, setBeneficiary, type Beneficiary, type Register } from "./beneficiaries.js";
import type { Assignments } from "../08-assignment/assignment.js";
import type { Placements } from "../09-placement/placement.js";
import { enrol, itemRulesOf, type Enrolments } from "./enrolments.js";

export const SAMPLE_REF_PREFIX = "SAMPLE-";

export interface SampleInput {
  items: { id: string; name: string }[];
  itemKinds: Record<string, string>;
  kindFeatures: SavedFeatures;
  partners: Project[];
  giftProjects: GiftProject[];
  partnerTypes: string[];
  register: Register;
  enrolments: Enrolments;
  whole?: Record<string, number>; // the units that make one whole beneficiary, by item (from its workflow), to know how many invented children the real gifts need
  demand?: Record<string, number>; // the units each item needs a partner for (see demandByItem), so the general partner has room for the real gifts
  realProjects: { id: string; itemIds: string[]; itemCounts?: Record<string, number> }[]; // the real projects, the items their gifts carry and how many gifts carry each, to attach to (see realProjectsFor)
  today: string;
}
export interface SampleState { partners: Project[]; giftProjects: GiftProject[]; partnerTypes: string[]; register: Register; enrolments: Enrolments; assignments?: Assignments; placements?: Placements }
export interface SampleSummary { partners: number; projects: number; attached: number; ownClusters: number; coveredProjects: number; uncovered: string[]; clusters: number; beneficiaries: number; enrolments: number; skipped: string[] }
type Loaded = ({ value: SampleState; summary: SampleSummary }) | { error: string };

// The real projects (not made by the sample), the items the gifts of each carry and how many gifts carry each, for the sample to attach to the busiest. A project is known by its CRM name, or its own name when it has none.
export function realProjectsFor(gps: GiftProject[], workOrders: { projectName?: string; itemId: string; status: string }[]): { id: string; itemIds: string[]; itemCounts: Record<string, number> }[] {
  return gps.filter((g) => g.sample !== true).map((g) => {
    const name = (g.crmName ?? g.name).trim().toLowerCase();
    const itemCounts: Record<string, number> = {};
    for (const w of workOrders) if (w.status !== "excluded" && w.itemId !== "" && (w.projectName ?? "").trim().toLowerCase() === name) itemCounts[w.itemId] = (itemCounts[w.itemId] ?? 0) + 1;
    return { id: g.id, itemIds: itemsSeenWith(workOrders, g.crmName ?? g.name), itemCounts };
  });
}

// The units that make one whole beneficiary for each item, from the workflow its gifts are routed under (3 parts for an orphan, 1 for a scholarship).
export function wholeByItem(workOrders: { itemId: string; frameworkId?: string }[], frameworks: { id: string; unitsPerBeneficiary: number }[], itemUnits: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...itemUnits }; // an item's own number first (DECISIONS 188), then its workflow's
  for (const w of workOrders) {
    if (out[w.itemId] !== undefined || (w.frameworkId ?? "") === "") continue;
    const u = frameworks.find((f) => f.id === w.frameworkId)?.unitsPerBeneficiary;
    if (u !== undefined) out[w.itemId] = Math.max(1, u);
  }
  return out;
}

const must = <T>(r: { value: T; error?: string }): T => { if (r.error) throw new Error(r.error); return r.value; };
export const isSamplePartner = (p: Project): boolean => (p.reference ?? "").startsWith(SAMPLE_REF_PREFIX);
export const hasSample = (s: { giftProjects: GiftProject[]; register: Register }): boolean => s.giftProjects.some((g) => g.sample === true || g.sampleAttached !== undefined) || s.register.records.some((b) => b.sample === true);

// The profile of an invented partner that delivers some items: active, due diligence approved, with a capacity and a cost for each. `lapsed` makes its due diligence approval run out last year, so it is not eligible.
function partnerProfile(name: string, reference: string, items: { id: string }[], today: string, base: number, lapsed = false, room?: (itemId: string) => number | undefined): Record<string, unknown> {
  const year = Number(today.slice(0, 4)) || 2026;
  return {
    name, officialName: `${name} (invented)`, type: "Institute", status: lapsed ? "pending" : "active", reference, established: "2012-04-01", partnershipStart: `${year - 1}-01-15`, countries: "Examplestan", regions: "North District",
    contacts: [{ name: "Sample Director", position: "Director", phone: "+000 000 0000", mobile: "+000 000 0001", email: "director@example.org", handles: "Agreements and approvals" }],
    itemIds: items.map((i) => i.id), terms: Object.fromEntries(items.map((i, n) => { const cap = room ? room(i.id) : n === 0 ? base : Math.max(5, base - n * 5); return [i.id, { ...(cap !== undefined ? { capacity: String(Math.min(100000, cap)) } : {}), costPerUnit: String(100 + n * 50) }]; })), capacity: room ? "" : String(base * 2), // a partner's total is a ceiling too: none for a partner whose room comes from its children (DECISIONS 183)
    capacityNote: lapsed ? "Invented partner whose due diligence has lapsed" : "Invented partner for trying the system", reportVia: "Email", language: "English", sectors: "Education, Child care",
    ddReference: `DD-${reference}`, ddStatus: "approved", ddReview: lapsed ? `${year - 1}-01-31` : `${year + 1}-12-31`, notes: "An invented sample partner. Nothing about it is real.",
  };
}

// A cluster to build: a name, what it is called, an optional total and roles, whether it is closed, and the clusters inside it (to any depth).
interface Plan { name: string; label: string; capacity?: number; roles?: string; closed?: boolean; subs?: Plan[] }

function clustersFrom(plans: Plan[]): Cluster[] {
  let st: ClusterState = { clusters: [] };
  const add = (p: Plan, parentId: string): void => {
    const r = addCluster(st, { name: p.name, label: p.label, parentId, ...(p.capacity !== undefined ? { capacity: p.capacity } : {}), ...(p.roles ? { roles: p.roles } : {}) });
    if ("error" in r) throw new Error(r.error);
    st = r.value;
    const id = st.clusters[st.clusters.length - 1]?.id ?? "";
    if (p.closed) { const c = setCluster(st, id, { status: "closed" }); if ("error" in c) throw new Error(c.error); st = c.value; }
    for (const sub of p.subs ?? []) add(sub, id);
  };
  for (const p of plans) add(p, "");
  return st.clusters;
}

export function loadSampleSetup(input: SampleInput): Loaded {
  if (hasSample({ giftProjects: input.giftProjects, register: input.register })) return { error: "The sample setup is already loaded. Remove it first to load it again." };
  const group = (kinds: string[]) => input.items.filter((i) => kinds.includes(kindOf(input.itemKinds, i.id, i.name).kind));
  const sponsor = group(["person"]);
  const build = group(["build"]);
  const relief = group(["activity", "distribution", "programme", "waqf"]);
  const untyped = group([""]); // items with no type yet: no clusters or beneficiaries, but they still need somewhere to go
  if (sponsor.length + build.length + relief.length === 0) return { error: "No item has a type yet, so there is nothing to build a sample from. Choose a type for the items on the Benefits page." };
  const skipped: string[] = [];
  try {
    // ---- Partners ----
    let ps: ProjectState = { projects: input.partners, nodes: [], outcomes: [], partnerTypes: input.partnerTypes, partnerFields: [], giftProjects: input.giftProjects };
    const partnerId = (name: string): string => ps.projects.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? "";
    const addPartner = (name: string, reference: string, items: { id: string }[], base: number, lapsed = false, room?: (itemId: string) => number | undefined): string => {
      if (items.length === 0) return "";
      const existing = partnerId(name);
      if (existing) return existing;
      ps = must(savePartner(ps, partnerProfile(name, reference, items, input.today, base, lapsed, room), "", "", input.today));
      return partnerId(name);
    };
    // Scenarios: the trust has room for only three of the first item, so the next gift goes to the backup. The lapsed partner and the builders (who do not deliver sponsorship) come first and must be skipped.
    // Rule (DECISIONS 183): a sponsorship partner's room is its own enrolled children, so nothing is typed. The trust has a ceiling of 3 for its first item only, so the overflow to the next partner still shows.
    const firstSponsor = sponsor[0]?.id ?? "";
    const trust = addPartner("Sample Orphan Care Trust", "SAMPLE-001", sponsor, 3, false, (id) => (id === firstSponsor ? 3 : undefined));
    const careBackup = addPartner("Sample Care Partners", "SAMPLE-002", sponsor, 10, false, () => undefined);
    const lapsed = addPartner("Sample Lapsed Partner", "SAMPLE-005", sponsor, 10, true, () => undefined);
    const builders = addPartner("Sample Builders Foundation", "SAMPLE-003", build, 15);
    const relieft = addPartner("Sample Relief Team", "SAMPLE-004", relief, 30);
    // The general partner delivers every item with generous room, so any gift has somewhere to go. It is the last choice in each sample project, so the others fill first and the overflow is still seen. With more than five items, the last one is left out on purpose: a gift for it waits, "no partner delivers it".
    const sorted = [...input.items].sort((a, b) => a.id.localeCompare(b.id));
    const uncovered = sorted.length > 5 ? [sorted[sorted.length - 1] as { id: string; name: string }] : [];
    // Rule (DECISIONS 174): its room for each item is twice what the real gifts need, and never under 50, so it is never the bottleneck.
    const demand = input.demand ?? {};
    const sponsorIds = new Set(sponsor.map((i) => i.id));
    const general = addPartner("Sample General Partner", "SAMPLE-006", sorted.filter((i) => !uncovered.some((u) => u.id === i.id)), 100, false, (id) => (sponsorIds.has(id) ? undefined : Math.min(100000, Math.max(50, 2 * (demand[id] ?? 0) + 5)))); // no ceiling for a sponsorship benefit (its room is its children), a partner's capacity may not pass 100000

    // ---- Projects and their clusters. A real project whose gifts carry the items is given the clusters and partners, so real gifts land in invented places. ----
    let gps = input.giftProjects;
    const used = new Set<string>();
    let attached = 0;
    // `extra` (sponsorship only) also gives every other real project that carries these items a home of its own, since a gift for a project fills only that project's places (DECISIONS 177).
    const addProject = (name: string, items: { id: string }[], partnerIds: string[], clusters: Cluster[], opts: { extra?: (rp: SampleInput["realProjects"][number]) => Cluster[]; existing?: (rp: SampleInput["realProjects"][number]) => boolean } = {}): string => {
      const { extra, existing } = opts;
      if (items.length === 0) return "";
      const wanted = new Set(items.map((i) => i.id));
      // Rule (DECISIONS 180): a real project that already has clusters of its own keeps them, and the invented children are enrolled in them, so its own home is filled.
      if (existing) {
        for (const rp of input.realProjects) {
          const gp = gps.find((g) => g.id === rp.id);
          if (!gp || gp.sample === true || used.has(rp.id) || (gp.clusters ?? []).length === 0 || !rp.itemIds.some((i) => wanted.has(i))) continue;
          if (existing(rp)) {
            used.add(rp.id);
            // Rule (DECISIONS 185): the invented children belong to the sample partners, so those partners must deliver for the project, or their children could never be used. Its own clusters are untouched.
            const adds = partnerIds.filter((id) => !gp.partnerIds.includes(id));
            gps = gps.map((g) => (g.id === rp.id ? { ...g, partnerIds: [...g.partnerIds, ...adds], sampleAttached: { partnerIds: adds, clusters: false } } : g));
          }
        }
      }
      // Rule (DECISIONS 182): the scenario clusters (the full home, the closed home, the university, the villages, the camp) are always the sample's own projects, never put on a real project. A real project is only
      // given what it needs for its own gifts: children in the clusters it already has (above), or a home of its own sized to its gifts (below), with the sample partners.
      const real = input.realProjects
        .filter((rp) => !used.has(rp.id) && !(gps.find((g) => g.id === rp.id)?.clusters ?? []).length)
        .map((rp) => ({ rp, overlap: rp.itemIds.filter((i) => wanted.has(i)).length, gifts: [...wanted].reduce((n, i) => n + (rp.itemCounts?.[i] ?? 0), 0) }))
        .filter((x) => x.overlap > 0)
        .sort((a, b) => b.gifts - a.gifts || b.overlap - a.overlap);
      if (extra) {
        for (const x of real) {
          const cl = extra(x.rp);
          if (cl.length === 0) continue;
          used.add(x.rp.id);
          attached++;
          const adds = partnerIds.filter((id) => !(gps.find((g) => g.id === x.rp.id)?.partnerIds ?? []).includes(id));
          gps = gps.map((g) => (g.id === x.rp.id ? { ...g, clusters: cl, partnerIds: [...g.partnerIds, ...adds], sampleAttached: { partnerIds: adds, clusters: true } } : g));
        }
      }
      gps = must(saveGiftProject(gps, ps.projects, { name, crmName: "", partnerIds, itemIds: items.map((i) => i.id), notes: "An invented sample project. Nothing about it is real." }, ""));
      const id = gps.find((g) => g.name === name)?.id ?? "";
      gps = gps.map((g) => (g.id === id ? { ...g, sample: true as const, clusters } : g));
      return id;
    };
    // Rule (DECISIONS 176): the invented children the real gifts need. For each sponsorship item, the units its gifts need divided by the units of one whole child, plus two, up to 120 an item and 400 in all.
    const whole = input.whole ?? {};
    const need = sponsor.map((i) => ({ item: i, count: Math.min(120, Math.ceil((input.demand?.[i.id] ?? 0) / Math.max(1, whole[i.id] ?? 1)) + ((input.demand?.[i.id] ?? 0) > 0 ? 2 : 0)) })).filter((x) => x.count > 0);
    let budget = 800;
    for (const x of need) { x.count = Math.min(x.count, budget); budget -= x.count; }
    // Each other real project that carries sponsorship gifts gets a home and children for its own gifts: the lines it has for each item divided by the units of one child, plus two.
    const extraPlans = new Map<string, { item: { id: string; name: string }; count: number }[]>();
    const extraTarget = new Map<string, string>(); // for a real project with clusters of its own: the cluster its invented children are enrolled in
    let ownClusters = 0;
    const existingHome = (rp: SampleInput["realProjects"][number]): boolean => {
      const gp = gps.find((g) => g.id === rp.id);
      const st = clusterStateOf(gp?.levels, gp?.clusters);
      const master = st.clusters.find((c) => c.parentId === "" && c.status === "active");
      if (!master) return false;
      const target = (st.clusters.find((c) => c.parentId === master.id && c.status === "active") ?? master).id;
      let room = master.capacity ?? Infinity; // the master cluster's total is shared by everything in it
      const list = sponsor.map((i) => {
        const wanted = (rp.itemCounts?.[i.id] ?? 0) > 0 ? Math.ceil((rp.itemCounts?.[i.id] ?? 0) / Math.max(1, whole[i.id] ?? 1)) + 2 : 0;
        const count = Math.max(0, Math.min(120, budget, room, wanted));
        room -= count;
        return { item: i, count };
      }).filter((x) => x.count > 0);
      const total = list.reduce((n, x) => n + x.count, 0);
      if (total === 0) return false;
      budget -= total;
      extraPlans.set(rp.id, list);
      extraTarget.set(rp.id, target);
      ownClusters++;
      return true;
    };
    const extraHome = (rp: SampleInput["realProjects"][number]): Cluster[] => {
      const list = sponsor.map((i) => ({ item: i, count: Math.min(120, budget, (rp.itemCounts?.[i.id] ?? 0) > 0 ? Math.ceil((rp.itemCounts?.[i.id] ?? 0) / Math.max(1, whole[i.id] ?? 1)) + 2 : 0) })).filter((x) => x.count > 0);
      const total = list.reduce((n, x) => n + x.count, 0);
      if (total === 0) return [];
      budget -= total;
      extraPlans.set(rp.id, list);
      return clustersFrom([{ name: "Sample Home - Main", label: "Home", capacity: total, subs: [1, 2, 3, 4, 5].map((n) => ({ name: `Class ${n}`, label: "Class" })) }]);
    };
    const bulk = need.reduce((n, x) => n + x.count, 0);
    const homes = addProject("Sample Orphan Homes", sponsor, [lapsed, builders, trust, careBackup, general].filter((x) => x !== ""), clustersFrom([
      ...(bulk > 0 ? [{ name: "Sample Home - Main", label: "Home", capacity: bulk, subs: [1, 2, 3, 4, 5].map((n) => ({ name: `Class ${n}`, label: "Class" })) }] : []), // large enough for the real gifts
      { name: "Sample Home - North", label: "Home", capacity: 12, roles: "Principal, Warden", subs: [{ name: "Class 1", label: "Class" }, { name: "Class 2", label: "Class" }] },
      { name: "Sample Home - South", label: "Home", capacity: 8, subs: [{ name: "Class 1", label: "Class" }] },
      { name: "Sample Home - Small", label: "Home", capacity: 2, subs: [{ name: "Class A", label: "Class" }] }, // two places, so it fills
      { name: "Sample Home - Closed", label: "Home", capacity: 10, closed: true }, // takes no one
      { name: "Sample University", label: "University", capacity: 6, roles: "Principal", subs: [{ name: "Faculty of Science", label: "Faculty", subs: [{ name: "Physics Department", label: "Department" }] }, { name: "Faculty of Arts", label: "Faculty" }] },
    ]), { extra: extraHome, existing: existingHome });
    const villages = addProject("Sample Village Projects", build, [builders, general].filter((x) => x !== ""), clustersFrom([{ name: "Sample Village A", label: "Village", capacity: 6 }, { name: "Sample Village B", label: "Village", capacity: 4 }]));
    // The mosque site has no capacity on purpose: it serves a community, not a number of places.
    const camps = addProject("Sample Relief Camps", relief, [relieft, general].filter((x) => x !== ""), clustersFrom([{ name: "Sample Camp 1", label: "Camp", capacity: 40 }, { name: "Sample Mosque Site", label: "Site" }]));
    const programmes = addProject("Sample General Programmes", untyped, [general].filter((x) => x !== ""), clustersFrom([{ name: "Sample General Site", label: "Site" }]));
    // A real project with no partner is given the general partner, so its gifts do not all wait. Its own clusters, items and gifts are not touched.
    let coveredProjects = 0;
    if (general !== "") {
      gps = gps.map((g) => {
        if (g.sample === true || g.partnerIds.length > 0) return g;
        coveredProjects++;
        return { ...g, partnerIds: [general], sampleAttached: { partnerIds: [general], clusters: g.sampleAttached?.clusters ?? false } };
      });
    }
    const clusterCount = [homes, villages, camps, programmes, ...[...extraPlans.keys()].filter((id) => !extraTarget.has(id))].reduce((n, id) => n + (gps.find((g) => g.id === id)?.clusters?.length ?? 0), 0);

    // ---- Beneficiaries ----
    let reg = input.register;
    const made: Record<string, string> = {};
    const mustBen = (r: { value: Register; id: string } | { error: string }): { value: Register; id: string } => { if ("error" in r) throw new Error(r.error); return r; };
    const person = (key: string, name: string, over: Record<string, unknown>, allowSimilar = false): void => {
      const r = mustBen(addBeneficiary(reg, "person", { name, placeOfBirth: "Sampletown", area: "North District", partnerId: trust, ...over }, allowSimilar));
      reg = r.value; made[key] = r.id;
    };
    const household = (key: string, name: string, over: Record<string, unknown>): void => {
      const r = mustBen(addBeneficiary(reg, "household", { name, ...over }));
      reg = r.value; made[key] = r.id;
    };
    let n = 0;
    const child = (key: string, name: string, dob: string, gender: string, decision: string, father: string, mother: string, allowSimilar = false): void => {
      n++;
      person(key, name, { dob, gender, idNumber: `SMP-${1000 + n}`, fatherStatus: father, motherStatus: mother, guardian: `Sample Guardian ${n}`, guardianRelation: mother === "living" ? "mother" : "uncle", eligibility: decision, eligibilityNote: decision === "review" ? "Waiting for the guardianship certificate" : decision === "declined" ? "Does not meet the criteria (invented)" : "Checked (invented)", partnerRef: `SAMPLE-C${String(n).padStart(2, "0")}` }, allowSimilar);
    };
    child("c1", "Sample Amina", "2015-03-12", "female", "ready", "deceased", "living");
    child("c2", "Sample Bilal", "2013-07-01", "male", "ready", "deceased", "deceased");
    child("c3", "Sample Carla", "2016-11-23", "female", "ready", "living", "deceased");
    child("c4", "Sample Daniyal", "2014-01-30", "male", "ready", "deceased", "living");
    child("c5", "Sample Eman", "2012-09-09", "female", "ready", "deceased", "deceased");
    child("c6", "Sample Farhan", "2015-05-17", "male", "review", "deceased", "living");
    child("c7", "Sample Gul", "2017-02-02", "female", "review", "", "");
    child("c8", "Sample Hira", "2011-12-12", "female", "declined", "living", "living");
    child("dup", "Sample Amina", "2018-01-01", "female", "ready", "deceased", "living", true); // the same name as Amina with another date of birth: a possible match, said to be different
    child("wait", "Sample Waiting Zain", "2014-04-04", "male", "ready", "deceased", "living"); // approved, with nowhere to go yet
    child("full1", "Sample Full One", "2013-03-03", "male", "ready", "deceased", "living");
    child("full2", "Sample Full Two", "2013-05-05", "female", "ready", "deceased", "living");
    child("idris", "Sample Inactive Idris", "2012-02-20", "male", "ready", "deceased", "living");
    for (const [key, name, dob] of [["st1", "Sample Student Ali", "2005-01-10"], ["st2", "Sample Student Bushra", "2004-06-21"], ["st3", "Sample Student Chand", "2005-09-30"]] as const) child(key, name, dob, key === "st2" ? "female" : "male", "ready", "deceased", "living");
    person("widow", "Sample Widow Rukhsana", { dob: "1985-10-10", gender: "female", idNumber: "SMP-3001", fatherStatus: "", motherStatus: "", guardian: "", eligibility: "ready", eligibilityNote: "Checked (invented)" });
    person("principal", "Sample Principal Hamid", { dob: "1975-04-04", gender: "male", idNumber: "SMP-2001", guardian: "", eligibility: "" });
    person("warden", "Sample Warden Saira", { dob: "1982-08-08", gender: "female", idNumber: "SMP-2002", guardian: "", eligibility: "" });
    person("dean", "Sample Dean Karim", { dob: "1970-02-02", gender: "male", idNumber: "SMP-2003", guardian: "", eligibility: "" });
    person("lapsed1", "Sample Lapsed Beneficiary One", { dob: "2013-08-08", gender: "male", idNumber: "SMP-4001", fatherStatus: "deceased", motherStatus: "living", guardian: "Sample Guardian L1", eligibility: "ready", partnerId: lapsed || trust }); // owned by the lapsed partner, so its room is never used
    person("lapsed2", "Sample Lapsed Beneficiary Two", { dob: "2014-09-09", gender: "female", idNumber: "SMP-4002", fatherStatus: "deceased", motherStatus: "living", guardian: "Sample Guardian L2", eligibility: "ready", partnerId: lapsed || trust });
    household("h1", "Sample Family Noor", { area: "Sample Village A", size: 5, partnerId: builders });
    household("h2", "Sample Family Rashid", { area: "Sample Village B", size: 7, partnerId: builders });
    household("h3", "Sample Family Qasim", { area: "Sample Camp 1", size: 4, partnerId: relieft });
    household("h4", "Sample Family Bashir", { area: "Sample Camp 1", size: 6, partnerId: relieft });
    // The invented children the real gifts need: one per place, each for one item, ready to be enrolled in the large home.
    // Rule (DECISIONS 183): the invented children belong to the partners that gave them, alternating between the backup and the general partner, since a partner's room is its own children.
    const owner = (n: number): string => (n % 2 === 0 ? careBackup : general) || trust;
    const bulkChildren: { id: string; itemId: string; cls: number; projectId: string }[] = [];
    let seq = 0;
    for (const x of need) {
      for (let k = 0; k < x.count; k++) {
        seq++;
        const label = String(seq).padStart(3, "0");
        const r = mustBen(addBeneficiary(reg, "person", { name: `Sample Beneficiary ${label}`, dob: `${2008 + (seq % 9)}-0${1 + (seq % 9)}-1${seq % 9}`, gender: seq % 2 ? "female" : "male", placeOfBirth: "Sampletown", area: "North District", partnerId: owner(seq), idNumber: `SMP-S${label}`, fatherStatus: "deceased", motherStatus: "living", guardian: `Sample Guardian S${label}`, guardianRelation: "mother", eligibility: "ready", eligibilityNote: "Checked (invented)", partnerRef: `SAMPLE-S${label}` }));
        reg = r.value; made[`bulk${seq}`] = r.id;
        bulkChildren.push({ id: r.id, itemId: x.item.id, cls: (seq % 5) + 1, projectId: homes });
      }
    }
    for (const [projectId, list] of extraPlans) {
      for (const x of list) {
        for (let k = 0; k < x.count; k++) {
          seq++;
          const label = String(seq).padStart(3, "0");
          const r = mustBen(addBeneficiary(reg, "person", { name: `Sample Beneficiary ${label}`, dob: `${2008 + (seq % 9)}-0${1 + (seq % 9)}-1${seq % 9}`, gender: seq % 2 ? "female" : "male", placeOfBirth: "Sampletown", area: "North District", partnerId: owner(seq), idNumber: `SMP-S${label}`, fatherStatus: "deceased", motherStatus: "living", guardian: `Sample Guardian S${label}`, guardianRelation: "mother", eligibility: "ready", eligibilityNote: "Checked (invented)", partnerRef: `SAMPLE-S${label}` }));
          reg = r.value; made[`bulk${seq}`] = r.id;
          bulkChildren.push({ id: r.id, itemId: x.item.id, cls: (seq % 5) + 1, projectId });
        }
      }
    }
    { const r = setBeneficiary(reg, made["idris"] as string, { name: "Sample Inactive Idris", dob: "2012-02-20", status: "inactive", placeOfBirth: "Sampletown", idNumber: "SMP-1013", fatherStatus: "deceased", motherStatus: "living", guardian: "Sample Guardian 13", guardianRelation: "mother", eligibility: "ready", partnerId: trust, area: "North District" }); if ("error" in r) throw new Error(r.error); reg = r.value; } // an inactive child: cannot be enrolled
    const sampleIds = new Set(Object.values(made));
    reg = { ...reg, records: reg.records.map((b): Beneficiary => (sampleIds.has(b.id) ? { ...b, sample: true } : b)) };

    // ---- Enrolments, through the same rules as a person's ----
    let enr = input.enrolments;
    const ctx = { beneficiaries: reg, giftProjects: gps, rulesOf: (itemId: string) => itemRulesOf(input.itemKinds, input.kindFeatures, itemId, input.items.find((i) => i.id === itemId)?.name ?? ""), today: input.today };
    // A cluster is named by its path from the master cluster down.
    const clusterId = (projectId: string, path: string[]): string => {
      const all = gps.find((g) => g.id === projectId)?.clusters ?? [];
      let cur = all.find((c) => c.parentId === "" && c.name === path[0]);
      for (const step of path.slice(1)) cur = all.find((c) => c.parentId === cur?.id && c.name === step);
      return cur?.id ?? "";
    };
    const enroll = (who: string, projectId: string, path: string[], item: { id: string } | undefined, role = ""): void => {
      if (!item || projectId === "") return;
      const r = enrol(ctx, enr, { beneficiaryId: made[who], giftProjectId: projectId, clusterId: clusterId(projectId, path), itemId: item.id, role });
      if ("error" in r) skipped.push(`${who} in ${path.join(" > ")}: ${r.error}`); else enr = r.value;
    };
    const s1 = sponsor[0], s2 = sponsor[1], sLast = sponsor[sponsor.length - 1];
    for (const who of ["c1", "c2", "c3"]) enroll(who, homes, ["Sample Home - North", "Class 1"], s1);
    enroll("c4", homes, ["Sample Home - North", "Class 2"], s1);
    enroll("c5", homes, ["Sample Home - South", "Class 1"], s1);
    enroll("c1", homes, ["Sample Home - North", "Class 1"], s2); // the same child, a second benefit
    enroll("lapsed1", homes, ["Sample Home - South", "Class 1"], s1);
    enroll("lapsed2", homes, ["Sample Home - South", "Class 1"], s1);
    enroll("full1", homes, ["Sample Home - Small", "Class A"], s1);
    enroll("full2", homes, ["Sample Home - Small", "Class A"], s1); // the Small home is now full
    for (const who of ["st1", "st2", "st3"]) enroll(who, homes, ["Sample University", "Faculty of Science", "Physics Department"], sLast);
    enroll("principal", homes, ["Sample Home - North"], s1, "Principal");
    enroll("warden", homes, ["Sample Home - North"], s1, "Warden");
    enroll("dean", homes, ["Sample University"], s1, "Principal");
    enroll("h1", villages, ["Sample Village A"], build[0]);
    enroll("h2", villages, ["Sample Village B"], build[0]);
    enroll("h3", camps, ["Sample Camp 1"], relief[0]);
    enroll("h4", camps, ["Sample Camp 1"], relief[relief.length > 1 ? 1 : 0]);
    // The invented children are enrolled in the large home, spread over its classes.
    for (const c of bulkChildren) {
      const cid = extraTarget.get(c.projectId) ?? clusterId(c.projectId, ["Sample Home - Main", `Class ${c.cls}`]);
      const r = enrol(ctx, enr, { beneficiaryId: c.id, giftProjectId: c.projectId, clusterId: cid, itemId: c.itemId, role: "" });
      if ("error" in r) skipped.push(`${c.id} in Sample Home - Main: ${r.error}`); else enr = r.value;
    }
    // Only the enrolments made here are marked as sample.
    const before = new Set(input.enrolments.records.map((e) => e.id));
    enr = { ...enr, records: enr.records.map((e) => (before.has(e.id) ? e : { ...e, sample: true as const })) };

    return {
      value: { partners: ps.projects, giftProjects: gps, partnerTypes: ps.partnerTypes, register: reg, enrolments: enr },
      summary: { partners: ps.projects.length - input.partners.length, projects: gps.length - input.giftProjects.length, attached, ownClusters, coveredProjects, uncovered: uncovered.map((u) => u.name), clusters: clusterCount, beneficiaries: sampleIds.size, enrolments: enr.records.length - input.enrolments.records.length, skipped },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The sample setup could not be built." };
  }
}

export interface Removed { value: SampleState; removed: { partners: number; projects: number; beneficiaries: number; enrolments: number; assignments: number; placements: number }; kept: string[] }

// Removes exactly what the sample made. A real project the sample was attached to gets its clusters and the sample partners taken off, and is otherwise untouched. A sample beneficiary that a real
// (not sample) enrolment holds stays, and a sample partner that a real project uses stays, and both are reported.
export function removeSampleSetup(s: SampleState): Removed {
  const kept: string[] = [];
  const enrolments = s.enrolments.records.filter((e) => e.sample !== true);
  const heldReal = new Set(enrolments.filter((e) => e.status === "active").map((e) => e.beneficiaryId));
  const records = s.register.records.filter((b) => {
    if (b.sample !== true) return true;
    if (heldReal.has(b.id)) { kept.push(`${b.name} (${b.id}) is enrolled in a real project`); return true; }
    return false;
  });
  const giftProjects = s.giftProjects.filter((g) => g.sample !== true).map((g): GiftProject => {
    if (g.sampleAttached === undefined) return g;
    const { sampleAttached, clusters, ...rest } = g;
    return { ...rest, ...(sampleAttached.clusters || clusters === undefined ? {} : { clusters }), partnerIds: g.partnerIds.filter((id) => !sampleAttached.partnerIds.includes(id)) };
  });
  const usedByReal = new Set(giftProjects.flatMap((g) => g.partnerIds));
  const partners = s.partners.filter((p) => {
    if (!isSamplePartner(p)) return true;
    if (usedByReal.has(p.id)) { kept.push(`${p.name} is used by a real project`); return true; }
    return false;
  });
  // Rule (DECISIONS 184): an assignment to a partner that is gone, or for a project that is gone, and a placement in a place that is gone, are cleared with it. An outcome does not need a place, so it stays while its assignment does.
  const partnerIds = new Set(partners.map((p) => p.id));
  const projectIds = new Set(giftProjects.map((g) => g.id));
  const assignmentRecords = (s.assignments?.records ?? []).filter((a) => partnerIds.has(a.partnerId) && (a.giftProjectId === "" || projectIds.has(a.giftProjectId)));
  const kept2 = new Set(assignmentRecords.map((a) => a.key));
  const enrolmentIds = new Set(enrolments.map((e) => e.id));
  const placementRecords = (s.placements?.records ?? []).filter((p) => kept2.has(p.key) && (p.kind === "outcome" || enrolmentIds.has(p.enrolmentId)));
  return {
    value: { partners, giftProjects, partnerTypes: s.partnerTypes, register: { ...s.register, records }, enrolments: { ...s.enrolments, records: enrolments }, ...(s.assignments ? { assignments: { records: assignmentRecords } } : {}), ...(s.placements ? { placements: { ...s.placements, records: placementRecords } } : {}) },
    removed: { partners: s.partners.length - partners.length, projects: s.giftProjects.filter((g) => g.sample === true).length, beneficiaries: s.register.records.length - records.length, enrolments: s.enrolments.records.length - enrolments.length, assignments: (s.assignments?.records.length ?? 0) - assignmentRecords.length, placements: (s.placements?.records.length ?? 0) - placementRecords.length },
    kept,
  };
}

// What a person is told after loading or removing, in plain words.
export const sampleSummaryText = (m: SampleSummary): string => `Sample setup loaded: ${m.partners} partner${m.partners === 1 ? "" : "s"}, ${m.projects} new project${m.projects === 1 ? "" : "s"}${m.attached ? ` and ${m.attached} real project${m.attached === 1 ? "" : "s"} given sample clusters` : ""}${m.ownClusters ? `, children enrolled in the own clusters of ${m.ownClusters} real project${m.ownClusters === 1 ? "" : "s"}` : ""}${m.coveredProjects ? `, ${m.coveredProjects} real project${m.coveredProjects === 1 ? "" : "s"} without a partner given the sample general partner` : ""}, ${m.clusters} clusters, ${m.beneficiaries} beneficiaries and ${m.enrolments} enrolments.${m.uncovered.length ? ` Left without a partner on purpose: ${m.uncovered.join(", ")}.` : ""}${m.skipped.length ? ` Not enrolled: ${m.skipped.join("; ")}.` : ""}`;
export const removedSummaryText = (r: Removed): string => `Sample data removed: ${r.removed.partners} partners, ${r.removed.projects} projects, ${r.removed.beneficiaries} beneficiaries and ${r.removed.enrolments} enrolments${r.removed.assignments || r.removed.placements ? `, and cleared ${r.removed.assignments} assignment${r.removed.assignments === 1 ? "" : "s"} and ${r.removed.placements} placement${r.removed.placements === 1 ? "" : "s"} that pointed at them` : ""}.${r.kept.length ? ` Kept: ${r.kept.join("; ")}.` : ""}`;
