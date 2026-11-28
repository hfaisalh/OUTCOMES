/**
 * profile.ts
 *
 * What it does: the one partner profile, seen in two ways (DECISIONS 281). MWF sees and changes all of it (the partner window). The partner sees a limited form of the same record and may change only the part that is its own to say: who to contact, how and in which language it reports, and its media capacity.
 * Who calls it: the partner server (modules/00-platform/partner-handler.ts) for the `profile-set` request, and the tests. Depends on: the partner record type (modules/06-projects/projects.ts). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: there is one record, never a copy. A partner's change is MWF's record changed, so the two views cannot disagree.
 * - Rule: a partner may change only PARTNER_MAY_EDIT. Everything else (name, type, status, due diligence, funding, capacity, notes, countries) stays MWF's, and a request that names any of it is ignored, not refused, so an old screen does not fail.
 * - Rule: contacts are what the partner says they are: at most 5, each with a name; empty ones are dropped.
 */

import type { PartnerContact, Project } from "../06-projects/projects.js";

// --- What the partner may change ---
export const PARTNER_MAY_EDIT = ["contacts", "reportVia", "reportContact", "language", "media"] as const;
export const MAX_CONTACTS = 5;
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

type Result = { value: Project[] } | { error: string };

export function setOwnProfile(partners: Project[], partnerId: string, body: Record<string, unknown>): Result {
  const p = partners.find((x) => x.id === partnerId);
  if (!p) return { error: "This partner was not found." };
  const next: Project = { ...p };
  if (body["contacts"] !== undefined) {
    const list = Array.isArray(body["contacts"]) ? (body["contacts"] as unknown[]) : [];
    if (list.length > MAX_CONTACTS) return { error: `Give at most ${MAX_CONTACTS} contacts.` };
    const contacts = list.map((c): PartnerContact => { const x = (c ?? {}) as Record<string, unknown>; return { name: text(x["name"], 100), position: text(x["position"], 100), phone: text(x["phone"], 40), mobile: text(x["mobile"], 40), email: text(x["email"], 120), handles: text(x["handles"], 200) }; });
    if (contacts.some((c) => c.name === "" && (c.phone !== "" || c.mobile !== "" || c.email !== "" || c.position !== ""))) return { error: "Give each contact a name." };
    const kept = contacts.filter((c) => c.name !== "");
    if (kept.some((c) => c.email !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email))) return { error: "An email address is not written correctly." };
    if (kept.length > 0) next.contacts = kept; else delete next.contacts;
  }
  for (const k of ["reportVia", "reportContact", "language", "media"] as const) {
    if (body[k] === undefined) continue;
    const v = text(body[k], k === "media" ? 300 : 120);
    if (v !== "") next[k] = v; else delete next[k];
  }
  return { value: partners.map((x) => (x.id === partnerId ? next : x)) };
}
