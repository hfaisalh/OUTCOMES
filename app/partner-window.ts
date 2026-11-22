/**
 * partner-window.ts
 *
 * What it does: draws the partner window (DECISIONS 70, 76). One partner, in tabs: the profile form and the structure (levels, the types of beneficiary,
 * the places and groups), with tables. The projects it delivers and its beneficiaries are shown in the header and have their own pages. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Modules 4b, 5 and 6, partner-form.ts, and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { perPeriodRule } from "../modules/05-outcomes/outcomes";
import { allocOptions, DUE_DILIGENCE, isActivePartner, levelsBelow, levelTree, PARTNER_STATUSES, rollupOf, type Node, type Project } from "../modules/06-projects/projects";
import { partnerProfileHtml, type FormContext } from "./partner-form";
import { esc, type View } from "./pages";

export type PartnerTab = "profile" | "structure";
const TABS: { id: PartnerTab; label: string }[] = [{ id: "profile", label: "Profile" }, { id: "structure", label: "Structure (optional)" }];
const MAX_ROWS = 300;
const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;

// The names of a place and its parents, nearest last, so a group is shown with the place it is in.
const ancestors = (nodes: Node[], id: string): string[] => { const out: string[] = []; for (let n = nodes.find((x) => x.id === id); n && n.parentId !== ""; n = nodes.find((x) => x.id === n?.parentId)) out.push(n.parentId); return out; };

// Levels (the place, and the ways of grouping people inside it), who belongs where, and the places, as tables, each with a form to add to it (DECISIONS 71).
function structureHtml(v: View, project: Project): string {
  const nodes = (v.nodes ?? []).filter((n) => n.projectId === project.id);
  const outcomes = (v.outcomes ?? []).filter((o) => o.projectId === project.id);
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const tree = levelTree(project);
  const levelName = (id: string) => project.levels.find((l) => l.id === id)?.name ?? "";
  const fwName = (id: string) => fws.find((f) => f.id === id)?.name ?? "No workflow";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const roll = rollupOf(nodes, outcomes, fws, v.allocations ?? [], commitments, allocOptions(v.projects ?? [], v.graceDays, today, v.requireRef === true, v.giftProjects ?? []).policy);

  // Levels: the first is the place, and the others sit under a level as ways of grouping people inside it.
  const levelRows = tree.map(({ level: l, depth }) => {
    const below = levelsBelow(project, l.id);
    const canMoveTo = [{ id: "", name: "Top, a place" }, ...tree.filter((x) => x.level.id !== l.id && !below.has(x.level.id)).map((x) => ({ id: x.level.id, name: `Under ${x.level.name}` }))];
    const leaf = !project.levels.some((x) => x.parentId === l.id);
    return `<tr><td style="padding-left:${8 + depth * 18}px"><b>${esc(l.name)}</b></td><td><select data-level-parent="${esc(l.id)}" aria-label="Where ${esc(l.name)} sits">${canMoveTo.map((o) => `<option value="${esc(o.id)}"${o.id === l.parentId ? " selected" : ""}>${esc(o.name)}</option>`).join("")}</select></td><td>${nodes.filter((n) => n.levelId === l.id).length}</td><td>${leaf ? `<button data-action="remove-level" data-id="${esc(l.id)}">Remove</button>` : ""}</td></tr>`;
  }).join("");
  const levelsCard = `<section><h3>Levels</h3>
    <p class="muted">The first level is the place: a branch or a site. A partner can have many places. The other levels are ways of grouping people inside a place, such as Class, House or School. A child can be in a class and a house at the same time.</p>
    ${tree.length ? `<div class="twrap"><table><thead><tr><th>Level</th><th>Sits</th><th>Places</th><th></th></tr></thead><tbody>${levelRows}</tbody></table></div>` : `<div class="empty">No levels yet. Add the place first, for example Branch.</div>`}
    <div class="actions"><input id="pj-level" placeholder="${tree.length ? "Another level, for example Class" : "First level, for example Branch"}" /><select id="pj-level-parent" aria-label="Where it sits">${tree.length ? "" : `<option value="">Top, a place</option>`}${tree.map((x) => `<option value="${esc(x.level.id)}">Under ${esc(x.level.name)}</option>`).join("")}${tree.length ? `<option value="">Top, another kind of place</option>` : ""}</select><button data-action="add-level">Add level</button></div></section>`;

  // Types: which place the beneficiaries belong to, which groupings apply to them, and how they are sponsored.
  const typeRows = project.types.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${t.levelId === "" ? '<span class="muted">Anywhere</span>' : esc(levelName(t.levelId))}</td><td>${(t.groupingIds ?? []).map((g) => esc(levelName(g))).join(", ") || '<span class="muted">none</span>'}</td><td>${esc(fwName(t.frameworkId))}</td><td>${outcomes.filter((o) => o.typeId === t.id).length}</td><td><button data-action="remove-type" data-id="${esc(t.id)}">Remove</button></td></tr>`).join("");
  const typesCard = `<section><h3>Who is here <span class="muted">(types of beneficiary)</span></h3>
    ${project.types.length ? `<div class="twrap"><table><thead><tr><th>Type</th><th>Belongs to</th><th>Grouped by</th><th>Sponsored as</th><th>Beneficiaries</th><th></th></tr></thead><tbody>${typeRows}</tbody></table></div>` : `<div class="empty">No types yet. A type needs only a name and how it is sponsored. For example: Child, sponsored as shared parts. If you also choose what it belongs to (a Branch) and what groups it (Class, House), beneficiaries can be placed there.</div>`}
    <div class="actions"><input id="pj-type-name" placeholder="Type, for example Child or Teacher" />
      <select id="pj-type-level" aria-label="Belongs to"><option value="">Anywhere in the partner</option>${tree.map((x) => `<option value="${esc(x.level.id)}">${esc(x.level.name)}</option>`).join("")}</select>
      <select id="pj-type-fw" aria-label="Sponsored as"><option value="">Sponsored as...</option>${fws.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select>
      <button data-action="add-type">Add type</button></div>
    ${tree.length > 1 ? `<div class="actions"><span class="muted">Grouped by:</span> ${tree.map((x) => `<label class="tick"><input type="checkbox" class="pj-type-group" value="${esc(x.level.id)}" /> ${esc(x.level.name)}</label>`).join(" ")}</div>` : ""}</section>`;

  // The places, in order down the tree, indented by how deep each is.
  const depthOf = (id: string): number => ancestors(nodes, id).length;
  const ordered: Node[] = [];
  const walk = (parent: string) => nodes.filter((n) => n.parentId === parent).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach((n) => { ordered.push(n); walk(n.id); });
  walk("");
  const placeRows = ordered.slice(0, MAX_ROWS).map((n) => {
    const r = roll.byNode.get(n.id) ?? { places: 0, used: 0, beneficiaries: 0 };
    return `<tr><td style="padding-left:${8 + depthOf(n.id) * 18}px"><b>${esc(n.name)}</b></td><td>${esc(levelName(n.levelId))}</td><td class="muted">${Object.entries(n.fields).map(([k, val]) => `${esc(k)}: ${esc(val)}`).join(", ")}</td><td>${r.beneficiaries}</td><td>${r.used} of ${r.places} ${meter(r.used, r.places)}</td><td><button data-action="remove-node" data-id="${esc(n.id)}" title="Remove this one">Remove</button></td></tr>`;
  }).join("");
  const parentOptions = nodes.map((n) => `<option value="${esc(n.id)}" data-level="${esc(n.levelId)}">${esc(n.name)} (${esc(levelName(n.levelId))})</option>`).join("");
  const levelOptions = tree.map((x) => `<option value="${esc(x.level.id)}" data-parent-level="${esc(x.level.parentId)}">${esc(x.level.name)}</option>`).join("");
  const placesCard = `<section><h3>Places and groups <span class="muted">(${nodes.length})</span></h3>
    ${nodes.length ? `<div class="twrap"><table><thead><tr><th>Name</th><th>Level</th><th>Profile</th><th>Beneficiaries</th><th>Sponsored of units</th><th></th></tr></thead><tbody>${placeRows}</tbody></table></div>${ordered.length > MAX_ROWS ? `<p class="muted">Showing ${MAX_ROWS} of ${ordered.length}.</p>` : ""}` : `<div class="empty">None yet. Add the first place, for example Aghosh Lahore.</div>`}
    <div class="actions"><input id="pj-node-name" placeholder="Name, for example Aghosh Lahore or Class 5A" /><select id="pj-node-level" aria-label="Level"><option value="">Level...</option>${levelOptions}</select>
      <select id="pj-node-parent" aria-label="Inside"><option value="">Inside...</option>${parentOptions}</select><input id="pj-node-loc" placeholder="Location (optional)" /><button data-action="add-node"${tree.length ? "" : " disabled"}>Add</button></div>
    <p class="muted">Choose the level first, and for a group the place it is in. A place of the first level is not inside anything.</p></section>`;
  return `${levelsCard}${typesCard}${placesCard}`;
}

/**
 * The whole window for one partner, or a new one when the id is empty. The structure and the beneficiaries wait until the partner is saved.
 * `profile` is what the profile form shows (the saved partner, or what was typed and not yet saved).
 */
export function partnerWindowHtml(v: View, id: string, tab: PartnerTab, ctx: FormContext, profile: Partial<Project>, error = ""): string {
  const project = (v.projects ?? []).find((p) => p.id === id);
  const live = project ? isActivePartner(project, v.today ?? "") : false;
  const status = PARTNER_STATUSES.find((x) => x.id === (project?.status ?? "pending"))?.label ?? "";
  const dd = DUE_DILIGENCE.find((x) => x.id === (project?.ddStatus ?? "none"))?.label ?? "";
  const delivers = project ? (v.giftProjects ?? []).filter((g) => g.partnerIds.includes(project.id)).map((g) => g.name) : [];
  const count = project ? (v.outcomes ?? []).filter((o) => o.projectId === project.id).length : 0;
  const head = `<header><div><h2>${project ? esc(project.name) : "New partner"}</h2>${project ? `<span class="muted">${esc(project.type ?? "No type")}</span> <span class="pill ${live ? "ok" : "review"}">${esc(status)}</span> <span class="pill ${project.ddStatus === "approved" ? "ok" : "review"}">Due diligence: ${esc(dd)}</span>
    <div class="muted">Delivers: ${delivers.length ? esc(delivers.join(", ")) : "no project yet"} (set on the Projects page). <button class="linkbtn" data-nav="beneficiaries" data-partner="${esc(project.id)}">${count} beneficiar${count === 1 ? "y" : "ies"}</button></div>` : `<span class="muted">Save the profile first. The structure comes after.</span>`}</div><button data-pf="cancel" aria-label="Close">Close</button></header>`;
  const tabs = `<nav class="pf-tabs">${TABS.map((t) => `<button data-pf-tab="${t.id}" class="${t.id === tab ? "on" : ""}"${!project && t.id !== "profile" ? " disabled" : ""}>${t.label}</button>`).join("")}</nav>`;
  const message = v.message ? `<div class="note">${esc(v.message)}</div>` : "";
  const body = tab === "profile" || !project ? partnerProfileHtml(profile, id, ctx, error) : `<div class="pf-body">${message}${structureHtml(v, project)}</div>`;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Partner"><div class="pf-box">${head}${tabs}<div id="pw-content">${body}</div></div></div>`;
}
