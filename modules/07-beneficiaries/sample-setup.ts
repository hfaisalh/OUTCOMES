/**
 * sample-setup.ts
 *
 * What it does: loads and removes a complete, invented sample setup (DECISIONS 168) so the whole chain can be tried without real data: partners, projects (one for sponsorship, one for builds, one for relief), their
 * clusters, beneficiaries (persons and households, with every admission decision), and enrolments, including a principal and a warden in a role and one child enrolled twice (orphan sponsorship and Hifz). It is built
 * from the items that exist, using each item's type: person items go to the sponsorship project, build items to the village project, the rest to the relief project. A group with no items is skipped.
 * Who calls it: the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), from the buttons on the Organisation settings page. Depends on: projects.ts, clusters.ts, beneficiaries.ts, enrolments.ts,
 * benefits.ts and kind-features.ts. Pure functions: no database, no screen.
 *
 * Rules:
 * - Everything is invented: names carry the word Sample, and nothing real is used. Real children's data is never loaded this way (it would use the import, kept out of the repository).
 * - Everything made is marked as sample (partners by a reference starting SAMPLE-, the rest by a sample flag), so Remove takes away exactly that and nothing else.
 * - Loading twice adds nothing: if the sample is already there it says so. A partner that already exists by name (the one-click sample partner) is reused.
 * - Enrolments go through the same rules as a person's (who a type takes, approval first, capacity, roles). Any refused is reported, not hidden.
 * - Removing leaves a sample beneficiary that a real enrolment still holds, and a partner a real project still uses, and says so.
 */

import { kindOf } from "../02-project-rules/benefits.js";
import type { SavedFeatures } from "../02-project-rules/kind-features.js";
import { addCluster, type Cluster, type ClusterState } from "../06-projects/clusters.js";
import { saveGiftProject, savePartner, type GiftProject, type Project, type ProjectState } from "../06-projects/projects.js";
import { addBeneficiary, type Beneficiary, type Register } from "./beneficiaries.js";
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
  today: string;
}
export interface SampleState { partners: Project[]; giftProjects: GiftProject[]; partnerTypes: string[]; register: Register; enrolments: Enrolments }
export interface SampleSummary { partners: number; projects: number; clusters: number; beneficiaries: number; enrolments: number; skipped: string[] }
type Loaded = ({ value: SampleState; summary: SampleSummary }) | { error: string };

const must = <T>(r: { value: T; error?: string }): T => { if (r.error) throw new Error(r.error); return r.value; };
const mustBen = (r: { value: Register; id: string } | { error: string }): { value: Register; id: string } => { if ("error" in r) throw new Error(r.error); return r; };

export const isSamplePartner = (p: Project): boolean => (p.reference ?? "").startsWith(SAMPLE_REF_PREFIX);
export const hasSample = (s: { giftProjects: GiftProject[]; register: Register }): boolean => s.giftProjects.some((g) => g.sample === true) || s.register.records.some((b) => b.sample === true);

// The profile of an invented partner that delivers some items: active, due diligence approved, with a capacity and a cost for each.
function partnerProfile(name: string, reference: string, items: { id: string }[], today: string, base: number): Record<string, unknown> {
  const year = Number(today.slice(0, 4)) || 2026;
  return {
    name, officialName: `${name} (invented)`, type: "Institute", status: "active", reference, established: "2012-04-01", partnershipStart: `${year - 1}-01-15`, countries: "Examplestan", regions: "North District",
    contacts: [{ name: "Sample Director", position: "Director", phone: "+000 000 0000", mobile: "+000 000 0001", email: "director@example.org", handles: "Agreements and approvals" }],
    itemIds: items.map((i) => i.id), terms: Object.fromEntries(items.map((i, n) => [i.id, { capacity: String(base - n * 5), costPerUnit: String(100 + n * 50) }])), capacity: String(base * 2),
    capacityNote: "Invented partner for trying the system", reportVia: "Email", language: "English", sectors: "Education, Child care",
    ddReference: `DD-${reference}`, ddStatus: "approved", ddReview: `${year + 1}-12-31`, notes: "An invented sample partner. Nothing about it is real.",
  };
}

// Builds a cluster tree from a plan: a master cluster with a total and roles, and the names of the sub clusters inside it.
function clustersFrom(plan: { name: string; label: string; capacity?: number; roles?: string; subs?: { name: string; label: string }[] }[]): Cluster[] {
  let st: ClusterState = { clusters: [] };
  for (const m of plan) {
    const top = addCluster(st, { name: m.name, label: m.label, ...(m.capacity !== undefined ? { capacity: m.capacity } : {}), ...(m.roles ? { roles: m.roles } : {}) });
    if ("error" in top) throw new Error(top.error);
    st = top.value;
    const topId = st.clusters[st.clusters.length - 1]?.id ?? "";
    for (const sub of m.subs ?? []) {
      const r = addCluster(st, { name: sub.name, label: sub.label, parentId: topId });
      if ("error" in r) throw new Error(r.error);
      st = r.value;
    }
  }
  return st.clusters;
}

export function loadSampleSetup(input: SampleInput): Loaded {
  if (hasSample({ giftProjects: input.giftProjects, register: input.register })) return { error: "The sample setup is already loaded. Remove it first to load it again." };
  const group = (kinds: string[]) => input.items.filter((i) => kinds.includes(kindOf(input.itemKinds, i.id, i.name).kind));
  const sponsor = group(["person"]);
  const build = group(["build"]);
  const relief = group(["activity", "distribution", "programme", "waqf"]);
  if (sponsor.length + build.length + relief.length === 0) return { error: "No item has a type yet, so there is nothing to build a sample from. Choose a type for the items on the Benefits page." };
  const skipped: string[] = [];
  try {
    // ---- Partners ----
    let ps: ProjectState = { projects: input.partners, nodes: [], outcomes: [], partnerTypes: input.partnerTypes, partnerFields: [], giftProjects: input.giftProjects };
    const partnerId = (name: string): string => ps.projects.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ?? "";
    const addPartner = (name: string, reference: string, items: { id: string }[], base: number): string => {
      if (items.length === 0) return "";
      const existing = partnerId(name);
      if (existing) return existing;
      ps = must(savePartner(ps, partnerProfile(name, reference, items, input.today, base), "", "", input.today));
      return partnerId(name);
    };
    const trust = addPartner("Sample Orphan Care Trust", "SAMPLE-001", sponsor, 20);
    const careBackup = addPartner("Sample Care Partners", "SAMPLE-002", sponsor, 10);
    const builders = addPartner("Sample Builders Foundation", "SAMPLE-003", build, 15);
    const relieft = addPartner("Sample Relief Team", "SAMPLE-004", relief, 30);

    // ---- Projects and their clusters ----
    let gps = input.giftProjects;
    const addProject = (name: string, items: { id: string }[], partnerIds: string[], clusters: Cluster[]): string => {
      if (items.length === 0) return "";
      gps = must(saveGiftProject(gps, ps.projects, { name, crmName: "", partnerIds, itemIds: items.map((i) => i.id), notes: "An invented sample project. Nothing about it is real." }, ""));
      const id = gps.find((g) => g.name === name)?.id ?? "";
      gps = gps.map((g) => (g.id === id ? { ...g, sample: true as const, clusters } : g));
      return id;
    };
    const homes = addProject("Sample Orphan Homes", sponsor, [trust, careBackup].filter((x) => x !== ""), clustersFrom([
      { name: "Sample Home - North", label: "Home", capacity: 12, roles: "Principal, Warden", subs: [{ name: "Class 1", label: "Class" }, { name: "Class 2", label: "Class" }] },
      { name: "Sample Home - South", label: "Home", capacity: 8, subs: [{ name: "Class 1", label: "Class" }] },
    ]));
    const villages = addProject("Sample Village Projects", build, [builders].filter((x) => x !== ""), clustersFrom([{ name: "Sample Village A", label: "Village" }, { name: "Sample Village B", label: "Village" }]));
    const camps = addProject("Sample Relief Camps", relief, [relieft].filter((x) => x !== ""), clustersFrom([{ name: "Sample Camp 1", label: "Camp", capacity: 40 }]));
    const clusterCount = gps.filter((g) => g.sample).reduce((n, g) => n + (g.clusters?.length ?? 0), 0);

    // ---- Beneficiaries: children with every admission decision, a principal and a warden, and households ----
    let reg = input.register;
    const made: Record<string, string> = {};
    const person = (key: string, name: string, over: Record<string, unknown>): void => {
      const r = mustBen(addBeneficiary(reg, "person", { name, placeOfBirth: "Sampletown", area: "North District", partnerId: trust, ...over }));
      reg = r.value; made[key] = r.id;
    };
    const household = (key: string, name: string, over: Record<string, unknown>): void => {
      const r = mustBen(addBeneficiary(reg, "household", { name, ...over }));
      reg = r.value; made[key] = r.id;
    };
    const child = (n: number, name: string, dob: string, gender: string, decision: string, father: string, mother: string): void =>
      person(`c${n}`, name, { dob, gender, idNumber: `SMP-${1000 + n}`, fatherStatus: father, motherStatus: mother, guardian: `Sample Guardian ${n}`, guardianRelation: mother === "living" ? "mother" : "uncle", eligibility: decision, eligibilityNote: decision === "review" ? "Waiting for the guardianship certificate" : decision === "declined" ? "Does not meet the criteria (invented)" : "Checked (invented)", partnerRef: `SAMPLE-C${String(n).padStart(2, "0")}` });
    child(1, "Sample Amina", "2015-03-12", "female", "ready", "deceased", "living");
    child(2, "Sample Bilal", "2013-07-01", "male", "ready", "deceased", "deceased");
    child(3, "Sample Carla", "2016-11-23", "female", "ready", "living", "deceased");
    child(4, "Sample Daniyal", "2014-01-30", "male", "ready", "deceased", "living");
    child(5, "Sample Eman", "2012-09-09", "female", "ready", "deceased", "deceased");
    child(6, "Sample Farhan", "2015-05-17", "male", "review", "deceased", "living");
    child(7, "Sample Gul", "2017-02-02", "female", "review", "", "");
    child(8, "Sample Hira", "2011-12-12", "female", "declined", "living", "living");
    person("principal", "Sample Principal Hamid", { dob: "1975-04-04", gender: "male", idNumber: "SMP-2001", guardian: "", eligibility: "" });
    person("warden", "Sample Warden Saira", { dob: "1982-08-08", gender: "female", idNumber: "SMP-2002", guardian: "", eligibility: "" });
    household("h1", "Sample Family Noor", { area: "Sample Village A", size: 5, partnerId: builders });
    household("h2", "Sample Family Rashid", { area: "Sample Village B", size: 7, partnerId: builders });
    household("h3", "Sample Family Qasim", { area: "Sample Camp 1", size: 4, partnerId: relieft });
    const sampleIds = new Set(Object.values(made));
    reg = { ...reg, records: reg.records.map((b): Beneficiary => (sampleIds.has(b.id) ? { ...b, sample: true } : b)) };

    // ---- Enrolments, through the same rules as a person's ----
    let enr = input.enrolments;
    const ctx = { beneficiaries: reg, giftProjects: gps, rulesOf: (itemId: string) => itemRulesOf(input.itemKinds, input.kindFeatures, itemId, input.items.find((i) => i.id === itemId)?.name ?? ""), today: input.today };
    // A cluster is named by its path: the master cluster, and the sub cluster inside it when there is one.
    const clusterId = (projectId: string, path: string[]): string => {
      const all = gps.find((g) => g.id === projectId)?.clusters ?? [];
      const top = all.find((c) => c.parentId === "" && c.name === path[0]);
      return (path[1] === undefined ? top : all.find((c) => c.parentId === top?.id && c.name === path[1]))?.id ?? "";
    };
    const enroll = (who: string, projectId: string, path: string[], item: { id: string } | undefined, role = ""): void => {
      if (!item || projectId === "") return;
      const r = enrol(ctx, enr, { beneficiaryId: made[who], giftProjectId: projectId, clusterId: clusterId(projectId, path), itemId: item.id, role });
      if ("error" in r) skipped.push(`${who} in ${path.join(" > ")}: ${r.error}`); else enr = r.value;
    };
    const s1 = sponsor[0], s2 = sponsor[1];
    for (const who of ["c1", "c2", "c3"]) enroll(who, homes, ["Sample Home - North", "Class 1"], s1);
    enroll("c4", homes, ["Sample Home - North", "Class 2"], s1);
    enroll("c5", homes, ["Sample Home - South", "Class 1"], s1);
    enroll("c1", homes, ["Sample Home - North", "Class 1"], s2); // the same child, a second benefit
    enroll("principal", homes, ["Sample Home - North"], s1, "Principal");
    enroll("warden", homes, ["Sample Home - North"], s1, "Warden");
    enroll("h1", villages, ["Sample Village A"], build[0]);
    enroll("h2", villages, ["Sample Village B"], build[0]);
    enroll("h3", camps, ["Sample Camp 1"], relief[0]);
    // Only the enrolments made here are marked as sample.
    const before = new Set(input.enrolments.records.map((e) => e.id));
    enr = { ...enr, records: enr.records.map((e) => (before.has(e.id) ? e : { ...e, sample: true as const })) };

    return {
      value: { partners: ps.projects, giftProjects: gps, partnerTypes: ps.partnerTypes, register: reg, enrolments: enr },
      summary: { partners: ps.projects.length - input.partners.length, projects: gps.length - input.giftProjects.length, clusters: clusterCount, beneficiaries: sampleIds.size, enrolments: enr.records.length - input.enrolments.records.length, skipped },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The sample setup could not be built." };
  }
}

export interface Removed { value: SampleState; removed: { partners: number; projects: number; beneficiaries: number; enrolments: number }; kept: string[] }

// Removes exactly what the sample made. A sample beneficiary that a real (not sample) enrolment holds stays, and a sample partner that a real project uses stays, and both are reported.
export function removeSampleSetup(s: SampleState): Removed {
  const kept: string[] = [];
  const enrolments = s.enrolments.records.filter((e) => e.sample !== true);
  const heldReal = new Set(enrolments.filter((e) => e.status === "active").map((e) => e.beneficiaryId));
  const records = s.register.records.filter((b) => {
    if (b.sample !== true) return true;
    if (heldReal.has(b.id)) { kept.push(`${b.name} (${b.id}) is enrolled in a real project`); return true; }
    return false;
  });
  const giftProjects = s.giftProjects.filter((g) => g.sample !== true);
  const usedByReal = new Set(giftProjects.flatMap((g) => g.partnerIds));
  const partners = s.partners.filter((p) => {
    if (!isSamplePartner(p)) return true;
    if (usedByReal.has(p.id)) { kept.push(`${p.name} is used by a real project`); return true; }
    return false;
  });
  return {
    value: { partners, giftProjects, partnerTypes: s.partnerTypes, register: { ...s.register, records }, enrolments: { ...s.enrolments, records: enrolments } },
    removed: { partners: s.partners.length - partners.length, projects: s.giftProjects.length - giftProjects.length, beneficiaries: s.register.records.length - records.length, enrolments: s.enrolments.records.length - enrolments.length },
    kept,
  };
}

// What a person is told after loading or removing, in plain words.
export const sampleSummaryText = (m: SampleSummary): string => `Sample setup loaded: ${m.partners} partners, ${m.projects} projects with ${m.clusters} clusters, ${m.beneficiaries} beneficiaries and ${m.enrolments} enrolments.${m.skipped.length ? ` Not enrolled: ${m.skipped.join("; ")}.` : ""}`;
export const removedSummaryText = (r: Removed): string => `Sample data removed: ${r.removed.partners} partners, ${r.removed.projects} projects, ${r.removed.beneficiaries} beneficiaries and ${r.removed.enrolments} enrolments.${r.kept.length ? ` Kept: ${r.kept.join("; ")}.` : ""}`;
