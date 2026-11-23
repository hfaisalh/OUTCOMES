/**
 * projects-page.ts
 *
 * What it does: draws the Projects page (DECISIONS 76). A project is what a donor chooses on the website (Aghosh, Dadyal Orphan Complex). The page lists the
 * projects with the CRM names each answers to and the partners that deliver it, and below it the names the CRM actually uses on gifts, so each can be put
 * in a project. A click on a project opens its form. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (projects), and esc and View from pages.ts.
 */

import { crmNamesOf, noProjectCount } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

export function projectsPage(v: View): string {
  const gps = v.giftProjects ?? [];
  const partners = v.projects ?? [];
  const names = crmNamesOf(v.workOrders, gps);
  const giftsOf = (gpId: string) => names.filter((n) => n.giftProjectId === gpId).reduce((t, n) => t + n.gifts, 0);
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  // The CRM name a project is linked to: its own, or for an older project its name. "" when not linked.
  const crmLink = (g: (typeof gps)[number]): string => (g.crmName === undefined ? g.name : g.crmName);
  const itemName = (id: string) => v.flaggedItems.find((i) => i.id === id)?.name ?? id;

  const head = `<h1>Projects</h1>
    <p class="sub">A project is what a donor chooses on the website, such as Aghosh. A gift carries the project's name from the CRM. Each project keeps the CRM\'s own name as its fixed link, and has its own name to show here. You say which benefits it offers, and which partners (vendors) deliver it, in order. A gift for a project can go to any of its partners and is spread across them. A gift with no project is not a general fund: it is for its own item, and goes to any partner that delivers that item.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-pj="new">New project</button></div>`;

  const rows = gps.map((g) => `<tr class="rowlink" data-pj="open" data-id="${esc(g.id)}" tabindex="0"><td><b>${esc(g.name)}</b>${g.auto ? ' <span class="pill review" title="Made automatically from the project name on a gift. Open it to set its benefits and vendors. Saving it makes it yours.">automatic</span>' : ""}</td><td>${crmLink(g) === "" ? '<span class="muted">Not linked</span>' : `<span title="The CRM's own project name, fixed">${esc(crmLink(g))}</span>`}</td>
      <td>${(g.itemIds ?? []).length ? esc((g.itemIds ?? []).map(itemName).join(", ")) : '<span class="muted">Any benefit</span>'}</td><td>${g.partnerIds.length ? g.partnerIds.map((id, n) => `${g.partnerIds.length > 1 ? `${n + 1}. ` : ""}${esc(partnerName(id))}`).join("<br>") : '<span class="pill review">No partner</span>'}</td><td>${giftsOf(g.id)}</td></tr>`).join("");
  const table = gps.length
    ? `<div class="card"><div class="twrap"><table class="ptable"><thead><tr><th>Project</th><th>CRM project</th><th>Benefits offered</th><th>Partners / vendors, in order</th><th>Gifts</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted">A project with no partner makes its gifts wait for a person to decide. A gift for a benefit the project does not offer also waits.</p></div>`
    : `<div class="card empty">No projects yet. Projects are made automatically from the project a gift carries, or click New project.</div>`;

  // Rule (DECISIONS 157): gifts with no project are counted here, not listed as a project. Each is for its own item.
  const none = noProjectCount(v.workOrders);
  const noneCard = none > 0 ? `<div class="card"><h2>Gifts with no project <span class="muted">(${none})</span></h2>
    <p class="muted">The donor did not choose a project: the CRM project is blank or "Where Needed Most". These are not a general fund that can go anywhere. Each is for its own item and goes to any partner that delivers that item.</p></div>` : "";
  return `${head}${table}${noneCard}`;
}
