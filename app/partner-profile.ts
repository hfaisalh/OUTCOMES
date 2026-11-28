/**
 * partner-profile.ts
 *
 * What it does: the partner's "Your profile" card and the pop-up form to change its own part of it (DECISIONS 281). It is the same record MWF sees in full; the partner sees a limited form and may change only who to contact, how and in which language it reports, and its media capacity.
 * Who calls it: app/partner-home.ts draws the card; app/partner-profile-session.ts handles the buttons. Depends on: the partner slice and the shared pieces in partner-outcomes.ts. Pure: it takes the slice and the form and returns HTML.
 * Data flow: the slice's profile holds only the fields a partner may see. Save sends { action: "profile-set", contacts, reportVia, ... } and the server answers with the fresh slice.
 * UX: a modal dialog like the other forms (role="dialog", aria-modal, Close, Esc, Tab kept inside); every field has a visible label; contacts are rows of labelled fields, with one spare row until there are 5; the error is announced under the form; 44px fields on touch.
 */

import { MAX_CONTACTS } from "../modules/13-partner-portal/profile";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { esc } from "./partner-outcomes";

export interface ProfileForm { values: Record<string, string>; contacts: { name: string; position: string; phone: string; email: string }[]; error: string; fresh?: boolean }
export const REPORT_WAYS = ["Email", "WhatsApp", "Portal"]; // suggestions only

// --- The form, opened from what the profile holds now ---
export function profileFormOf(p: PartnerSlice["partner"]): ProfileForm {
  return { values: { reportVia: p.reportVia ?? "", reportContact: p.reportContact ?? "", language: p.language ?? "", media: p.media ?? "" }, contacts: (p.contacts ?? []).map((c) => ({ name: c.name, position: c.position, phone: c.phone, email: c.email })), error: "", fresh: true };
}

export function profileFormHtml(f: ProfileForm): string {
  const rows = [...f.contacts, ...(f.contacts.length < MAX_CONTACTS ? [{ name: "", position: "", phone: "", email: "" }] : [])];
  const v = (k: string): string => esc(f.values[k] ?? "");
  const contact = (c: ProfileForm["contacts"][number], i: number): string => `<fieldset class="pp-contact"><legend>Contact ${i + 1}</legend>
    <label class="pe-f"><span class="pe-l">Name</span><input id="pp-c${i}-name" value="${esc(c.name)}" autocomplete="off"></label>
    <label class="pe-f"><span class="pe-l">Position</span><input id="pp-c${i}-position" value="${esc(c.position)}" autocomplete="off"></label>
    <label class="pe-f"><span class="pe-l">Phone</span><input id="pp-c${i}-phone" type="tel" value="${esc(c.phone)}" autocomplete="off"></label>
    <label class="pe-f"><span class="pe-l">Email</span><input id="pp-c${i}-email" type="email" value="${esc(c.email)}" autocomplete="off"></label></fieldset>`;
  return `<div class="pf-overlay${f.fresh ? " pe-in" : ""}" role="dialog" aria-modal="true" aria-labelledby="pp-title"><div class="pf-box">
    <header role="none" class="gw-head"><div><h2 id="pp-title">Change your profile</h2><div class="gw-sub muted">The part of your profile that is yours to say. MWF keeps the rest, such as due diligence and funding.</div></div><button type="button" data-action="pt-profile-cancel" aria-label="Close">Close</button></header>
    <form class="pf-body gw pe" id="pp-form" novalidate>
      <h3 class="pp-h">Who to contact</h3><div class="pp-contacts">${rows.map(contact).join("")}</div>
      <h3 class="pp-h">How you report</h3><div class="pe-grid">
        <label class="pe-f"><span class="pe-l">You send updates by</span><input id="pp-reportVia" list="pp-ways" value="${v("reportVia")}" autocomplete="off"><datalist id="pp-ways">${REPORT_WAYS.map((w) => `<option value="${w}">`).join("")}</datalist></label>
        <label class="pe-f"><span class="pe-l">Reporting contact</span><input id="pp-reportContact" value="${v("reportContact")}" autocomplete="off"><span class="muted pe-hint">An address or number we send requests to.</span></label>
        <label class="pe-f"><span class="pe-l">Language</span><input id="pp-language" value="${v("language")}" autocomplete="off"></label>
        <label class="pe-f"><span class="pe-l">Media capacity</span><input id="pp-media" value="${v("media")}" autocomplete="off"><span class="muted pe-hint">For example cameras, video, trained staff.</span></label></div>
    </form>
    <footer><span id="pp-error" class="pf-error" role="alert" tabindex="-1">${esc(f.error)}</span><button type="button" data-action="pt-profile-cancel">Cancel</button><button type="button" class="primary" data-action="pt-profile-save">Save</button></footer></div></div>`;
}

// --- The card ---
export function profileCardHtml(slice: PartnerSlice, form: ProfileForm | null | undefined, message: string): string {
  const p = slice.partner;
  const facts = [["Reference", p.reference], ["Type", p.type], ["Countries", p.countries], ["Reports by", p.reportVia], ["Reporting contact", p.reportContact], ["Language", p.language], ["Media capacity", p.media], ["Batch size", p.batchSize !== undefined ? String(p.batchSize) : ""]].filter(([, v]) => v);
  const contacts = (p.contacts ?? []).map((c) => `<li><b>${esc(c.name)}</b>${c.position ? ` <span class="muted">${esc(c.position)}</span>` : ""}<div class="muted">${[c.phone, c.mobile, c.email].filter((x) => x).map(esc).join(" · ")}</div></li>`).join("");
  return `<section class="card" aria-label="Your profile"><div class="pe-head"><h2>Your profile</h2><span class="pe-btns"><button data-action="pt-profile-edit">Change</button></span></div>
    ${message && !form ? `<div class="note" role="status">${esc(message)}</div>` : ""}${form ? profileFormHtml(form) : ""}
    ${facts.length ? `<table><tbody>${facts.map(([k, v]) => `<tr><td class="muted">${esc(k as string)}</td><td>${esc(v as string)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Your profile has no details yet.</div>`}
    ${contacts ? `<h3 class="pp-h">Contacts</h3><ul class="phome-list">${contacts}</ul>` : ""}</section>`;
}
