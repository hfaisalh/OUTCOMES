/**
 * entry.ts
 *
 * What it does: lets a partner add its own beneficiaries and complete their records (DECISIONS 260). It hands the person's details to the same register rules the staff screens use (the duplicate check, the field checks, the ID), but only ever for this partner: the record is always the partner's own, it is meant for a project the partner delivers, and the decisions that belong to MWF (admission, priority, status) are never taken from the partner.
 * Who calls it: the server (modules/00-platform/partner-handler.ts), which then runs the waiting list (waiting.ts) and saves. Depends on: modules/07-beneficiaries (the register rules and the waiting list words). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a partner adds people (not households) and edits only the records it gave. Another partner's record is answered as not found, the same as one that does not exist.
 * - Rule: a record is meant for one project, and it must be one the partner delivers. Without a project it can never join a waiting list, so the project is required.
 * - Rule: only the facts a partner knows are taken: name, date of birth, gender, place of birth, ID number, whether each parent is living, the guardian and relation, the area, and its own reference. Admission, priority, notes and status are MWF's, so a partner's request cannot set them, and an edit keeps whatever MWF set.
 * - Rule: a possible duplicate among the partner's OWN records is shown to it, who may say it is a different person (allowSimilar), and an exact one is refused with the record described. A match with ANOTHER partner's record is never described (that would show a stranger's name, birth date and ID): an exact match is refused in general words, and a similar one is simply allowed.
 * - Rule (DECISIONS 246): admission is then decided by completeness, and the waiting list enrols by itself. The message says where the person stands, in the partner's own words.
 */

import { addBeneficiary, findDuplicates, setBeneficiary, type Beneficiary, type Register } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolments } from "../07-beneficiaries/enrolments.js";
import { missingFor } from "../07-beneficiaries/waiting.js";
import type { GiftProject } from "../06-projects/projects.js";

// The same short description the register gives of a record, for the partner's own records only.
const describe = (r: Beneficiary): string => `${r.name} (${r.id}${r.dob ? `, born ${r.dob}` : ""}${r.idNumber ? `, ID ${r.idNumber}` : ""})`;

// --- What a partner may give ---
const FIELDS = ["name", "dob", "gender", "placeOfBirth", "idNumber", "fatherStatus", "motherStatus", "guardian", "guardianRelation", "area", "locationId", "partnerRef", "targetProjectId"] as const;
export const SIMILAR = "Possible match"; // the start of the message the register gives for a possible duplicate

export type EntryResult = { register: Register; id: string; added: boolean } | { error: string; similar: boolean };

export function partnerEntry(reg: Register, partnerId: string, projectIds: string[], body: Record<string, unknown>, today: string): EntryResult | null {
  const action = body["action"];
  if (action !== "ben-add" && action !== "ben-set") return null;
  const given: Record<string, unknown> = {};
  for (const f of FIELDS) if (body[f] !== undefined) given[f] = body[f];
  const target = typeof given["targetProjectId"] === "string" ? given["targetProjectId"] : "";
  if (!projectIds.includes(target)) return { error: "Choose the project this beneficiary is meant for, from the projects you deliver.", similar: false };
  const allowSimilar = body["allowSimilar"] === true;

  const fail = (error: string): EntryResult => ({ error, similar: error.startsWith(SIMILAR) });
  // Duplicates, checked here so another partner's record is never described (DECISIONS 271).
  const dupError = (name: unknown, dob: unknown, idNumber: unknown, ignoreId: string): string => {
    const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    if (text(name).length < 2) return ""; // the register's own check says "Give a name."
    const found = findDuplicates(reg, { kind: "person", name: text(name), dob: text(dob), idNumber: text(idNumber) }, ignoreId);
    if (found.exact.some((r) => r.partnerId !== partnerId)) return "This person is already registered. Please contact MWF to sort it out.";
    const own = (list: Beneficiary[]): Beneficiary[] => list.filter((r) => r.partnerId === partnerId);
    if (own(found.exact).length > 0) return `${describe(own(found.exact)[0] as Beneficiary)} is already in your register.`;
    if (own(found.similar).length > 0 && !allowSimilar) return `${SIMILAR}: ${own(found.similar).map(describe).join(", ")}. If this is a different person, tick that it is not the same and save again.`;
    return "";
  };
  if (action === "ben-add") {
    const dup = dupError(given["name"], given["dob"], given["idNumber"], "");
    if (dup !== "") return fail(dup);
    const r = addBeneficiary(reg, "person", { name: given["name"], ...given, partnerId }, true, today); // duplicates were handled above
    return "error" in r ? fail(r.error) : { register: r.value, id: r.id, added: true };
  }
  const id = typeof body["id"] === "string" ? body["id"] : "";
  const mine = reg.records.find((b) => b.id === id && b.partnerId === partnerId && b.kind === "person");
  if (!mine) return { error: "That beneficiary was not found.", similar: false };
  // Everything a partner does not give stays as it is, so an edit never wipes what MWF decided.
  const kept = { eligibility: mine.eligibility, eligibilityNote: mine.eligibilityNote, priority: mine.priority, priorityNote: mine.priorityNote, notes: mine.notes, partnerId: mine.partnerId };
  const merged = { ...mine, ...given };
  const dup = dupError(merged.name, merged.dob, merged.idNumber, id);
  if (dup !== "") return fail(dup);
  const r = setBeneficiary(reg, id, { ...mine, ...kept, ...given }, true, today); // duplicates were handled above
  return "error" in r ? fail(r.error) : { register: r.value, id, added: false };
}

// --- Where the person stands, in the partner's words ---
export function entryMessage(reg: Register, enr: Enrolments, giftProjects: GiftProject[], id: string, added: boolean): string {
  const b = reg.records.find((x) => x.id === id) as Beneficiary | undefined;
  if (!b) return "";
  const project = giftProjects.find((g) => g.id === b.targetProjectId)?.name ?? "the project";
  const lead = `${added ? "Added" : "Saved"} ${b.name} (${b.id}).`;
  if (enr.records.some((e) => e.beneficiaryId === id && e.status === "active")) return `${lead} Enrolled in ${project}.`;
  if (b.eligibility === "ready") return `${lead} The record is complete, so they are on the waiting list for ${project}.`;
  if (b.eligibility === "declined") return `${lead} MWF has decided they cannot be offered a vacancy in ${project}.`;
  const gaps = missingFor(b);
  return `${lead} ${gaps.length > 0 ? `Add ${gaps.join(", ")}` : "MWF needs to look at the record"} before they can join the waiting list for ${project}.`;
}
