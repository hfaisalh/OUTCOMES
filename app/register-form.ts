/**
 * register-form.ts
 *
 * What it does: the window that adds or changes one beneficiary (DECISIONS 163). A person has a name, date of birth, gender, place of birth, national ID or B-form number, which parent has died, guardian and relation, the admission decision and its reason, area and notes. Any record may name the partner that gave it and the partner's own ID for it. A household has a name, area, the persons in it
 * (ticked from the register) or a size, and notes. An existing record also has a status and a Remove button. When the duplicate check finds a possible match, a tick box appears so a person can say it is a
 * different one and save again. Pure: it takes a record and returns HTML, and reads the form back into the request fields.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries/beneficiaries.ts and esc from pages.ts.
 */

import { ELIGIBILITY_LABEL, KIND_LABEL, type Beneficiary, type BeneficiaryKind, type Eligibility } from "../modules/07-beneficiaries/beneficiaries";
import { esc } from "./pages";

export const SIMILAR_NOTICE = "Possible match"; // the start of the message the duplicate check gives for a possible match

// What the window needs besides the record: the persons to tick for a household, and the partners a record can come from.
export function registerFormHtml(rec: Partial<Beneficiary>, id: string, kind: BeneficiaryKind, persons: Beneficiary[], error = "", partners: { id: string; name: string }[] = []): string {
  const person = kind === "person";
  const members = new Set(rec.memberIds ?? []);
  const input = (fid: string, label: string, value: string, extra = ""): string => `<label>${label}<input id="${fid}" value="${esc(value)}"${extra}></label>`;
  const parent = (fid: string, label: string, v: string | undefined): string => `<label>${label}<select id="${fid}"><option value="">Not known</option><option value="living"${v === "living" ? " selected" : ""}>Living</option><option value="deceased"${v === "deceased" ? " selected" : ""}>Deceased</option></select></label>`;
  // The details an admission needs, taken from the orphan admission form (DECISIONS 164). More comes later through the partner portal.
  const personFields = `${input("rg-dob", "Date of birth", rec.dob ?? "", ' placeholder="YYYY-MM-DD"')}
    <label>Gender<select id="rg-gender"><option value="">Not said</option><option value="female"${rec.gender === "female" ? " selected" : ""}>Female</option><option value="male"${rec.gender === "male" ? " selected" : ""}>Male</option></select></label>
    ${input("rg-pob", "Place of birth", rec.placeOfBirth ?? "")}
    ${input("rg-idnumber", "National ID or B-form number", rec.idNumber ?? "")}
    ${parent("rg-father", "Father", rec.fatherStatus)}${parent("rg-mother", "Mother", rec.motherStatus)}
    ${input("rg-guardian", "Parent or guardian", rec.guardian ?? "")}
    ${input("rg-guardianrel", "Guardian's relation to the child", rec.guardianRelation ?? "", ' placeholder="For example mother, uncle, grandmother"')}
    <label>Admission decision<select id="rg-eligibility">${(["", "ready", "review", "declined"] as Eligibility[]).map((e) => `<option value="${e}"${(rec.eligibility ?? "") === e ? " selected" : ""}>${esc(ELIGIBILITY_LABEL[e])}</option>`).join("")}</select></label>
    ${input("rg-eligibilitynote", "Reason for the decision", rec.eligibilityNote ?? "")}`;
  const source = `<label>Given by partner<select id="rg-partner"><option value="">None</option>${partners.map((p) => `<option value="${esc(p.id)}"${rec.partnerId === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
    ${input("rg-partnerref", "The partner's own ID for it", rec.partnerRef ?? "")}`;
  const householdFields = `${input("rg-size", "Number of people (if the persons are not listed)", rec.size === undefined ? "" : String(rec.size), ' type="number" min="1" max="60"')}
    <fieldset class="rg-members"><legend>Persons in this household</legend>${persons.length ? persons.map((p) => `<label class="rg-member-row"><input type="checkbox" class="rg-member" value="${esc(p.id)}"${members.has(p.id) ? " checked" : ""}> ${esc(p.name)} <span class="muted">${esc(p.id)}</span></label>`).join("") : '<span class="muted">No persons in the register yet.</span>'}</fieldset>`;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Beneficiary"><div class="pf-box">
    <header><h2>${id ? esc(rec.name ?? "Beneficiary") : `New ${KIND_LABEL[kind].toLowerCase()}`}${id ? ` <span class="muted">${esc(id)}</span>` : ""}</h2><button data-bn="cancel" aria-label="Close">Close</button></header>
    <div class="pf-body"><div class="cl-form">
      ${input("rg-name", person ? "Name" : "Family or household name", rec.name ?? "")}
      ${person ? personFields : householdFields}
      ${input("rg-area", "Area (village or district, not a full address)", rec.area ?? "")}
      ${source}
      ${input("rg-notes", "Notes", rec.notes ?? "")}
      ${id ? `<label>Status<select id="rg-status"><option value="active"${rec.status !== "inactive" ? " selected" : ""}>Active</option><option value="inactive"${rec.status === "inactive" ? " selected" : ""}>Inactive</option></select></label>` : ""}
      ${error.startsWith(SIMILAR_NOTICE) ? `<label class="rg-same"><input type="checkbox" id="rg-different"> This is a different ${person ? "person" : "household"}, not the one above</label>` : ""}
      ${id ? `<details class="rg-danger"><summary>Download or erase their data</summary>
        <p class="muted">Download everything OUTCOMES holds about ${esc(rec.name ?? id)} as a file, or erase it for good: the record, ${person ? "their enrolments and the places they held" : "the household and its enrolments"}, and what the change log says about them. ${person ? "" : "The persons in the household stay. "}Gifts that filled their places wait to be placed again. The ID is never used again. This cannot be undone.</p>
        <div class="rg-dangerrow"><button type="button" data-bn="export">Download their data</button><input id="rg-erase-confirm" placeholder="Type ${esc(id)} to confirm" aria-label="Type ${esc(id)} to confirm erasing" autocomplete="off"><button type="button" class="danger" data-bn="erase">Erase for good</button></div></details>` : ""}
      <p class="muted">Contact details, health records, fingerprints and documents are not kept here. They stay in the CRM or with the partner, and come later through the partner portal.</p>
    </div></div>
    <footer><span id="rg-error" class="pf-error" role="alert">${esc(error)}</span>${id ? '<button data-bn="remove">Remove</button>' : ""}<button data-bn="cancel">Cancel</button><button class="primary" data-bn="save">Save</button></footer>
  </div></div>`;
}
