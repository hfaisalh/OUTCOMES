/**
 * beneficiaries.ts
 *
 * What it does: the Beneficiary register (DECISIONS 163). The people and households that receive what a gift delivers. A beneficiary is a record with one permanent ID, a kind (person or household),
 * its own details, and a duplicate check, so the same child is never entered twice. It holds recipients only: what is delivered (a house, a pump, a sponsorship) is an outcome, and a beneficiary is
 * enrolled to an outcome in a cluster later (DECISIONS 163, next step). A community outcome such as a mosque has no beneficiary at all.
 * Who calls it: the Beneficiaries page (app/register-page.ts), the server (modules/00-platform/handlers.ts) and the demo (app/main.ts), all through applyBeneficiaryAction.
 * Depends on: nothing. Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule (DECISIONS 164): a person also carries what an admission needs, taken from the orphan admission form: place of birth, a national ID or B-form number, which parent has died, the guardian's relation, and
 *   the eligibility decision (ready, needs review, cannot offer a place) with a note. A partner may also give its own ID for the child (partnerId, partnerRef), since partners keep their own records and later
 *   update this profile through the partner portal. Health, fingerprints, documents and contact details are not held yet (they come with the portal and a restricted role).
 * - Two kinds: a person (a child, a student, a widow, a teacher) and a household (a family, a group of persons living together). Other things people call beneficiaries, such as a pump or a house, are outcomes.
 * - Every record has one permanent ID with its kind's prefix (PRS-0001, HH-0001). A number is never used twice, even after a record is removed (the counter only goes up).
 * - Only a name is required. A person may have a date of birth (a real date), a gender, a guardian and an area. A household may have an area, the persons in it, or just a size when the persons are not listed.
 * - Rule: duplicate check. The same national ID or B-form number is the same person, whatever the name. Otherwise the same name and the same date of birth is the same person (a household: the same name and area), and is refused with the ID it matches. The same name only is a possible match:
 *   it is refused with a message until a person says it is a different one (allowSimilar). Names are compared ignoring case, punctuation and extra spaces.
 * - Rule: a person who is a member of a household cannot be removed until taken out of it. A record that is enrolled (held > 0) cannot be removed, make it inactive instead.
 * - Contact details are not kept here: they stay in the CRM or with the partner. Child data is sensitive, so only a name, date of birth, guardian's name and area are held.
 * - Nothing is changed in place: every function returns a new value.
 */

import { validPlaceId } from "../14-locations/locations.js";

export type BeneficiaryKind = "person" | "household";
export type BeneficiaryStatus = "active" | "inactive";
export type Gender = "" | "female" | "male";
export type ParentStatus = "" | "living" | "deceased";
export type Eligibility = "" | "ready" | "review" | "declined"; // the admission decision: prepare for enrolment, needs management consent or further review, cannot offer a place
export const ELIGIBILITY_LABEL: Record<Eligibility, string> = { "": "Not checked", ready: "Ready", review: "Needs review", declined: "Cannot be enrolled" };

export interface Beneficiary {
  id: string; // the permanent ID, for example PRS-0001
  kind: BeneficiaryKind;
  name: string;
  status: BeneficiaryStatus;
  area: string; // where they live: a village, a district. Not a full address
  locationId?: string; // the checked place the Area was chosen from (DECISIONS 274), "osm:N123". Absent when the Area is only what was typed
  notes: string;
  dob: string; // person: YYYY-MM-DD, "" when not known
  gender: Gender; // person
  guardian: string; // person: the name of the parent or guardian, "" when none
  guardianRelation: string; // person: the guardian's relation to the child (mother, uncle, grandmother)
  placeOfBirth: string; // person
  idNumber: string; // person: national ID or B-form number. The strongest way to tell two records are the same person
  fatherStatus: ParentStatus; // person: whether the father is living or deceased, "" when not known
  motherStatus: ParentStatus; // person: the same for the mother
  eligibility: Eligibility; // person: the admission decision
  eligibilityNote: string; // person: why, in a few words
  partnerId: string; // the partner that gave this record, "" when none
  partnerRef: string; // the partner's own ID for it, so their records and ours can be matched
  sample?: true; // made by the sample setup (DECISIONS 168), so it can be removed again
  targetProjectId?: string; // person: the project they are meant for. With it, admission is decided by completeness and they join the project's waiting list (DECISIONS 246)
  priority?: true; // person: goes to the front of the waiting list. Between people with priority, first come first served (DECISIONS 247)
  priorityNote?: string; // why, in a few words
  registeredOn?: string; // YYYY-MM-DD, when they were put in the register: the order of the waiting list
  memberIds: string[]; // household: the persons in it
  size?: number; // household: how many people, when the persons are not listed
}

export interface Register { records: Beneficiary[]; counters: Record<string, number> }
type Result = { value: Register; id: string; message?: string } | { error: string };

export const PREFIX: Record<BeneficiaryKind, string> = { person: "PRS", household: "HH" };
export const KIND_LABEL: Record<BeneficiaryKind, string> = { person: "Person", household: "Household" };
export const emptyRegister = (): Register => ({ records: [], counters: {} });

const clean = (s: unknown): string => (typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "");

// Names are compared ignoring case, punctuation and extra spaces, so "Ayesha  Khan." and "ayesha khan" match.
export const normName = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

const validDate = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

// Age in whole years on `today` (YYYY-MM-DD), or null when the date of birth is not known.
export function ageOf(dob: string, today: string): number | null {
  if (!validDate(dob) || !validDate(today)) return null;
  let age = Number(today.slice(0, 4)) - Number(dob.slice(0, 4));
  if (today.slice(5) < dob.slice(5)) age--;
  return age < 0 ? null : age;
}

// The numbers in a list of persons for a household, from a list or a text with commas.
const idList = (raw: unknown): string[] => {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(list.map((x) => clean(x)).filter((x) => x !== ""))];
};

export interface Duplicates { exact: Beneficiary[]; similar: Beneficiary[] }

/**
 * Rule: duplicate check. Exact: the same kind, the same name and the same date of birth (a person) or the same area (a household), both known. Similar: the same name but the other detail differs or is missing.
 * `ignoreId` leaves out the record being changed.
 */
export function findDuplicates(reg: Register, c: { kind: BeneficiaryKind; name: string; dob?: string; area?: string; idNumber?: string }, ignoreId = ""): Duplicates {
  const id = clean(c.idNumber).replace(/\s+/g, "").toLowerCase();
  const sameId = c.kind === "person" && id !== "" ? reg.records.filter((r) => r.kind === "person" && r.id !== ignoreId && (r.idNumber ?? "").toLowerCase() === id) : [];
  if (sameId.length > 0) return { exact: sameId, similar: [] }; // the same national ID or B-form number is the same person, whatever the name
  const n = normName(c.name);
  const sameName = reg.records.filter((r) => r.kind === c.kind && r.id !== ignoreId && normName(r.name) === n);
  const key = (r: { dob?: string; area?: string }): string => (c.kind === "person" ? clean(r.dob) : normName(clean(r.area)));
  const mine = key(c);
  const exact = mine === "" ? [] : sameName.filter((r) => key(r) === mine);
  return { exact, similar: sameName.filter((r) => !exact.includes(r)) };
}

const describe = (r: Beneficiary): string => `${r.name} (${r.id}${r.kind === "person" ? (r.dob ? `, born ${r.dob}` : "") + (r.idNumber ? `, ID ${r.idNumber}` : "") : r.area ? `, ${r.area}` : ""})`;

interface Fields { name: unknown; dob?: unknown; gender?: unknown; guardian?: unknown; guardianRelation?: unknown; placeOfBirth?: unknown; idNumber?: unknown; fatherStatus?: unknown; motherStatus?: unknown; eligibility?: unknown; eligibilityNote?: unknown; partnerId?: unknown; partnerRef?: unknown; targetProjectId?: unknown; priority?: unknown; priorityNote?: unknown; area?: unknown; notes?: unknown; memberIds?: unknown; size?: unknown; locationId?: unknown }

// Checks the fields for a kind and returns the record's details (without ID and status), or an error.
function readFields(reg: Register, kind: BeneficiaryKind, f: Fields, selfId: string): Omit<Beneficiary, "id" | "kind" | "status"> | { error: string } {
  const name = clean(f.name).slice(0, 80);
  if (name.length < 2) return { error: "Give a name." };
  const dob = kind === "person" ? clean(f.dob) : "";
  if (dob !== "" && !validDate(dob)) return { error: "The date of birth is not a real date. Write it as YYYY-MM-DD." };
  const gender = clean(f.gender);
  if (gender !== "" && gender !== "female" && gender !== "male") return { error: "Gender is female, male, or empty." };
  let memberIds: string[] = [];
  let size: number | undefined;
  if (kind === "household") {
    memberIds = idList(f.memberIds);
    for (const m of memberIds) {
      if (m === selfId) return { error: "A household cannot be a member of itself." };
      const p = reg.records.find((r) => r.id === m);
      if (!p || p.kind !== "person") return { error: `${m} is not a person in the register.` };
    }
    const raw = clean(f.size);
    if (raw !== "") {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 60) return { error: "Size is a whole number from 1 to 60, or leave it empty." };
      size = n;
    }
  }
  const status = (v: unknown): ParentStatus | "bad" => { const t = clean(v); return t === "" || t === "living" || t === "deceased" ? (t as ParentStatus) : "bad"; };
  const father = status(f.fatherStatus);
  const mother = status(f.motherStatus);
  if (father === "bad" || mother === "bad") return { error: "A parent is living, deceased, or not known." };
  const eligibility = clean(f.eligibility);
  if (eligibility !== "" && eligibility !== "ready" && eligibility !== "review" && eligibility !== "declined") return { error: "The decision is ready, needs review, or cannot be enrolled." };
  const priority = kind === "person" && (f.priority === true || f.priority === "true");
  const mine = (v: unknown, n: number): string => (kind === "person" ? clean(v).slice(0, n) : "");
  return {
    name, area: clean(f.area).slice(0, 120), notes: clean(f.notes).slice(0, 500), dob, gender: (kind === "person" ? gender : "") as Gender, guardian: mine(f.guardian, 80), guardianRelation: mine(f.guardianRelation, 40),
    placeOfBirth: mine(f.placeOfBirth, 80), idNumber: kind === "person" ? clean(f.idNumber).replace(/\s+/g, "").slice(0, 30) : "", fatherStatus: kind === "person" ? father : "", motherStatus: kind === "person" ? mother : "",
    eligibility: (kind === "person" ? eligibility : "") as Eligibility, eligibilityNote: mine(f.eligibilityNote, 200), partnerId: clean(f.partnerId).slice(0, 80), partnerRef: clean(f.partnerRef).slice(0, 60), targetProjectId: kind === "person" ? clean(f.targetProjectId).slice(0, 80) : "", ...(priority ? { priority: true as const, priorityNote: mine(f.priorityNote, 200) } : {}), memberIds, ...(size !== undefined ? { size } : {}), ...(validPlaceId(clean(f.locationId)) ? { locationId: clean(f.locationId) } : {}),
  };
}

// Rule: the duplicate check as an error message, or "" when there is no problem.
function duplicateError(reg: Register, kind: BeneficiaryKind, d: { name: string; dob: string; area: string; idNumber: string }, selfId: string, allowSimilar: boolean): string {
  const found = findDuplicates(reg, { kind, name: d.name, dob: d.dob, area: d.area, idNumber: d.idNumber }, selfId);
  if (found.exact.length > 0) return `${describe(found.exact[0] as Beneficiary)} is already in the register.`;
  if (found.similar.length > 0 && !allowSimilar) return `Possible match: ${found.similar.map(describe).join(", ")}. If this is a different ${kind === "person" ? "person" : "household"}, tick that it is not the same and save again.`;
  return "";
}

// Rule (DECISIONS 244): a person is in one household at a time. Saving a household with a person who is in another household moves them: they are taken out of the other one, and the message says so.
function moveMembers(records: Beneficiary[], householdId: string, memberIds: string[]): { records: Beneficiary[]; message?: string } {
  const moved: string[] = [];
  const next = records.map((h) => {
    if (h.kind !== "household" || h.id === householdId) return h;
    const leaving = h.memberIds.filter((m) => memberIds.includes(m));
    if (leaving.length === 0) return h;
    for (const m of leaving) moved.push(`${records.find((x) => x.id === m)?.name ?? m} from ${h.name}`);
    return { ...h, memberIds: h.memberIds.filter((m) => !memberIds.includes(m)) };
  });
  return moved.length ? { records: next, message: `Moved ${moved.join(", ")}.` } : { records: next };
}

export function addBeneficiary(reg: Register, kind: BeneficiaryKind, f: Fields, allowSimilar = false, today = ""): Result {
  if (kind !== "person" && kind !== "household") return { error: "Choose person or household." };
  const d = readFields(reg, kind, f, "");
  if ("error" in d) return d;
  const dup = duplicateError(reg, kind, d, "", allowSimilar);
  if (dup !== "") return { error: dup };
  const prefix = PREFIX[kind];
  const next = Math.max(reg.counters[prefix] ?? 0, ...reg.records.filter((r) => r.id.startsWith(`${prefix}-`)).map((r) => Number(r.id.slice(prefix.length + 1)) || 0)) + 1;
  const id = `${prefix}-${String(next).padStart(4, "0")}`;
  const moved = moveMembers(reg.records, id, d.memberIds);
  return { value: { records: [...moved.records, { id, kind, status: "active", ...d, ...(today !== "" ? { registeredOn: today } : {}) }], counters: { ...reg.counters, [prefix]: next } }, id, ...(moved.message ? { message: moved.message } : {}) };
}

// The record without its priority, so a save that unticks the switch takes it away instead of keeping the old one.
const withoutPriority = ({ priority: _p, priorityNote: _n, ...rest }: Beneficiary): Beneficiary => rest;

// Rule: a record's kind and ID never change. Everything else can, and the duplicate check runs again.
export function setBeneficiary(reg: Register, id: string, f: Fields & { status?: unknown }, allowSimilar = false, today = ""): Result {
  const r = reg.records.find((x) => x.id === id);
  if (!r) return { error: "That beneficiary was not found." };
  const status = f.status === undefined ? r.status : f.status;
  if (status !== "active" && status !== "inactive") return { error: "Status is active or inactive." };
  const d = readFields(reg, r.kind, f, id);
  if ("error" in d) return d;
  const dup = duplicateError(reg, r.kind, d, id, allowSimilar);
  if (dup !== "") return { error: dup };
  // Rule (DECISIONS 246): a person who changes an automatic decision owns it from then on, so it is not worked out again over theirs.
  const mine = d.eligibility !== (r.eligibility ?? "") && d.eligibilityNote === (r.eligibilityNote ?? "") && (r.eligibilityNote ?? "").startsWith("Automatic: ") ? { ...d, eligibilityNote: "Decided by a person" } : d;
  // Rule: the date registered is set once, when a person first has a project to wait for.
  const registeredOn = r.registeredOn ?? (today !== "" ? today : undefined);
  const moved = moveMembers(reg.records, id, mine.memberIds);
  return { value: { ...reg, records: moved.records.map((x) => (x.id === id ? { ...withoutPriority(x), ...mine, status, ...(registeredOn !== undefined ? { registeredOn } : {}) } : x)) }, id, ...(moved.message ? { message: moved.message } : {}) };
}

// Rule: a person in a household cannot be removed until taken out of it, and one that is enrolled (held) cannot be removed at all. The ID stays used.
export function removeBeneficiary(reg: Register, id: string, held = 0): Result {
  const r = reg.records.find((x) => x.id === id);
  if (!r) return { error: "That beneficiary was not found." };
  const home = reg.records.find((x) => x.kind === "household" && x.memberIds.includes(id));
  if (home) return { error: `${r.name} is in the household ${home.name} (${home.id}). Take them out of it first.` };
  if (held > 0) return { error: `${r.name} is enrolled ${held} time${held === 1 ? "" : "s"}, so cannot be removed. Make them inactive instead.` };
  return { value: { ...reg, records: reg.records.filter((x) => x.id !== id) }, id };
}

export interface BeneficiaryFilter { kind: "" | BeneficiaryKind; status: "" | BeneficiaryStatus; text: string; eligibility?: "" | Eligibility; show?: "" | "gaps" | "missed" | "parked"; project?: string /* a project id: those enrolled in it, applied by the page (DECISIONS 190) */ }
export const NO_FILTER: BeneficiaryFilter = { kind: "", status: "", text: "" };

// The records that match a filter: the kind, the status, and a text found in the name, ID, national ID, partner reference, area or guardian, and the eligibility decision. Sorted by name.
export function filterBeneficiaries(records: Beneficiary[], f: BeneficiaryFilter): Beneficiary[] {
  const t = normName(f.text);
  return records
    .filter((r) => (f.kind === "" || r.kind === f.kind) && (f.status === "" || r.status === f.status) && (!f.eligibility || (r.eligibility ?? "") === f.eligibility) && (t === "" || normName(`${r.id} ${r.name} ${r.area} ${r.guardian} ${r.idNumber ?? ""} ${r.partnerRef ?? ""}`).includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// How many people a household stands for: the persons listed, else the size given, else 0.
export const householdCount = (h: Beneficiary): number => (h.memberIds.length > 0 ? h.memberIds.length : h.size ?? 0);

/**
 * The requests the page makes on the register, applied by one pure function so the server and the demo behave the same.
 * Returns null for a request that is not about the register. `held` says how many times a record is enrolled (none until enrolment is built).
 */
export function applyBeneficiaryAction(reg: Register, body: Record<string, unknown>, held: (id: string) => number = () => 0, today = ""): Result | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const fields: Fields = { name: body["name"], dob: body["dob"], gender: body["gender"], guardian: body["guardian"], guardianRelation: body["guardianRelation"], placeOfBirth: body["placeOfBirth"], idNumber: body["idNumber"], fatherStatus: body["fatherStatus"], motherStatus: body["motherStatus"], eligibility: body["eligibility"], eligibilityNote: body["eligibilityNote"], partnerId: body["partnerId"], partnerRef: body["partnerRef"], targetProjectId: body["targetProjectId"], priority: body["priority"], priorityNote: body["priorityNote"], area: body["area"], notes: body["notes"], memberIds: body["memberIds"], size: body["size"] };
  const allow = body["allowSimilar"] === true;
  switch (body["action"]) {
    case "ben-add": return addBeneficiary(reg, str("kind") as BeneficiaryKind, fields, allow, today);
    case "ben-set": return setBeneficiary(reg, str("id"), { ...fields, status: str("status") || undefined }, allow, today);
    case "ben-remove": return removeBeneficiary(reg, str("id"), held(str("id")));
    default: return null;
  }
}
