/**
 * scope.ts
 *
 * What it does: the "only their data" rule of the partner portal (DECISIONS 249). Given everything OUTCOMES holds and one partner's id, it returns the slice that partner may see, and nothing else.
 * Who calls it: the server (modules/00-platform/partner-handler.ts) for the partner's own screens, and the demo. Depends on: the record types of modules 6, 7, 8, 9, 11 and 12. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a partner sees only its own profile, with a short list of fields. Money terms, due diligence, funding and MWF's notes are never sent.
 * - Rule: a partner sees only the projects it delivers, and only the beneficiaries it gave (the record's partner is that partner), their enrolments in those projects, and the gifts assigned to it.
 * - Rule: the slice carries no donor details at all. The work order details a partner needs (what to deliver, the tribute) are a separate, later step, and only for gifts assigned to it.
 * - Rule: a household shows only the members the partner itself gave.
 * - An unknown partner id gives undefined, never an empty or a full picture.
 */

import type { GiftProject, Project } from "../06-projects/projects.js";
import type { Register, Beneficiary } from "../07-beneficiaries/beneficiaries.js";
import type { Enrolments } from "../07-beneficiaries/enrolments.js";
import type { Assignments } from "../08-assignment/assignment.js";
import type { Placements } from "../09-placement/placement.js";
import type { Confirmations } from "../11-confirmation/confirmation.js";
import type { Progress } from "../12-progress/progress.js";

// --- What the portal needs to read, and what it hands out ---
export const PARTNER_PERMISSION = "outcomes.partner"; // held only by a partner's sign-in, never by staff roles
export const PARTNER_PERMISSIONS: string[] = ["outcomes.access", PARTNER_PERMISSION];

export interface PartnerState {
  partners: Project[];
  giftProjects: GiftProject[];
  register: Register;
  enrolments: Enrolments;
  assignments: Assignments;
  confirmations: Confirmations;
  progress: Progress;
  placements: Placements;
  itemNames?: Record<string, string>; // the name of each benefit (a gift item), from the work orders. Names only, never anything about a donor
}

// The profile fields a partner may see. Everything else on the record stays with MWF.
const PROFILE_FIELDS = ["id", "name", "officialName", "reference", "type", "status", "contacts", "countries", "regions", "itemIds", "capacity", "batchSize", "reportVia", "reportContact", "language"] as const;

export interface PartnerSlice {
  partner: Partial<Project> & { id: string; name: string };
  giftProjects: Pick<GiftProject, "id" | "name" | "itemIds" | "clusters" | "enrolAuto">[];
  beneficiaries: Beneficiary[];
  enrolments: Enrolments["records"];
  assignments: Assignments["records"];
  confirmations: Confirmations["records"];
  progress: Progress["records"];
  placements: Placements["records"];
  itemNames: Record<string, string>; // only the benefits of the partner's own gifts and projects
}

// --- The rule ---
export function partnerSlice(s: PartnerState, partnerId: string): PartnerSlice | undefined {
  const p = s.partners.find((x) => x.id === partnerId);
  if (!p) return undefined;
  const profile: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) if (p[f] !== undefined) profile[f] = p[f];

  const projects = s.giftProjects.filter((g) => g.partnerIds.includes(partnerId));
  const projectIds = new Set(projects.map((g) => g.id));
  const mine = s.register.records.filter((b) => b.partnerId === partnerId);
  const mineIds = new Set(mine.map((b) => b.id));
  const enrolments = s.enrolments.records.filter((e) => projectIds.has(e.giftProjectId) && mineIds.has(e.beneficiaryId));
  const enrolmentIds = new Set(enrolments.map((e) => e.id));
  const assignments = s.assignments.records.filter((a) => a.partnerId === partnerId);
  const keys = new Set(assignments.map((a) => a.key));

  // Rule: a benefit's name is sent only for the benefits the partner's own projects offer or its own gifts are for.
  const itemNames: Record<string, string> = {};
  for (const id of [...projects.flatMap((g) => g.itemIds ?? []), ...assignments.map((a) => a.itemId)]) if (s.itemNames?.[id] !== undefined) itemNames[id] = s.itemNames[id] as string;

  return {
    partner: profile as PartnerSlice["partner"],
    giftProjects: projects.map((g) => ({ id: g.id, name: g.name, itemIds: g.itemIds ?? [], clusters: g.clusters ?? [], ...(g.enrolAuto ? { enrolAuto: true as const } : {}) })),
    beneficiaries: mine.map((b) => ({ ...b, memberIds: b.memberIds.filter((m) => mineIds.has(m)) })),
    enrolments,
    assignments,
    confirmations: s.confirmations.records.filter((c) => c.partnerId === partnerId),
    // Rule: a batch entry is kept as "<partner>|<batch>", so it is matched on the partner's own id.
    progress: s.progress.records.filter((r) => keys.has(r.key) || r.key.startsWith(`${partnerId}|`)),
    // Rule: a placement is kept only when it fills no place, or a place of the partner's own beneficiary.
    placements: s.placements.records.filter((r) => keys.has(r.key) && (r.enrolmentId === "" || enrolmentIds.has(r.enrolmentId))),
    itemNames,
  };
}
