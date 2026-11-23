/**
 * projects-page.ts
 *
 * What it does: draws the Projects page (DECISIONS 76). A project is what a donor chooses on the website (Aghosh, Dadyal Orphan Complex). The page lists the
 * projects with the CRM names each answers to and the partners that deliver it, and below it the names the CRM actually uses on gifts, so each can be put
 * in a project. A click on a project opens its form. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (projects), and esc and View from pages.ts.
 */

import { crmNamesOf, itemsSeenWith } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

export function projectsPage(v: View): string {
  const gps = v.giftProjects ?? [];
  const partners = v.projects ?? [];
  const names = crmNamesOf(v.workOrders, gps);
  const giftsOf = (gpId: string) => names.filter((n) => n.giftProjectId === gpId).reduce((t, n) => t + n.gifts, 0);
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  const itemName = (id: string) => v.flaggedItems.find((i) => i.id === id)?.name ?? id;

  const head = `<h1>Projects</h1>
    <p class="sub">A project is what a donor chooses on the website, such as Aghosh. A gift carries the project's name from the CRM. Here you say which CRM names belong to each project, which benefits it offers, and which vendors deliver it, in order. A gift for a project can go to any of its partners and is spread across them. A gift with no project is general and can go to any partner.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-pj="new">New project</button></div>`;

  const rows = gps.map((g) => `<tr class="rowlink" data-pj="open" data-id="${esc(g.id)}" tabindex="0"><td><b>${esc(g.name)}</b>${g.auto ? ' <span class="pill review" title="Made automatically from the project name on a gift. Open it to set its benefits and vendors. Saving it makes it yours.">automatic</span>' : ""}</td><td>${g.crmNames.length ? esc(g.crmNames.join(", ")) : '<span class="muted">Only its own name</span>'}</td>
      <td>${(g.itemIds ?? []).length ? esc((g.itemIds ?? []).map(itemName).join(", ")) : '<span class="muted">Any benefit</span>'}</td><td>${g.partnerIds.length ? g.partnerIds.map((id, n) => `${g.partnerIds.length > 1 ? `${n + 1}. ` : ""}${esc(partnerName(id))}`).join("<br>") : '<span class="pill review">No vendor</span>'}</td><td>${giftsOf(g.id)}</td></tr>`).join("");
  const table = gps.length
    ? `<div class="card"><div class="twrap"><table class="ptable"><thead><tr><th>Project</th><th>Other CRM names</th><th>Benefits offered</th><th>Vendors, in order</th><th>Gifts</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">A project with no vendor makes its gifts wait for a person to decide. A gift for a benefit the project does not offer also waits.</p></div>`
    : `<div class="card empty">No projects yet. Click New project, or put a CRM name from the list below into a new project.</div>`;

  // The names the CRM uses on gifts: put each in a project. A suggestion is only a starting point.
  const suggestable = names.filter((n) => n.suggestion !== "");
  const gpName = (id: string) => gps.find((g) => g.id === id)?.name ?? id;
  const namesCard = names.length ? `<div class="card"><h2>Names the CRM uses <span class="muted">(${names.length})</span></h2>
    <p class="muted">The project a donor chose, counted on your gifts. Put each name in a project. A name in no project is a general gift. Where Needed Most should stay in none.</p>
    ${suggestable.length ? `<div class="actions"><button class="primary" data-action="assign-crm-all" data-pairs="${esc(JSON.stringify(suggestable.map((n) => [n.name, n.suggestion])))}">Use ${suggestable.length} suggestion${suggestable.length === 1 ? "" : "s"}</button></div>` : ""}
    <div class="twrap"><table><thead><tr><th>CRM name</th><th>Gifts</th><th>Project</th></tr></thead><tbody>${names.map((n) => `<tr><td>${esc(n.name)}</td><td>${n.gifts}</td><td><select data-crm-project="${esc(n.name)}" aria-label="Project of ${esc(n.name)}"><option value="">No project (general)</option>${gps.map((g) => `<option value="${esc(g.id)}"${g.id === n.giftProjectId ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select>${n.suggestion ? ` <button data-action="assign-crm" data-name="${esc(n.name)}" data-project="${esc(n.suggestion)}">Use ${esc(gpName(n.suggestion))}</button> <span class="muted">suggested</span>` : ""}${n.giftProjectId === "" && !n.suggestion ? ` <button class="primary" data-pj="create-now" data-name="${esc(n.name)}" data-items="${esc(itemsSeenWith(v.workOrders, n.name).join(","))}" title="Makes the project at once, offering the benefits seen on its gifts. Add vendors afterwards.">Create project</button> <button data-pj="from-name" data-name="${esc(n.name)}" data-items="${esc(itemsSeenWith(v.workOrders, n.name).join(","))}">New project from this name</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`
    : `<div class="card"><h2>Names the CRM uses</h2><div class="empty">No gifts carry a project name yet. Load the donation lines with the Project column ticked.</div></div>`;
  return `${head}${table}${namesCard}`;
}
