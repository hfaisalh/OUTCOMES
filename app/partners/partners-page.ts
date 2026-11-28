/**
 * partners-page.ts
 *
 * What it does: draws the Partners page (DECISIONS 70, 76). A table of partners, one line each, with what matters at a glance, including the projects each
 * delivers and how many beneficiaries it has. A click on a partner opens its window (partner-window.ts) with its profile and structure. Projects and
 * beneficiaries have their own pages. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (partners) and Module 5 (fill), and esc and View from pages.ts.
 */

import { allocatable } from "../../modules/04b-commitments/commitments";
import { perPeriodRule } from "../../modules/05-outcomes/outcomes";
import { allocOptions, DUE_DILIGENCE, isActivePartner, PARTNER_STATUSES, rollupOf, SAMPLE_PARTNER_REFERENCE } from "../../modules/06-projects/projects";
import { esc, type View } from "../shared/pages";

const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;

export function partnersPage(v: View): string {
  const partners = v.projects ?? [];
  const nodes = v.nodes ?? [];
  const outcomes = v.outcomes ?? [];
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const roll = rollupOf(nodes, outcomes, fws, v.outcomeAllocations ?? [], commitments, allocOptions(partners, v.graceDays, today, v.requireRef === true, v.giftProjects ?? []).policy);

  const head = `<h1>Partners</h1>
    <p class="sub">A partner is whoever implements the job of a gift: an institute, a contractor, another charity or any type you add. Click a partner to open its profile and structure. The projects a partner delivers are set on the Projects page, and its beneficiaries are on the Beneficiaries page.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-pf="new">New partner</button>${partners.some((p) => p.reference === SAMPLE_PARTNER_REFERENCE) ? "" : `<button data-pf="sample" title="Adds an invented partner, active and approved, to try the system with. Nothing about it is real, and it can be removed.">Add a sample partner</button>`}</div>`;

  const rows = partners.map((p) => {
    const r = roll.byProject.get(p.id) ?? { places: 0, used: 0, beneficiaries: 0 };
    const live = isActivePartner(p, today);
    const items = (p.itemIds ?? []).length;
    const projects = (v.giftProjects ?? []).filter((g) => g.partnerIds.includes(p.id)).map((g) => g.name);
    return `<tr class="rowlink" data-pf="open" data-id="${esc(p.id)}" tabindex="0"><td><b>${esc(p.name)}</b>${p.reference ? ` <span class="muted">${esc(p.reference)}</span>` : ""}</td><td>${esc(p.type ?? "")}</td>
      <td><span class="pill ${live ? "ok" : "review"}">${esc(PARTNER_STATUSES.find((s) => s.id === (p.status ?? "pending"))?.label ?? "")}</span></td>
      <td><span class="pill ${p.ddStatus === "approved" ? "ok" : "review"}">${esc(DUE_DILIGENCE.find((d) => d.id === (p.ddStatus ?? "none"))?.label ?? "")}</span></td>
      <td>${projects.length ? esc(projects.join(", ")) : '<span class="muted">None</span>'}</td><td>${items ? `${items} item${items === 1 ? "" : "s"}` : "Any item"}</td><td>${p.capacity === undefined ? "" : p.capacity}</td><td>${r.beneficiaries}</td><td>${r.used} of ${r.places} ${meter(r.used, r.places)}</td><td>${(p.contacts ?? [])[0]?.name ? esc((p.contacts ?? [])[0]?.name ?? "") : ""}</td></tr>`;
  }).join("");
  const table = partners.length
    ? `<div class="card"><div class="twrap"><table class="ptable"><thead><tr><th>Partner</th><th>Type</th><th>Status</th><th>Due diligence</th><th>Projects</th><th>Delivers</th><th>Capacity</th><th>Beneficiaries</th><th>Sponsored of units</th><th>Main contact</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">A partner takes gifts only when it is Active and its due diligence is Approved.</p></div>`
    : `<div class="card empty">No partners yet. Click New partner to add the first.</div>`;
  return `${head}${table}`;
}
