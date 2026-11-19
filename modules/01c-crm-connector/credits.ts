/**
 * credits.ts
 *
 * What it does: reads the optional "credit chain" of a feed line, and decides who a feedback report
 * goes to. The chain is the people and bodies a gift is credited to besides the donor, nearest
 * first. For example a rep (an agent), then the branch (a group), then the company (an organisation
 * above the group). The CRM will hold these links; OUTCOMES only carries what the feed says
 * (DECISIONS 44).
 * Who calls it: feed.ts (reading), work-orders.ts (keeping), the work orders screen (showing).
 * Depends on: nothing. Pure functions: no database, no screen.
 *
 * Nothing here is required. A feed with no credit columns gives an empty chain, and every rule
 * below falls back to the donor, so today's behaviour does not change.
 */

export interface Credit {
  role: string; // what the CRM calls this level, for example agent, group, organisation. OUTCOMES does not interpret it
  id: string; // the CRM's id for the party
  name: string; // display name only
}

export const MAX_CREDITS = 4;

// Rule: the feed carries the chain as numbered columns, credit_1_role, credit_1_id, credit_1_name,
// then credit_2_..., nearest level first. A level counts when it has an id or a name.
export function readCredits(row: Record<string, string>): Credit[] {
  const out: Credit[] = [];
  for (let n = 1; n <= MAX_CREDITS; n++) {
    const id = (row[`credit_${n}_id`] ?? "").trim();
    const name = (row[`credit_${n}_name`] ?? "").trim();
    if (id !== "" || name !== "") out.push({ role: (row[`credit_${n}_role`] ?? "").trim(), id, name });
  }
  return out;
}

// What the CRM says the donor on the line is: "individual", "organisation" (a donor in its own right) or "group"
// (a group giving on its own name, not an individual). Anything else, including blank, is treated as individual.
export type SupporterKind = "individual" | "organisation" | "group";
export const supporterKindOf = (text: string | undefined): SupporterKind => {
  const t = (text ?? "").trim().toLowerCase();
  return t === "organisation" || t === "organization" ? "organisation" : t === "group" ? "group" : "individual";
};

export interface Creditable {
  supporterId: string;
  supporterName: string;
  supporterKind?: string;
  credits?: Credit[];
}

export interface Recipient {
  id: string;
  name: string;
  role: string; // "donor" when it is the donor, otherwise the credit's role
}

/**
 * Rules for who the feedback report goes to:
 * - An individual donor, or an organisation giving in its own right, gets the report.
 * - A line with no donor, or whose donor is a group giving on its own name, goes to the nearest
 *   credit in the chain (the agent, then the group, then the organisation).
 * - With no credit at all it stays with the donor, and the line is flagged by `noIndividualDonor`.
 */
export function reportTo(w: Creditable): Recipient | null {
  const donorPresent = w.supporterId !== "" || w.supporterName !== "";
  const kind = supporterKindOf(w.supporterKind);
  if (donorPresent && kind !== "group") return { id: w.supporterId, name: w.supporterName, role: "donor" };
  const nearest = (w.credits ?? [])[0];
  if (nearest) return { id: nearest.id, name: nearest.name, role: nearest.role || "credit" };
  return donorPresent ? { id: w.supporterId, name: w.supporterName, role: "donor" } : null;
}

// Rule: flagged so staff can add an individual donor later (DECISIONS 8). True when the line has no individual donor.
export function noIndividualDonor(w: Creditable): boolean {
  const donorPresent = w.supporterId !== "" || w.supporterName !== "";
  return !donorPresent || supporterKindOf(w.supporterKind) === "group";
}

// Everyone a line is credited to, for roll-up views (all gifts credited to a group or organisation).
export const creditedIds = (w: Creditable): string[] => (w.credits ?? []).map((c) => c.id).filter((id) => id !== "");
