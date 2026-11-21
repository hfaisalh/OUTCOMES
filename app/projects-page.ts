/**
 * projects-page.ts
 *
 * What it does: draws the Partners page (DECISIONS 70). A table of partners, one line each, with what matters at a glance. A click on a
 * partner opens its window (partner-window.ts), where its profile, structure and beneficiaries are. Under the table, the list of names the
 * CRM uses on gifts, where a person ticks the partners each name goes to (DECISIONS 67, 68). Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (partners) and Module 5 (fill), and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { perPeriodRule } from "../modules/05-outcomes/outcomes";
import { allocOptions, crmProjectNames, DUE_DILIGENCE, isActivePartner, PARTNER_STATUSES, rollupOf } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;

export function projectsPage(v: View): string {
  const projects = v.projects ?? [];
  const nodes = v.nodes ?? [];
  const outcomes = v.outcomes ?? [];
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const roll = rollupOf(nodes, outcomes, fws, v.allocations ?? [], commitments, allocOptions(projects, v.graceDays, today).policy);

  const head = `<h1>Partners</h1>
    <p class="sub">A partner is whoever implements the job of a gift: an institute, a contractor, another charity or any type you add. Click a partner to open everything about it: its profile, its structure of branches and classes, and its beneficiaries.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-pf="new">New partner</button></div>`;

  const rows = projects.map((p) => {
    const r = roll.byProject.get(p.id) ?? { places: 0, used: 0, beneficiaries: 0 };
    const live = isActivePartner(p, today);
    const items = (p.itemIds ?? []).length;
    return `<tr class="rowlink" data-pf="open" data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b>${p.reference ? ` <span class="muted">${esc(p.reference)}</span>` : ""}</td><td>${esc(p.type ?? "")}</td>
      <td><span class="pill ${live ? "ok" : "review"}">${esc(PARTNER_STATUSES.find((s) => s.id === (p.status ?? "pending"))?.label ?? "")}</span></td>
      <td><span class="pill ${p.ddStatus === "approved" ? "ok" : "review"}">${esc(DUE_DILIGENCE.find((d) => d.id === (p.ddStatus ?? "none"))?.label ?? "")}</span></td>
      <td>${items ? `${items} item${items === 1 ? "" : "s"}` : "Any item"}</td><td>${p.capacity === undefined ? "" : p.capacity}</td><td>${r.beneficiaries}</td><td>${r.used} of ${r.places} ${meter(r.used, r.places)}</td><td>${(p.contacts ?? [])[0]?.name ? esc((p.contacts ?? [])[0]?.name ?? "") : ""}</td></tr>`;
  }).join("");
  const table = projects.length
    ? `<div class="card"><div class="twrap"><table class="ptable"><thead><tr><th>Partner</th><th>Type</th><th>Status</th><th>Due diligence</th><th>Delivers</th><th>Capacity</th><th>Beneficiaries</th><th>Sponsored of units</th><th>Main contact</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">A partner takes gifts only when it is Active and its due diligence is Approved.</p></div>`
    : `<div class="card empty">No partners yet. Click New partner to add the first.</div>`;

  // The names the CRM uses on gifts, matched to partners by ticking (DECISIONS 67, 68). A person decides, and a suggestion is only a starting point.
  const names = crmProjectNames(v.workOrders, projects);
  const suggestable = names.filter((n) => n.suggestion !== "");
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const crmCard = names.length ? `<div class="card"><h2>Names the CRM uses <span class="muted">(${names.length})</span></h2>
    <p class="muted">The project a donor chose, which is the page of the website they posted from, counted on your gifts. Tick the partners each name goes to. A gift that names a project goes to its partners only (a specific gift), and with several partners ticked, to any of them. A name with none ticked is a general gift that is spread across partners. Where Needed Most should stay with none ticked.</p>
    ${suggestable.length ? `<div class="actions"><button class="primary" data-action="assign-crm-all" data-pairs="${esc(JSON.stringify(suggestable.map((n) => [n.name, n.suggestion])))}">Use ${suggestable.length} suggestion${suggestable.length === 1 ? "" : "s"}</button></div>` : ""}
    <div class="twrap"><table><thead><tr><th>CRM name</th><th>Gifts</th><th>Goes to</th></tr></thead><tbody>${names.map((n) => `<tr><td>${esc(n.name)}</td><td>${n.gifts}</td><td>${projects.length ? projects.map((p) => `<label class="tick"><input type="checkbox" data-crm-name="${esc(n.name)}" data-crm-toggle="${esc(p.id)}"${n.projectIds.includes(p.id) ? " checked" : ""} /> ${esc(p.name)}</label>`).join(" ") : `<span class="muted">Create a partner first.</span>`} ${n.projectIds.length === 0 ? `<span class="muted">General, any partner.</span>` : ""}${n.suggestion ? ` <button data-action="assign-crm" data-name="${esc(n.name)}" data-project="${esc(n.suggestion)}">Use ${esc(projectName(n.suggestion))}</button> <span class="muted">suggested</span>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="card"><h2>Names the CRM uses</h2><div class="empty">No gifts carry a project name yet. Load the donation lines with the Project column ticked.</div></div>`;

  return `${head}${table}${crmCard}`;
}
