/**
 * projects-page.ts
 *
 * What it does: draws the Projects page (DECISIONS 76, 245). A project is what a donor chooses on the website (Aghosh, Dadyal Orphan Complex). The page lists the
 * projects as figures, one line each: status, gifts, people enrolled, clusters, benefits, partners, capacity, vacancies, waiting and roles, with four tiles that filter the list. A click on a project opens its form. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (projects), and esc and View from pages.ts.
 */

import { crmNamesOf, noProjectCount } from "../modules/06-projects/projects";
import { projectStats, type ProjectStats } from "../modules/07-beneficiaries/project-stats";
import { emptyEnrolments } from "../modules/07-beneficiaries/enrolments";
import { esc, type View } from "./pages";

export type ProjectFilter = "all" | "setup" | "vacant" | "full";

// Rule: a project needs set-up when it was made automatically or has no partner. It has vacant places when a top cluster has room, and is full when it has places and none is free.
const matches = (s: ProjectStats, f: ProjectFilter): boolean => f === "all" || (f === "setup" ? s.setup !== "ready" : f === "vacant" ? (s.vacant ?? 0) > 0 : s.capacity !== undefined && s.vacant === 0);

export function projectsPage(v: View): string {
  const gps = v.giftProjects ?? [];
  const partners = v.projects ?? [];
  const names = crmNamesOf(v.workOrders, gps);
  const giftsOf = (gpId: string) => names.filter((n) => n.giftProjectId === gpId).reduce((t, n) => t + n.gifts, 0);
  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;
  // The CRM name a project is linked to: its own, or for an older project its name. "" when not linked.
  const crmLink = (g: (typeof gps)[number]): string => (g.crmName === undefined ? g.name : g.crmName);
  const itemName = (id: string) => v.flaggedItems.find((i) => i.id === id)?.name ?? id;
  const enr = v.enrolments ?? emptyEnrolments();
  const all = gps.map((g) => ({ g, s: projectStats(g, enr, v.beneficiaries), gifts: giftsOf(g.id) }));
  const filter = v.pjFilter ?? "all";

  const head = `<h1>Projects</h1>
    <p class="sub">A project is what a donor chooses on the website, such as Aghosh. A gift carries the project's name from the CRM. Each project keeps the CRM's own name as its fixed Original Name, and has a Display Name to show here. Open a project to say which benefits it offers, which partners (vendors) deliver it, in order, and to set up its clusters. A gift for a project can go to any of its partners and is spread across them. A gift with no project is not a general fund: it is for its own item, and goes to any partner that delivers that item.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="actions"><button class="primary" data-pj="new">New project</button></div>`;

  // Tiles: the summary of the list, and the quickest way to the projects that need a person. They count under no filter, so they do not change as one is pressed.
  const count = (f: ProjectFilter): number => all.filter((x) => matches(x.s, f)).length;
  const sum = (n: (x: (typeof all)[number]) => number): number => all.reduce((t, x) => t + n(x), 0);
  const small = (n: number, label: string): string => `<span class="sm"><b>${n}</b> ${label}</span>`;
  const tile = (f: ProjectFilter, cls: string, inner: string): string => `<button type="button" class="metric tile${cls}" data-tile="pj:${f}" aria-pressed="${filter === f ? "true" : "false"}">${inner}</button>`;
  const tiles = all.length === 0 ? "" : `<div class="metrics">
    ${tile("all", "", `<b>${all.length}</b><span>Projects</span><div class="smrow">${small(sum((x) => x.gifts), "gifts")}${small(sum((x) => x.s.beneficiaries), "enrolled")}</div>`)}
    ${tile("setup", count("setup") ? " warn" : "", `<b>${count("setup")}</b><span>Need set-up</span><div class="smrow">${small(all.filter((x) => x.s.setup === "no-partner").length, "with no partner")}</div>`)}
    ${tile("vacant", "", `<b>${count("vacant")}</b><span>With vacancies</span><div class="smrow">${small(sum((x) => x.s.vacant ?? 0), "vacancies")}${small(sum((x) => x.s.waiting), "waiting")}</div>`)}
    ${tile("full", count("full") ? " warn" : "", `<b>${count("full")}</b><span>Full</span><div class="smrow">${small(count("full"), "no vacancy")}</div>`)}</div>`;

  // Rule (DECISIONS 245): the list shows figures, one line a project. The names of the benefits and partners are in a tooltip and in the project's own window (open the row).
  const dash = '<span class="muted">–</span>';
  const status = (x: (typeof all)[number]): string => x.s.setup === "no-partner" ? '<span class="pill review" title="No partner delivers it, so its gifts wait for a person to decide.">No partner</span>'
    : x.s.setup === "automatic" ? '<span class="pill review" title="Made automatically from the project name on a gift. Open it to set its benefits, vendors and clusters. Saving it makes it yours.">Needs set-up</span>' : '<span class="pill ready">Ready</span>';
  const row = (x: (typeof all)[number]): string => {
    const { g, s } = x;
    const crm = crmLink(g);
    const benefitNames = (g.itemIds ?? []).map(itemName);
    return `<tr class="rowlink" data-pj="open" data-id="${esc(g.id)}" tabindex="0"><td class="clip" title="${esc(crm === "" ? "Not linked to a CRM project" : `The CRM's own project name, fixed: ${crm}`)}"><b>${esc(g.name)}</b></td><td>${status(x)}</td>
      <td class="num">${x.gifts}</td><td class="num">${s.beneficiaries}</td><td class="num">${s.clusters || dash}</td>
      <td class="num" title="${esc(benefitNames.length ? benefitNames.join(", ") : "Any benefit")}">${s.benefits === 0 ? '<span class="muted">Any</span>' : s.benefits}</td>
      <td class="num" title="${esc(g.partnerIds.map((id, n) => `${n + 1}. ${partnerName(id)}`).join("\n"))}">${s.partners || dash}</td>
      <td class="num">${s.capacity ?? dash}</td><td class="num${s.vacant === 0 ? " full" : ""}" title="${s.capacity === undefined ? "No capacity set on its clusters" : `${s.taken} of ${s.capacity} enrolled`}">${s.vacant ?? dash}</td><td class="num" title="${esc(s.review ? `${s.waiting} ready and waiting for a vacancy, priority first then first in first out. ${s.review} more need a person to look at the record.` : `${s.waiting} ready and waiting for a vacancy, priority first then first in first out.`)}">${s.waiting || dash}</td><td class="num">${s.roles || dash}</td></tr>`;
  };
  const shown = all.filter((x) => matches(x.s, filter));
  const table = gps.length
    ? `<div class="card"><div class="twrap"><table class="ptable"><thead><tr><th>Display Name</th><th>Status</th><th class="num" title="Gifts the CRM names for this project">Gifts</th><th class="num" title="People or households with an active enrolment">Enrolled</th><th class="num">Clusters</th><th class="num" title="Benefits it offers. Any means no list was set.">Benefits</th><th class="num" title="Partners that deliver it. The order is in the project's own window.">Partners</th><th class="num" title="How many its top clusters can take">Capacity</th><th class="num" title="Capacity not yet taken, counted for each top cluster">Vacancies</th><th class="num" title="Ready and in line for a vacancy. When Enrol automatically is on, the next in line is enrolled by itself.">Waiting</th><th class="num" title="Roles its clusters need, such as Principal">Roles</th></tr></thead><tbody>${shown.map(row).join("")}</tbody></table></div>
      ${shown.length === 0 ? '<div class="empty">No project matches this tile.</div>' : ""}
      <p class="muted">A project with no partner makes its gifts wait for a person to decide. A gift for a benefit the project does not offer also waits.</p></div>`
    : `<div class="card empty">No projects yet. Projects are made automatically from the project a gift carries, or click New project.</div>`;

  // Rule (DECISIONS 157): gifts with no project are counted here, not listed as a project. Each is for its own item.
  const none = noProjectCount(v.workOrders);
  const noneCard = none > 0 ? `<div class="card"><h2>Gifts with no project <span class="muted">(${none})</span></h2>
    <p class="muted">The donor did not choose a project: the CRM project is blank or "Where Needed Most". These are not a general fund that can go anywhere. Each is for its own item and goes to any partner that delivers that item.</p></div>` : "";
  return `${head}${tiles}${table}${noneCard}`;
}
