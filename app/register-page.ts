/**
 * register-page.ts
 *
 * What it does: draws the Beneficiaries page, the register of people and households that receive what gifts deliver (DECISIONS 163), as the month by month view of the implementation of gifts (DECISIONS 190).
 * One row for each enrolment (a child with two benefits has two rows; one not enrolled has one row): ID, name, where (project and cluster), benefit, the units filled of the whole, then a small pie for each month
 * with a slice for each unit, coloured paid, expected, missed or nothing expected. A row opens the profile in a window (app/register-form.ts). Filters (kind, status, admission, project, search) and the buttons to
 * add a person or a household stay. Contact details are not held here (they stay in the CRM). Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries (beneficiaries, implementation), outcomes.ts (monthsAround, perPeriodRule), commitments.ts, clusters.ts and esc and View from pages.ts.
 */

import { ageOf, ELIGIBILITY_LABEL, filterBeneficiaries, KIND_LABEL, NO_FILTER, type BeneficiaryFilter } from "../modules/07-beneficiaries/beneficiaries";
import { implementationRows } from "../modules/07-beneficiaries/implementation";
import { allocatable } from "../modules/04b-commitments/commitments";
import { monthsAround, perPeriodRule, type UnitStatus } from "../modules/05-outcomes/outcomes";
import { unitsOfItem } from "../modules/02-project-rules/benefits";
import { clusterStateOf, pathOf } from "../modules/06-projects/clusters";
import { esc, type View } from "./pages";

const MAX_ROWS = 300;
const NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KEY: [UnitStatus, string][] = [["p", "Paid"], ["e", "Expected"], ["m", "Missed"], ["f", "Nothing expected"]];

// One small pie for a month: a slice for each unit of the whole beneficiary, coloured by what its gift did that month.
function pie(slots: { status: UnitStatus }[], label: string): string {
  const n = slots.length;
  if (n === 0) return "";
  const R = 9, C = 2 * Math.PI * R;
  const arcs = slots.map((sl, i) => { const len = C / n; return `<circle class="seg ${sl.status}" cx="12" cy="12" r="${R}" fill="none" stroke-width="6" stroke-dasharray="${n === 1 ? C : Math.max(len - 1.2, 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 12 12)"/>`; });
  return `<svg class="mpie" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${esc(label)}">${arcs.join("")}</svg>`;
}

export function registerPage(v: View): string {
  const all = v.beneficiaries?.records ?? [];
  const f: BeneficiaryFilter = v.registerFilter ?? NO_FILTER;
  const today = v.today ?? "2026-01-01";
  const fws = v.frameworks ?? [];
  const projects = v.giftProjects ?? [];
  const byId = new Map(all.map((b) => [b.id, b]));
  const itemName = new Map((v.workOrders ?? []).map((w) => [w.itemId, w.itemName]));
  const itemFw = new Map<string, string>();
  for (const w of v.workOrders ?? []) if (w.frameworkId && !itemFw.has(w.itemId)) itemFw.set(w.itemId, w.frameworkId);
  const months = monthsAround(today, 5, 6);
  // Rule: the whole beneficiary is the units the benefit needs (set on the item, else the workflow's, else 1).
  const whole = (itemId: string): number => unitsOfItem(v.itemUnits, itemId, fws.find((x) => x.id === itemFw.get(itemId))?.unitsPerBeneficiary ?? 1);
  // Rule: the project filter keeps the beneficiaries enrolled in that project.
  const inProject = new Set((v.enrolments?.records ?? []).filter((e) => e.status === "active" && (f.project ?? "") !== "" && e.giftProjectId === f.project).map((e) => e.beneficiaryId));
  const shown = filterBeneficiaries(all, f).filter((b) => (f.project ?? "") === "" || inProject.has(b.id));
  const commitments = allocatable(v.workOrders ?? [], perPeriodRule(fws), today);
  const impl = implementationRows({ beneficiaryIds: shown.slice(0, MAX_ROWS).map((b) => b.id), enrolments: v.enrolments?.records ?? [], placements: v.placements?.records ?? [], commitments, whole, months, today });
  const where = (gpId: string, clusterId: string): string => {
    const gp = projects.find((p) => p.id === gpId);
    return `${gp ? esc(gp.name) : ""} › ${esc(pathOf(clusterStateOf(gp?.levels, gp?.clusters), clusterId).map((c) => c.name).join(" › "))}`;
  };
  const rows = impl.map((r) => {
    const b = byId.get(r.beneficiaryId);
    if (!b) return "";
    const age = b.kind === "person" ? ageOf(b.dob, today) : null;
    const sub = [KIND_LABEL[b.kind], age === null ? "" : `${age} yrs`, b.area].filter((x) => x !== "").join(" · ");
    const cells = r.enrolmentId === ""
      ? `<td colspan="${months.length + 3}" class="muted">Not enrolled in any benefit yet</td>`
      : `<td>${where(r.giftProjectId, r.clusterId)}</td><td>${esc(itemName.get(r.itemId) ?? r.itemId)}</td><td class="num">${r.filled} of ${r.whole}</td>${r.cells.map((c) => `<td class="m">${pie(c.slots, `${NAME[Number(c.month.slice(5, 7)) - 1]} ${c.month.slice(0, 4)}`)}</td>`).join("")}`;
    return `<tr class="rowlink" data-bn="open" data-id="${esc(b.id)}" tabindex="0"><td><span class="refbox">${esc(b.id)}</span></td><td><b>${esc(b.name)}</b><br><span class="muted">${esc(sub)}</span></td>${cells}</tr>`;
  }).join("");
  const head = `<thead><tr><th>ID</th><th>Name</th><th>Where</th><th>Benefit</th><th class="num">Units</th>${months.map((m) => `<th class="m${m === today.slice(0, 7) ? " now" : ""}">${NAME[Number(m.slice(5, 7)) - 1]}</th>`).join("")}</tr></thead>`;
  const legend = `<div class="legendrow">${KEY.map(([s, t]) => `<span><span class="sw ${s}"></span>${t}</span>`).join("")}</div>`;
  const sel = (x: string | undefined, val: string): string => (x === val ? " selected" : "");
  const projectSel = `<select data-regf="project" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${sel(f.project, p.id)}>${esc(p.name)}</option>`).join("")}</select>`;
  const filters = `<div class="filters"><select data-regf="kind" aria-label="Kind"><option value="">People and households</option><option value="person"${sel(f.kind, "person")}>People</option><option value="household"${sel(f.kind, "household")}>Households</option></select>
    ${projectSel}
    <select data-regf="status" aria-label="Status"><option value="">Any status</option><option value="active"${sel(f.status, "active")}>Active</option><option value="inactive"${sel(f.status, "inactive")}>Inactive</option></select>
    <select data-regf="eligibility" aria-label="Admission decision"><option value="">Any decision</option>${(["ready", "review", "declined"] as const).map((e) => `<option value="${e}"${sel(f.eligibility, e)}>${esc(ELIGIBILITY_LABEL[e])}</option>`).join("")}</select>
    <input data-regf="text" value="${esc(f.text)}" placeholder="Search name, ID, national ID, area or guardian" aria-label="Search" /></div>`;
  return `<h1>Beneficiaries</h1>
    <p class="sub">Month by month, what is happening with each beneficiary: the gifts that fill each unit of the benefit, paid, expected or missed. Each has one permanent ID, and the same person is never entered twice. Open a row for the profile. Contact details stay in the CRM.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-bn="new" data-kind="person">New person</button><button data-bn="new" data-kind="household">New household</button></div>
    ${filters}
    ${all.length === 0 ? '<div class="empty">No beneficiaries yet. Add the first person or household.</div>' : shown.length === 0 ? '<div class="empty">Nothing matches.</div>' : `${legend}<div class="tablewrap"><table class="octable">${head}<tbody>${rows}</tbody></table></div>
    <p class="muted">${shown.length} of ${all.length} beneficiaries${shown.length > MAX_ROWS ? `, the first ${MAX_ROWS} shown` : ""}.</p>`}`;
}
