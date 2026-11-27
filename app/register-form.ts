/**
 * register-form.ts
 *
 * What it does: the window that adds or changes one beneficiary (DECISIONS 163). A person has a name, date of birth, gender, place of birth, national ID or B-form number, which parent has died, guardian and relation, the admission decision and its reason, area and notes. Any record may name the partner that gave it and the partner's own ID for it. A household has a name, area, the persons in it
 * (ticked from the register) or a size, and notes. An existing record also has a status and a Remove button. When the duplicate check finds a possible match, a tick box appears so a person can say it is a
 * different one and save again. Pure: it takes a record and returns HTML, and reads the form back into the request fields.
 * Layout (DECISIONS 241): the same window look as the gift window. A compact header with the ID and status, then cards in two columns (container query, one column when narrow): Identity, Family, Admission, Where and notes, and for a household Members. Every field keeps its id, so the request is read back the same way.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries/beneficiaries.ts and esc from pages.ts.
 */

import { ELIGIBILITY_LABEL, KIND_LABEL, type Beneficiary, type BeneficiaryKind, type Eligibility } from "../modules/07-beneficiaries/beneficiaries";
import { esc } from "./pages";
import { pickerHtml } from "./household-picker";

export const SIMILAR_NOTICE = "Possible match"; // the start of the message the duplicate check gives for a possible match

// What the window needs besides the record: the persons to tick for a household, and the partners a record can come from.
export function registerFormHtml(rec: Partial<Beneficiary>, id: string, kind: BeneficiaryKind, persons: Beneficiary[], error = "", partners: { id: string; name: string }[] = [], households: Beneficiary[] = [], projects: { id: string; name: string }[] = [], standing = ""): string {
  const person = kind === "person";
  const members = new Set(rec.memberIds ?? []);
  // --- Small pieces ---
  // A field. `w` makes it take the whole row of its card.
  const input = (fid: string, label: string, value: string, extra = "", w = false): string => `<label${w ? ' class="w"' : ""}>${label}<input id="${fid}" value="${esc(value)}"${extra}></label>`;
  const parent = (fid: string, label: string, v: string | undefined): string => `<label>${label}<select id="${fid}"><option value="">Not known</option><option value="living"${v === "living" ? " selected" : ""}>Living</option><option value="deceased"${v === "deceased" ? " selected" : ""}>Deceased</option></select></label>`;
  const card = (title: string, fields: string, cls = ""): string => `<section class="gw-card rg-card${cls}"><h3>${title}</h3><div class="rg-grid">${fields}</div></section>`;

  // --- Cards of a person (the details an admission needs, from the orphan admission form, DECISIONS 164; more comes later through the partner portal) ---
  const identity = card("Identity", `${input("rg-name", "Name", rec.name ?? "", "", true)}${input("rg-dob", "Date of birth", rec.dob ?? "", ' placeholder="YYYY-MM-DD"')}
    <label>Gender<select id="rg-gender"><option value="">Not said</option><option value="female"${rec.gender === "female" ? " selected" : ""}>Female</option><option value="male"${rec.gender === "male" ? " selected" : ""}>Male</option></select></label>
    ${input("rg-pob", "Place of birth", rec.placeOfBirth ?? "")}${input("rg-idnumber", "National ID or B-form number", rec.idNumber ?? "")}`);
  const family = card("Family", `${parent("rg-father", "Father", rec.fatherStatus)}${parent("rg-mother", "Mother", rec.motherStatus)}
    ${input("rg-guardian", "Parent or guardian", rec.guardian ?? "")}${input("rg-guardianrel", "Guardian's relation to the child", rec.guardianRelation ?? "", ' placeholder="For example mother, uncle"')}`);
  const admission = card("Admission", `<label>Decision<select id="rg-eligibility">${(["", "ready", "review", "declined"] as Eligibility[]).map((e) => `<option value="${e}"${(rec.eligibility ?? "") === e ? " selected" : ""}>${esc(ELIGIBILITY_LABEL[e])}</option>`).join("")}</select></label>
    ${input("rg-eligibilitynote", "Reason for the decision", rec.eligibilityNote ?? "")}
    <label class="w tick"><input type="checkbox" id="rg-priority"${rec.priority ? " checked" : ""}> Priority: go to the front of the waiting list</label>
    ${input("rg-prioritynote", "Why they have priority", rec.priorityNote ?? "", ' placeholder="For example both parents deceased"', true)}`);
  // --- Cards of a household ---
  const householdIdentity = card("Household", `${input("rg-name", "Family or household name", rec.name ?? "", "", true)}${input("rg-size", "Number of people (if the persons are not listed)", rec.size === undefined ? "" : String(rec.size), ' type="number" min="1" max="60"', true)}`);
  const membersCard = `<section class="gw-card rg-card"><h3>Persons in this household</h3>${pickerHtml(persons, [...members], households, id)}</section>`;
  // --- Cards of both ---
  // Rule (DECISIONS 246): the project a person is meant for. With it, admission is decided by completeness and they join the project's waiting list. `standing` says where they are in the line.
  const target = person ? `<label class="w">Meant for project<select id="rg-target"><option value="">None (not waiting for a project)</option>${projects.map((p) => `<option value="${esc(p.id)}"${rec.targetProjectId === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>${standing ? `<p class="muted w">${esc(standing)}</p>` : ""}` : "";
  const where = card("Where and source", `${target}${input("rg-area", "Area (village or district, not a full address)", rec.area ?? "", "", true)}
    <label>Given by partner<select id="rg-partner"><option value="">None</option>${partners.map((p) => `<option value="${esc(p.id)}"${rec.partnerId === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
    ${input("rg-partnerref", "The partner's own ID for it", rec.partnerRef ?? "")}${input("rg-notes", "Notes", rec.notes ?? "", "", true)}
    ${id ? `<label>Status<select id="rg-status"><option value="active"${rec.status !== "inactive" ? " selected" : ""}>Active</option><option value="inactive"${rec.status === "inactive" ? " selected" : ""}>Inactive</option></select></label>` : ""}`);
  const same = error.startsWith(SIMILAR_NOTICE) ? `<label class="rg-same"><input type="checkbox" id="rg-different"> This is a different ${person ? "person" : "household"}, not the one above</label>` : "";
  const danger = id ? `<details class="rg-danger"><summary>Download or erase their data</summary>
      <p class="muted">Download everything OUTCOMES holds about ${esc(rec.name ?? id)} as a file, or erase it for good: the record, ${person ? "their enrolments and the funding placed with them" : "the household and its enrolments"}, and what the change log says about them. ${person ? "" : "The persons in the household stay. "}Gifts that supported them wait to be placed again. The ID is never used again. This cannot be undone.</p>
      <div class="rg-dangerrow"><button type="button" data-bn="export">Download their data</button><input id="rg-erase-confirm" placeholder="Type ${esc(id)} to confirm" aria-label="Type ${esc(id)} to confirm erasing" autocomplete="off"><button type="button" class="danger" data-bn="erase">Erase for good</button></div></details>` : "";
  // The sub line under the title: the ID, the kind and the status.
  const sub = id ? `<div class="gw-sub"><span class="muted">${esc(id)}</span><span class="muted">${KIND_LABEL[kind]}</span><span class="dot ${rec.status === "inactive" ? "off" : "on"}" aria-hidden="true"></span><span class="muted">${rec.status === "inactive" ? "Inactive" : "Active"}</span></div>` : `<div class="gw-sub muted">Contact details stay in the CRM</div>`;

  // --- The window ---
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Beneficiary"><div class="pf-box">
    <header class="gw-head"><div><h2>${id ? esc(rec.name ?? "Beneficiary") : `New ${KIND_LABEL[kind].toLowerCase()}`}</h2>${sub}</div><button data-bn="cancel" aria-label="Close">Close</button></header>
    <div class="pf-body gw rg-body"><div class="gw-cols rg-cols">
      ${person ? `<div class="rg-col">${identity}${family}</div><div class="rg-col">${admission}${where}</div>` : `<div class="rg-col">${householdIdentity}${membersCard}</div><div class="rg-col">${where}</div>`}
    </div>
    ${same}${danger}
    <p class="muted rg-foot">Contact details, health records, fingerprints and documents are not kept here. They stay in the CRM or with the partner, and come later through the partner portal.</p>
    </div>
    <footer><span id="rg-error" class="pf-error" role="alert">${esc(error)}</span>${id ? '<button data-bn="remove">Remove</button>' : ""}<button data-bn="cancel">Cancel</button><button class="primary" data-bn="save">Save</button></footer>
  </div></div>`;
}
