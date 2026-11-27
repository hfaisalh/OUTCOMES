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
 * - Rule: a possible duplicate is shown to the partner, who may say it is a different person (allowSimilar). An exact duplicate is refused.
 * - Rule (DECISIONS 246): admission is then decided by completeness, and the waiting list enrols by itself. The message says where the person stands, in the partner's own words.
 */

import { addBeneficiary, setBeneficiary, type Beneficiary, type Register } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolments } from "../07-beneficiaries/enrolments.js";
import { missingFor } from "../07-beneficiaries/waiting.js";
import type { GiftProject } from "../06-projects/projects.js";

// --- What a partner may give ---
const FIELDS = ["name", "dob", "gender", "placeOfBirth", "idNumber", "fatherStatus", "motherStatus", "guardian", "guardianRelation", "area", "partnerRef", "targetProjectId"] as const;
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
  if (action === "ben-add") {
    const r = addBeneficiary(reg, "person", { name: given["name"], ...given, partnerId }, allowSimilar, today);
    return "error" in r ? fail(r.error) : { register: r.value, id: r.id, added: true };
  }
  const id = typeof body["id"] === "string" ? body["id"] : "";
  const mine = reg.records.find((b) => b.id === id && b.partnerId === partnerId && b.kind === "person");
  if (!mine) return { error: "That beneficiary was not found.", similar: false };
  // Everything a partner does not give stays as it is, so an edit never wipes what MWF decided.
  const kept = { eligibility: mine.eligibility, eligibilityNote: mine.eligibilityNote, priority: mine.priority, priorityNote: mine.priorityNote, notes: mine.notes, partnerId: mine.partnerId };
  const r = setBeneficiary(reg, id, { ...mine, ...kept, ...given }, allowSimilar, today);
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
