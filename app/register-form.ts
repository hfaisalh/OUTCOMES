/**
 * register-form.ts
 *
 * What it does: the window that adds or changes one beneficiary (DECISIONS 163). A person has a name, date of birth, gender, guardian, area and notes. A household has a name, area, the persons in it
 * (ticked from the register) or a size, and notes. An existing record also has a status and a Remove button. When the duplicate check finds a possible match, a tick box appears so a person can say it is a
 * different one and save again. Pure: it takes a record and returns HTML, and reads the form back into the request fields.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries/beneficiaries.ts and esc from pages.ts.
 */

import { KIND_LABEL, type Beneficiary, type BeneficiaryKind } from "../modules/07-beneficiaries/beneficiaries";
import { esc } from "./pages";

export const SIMILAR_NOTICE = "Possible match"; // the start of the message the duplicate check gives for a possible match

export function registerFormHtml(rec: Partial<Beneficiary>, id: string, kind: BeneficiaryKind, persons: Beneficiary[], error = ""): string {
  const person = kind === "person";
  const members = new Set(rec.memberIds ?? []);
  const input = (fid: string, label: string, value: string, extra = ""): string => `<label>${label}<input id="${fid}" value="${esc(value)}"${extra}></label>`;
  const personFields = `${input("rg-dob", "Date of birth", rec.dob ?? "", ' placeholder="YYYY-MM-DD"')}
    <label>Gender<select id="rg-gender"><option value="">Not said</option><option value="female"${rec.gender === "female" ? " selected" : ""}>Female</option><option value="male"${rec.gender === "male" ? " selected" : ""}>Male</option></select></label>
    ${input("rg-guardian", "Parent or guardian", rec.guardian ?? "")}`;
  const householdFields = `${input("rg-size", "Number of people (if the persons are not listed)", rec.size === undefined ? "" : String(rec.size), ' type="number" min="1" max="60"')}
    <fieldset class="rg-members"><legend>Persons in this household</legend>${persons.length ? persons.map((p) => `<label class="rg-member-row"><input type="checkbox" class="rg-member" value="${esc(p.id)}"${members.has(p.id) ? " checked" : ""}> ${esc(p.name)} <span class="muted">${esc(p.id)}</span></label>`).join("") : '<span class="muted">No persons in the register yet.</span>'}</fieldset>`;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Beneficiary"><div class="pf-box">
    <header><h2>${id ? esc(rec.name ?? "Beneficiary") : `New ${KIND_LABEL[kind].toLowerCase()}`}${id ? ` <span class="muted">${esc(id)}</span>` : ""}</h2><button data-bn="cancel" aria-label="Close">Close</button></header>
    <div class="pf-body"><div class="cl-form">
      ${input("rg-name", person ? "Name" : "Family or household name", rec.name ?? "")}
      ${person ? personFields : householdFields}
      ${input("rg-area", "Area (village or district, not a full address)", rec.area ?? "")}
      ${input("rg-notes", "Notes", rec.notes ?? "")}
      ${id ? `<label>Status<select id="rg-status"><option value="active"${rec.status !== "inactive" ? " selected" : ""}>Active</option><option value="inactive"${rec.status === "inactive" ? " selected" : ""}>Inactive</option></select></label>` : ""}
      ${error.startsWith(SIMILAR_NOTICE) ? `<label class="rg-same"><input type="checkbox" id="rg-different"> This is a different ${person ? "person" : "household"}, not the one above</label>` : ""}
      <p class="muted">Contact details are not kept here. They stay in the CRM or with the partner.</p>
    </div></div>
    <footer><span id="rg-error" class="pf-error" role="alert">${esc(error)}</span>${id ? '<button data-bn="remove">Remove</button>' : ""}<button data-bn="cancel">Cancel</button><button class="primary" data-bn="save">Save</button></footer>
  </div></div>`;
}
