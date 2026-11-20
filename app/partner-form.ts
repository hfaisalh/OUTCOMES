/**
 * partner-form.ts
 *
 * What it does: draws the partner profile pop-up (one form for creating a partner or editing one) and reads it back (DECISIONS 69).
 * The profile covers identity, contacts, where the partner works, the items it delivers and its capacity, how it reports, the result of its
 * due diligence (done in a separate tool) and the organisation's own extra fields. Only the name and the type are required.
 * Who calls it: app/main.ts. Depends on: Module 6 (statuses and due diligence results) and esc from pages.ts. The HTML builder is pure. The reader needs a page.
 */

import { DUE_DILIGENCE, PARTNER_STATUSES, type Project } from "../modules/06-projects/projects";
import { esc } from "./pages";

export interface FormContext {
  types: string[]; // the organisation's own partner types
  fields: string[]; // the organisation's own extra fields
  items: { id: string; name: string }[]; // CRM items that need feedback, for "items it delivers"
  others: { id: string; name: string }[]; // partners that have a structure to copy
}

const input = (id: string, label: string, value = "", type = "text", extra = "") => `<label class="pf-field"><span>${esc(label)}</span><input id="${id}" type="${type}" value="${esc(value)}" ${extra} /></label>`;
const area = (id: string, label: string, value = "") => `<label class="pf-field wide"><span>${esc(label)}</span><textarea id="${id}" rows="2">${esc(value)}</textarea></label>`;
const select = (id: string, label: string, options: { id: string; label: string }[], value: string) => `<label class="pf-field"><span>${esc(label)}</span><select id="${id}">${options.map((o) => `<option value="${esc(o.id)}"${o.id === value ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;

const contactRow = (c: { name?: string; position?: string; phone?: string; mobile?: string; email?: string; handles?: string } = {}) => `<div class="pf-row pf-contact">
  <input data-f="name" placeholder="Name" value="${esc(c.name ?? "")}" /><input data-f="position" placeholder="Position" value="${esc(c.position ?? "")}" /><input data-f="phone" placeholder="Phone" value="${esc(c.phone ?? "")}" />
  <input data-f="mobile" placeholder="Mobile" value="${esc(c.mobile ?? "")}" /><input data-f="email" placeholder="Email" value="${esc(c.email ?? "")}" /><input data-f="handles" placeholder="Deals with, for example updates" value="${esc(c.handles ?? "")}" /></div>`;
const docRow = (d: { title?: string; url?: string } = {}) => `<div class="pf-row pf-doc"><input data-f="title" placeholder="Document, for example Agreement" value="${esc(d.title ?? "")}" /><input data-f="url" placeholder="Link to the document" value="${esc(d.url ?? "")}" /></div>`;
export const NEW_CONTACT_ROW = contactRow();
export const NEW_DOC_ROW = docRow();

export function partnerFormHtml(p: Partial<Project>, id: string, ctx: FormContext, error = ""): string {
  const types = [...new Set([...(p.type && !ctx.types.includes(p.type) ? [p.type] : []), ...ctx.types])];
  const picked = new Set(p.itemIds ?? []);
  const contacts = p.contacts && p.contacts.length ? p.contacts : [{}, {}];
  const docs = p.documents && p.documents.length ? p.documents : [{}];
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="${id ? "Edit partner" : "New partner"}"><div class="pf-box">
    <header><h2>${id ? "Edit partner" : "New partner"}</h2><button data-pf="cancel" aria-label="Close">Close</button></header>
    <div class="pf-body">
      <p class="muted">Only the name and the type are required. The rest can be filled in later.</p>
      <section><h3>Who they are</h3><div class="pf-grid">
        ${input("pf-name", "Name (working name)", p.name ?? "", "text", "required")}${input("pf-officialName", "Official name", p.officialName ?? "")}
        <label class="pf-field"><span>Type</span><select id="pf-type"><option value="">Choose a type...</option>${types.map((t) => `<option value="${esc(t)}"${t === p.type ? " selected" : ""}>${esc(t)}</option>`).join("")}<option value="__new__">New type...</option></select></label>
        <label class="pf-field" id="pf-newtype-wrap" hidden><span>Name of the new type</span><input id="pf-newtype" placeholder="For example Mosque, Hospital, Supplier" /></label>
        ${select("pf-status", "Status", PARTNER_STATUSES, p.status ?? "pending")}${input("pf-reference", "Partner reference", p.reference ?? "")}
        ${input("pf-parent", "Part of a larger organisation", p.parent ?? "")}${input("pf-established", "Date established", p.established ?? "", "date")}${input("pf-partnershipStart", "Partnership started", p.partnershipStart ?? "", "date")}
      </div></section>
      <section><h3>Contacts</h3><div id="pf-contacts">${contacts.map(contactRow).join("")}</div><button data-pf="add-contact">Add a contact</button></section>
      <section><h3>Where they work</h3><div class="pf-grid">${input("pf-countries", "Countries of operation", p.countries ?? "")}${input("pf-regions", "Regions and cities", p.regions ?? "")}</div>
        <p class="muted">Branches and their addresses are part of the structure, which you build on the partner's page.</p></section>
      <section><h3>What they deliver</h3>
        <p class="muted">Tick the items this partner can fulfil. A gift for an item is only offered to partners that deliver it. Leave all unticked and it can take any item.</p>
        <div class="pf-items">${ctx.items.length ? ctx.items.map((i) => `<label class="tick"><input type="checkbox" class="pf-item" value="${esc(i.id)}"${picked.has(i.id) ? " checked" : ""} /> ${esc(i.name)}</label>`).join("") : `<span class="muted">No items need feedback yet. Load the CRM files first.</span>`}</div>
        <div class="pf-grid">${input("pf-capacity", "Capacity, jobs at once", p.capacity === undefined ? "" : String(p.capacity), "number", 'min="0"')}${input("pf-capacityNote", "Capacity note", p.capacityNote ?? "")}</div></section>
      <section><h3>How they report</h3><div class="pf-grid">${input("pf-reportVia", "How they send updates", p.reportVia ?? "")}${input("pf-reportContact", "Who to chase", p.reportContact ?? "")}${input("pf-language", "Language", p.language ?? "")}</div>${area("pf-media", "Media capacity: cameras, video, trained staff", p.media ?? "")}</section>
      <section><h3>Due diligence</h3><p class="muted">Done in your separate tool. Only the result is kept here. A partner can be active only while it is approved and in date.</p>
        <div class="pf-grid">${input("pf-ddReference", "Reference in that tool", p.ddReference ?? "")}${select("pf-ddStatus", "Result", DUE_DILIGENCE, p.ddStatus ?? "none")}${input("pf-ddReview", "Review due", p.ddReview ?? "", "date")}</div></section>
      <section><h3>Notes and documents</h3>${area("pf-notes", "Notes", p.notes ?? "")}<div id="pf-docs">${docs.map(docRow).join("")}</div><button data-pf="add-doc">Add a document link</button></section>
      <section><h3>Extra fields</h3>${ctx.fields.length ? `<div class="pf-grid">${ctx.fields.map((f) => `<label class="pf-field"><span>${esc(f)} <button class="linkbtn" data-pf="remove-field" data-name="${esc(f)}" title="Remove this field from every partner">remove</button></span><input data-custom="${esc(f)}" value="${esc(p.custom?.[f] ?? "")}" /></label>`).join("")}</div>` : `<p class="muted">None yet. Add any field you want on every partner.</p>`}
        <div class="actions"><input id="pf-newfield" placeholder="Name of a new field" /><button data-pf="add-field">Add field</button></div></section>
      ${id ? "" : `<section><h3>Structure</h3><label class="pf-field"><span>Start the structure from</span><select id="pf-copy"><option value="">Nothing, I will build it</option>${ctx.others.map((o) => `<option value="${esc(o.id)}">A copy of ${esc(o.name)}</option>`).join("")}</select></label></section>`}
    </div>
    <footer><span id="pf-error" class="pf-error" role="alert">${esc(error)}</span><button data-pf="cancel">Cancel</button><button class="primary" data-pf="save">Save partner</button></footer>
  </div></div>`;
}

// Reads the form back as the profile the server expects. Needs a page.
export function readPartnerForm(root: ParentNode): Record<string, unknown> {
  const val = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";
  const rows = (sel: string) => [...root.querySelectorAll(sel)].map((r) => Object.fromEntries([...r.querySelectorAll("[data-f]")].map((i) => [(i as HTMLElement).dataset.f as string, (i as HTMLInputElement).value])));
  const type = val("pf-type") === "__new__" ? val("pf-newtype") : val("pf-type");
  const out: Record<string, unknown> = { type, contacts: rows(".pf-contact"), documents: rows(".pf-doc"), itemIds: [...root.querySelectorAll(".pf-item:checked")].map((i) => (i as HTMLInputElement).value), custom: Object.fromEntries([...root.querySelectorAll("[data-custom]")].map((i) => [(i as HTMLElement).dataset.custom as string, (i as HTMLInputElement).value])) };
  for (const k of ["name", "officialName", "status", "reference", "parent", "established", "partnershipStart", "countries", "regions", "capacity", "capacityNote", "reportVia", "reportContact", "language", "media", "ddReference", "ddStatus", "ddReview", "notes"]) out[k] = val(`pf-${k}`);
  return out;
}
