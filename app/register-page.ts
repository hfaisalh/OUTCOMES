/**
 * register-page.ts
 *
 * What it does: draws the Beneficiaries page, the register of people and households that receive what gifts deliver (DECISIONS 163). A table with a filter (kind, status, search), one row each
 * (ID, name, kind, age or size, area, guardian or members, status), a button to add a person or a household, and a row opens the record in a window (app/register-form.ts).
 * Contact details are not held here (they stay in the CRM). Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries/beneficiaries.ts and esc and View from pages.ts.
 */

import { ageOf, filterBeneficiaries, householdCount, KIND_LABEL, NO_FILTER, type Beneficiary, type BeneficiaryFilter } from "../modules/07-beneficiaries/beneficiaries";
import { esc, type View } from "./pages";

const MAX_ROWS = 300;

// What the row says about the record: a person's age and guardian, a household's size and members.
function detail(r: Beneficiary, all: Beneficiary[], today: string): { size: string; who: string } {
  if (r.kind === "person") {
    const age = ageOf(r.dob, today);
    return { size: age === null ? "" : `${age} yrs`, who: r.guardian };
  }
  const names = r.memberIds.map((id) => all.find((x) => x.id === id)?.name ?? id);
  return { size: String(householdCount(r) || ""), who: names.join(", ") };
}

export function registerPage(v: View): string {
  const all = v.beneficiaries?.records ?? [];
  const f: BeneficiaryFilter = v.registerFilter ?? NO_FILTER;
  const shown = filterBeneficiaries(all, f);
  const today = v.today ?? "2026-01-01";
  const rows = shown.slice(0, MAX_ROWS).map((r) => {
    const d = detail(r, all, today);
    return `<tr class="rowlink" data-bn="open" data-id="${esc(r.id)}" tabindex="0"><td><span class="refbox">${esc(r.id)}</span></td><td><b>${esc(r.name)}</b></td><td>${esc(KIND_LABEL[r.kind])}</td><td class="num">${esc(d.size)}</td><td>${esc(r.area)}</td><td class="muted">${esc(d.who)}</td><td>${r.status === "active" ? '<span class="pill">Active</span>' : '<span class="pill muted">Inactive</span>'}</td></tr>`;
  }).join("");
  const filters = `<div class="filters"><select data-regf="kind" aria-label="Kind"><option value="">People and households</option><option value="person"${f.kind === "person" ? " selected" : ""}>People</option><option value="household"${f.kind === "household" ? " selected" : ""}>Households</option></select>
    <select data-regf="status" aria-label="Status"><option value="">Any status</option><option value="active"${f.status === "active" ? " selected" : ""}>Active</option><option value="inactive"${f.status === "inactive" ? " selected" : ""}>Inactive</option></select>
    <input data-regf="text" value="${esc(f.text)}" placeholder="Search name, ID, area or guardian" aria-label="Search" /></div>`;
  return `<h1>Beneficiaries</h1>
    <p class="sub">The people and households that receive what gifts deliver. Each has one permanent ID, and the same person is never entered twice. A house, a pump or a sponsorship is an outcome, not a beneficiary: a beneficiary is enrolled in an outcome in a cluster. Contact details stay in the CRM.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-bn="new" data-kind="person">New person</button><button data-bn="new" data-kind="household">New household</button></div>
    ${filters}
    ${all.length === 0 ? '<div class="empty">No beneficiaries yet. Add the first person or household.</div>' : shown.length === 0 ? '<div class="empty">Nothing matches.</div>' : `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Name</th><th>Kind</th><th class="num">Age or size</th><th>Area</th><th>Guardian or members</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted">${shown.length} of ${all.length}${shown.length > MAX_ROWS ? `, the first ${MAX_ROWS} shown` : ""}.</p>`}`;
}
