/**
 * partner-profile-session.ts
 *
 * What it does: what happens when a partner changes its profile (DECISIONS 281): Change opens the form from the current profile, Save sends it, a refusal keeps what was typed and shows the reason.
 * Who calls it: app/partner-session.ts, for data-action values that start with "pt-profile-". Depends on: the partner answer call (api.ts), partner-profile.ts and the state in partner-state.ts.
 */

import { MAX_CONTACTS } from "../modules/13-partner-portal/profile";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { partnerAnswer } from "./api";
import { profileFormOf } from "./partner-profile";
import { partnerUi } from "./partner-state";

const el = (id: string): string => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
const readContacts = (): { name: string; position: string; phone: string; email: string }[] => Array.from({ length: MAX_CONTACTS }, (_, i) => ({ name: el(`pp-c${i}-name`), position: el(`pp-c${i}-position`), phone: el(`pp-c${i}-phone`), email: el(`pp-c${i}-email`) })).filter((c, i) => document.getElementById(`pp-c${i}-name`) && (c.name !== "" || c.position !== "" || c.phone !== "" || c.email !== ""));

export async function profileAction(action: string, current: PartnerSlice | null, apply: (s: PartnerSlice) => void): Promise<void> {
  if (partnerUi.profile) partnerUi.profile = { ...partnerUi.profile, fresh: false };
  if (action === "pt-profile-edit" && current) partnerUi.profile = profileFormOf(current.partner);
  else if (action === "pt-profile-cancel") partnerUi.profile = null;
  else if (action === "pt-profile-save" && partnerUi.profile) {
    const form = partnerUi.profile;
    const values = { reportVia: el("pp-reportVia"), reportContact: el("pp-reportContact"), language: el("pp-language"), media: el("pp-media") };
    const contacts = readContacts();
    try {
      const { message, ...slice } = await partnerAnswer({ action: "profile-set", contacts, ...values });
      apply(slice as PartnerSlice);
      partnerUi.message = message ?? "";
      partnerUi.profile = null;
    } catch (e) {
      partnerUi.profile = { ...form, values, contacts, error: e instanceof Error ? e.message : "Could not save." }; // what was typed is kept
    }
  }
}

export function profileFocus(action: string): void {
  if (action === "pt-profile-edit") (document.getElementById("pp-c0-name") as HTMLElement | null)?.focus();
  else if (action === "pt-profile-save" && partnerUi.profile?.error) (document.getElementById("pp-error") as HTMLElement | null)?.focus();
  else if (action === "pt-profile-save" || action === "pt-profile-cancel") (document.querySelector('[data-action="pt-profile-edit"]') as HTMLElement | null)?.focus();
}
