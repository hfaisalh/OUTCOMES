/**
 * projects-page.ts
 *
 * What it does: draws the Projects page. A person creates a project, builds the levels it uses (Branch, Block, Class), says which
 * kinds of beneficiary live at which level and how they are sponsored, adds the places, and adds numbered beneficiaries to them
 * (DECISIONS 65). Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Module 6 (projects) and Module 5 (fill), and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { perPeriodRule } from "../modules/05-outcomes/outcomes";
import { allocOptions, orderedLevels, rollupOf, type Node, type Project } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

// Starting shapes for a new project, so nobody builds the structure from nothing.
export const PROJECT_TEMPLATES: { id: string; label: string; levels: string[] }[] = [
  { id: "school", label: "Orphan home or school (Branch, Block, Class)", levels: ["Branch", "Block", "Class"] },
  { id: "sites", label: "Sites with items (Region, Site)", levels: ["Region", "Site"] },
  { id: "blank", label: "Blank, I will add the levels", levels: [] },
];

const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;

export function projectsPage(v: View): string {
  const projects = v.projects ?? [];
  const nodes = v.nodes ?? [];
  const outcomes = v.outcomes ?? [];
  const fws = v.frameworks ?? [];
  const project = projects.find((p) => p.id === v.openProject) ?? projects[0];

  const create = `<div class="card"><h2>New project</h2>
    <div class="actions"><input id="pj-name" placeholder="Project name, for example Aghosh Orphan Homes" /><input id="pj-aliases" placeholder="Names the CRM uses, separated by commas (optional)" />
      <select id="pj-template" aria-label="Start from">${PROJECT_TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join("")}</select>
      <button class="primary" data-action="add-project">Create project</button></div>
    <p class="muted">A gift that names one of these CRM names goes to this project. A gift that names none is general and can go to any project.</p></div>`;
  const head = `<h1>Projects</h1>
    <p class="sub">A project is somewhere that sponsors people or things, such as an orphan home. Build the structure it uses, say who lives at each level and how they are sponsored, then add them. Test records are numbered for now. Profile details come later.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}`;
  if (!project) return `${head}${create}<div class="card empty">No projects yet. Create the first one above.</div>`;

  const levels = orderedLevels(project);
  const mine = nodes.filter((n) => n.projectId === project.id);
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), v.today ?? "2026-01-01");
  const roll = rollupOf(mine, outcomes.filter((o) => o.projectId === project.id), fws, v.allocations ?? [], commitments, allocOptions(projects, v.bufferMonths, v.today ?? "2026-01-01").policy);
  const levelName = (id: string) => levels.find((l) => l.id === id)?.name ?? "";
  const fwName = (id: string) => fws.find((f) => f.id === id)?.name ?? "No framework";
  const total = roll.byProject.get(project.id) ?? { places: 0, used: 0, beneficiaries: 0 };

  const picker = projects.length > 1 ? `<div class="actions"><label>Project <select data-pj-open aria-label="Project">${projects.map((p) => `<option value="${esc(p.id)}"${p.id === project.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label></div>` : "";

  // 1. Levels: one chain from the top down. A new level goes under the last one.
  const last = levels[levels.length - 1];
  const levelCard = `<div class="card"><h2>1. Levels <span class="muted">(the shape of ${esc(project.name)})</span></h2>
    <p>${levels.length ? levels.map((l) => `<b>${esc(l.name)}</b>`).join(" &gt; ") : `<span class="muted">No levels yet. Add the first one, for example Branch.</span>`}${last ? ` <button data-action="remove-level" data-id="${esc(last.id)}" title="Remove the bottom level, ${esc(last.name)}">Remove ${esc(last.name)}</button>` : ""}</p>
    <div class="actions"><input id="pj-level" placeholder="${last ? `A level under ${esc(last.name)}` : "First level, for example Branch"}" /><button data-action="add-level" data-parent="${esc(last?.id ?? "")}">Add level</button></div></div>`;

  // 2. Types of beneficiary, where each lives and how it is sponsored.
  const typeCard = `<div class="card"><h2>2. Who lives here <span class="muted">(types of beneficiary)</span></h2>
    ${project.types.length ? `<table><thead><tr><th>Type</th><th>Lives at</th><th>Sponsored as</th><th></th></tr></thead><tbody>${project.types.map((t) => `<tr><td>${esc(t.name)}</td><td>${esc(levelName(t.levelId))}</td><td>${esc(fwName(t.frameworkId))}</td><td><button data-action="remove-type" data-id="${esc(t.id)}">Remove</button></td></tr>`).join("")}</tbody></table>` : `<div class="empty">No types yet. For example: Child lives at Class, sponsored as shared parts.</div>`}
    <div class="actions"><input id="pj-type-name" placeholder="Type, for example Child or Teacher" />
      <select id="pj-type-level" aria-label="Lives at"><option value="">Lives at...</option>${levels.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select>
      <select id="pj-type-fw" aria-label="Sponsored as"><option value="">Sponsored as...</option>${fws.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select>
      <button data-action="add-type">Add type</button></div></div>`;

  // 3. Places, as a tree with what each one adds up to.
  const render = (parentId: string, depth: number): string =>
    mine.filter((n) => n.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((n) => {
      const r = roll.byNode.get(n.id) ?? { places: 0, used: 0, beneficiaries: 0 };
      const here = outcomes.filter((o) => o.nodeId === n.id);
      const byType = project.types.map((t) => ({ t, n: here.filter((o) => o.typeId === t.id).length })).filter((x) => x.n > 0);
      const fields = Object.entries(n.fields).map(([k, val]) => `${esc(k)}: ${esc(val)}`).join(", ");
      return `<div class="pnode" style="margin-left:${depth * 18}px"><span class="lvl">${esc(levelName(n.levelId))}</span> <b>${esc(n.name)}</b>${fields ? ` <span class="muted">${fields}</span>` : ""}
        <span class="muted">${r.beneficiaries} beneficiar${r.beneficiaries === 1 ? "y" : "ies"}, ${r.used} of ${r.places} units sponsored</span> ${meter(r.used, r.places)}
        ${byType.length ? `<span class="muted">Here: ${byType.map((x) => `${x.n} ${esc(x.t.name)}`).join(", ")}</span>` : ""}
        <button data-action="remove-node" data-id="${esc(n.id)}" title="Remove this place">Remove</button></div>${render(n.id, depth + 1)}`;
    }).join("");
  const parentOptions = (): string => {
    const label = (n: Node): string => `${n.name} (${levelName(n.levelId)})`;
    const first = levels[0];
    return `${first ? `<option value="">Top of the project (${esc(first.name)})</option>` : ""}${mine.filter((n) => levels.findIndex((l) => l.id === n.levelId) < levels.length - 1).map((n) => `<option value="${esc(n.id)}">${esc(label(n))}, under it</option>`).join("")}`;
  };
  const placeCard = `<div class="card"><h2>3. Places <span class="muted">(${mine.length})</span></h2>
    ${mine.length ? `<div class="ptree">${render("", 0)}</div>` : `<div class="empty">No places yet. Add the first, for example Branch 1.</div>`}
    <div class="actions"><input id="pj-node-name" placeholder="Place name, for example Branch 1" /><select id="pj-node-parent" aria-label="Sits under">${parentOptions()}</select>
      <input id="pj-node-loc" placeholder="Location (optional)" /><button data-action="add-node"${levels.length ? "" : " disabled"}>Add place</button></div></div>`;

  // 4. Beneficiaries, added in numbers to a place of the level the type lives at.
  const benCard = `<div class="card"><h2>4. Add beneficiaries <span class="muted">(numbered test records)</span></h2>
    <div class="actions"><select id="pj-ben-type" aria-label="Type"><option value="">Type...</option>${project.types.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (at ${esc(levelName(t.levelId))})</option>`).join("")}</select>
      <select id="pj-ben-node" aria-label="Place"><option value="">Place...</option>${mine.map((n) => `<option value="${esc(n.id)}">${esc(n.name)} (${esc(levelName(n.levelId))})</option>`).join("")}</select>
      <input id="pj-ben-name" placeholder="Name, for example Orphan" /><input id="pj-ben-count" type="number" min="1" max="500" value="10" aria-label="How many" />
      <button class="primary" data-action="add-beneficiaries"${project.types.length && mine.length ? "" : " disabled"}>Add</button></div>
    <p class="muted">Several at once are numbered: Orphan 1, Orphan 2 and so on. ${total.beneficiaries} in ${esc(project.name)}, ${total.used} of ${total.places} units sponsored.</p></div>`;

  return `${head}${create}${picker}${levelCard}${typeCard}${placeCard}${benCard}`;
}
