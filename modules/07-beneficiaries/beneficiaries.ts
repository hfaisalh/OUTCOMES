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
 * - Two kinds: a person (a child, a student, a widow, a teacher) and a household (a family, a group of persons living together). Other things people call beneficiaries, such as a pump or a house, are outcomes.
 * - Every record has one permanent ID with its kind's prefix (PRS-0001, HH-0001). A number is never used twice, even after a record is removed (the counter only goes up).
 * - Only a name is required. A person may have a date of birth (a real date), a gender, a guardian and an area. A household may have an area, the persons in it, or just a size when the persons are not listed.
 * - Rule: duplicate check. The same name and the same date of birth is the same person (a household: the same name and area), and is refused with the ID it matches. The same name only is a possible match:
 *   it is refused with a message until a person says it is a different one (allowSimilar). Names are compared ignoring case, punctuation and extra spaces.
 * - Rule: a person who is a member of a household cannot be removed until taken out of it. A record that is enrolled (held > 0) cannot be removed, make it inactive instead.
 * - Contact details are not kept here: they stay in the CRM or with the partner. Child data is sensitive, so only a name, date of birth, guardian's name and area are held.
 * - Nothing is changed in place: every function returns a new value.
 */

export type BeneficiaryKind = "person" | "household";
export type BeneficiaryStatus = "active" | "inactive";
export type Gender = "" | "female" | "male";

export interface Beneficiary {
  id: string; // the permanent ID, for example PRS-0001
  kind: BeneficiaryKind;
  name: string;
  status: BeneficiaryStatus;
  area: string; // where they live: a village, a district. Not a full address
  notes: string;
  dob: string; // person: YYYY-MM-DD, "" when not known
  gender: Gender; // person
  guardian: string; // person: the name of the parent or guardian, "" when none
  memberIds: string[]; // household: the persons in it
  size?: number; // household: how many people, when the persons are not listed
}

export interface Register { records: Beneficiary[]; counters: Record<string, number> }
type Result = { value: Register; id: string } | { error: string };

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
export function findDuplicates(reg: Register, c: { kind: BeneficiaryKind; name: string; dob?: string; area?: string }, ignoreId = ""): Duplicates {
  const n = normName(c.name);
  const sameName = reg.records.filter((r) => r.kind === c.kind && r.id !== ignoreId && normName(r.name) === n);
  const key = (r: { dob?: string; area?: string }): string => (c.kind === "person" ? clean(r.dob) : normName(clean(r.area)));
  const mine = key(c);
  const exact = mine === "" ? [] : sameName.filter((r) => key(r) === mine);
  return { exact, similar: sameName.filter((r) => !exact.includes(r)) };
}

const describe = (r: Beneficiary): string => `${r.name} (${r.id}${r.kind === "person" ? (r.dob ? `, born ${r.dob}` : "") : r.area ? `, ${r.area}` : ""})`;

interface Fields { name: unknown; dob?: unknown; gender?: unknown; guardian?: unknown; area?: unknown; notes?: unknown; memberIds?: unknown; size?: unknown }

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
  return { name, area: clean(f.area).slice(0, 120), notes: clean(f.notes).slice(0, 500), dob, gender: (kind === "person" ? gender : "") as Gender, guardian: kind === "person" ? clean(f.guardian).slice(0, 80) : "", memberIds, ...(size !== undefined ? { size } : {}) };
}

// Rule: the duplicate check as an error message, or "" when there is no problem.
function duplicateError(reg: Register, kind: BeneficiaryKind, d: { name: string; dob: string; area: string }, selfId: string, allowSimilar: boolean): string {
  const found = findDuplicates(reg, { kind, name: d.name, dob: d.dob, area: d.area }, selfId);
  if (found.exact.length > 0) return `${describe(found.exact[0] as Beneficiary)} is already in the register.`;
  if (found.similar.length > 0 && !allowSimilar) return `Possible match: ${found.similar.map(describe).join(", ")}. If this is a different ${kind === "person" ? "person" : "household"}, tick that it is not the same and save again.`;
  return "";
}

export function addBeneficiary(reg: Register, kind: BeneficiaryKind, f: Fields, allowSimilar = false): Result {
  if (kind !== "person" && kind !== "household") return { error: "Choose person or household." };
  const d = readFields(reg, kind, f, "");
  if ("error" in d) return d;
  const dup = duplicateError(reg, kind, d, "", allowSimilar);
  if (dup !== "") return { error: dup };
  const prefix = PREFIX[kind];
  const next = Math.max(reg.counters[prefix] ?? 0, ...reg.records.filter((r) => r.id.startsWith(`${prefix}-`)).map((r) => Number(r.id.slice(prefix.length + 1)) || 0)) + 1;
  const id = `${prefix}-${String(next).padStart(4, "0")}`;
  return { value: { records: [...reg.records, { id, kind, status: "active", ...d }], counters: { ...reg.counters, [prefix]: next } }, id };
}

// Rule: a record's kind and ID never change. Everything else can, and the duplicate check runs again.
export function setBeneficiary(reg: Register, id: string, f: Fields & { status?: unknown }, allowSimilar = false): Result {
  const r = reg.records.find((x) => x.id === id);
  if (!r) return { error: "That beneficiary was not found." };
  const status = f.status === undefined ? r.status : f.status;
  if (status !== "active" && status !== "inactive") return { error: "Status is active or inactive." };
  const d = readFields(reg, r.kind, f, id);
  if ("error" in d) return d;
  const dup = duplicateError(reg, r.kind, d, id, allowSimilar);
  if (dup !== "") return { error: dup };
  return { value: { ...reg, records: reg.records.map((x) => (x.id === id ? { ...x, ...d, status } : x)) }, id };
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

export interface BeneficiaryFilter { kind: "" | BeneficiaryKind; status: "" | BeneficiaryStatus; text: string }
export const NO_FILTER: BeneficiaryFilter = { kind: "", status: "", text: "" };

// The records that match a filter: the kind, the status, and a text found in the name, ID, area or guardian. Sorted by name.
export function filterBeneficiaries(records: Beneficiary[], f: BeneficiaryFilter): Beneficiary[] {
  const t = normName(f.text);
  return records
    .filter((r) => (f.kind === "" || r.kind === f.kind) && (f.status === "" || r.status === f.status) && (t === "" || normName(`${r.id} ${r.name} ${r.area} ${r.guardian}`).includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// How many people a household stands for: the persons listed, else the size given, else 0.
export const householdCount = (h: Beneficiary): number => (h.memberIds.length > 0 ? h.memberIds.length : h.size ?? 0);

/**
 * The requests the page makes on the register, applied by one pure function so the server and the demo behave the same.
 * Returns null for a request that is not about the register. `held` says how many times a record is enrolled (none until enrolment is built).
 */
export function applyBeneficiaryAction(reg: Register, body: Record<string, unknown>, held: (id: string) => number = () => 0): Result | null {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const fields: Fields = { name: body["name"], dob: body["dob"], gender: body["gender"], guardian: body["guardian"], area: body["area"], notes: body["notes"], memberIds: body["memberIds"], size: body["size"] };
  const allow = body["allowSimilar"] === true;
  switch (body["action"]) {
    case "ben-add": return addBeneficiary(reg, str("kind") as BeneficiaryKind, fields, allow);
    case "ben-set": return setBeneficiary(reg, str("id"), { ...fields, status: str("status") || undefined }, allow);
    case "ben-remove": return removeBeneficiary(reg, str("id"), held(str("id")));
    default: return null;
  }
}
