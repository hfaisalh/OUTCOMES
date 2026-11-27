/**
 * partner-entry-form.ts
 *
 * What it does: the pop-up window (a dialog) a partner uses to add a beneficiary or complete one it gave (DECISIONS 260): who they are, their family, and where they are and which project they are meant for. Nothing that belongs to MWF (admission, priority, status) is asked.
 * Who calls it: app/partner-beneficiaries.ts, when a person opens Add or Edit. Depends on: nothing but the escaping. Pure: it takes the values and the partner's projects and returns HTML.
 * Data flow: the values typed are read back by app/partner-session.ts from the fields' ids (pe-...). On a refusal they are kept, so nothing typed is lost, and the error is shown under the form.
 * UX: it is a modal dialog like the other windows (role="dialog", aria-modal, Close, Esc, Tab kept inside). Every field has a visible label (never a placeholder alone); required ones are marked; a hint under the fields that are easy to get wrong; the error is announced (role="alert") and focused; a date field for the date of birth; two columns, one on a phone, fields 44px for touch; Cancel is always there.
 */

import { esc } from "./partner-outcomes";
import { placeFieldHtml } from "./place-picker";

export interface EntryForm { id: string; values: Record<string, string>; error: string; similar: boolean; fresh?: boolean } // id is "" when adding. fresh: just opened, so the window eases in (and not again on a redraw)

const val = (f: EntryForm, k: string): string => f.values[k] ?? "";
const field = (f: EntryForm, k: string, label: string, extra = "", hint = "", required = false): string =>
  `<label class="pe-f"><span class="pe-l">${esc(label)}${required ? ` <abbr title="required" aria-hidden="true">*</abbr>` : ""}</span><input id="pe-${k}" value="${esc(val(f, k))}" autocomplete="off"${required ? " required" : ""}${extra}>${hint ? `<span class="muted pe-hint">${esc(hint)}</span>` : ""}</label>`;
const pick = (f: EntryForm, k: string, label: string, options: [string, string][]): string =>
  `<label class="pe-f"><span class="pe-l">${esc(label)}</span><select id="pe-${k}">${options.map(([v, t]) => `<option value="${v}"${val(f, k) === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;

export function entryFormHtml(f: EntryForm, projects: { id: string; name: string }[]): string {
  const parent: [string, string][] = [["", "Not known"], ["living", "Living"], ["deceased", "Deceased"]];
  const onlyOne = projects.length === 1 ? projects[0]?.id ?? "" : "";
  const withProject: EntryForm = val(f, "targetProjectId") === "" && onlyOne !== "" ? { ...f, values: { ...f.values, targetProjectId: onlyOne } } : f;
  const project = `<label class="pe-f"><span class="pe-l">Meant for project <abbr title="required" aria-hidden="true">*</abbr></span><select id="pe-targetProjectId" required><option value="">Choose a project</option>${projects.map((p) => `<option value="${esc(p.id)}"${val(withProject, "targetProjectId") === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select><span class="muted pe-hint">A project you deliver. They wait for a vacancy in it.</span></label>`;
  const title = f.id ? "Complete this beneficiary" : "Add a beneficiary";
  return `<div class="pf-overlay${f.fresh ? " pe-in" : ""}" role="dialog" aria-modal="true" aria-labelledby="pe-title"><div class="pf-box">
    <header class="gw-head"><div><h2 id="pe-title">${title}</h2><div class="gw-sub muted">${f.id ? `${esc(f.id)}. ` : ""}A record with a date of birth, a guardian and an ID number is complete, and joins the waiting list for the project.</div></div><button type="button" data-action="pt-form-cancel" aria-label="Close">Close</button></header>
    <form class="pf-body gw pe" id="pe-form" novalidate>
      <div class="pe-grid">
        ${field(f, "name", "Name", "", "", true)}${field(f, "dob", "Date of birth", ' type="date"', "")}
        ${pick(f, "gender", "Gender", [["", "Not said"], ["female", "Female"], ["male", "Male"]])}${field(f, "idNumber", "National ID or B-form number", "", "The surest way to avoid adding the same person twice.")}
        ${pick(f, "fatherStatus", "Father", parent)}${pick(f, "motherStatus", "Mother", parent)}
        ${field(f, "guardian", "Parent or guardian")}${field(f, "guardianRelation", "Guardian's relation to the beneficiary", "", "For example mother, uncle, grandmother.")}
        ${project}${placeFieldHtml("pe-area", val(f, "area"), val(f, "locationId"), "A village or district, not a full address.")}
        ${field(f, "placeOfBirth", "Place of birth")}${field(f, "partnerRef", "Your own reference", "", "Your ID for them, so your records and ours can be matched.")}
      </div>
      ${f.similar ? `<label class="pe-same"><input type="checkbox" id="pe-different"> This is a different person, not the same. Save anyway.</label>` : ""}
      <p class="muted pe-note">Contact details, health records and documents are not kept here. They stay with you and MWF.</p>
    </form>
    <footer><span id="pe-error" class="pf-error" role="alert" tabindex="-1">${esc(f.error)}</span><button type="button" data-action="pt-form-cancel">Cancel</button><button type="button" class="primary" data-action="pt-form-save">${f.id ? "Save" : "Add beneficiary"}</button></footer>
  </div></div>`;
}
