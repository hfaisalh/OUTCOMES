/**
 * register-page.ts
 *
 * What it does: draws the Beneficiaries page, the register of people and households that receive what gifts deliver (DECISIONS 163), as the month by month view of the implementation of gifts (DECISIONS 190).
 * One row for each enrolment (a child with two benefits has two rows; one not enrolled has one row): ID, name, where (project and cluster), benefit, the units filled of the whole, then a small pie for each month
 * with a slice for each unit, coloured paid, expected, missed or nothing expected. A row opens the profile in a window (app/register-form.ts). Filters (kind, status, admission, project, search) and the buttons to
 * add a person or a household stay. Contact details are not held here (they stay in the CRM). Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/07-beneficiaries (beneficiaries, implementation), outcomes.ts (monthsAround, perPeriodRule), commitments.ts, clusters.ts and esc and View from pages.ts.
 */

import { ageOf, ELIGIBILITY_LABEL, filterBeneficiaries, NO_FILTER, type BeneficiaryFilter } from "../modules/07-beneficiaries/beneficiaries";
import { implementationRows } from "../modules/07-beneficiaries/implementation";
import { allocatable, oneOffCommitments } from "../modules/04b-commitments/commitments";
import { monthsAround, perPeriodRule, type UnitStatus } from "../modules/05-outcomes/outcomes";
import { unitsOfItem } from "../modules/02-project-rules/benefits";
import { clusterStateOf, pathOf } from "../modules/06-projects/clusters";
import { normName } from "../modules/07-beneficiaries/beneficiaries";
import { icon, SYMBOL } from "./gifts-page";
import { esc, type View } from "./pages";

const MAX_ROWS = 300;
const NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const KEY: [UnitStatus, string][] = [["p", "Paid"], ["e", "Expected"], ["m", "Missed"], ["f", "Nothing expected"]];

// One small pie for a month: a slice for each unit of the whole beneficiary, coloured by what its gift did that month.
function pie(slots: { status: UnitStatus | "g" }[], label: string): string {
  const n = slots.length;
  if (n === 0) return "";
  const R = 9, C = 2 * Math.PI * R;
  const arcs = slots.map((sl, i) => { const len = C / n; return `<circle class="seg ${sl.status}" cx="12" cy="12" r="${R}" fill="none" stroke-width="6" stroke-dasharray="${n === 1 ? C : Math.max(len - 1.2, 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 12 12)"/>`; });
  // A thin ring marks the edge so an unfilled (white) unit still shows as an empty slot.
  const rings = `<circle class="ring" cx="12" cy="12" r="11.7" stroke-width=".7"/><circle class="ring" cx="12" cy="12" r="6.3" stroke-width=".7"/>`;
  return `<svg class="mpie" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="${esc(label)}">${rings}${arcs.join("")}</svg>`;
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
  const text = normName(f.text);
  const byText = filterBeneficiaries(all, f); // kind, status, admission and the text against the profile
  const pool = filterBeneficiaries(all, { ...f, text: "" }).filter((b) => (f.project ?? "") === "" || inProject.has(b.id));
  // Rule: every allocated gift has a plan. A single payment the allocation rules do not count per period (a scholarship) is still shown, as a plan of the months it covers.
  const all0 = allocatable(v.workOrders ?? [], perPeriodRule(fws), today);
  const have = new Set(all0.map((c) => c.subscriptionId));
  const commitments = [...all0, ...oneOffCommitments(v.workOrders ?? [], () => true, today).filter((c) => !have.has(c.subscriptionId))];
  const partnerOfKey = new Map((v.assignments?.records ?? []).map((x) => [x.key, x.partnerId]));
  const partnerName = (id: string): string => (v.projects ?? []).find((p) => p.id === id)?.name ?? id;
  const impl = implementationRows({ beneficiaryIds: pool.map((b) => b.id), enrolments: v.enrolments?.records ?? [], placements: v.placements?.records ?? [], commitments, whole, partnerOf: (k) => partnerOfKey.get(k) ?? "", months, today });
  const profileHit = new Set(byText.map((b) => b.id));
  // Rule: the search finds a beneficiary by its profile (name, ID, area, guardian) or by the donor whose gift fills a unit, the partner or the project.
  const matches = (r: (typeof impl)[number]): boolean => {
    if (text === "") return true;
    const b = byId.get(r.beneficiaryId);
    const hay = normName(`${r.donors.join(" ")} ${[...r.partnerIds.map(partnerName), b ? partnerName(b.partnerId) : ""].join(" ")} ${projects.find((p) => p.id === r.giftProjectId)?.name ?? ""}`);
    return profileHit.has(r.beneficiaryId) || hay.includes(text);
  };
  // Rule: show only gaps (a unit with no gift), only failed payments (a missed month), or only plans that are paused, cancelled or completed.
  const showOk = (r: (typeof impl)[number]): boolean => {
    const s = f.show ?? "";
    if (s === "") return true;
    if (r.enrolmentId === "") return false;
    return s === "gaps" ? r.cells.some((c) => c.slots.some((x) => x.status === "g")) : r.missed > 0;
  };
  const list = impl.filter((r) => matches(r) && showOk(r));
  const shownIds = new Set(list.map((r) => r.beneficiaryId));
  const shown = pool.filter((b) => shownIds.has(b.id));
  const where = (gpId: string): string => projects.find((p) => p.id === gpId)?.name ?? "";
  // Plan like the Gifts list: instalments paid over planned (2/∞), with the plan's own status icon when it is not running.
  const planOf = (g: { once: boolean; paid: number; planned: number | null; planStatus: string }): string => (g.once ? `${g.planned ?? 1} mo` : `${g.paid}/${g.planned ?? "\u221E"}`);
  const rows = list.slice(0, MAX_ROWS).map((r) => {
    const b = byId.get(r.beneficiaryId);
    if (!b) return "";
    const age = b.kind === "person" ? ageOf(b.dob, today) : null;
    const sex = b.kind === "person" ? (b.gender === "female" ? "F" : b.gender === "male" ? "M" : "") : "";
    const partner = r.partnerIds.length > 0 ? r.partnerIds.map(partnerName).join(", ") : b.partnerId !== "" ? partnerName(b.partnerId) : "";
    const first = r.gifts[0];
    const more = r.gifts.length > 1 ? ` <span class="muted">+${r.gifts.length - 1}</span>` : "";
    const donor = first ? `${icon(first.once ? "one" : "rec", first.once ? SYMBOL.one : SYMBOL.recurring, first.once ? "One payment" : "Recurring gift")} ${esc(first.donor)}${more}` : "";
    // Status is the beneficiary's own: active (green) or inactive (red), set in the profile. A gift can pause, a beneficiary does not.
    const status = b.status === "active" ? `<span class="dot on" title="Active" aria-label="Active"></span>` : `<span class="dot off" title="Inactive" aria-label="Inactive"></span>`;
    const lead = `<td class="nm" title="${esc([b.id, b.area].filter((x) => x !== "").join(" \u00B7 "))}"><b>${esc(b.name)}</b></td><td>${esc(sex)}</td><td class="num">${age === null ? "" : age}</td><td>${esc(partner)}</td>`;
    const rest = r.enrolmentId === ""
      ? `<td colspan="${months.length + 5}" class="muted">Not enrolled in any benefit yet</td>`
      : `<td>${esc(where(r.giftProjectId))}</td><td>${esc(itemName.get(r.itemId) ?? r.itemId)}</td><td class="num" title="${esc(r.gifts.map((g) => `${g.donor}: ${planOf(g) || "one payment"}`).join("; "))}">${first ? planOf(first) : ""}</td><td class="dn" title="${esc(r.donors.join(", "))}">${donor}</td><td class="num" title="Unit-months paid or expected in the months shown, out of all the unit-months">${r.pct}%</td>${r.cells.map((c) => `<td class="m">${pie(c.slots, `${NAME[Number(c.month.slice(5, 7)) - 1]} ${c.month.slice(0, 4)}`)}</td>`).join("")}`;
    return `<tr class="rowlink" data-bn="open" data-id="${esc(b.id)}" tabindex="0">${lead}${rest}<td class="c st">${status}</td></tr>`;
  }).join("");
  const head = `<thead><tr><th>Name</th><th>M/F</th><th class="num">Age</th><th>Partner</th><th>Project</th><th>Benefit</th><th>Plan</th><th>Donor</th><th class="num" title="Allocation score: the share of the months shown that a gift has paid or expects">Allocated</th>${months.map((m) => `<th class="m${m === today.slice(0, 7) ? " now" : ""}">${NAME[Number(m.slice(5, 7)) - 1]}</th>`).join("")}<th>Status</th></tr></thead>`;
  const legend = `<p class="symbolkey muted">${SYMBOL.recurring} recurring &nbsp; ${SYMBOL.one} one payment &nbsp; <span class="dot on"></span> active &nbsp; <span class="dot off"></span> inactive</p><div class="legendrow">${[...KEY, ["g", "Unfilled unit"] as [string, string]].map(([s, t]) => `<span><span class="sw ${s}"></span>${t}</span>`).join("")}</div>`;
  const sel = (x: string | undefined, val: string): string => (x === val ? " selected" : "");
  const projectSel = `<select data-regf="project" aria-label="Project"><option value="">All projects</option>${projects.map((p) => `<option value="${esc(p.id)}"${sel(f.project, p.id)}>${esc(p.name)}</option>`).join("")}</select>`;
  const filters = `<div class="filters"><select data-regf="kind" aria-label="Kind"><option value="">People and households</option><option value="person"${sel(f.kind, "person")}>People</option><option value="household"${sel(f.kind, "household")}>Households</option></select>
    ${projectSel}
    <select data-regf="show" aria-label="Show"><option value="">All</option><option value="gaps"${sel(f.show, "gaps")}>Gaps: not fully allocated</option><option value="missed"${sel(f.show, "missed")}>Failed payments</option></select>
    <select data-regf="status" aria-label="Status"><option value="">Any status</option><option value="active"${sel(f.status, "active")}>Active</option><option value="inactive"${sel(f.status, "inactive")}>Inactive</option></select>
    <select data-regf="eligibility" aria-label="Admission decision"><option value="">Any decision</option>${(["ready", "review", "declined"] as const).map((e) => `<option value="${e}"${sel(f.eligibility, e)}>${esc(ELIGIBILITY_LABEL[e])}</option>`).join("")}</select>
    <input data-regf="text" value="${esc(f.text)}" placeholder="Search name, ID, donor, partner, area or guardian" aria-label="Search" /></div>`;
  return `<h1>Beneficiaries</h1>
    <p class="sub">Month by month, what is happening with each beneficiary: the gifts that fill each unit of the benefit, paid, expected or missed, and the gaps. Search by name, ID or donor. Open a row for the profile and the ID. Contact details stay in the CRM.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-bn="new" data-kind="person">New person</button><button data-bn="new" data-kind="household">New household</button></div>
    ${filters}
    ${all.length === 0 ? '<div class="empty">No beneficiaries yet. Add the first person or household.</div>' : shown.length === 0 ? '<div class="empty">Nothing matches.</div>' : `${legend}<div class="tablewrap"><table class="octable regtable">${head}<tbody>${rows}</tbody></table></div>
    <p class="muted">${shown.length} of ${all.length} beneficiaries${shown.length > MAX_ROWS ? `, the first ${MAX_ROWS} shown` : ""}.</p>`}`;
}
