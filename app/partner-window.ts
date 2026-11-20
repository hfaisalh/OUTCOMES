/**
 * partner-window.ts
 *
 * What it does: draws the partner window (DECISIONS 70). One partner and everything that belongs to it, in tabs: the profile form, the
 * structure (levels, the types of beneficiary, the places) and the beneficiaries, with tables for each. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Modules 4b, 5 and 6, partner-form.ts, and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { fillOf, perPeriodRule, capacityOf } from "../modules/05-outcomes/outcomes";
import { allocOptions, DUE_DILIGENCE, isActivePartner, orderedLevels, PARTNER_STATUSES, rollupOf, type Project } from "../modules/06-projects/projects";
import { partnerProfileHtml, type FormContext } from "./partner-form";
import { esc, type View } from "./pages";

export type PartnerTab = "profile" | "structure" | "beneficiaries";
const TABS: { id: PartnerTab; label: string }[] = [{ id: "profile", label: "Profile" }, { id: "structure", label: "Structure" }, { id: "beneficiaries", label: "Beneficiaries" }];
const MAX_ROWS = 300;
const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;

// Levels, who lives at each, and the places, as tables, each with a form to add to it.
function structureHtml(v: View, project: Project): string {
  const nodes = (v.nodes ?? []).filter((n) => n.projectId === project.id);
  const outcomes = (v.outcomes ?? []).filter((o) => o.projectId === project.id);
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const levels = orderedLevels(project);
  const levelName = (id: string) => levels.find((l) => l.id === id)?.name ?? "";
  const fwName = (id: string) => fws.find((f) => f.id === id)?.name ?? "No framework";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const roll = rollupOf(nodes, outcomes, fws, v.allocations ?? [], commitments, allocOptions(v.projects ?? [], v.bufferMonths, today).policy);
  const last = levels[levels.length - 1];

  const levelRows = levels.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.name)}</b></td><td>${nodes.filter((n) => n.levelId === l.id).length}</td><td>${l === last ? `<button data-action="remove-level" data-id="${esc(l.id)}" title="Remove the bottom level">Remove</button>` : ""}</td></tr>`).join("");
  const levelsCard = `<section><h3>Levels</h3>
    ${levels.length ? `<div class="twrap"><table><thead><tr><th>Order</th><th>Level</th><th>Places</th><th></th></tr></thead><tbody>${levelRows}</tbody></table></div>` : `<div class="empty">No levels yet. For an institute, for example Branch, then Block, then Class.</div>`}
    <div class="actions"><input id="pj-level" placeholder="${last ? `A level under ${esc(last.name)}` : "First level, for example Branch"}" /><button data-action="add-level" data-parent="${esc(last?.id ?? "")}">Add level</button></div></section>`;

  const typeRows = project.types.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${esc(levelName(t.levelId))}</td><td>${esc(fwName(t.frameworkId))}</td><td>${outcomes.filter((o) => o.typeId === t.id).length}</td><td><button data-action="remove-type" data-id="${esc(t.id)}">Remove</button></td></tr>`).join("");
  const typesCard = `<section><h3>Who lives here <span class="muted">(types of beneficiary)</span></h3>
    ${project.types.length ? `<div class="twrap"><table><thead><tr><th>Type</th><th>Lives at</th><th>Sponsored as</th><th>Beneficiaries</th><th></th></tr></thead><tbody>${typeRows}</tbody></table></div>` : `<div class="empty">No types yet. For example: Child lives at Class, sponsored as shared parts.</div>`}
    <div class="actions"><input id="pj-type-name" placeholder="Type, for example Child or Teacher" />
      <select id="pj-type-level" aria-label="Lives at"><option value="">Lives at...</option>${levels.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("")}</select>
      <select id="pj-type-fw" aria-label="Sponsored as"><option value="">Sponsored as...</option>${fws.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}</select>
      <button data-action="add-type">Add type</button></div></section>`;

  // The places, in order down the tree, indented by how deep each is.
  const depthOf = (id: string): number => { let d = 0; for (let n = nodes.find((x) => x.id === id); n && n.parentId !== ""; n = nodes.find((x) => x.id === n?.parentId)) d++; return d; };
  const ordered: typeof nodes = [];
  const walk = (parent: string) => nodes.filter((n) => n.parentId === parent).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).forEach((n) => { ordered.push(n); walk(n.id); });
  walk("");
  const placeRows = ordered.slice(0, MAX_ROWS).map((n) => {
    const r = roll.byNode.get(n.id) ?? { places: 0, used: 0, beneficiaries: 0 };
    return `<tr><td style="padding-left:${8 + depthOf(n.id) * 18}px"><b>${esc(n.name)}</b></td><td>${esc(levelName(n.levelId))}</td><td class="muted">${Object.entries(n.fields).map(([k, val]) => `${esc(k)}: ${esc(val)}`).join(", ")}</td><td>${r.beneficiaries}</td><td>${r.used} of ${r.places} ${meter(r.used, r.places)}</td><td><button data-action="remove-node" data-id="${esc(n.id)}" title="Remove this place">Remove</button></td></tr>`;
  }).join("");
  const parentOptions = `${levels[0] ? `<option value="">Top (${esc(levels[0].name)})</option>` : ""}${nodes.filter((n) => levels.findIndex((l) => l.id === n.levelId) < levels.length - 1).map((n) => `<option value="${esc(n.id)}">${esc(n.name)} (${esc(levelName(n.levelId))}), under it</option>`).join("")}`;
  const placesCard = `<section><h3>Places <span class="muted">(${nodes.length})</span></h3>
    ${nodes.length ? `<div class="twrap"><table><thead><tr><th>Place</th><th>Level</th><th>Profile</th><th>Beneficiaries</th><th>Sponsored of units</th><th></th></tr></thead><tbody>${placeRows}</tbody></table></div>${ordered.length > MAX_ROWS ? `<p class="muted">Showing ${MAX_ROWS} of ${ordered.length}.</p>` : ""}` : `<div class="empty">No places yet. Add the first, for example Branch 1.</div>`}
    <div class="actions"><input id="pj-node-name" placeholder="Place name, for example Branch 1" /><select id="pj-node-parent" aria-label="Sits under">${parentOptions}</select><input id="pj-node-loc" placeholder="Location (optional)" /><button data-action="add-node"${levels.length ? "" : " disabled"}>Add place</button></div></section>`;
  return `${levelsCard}${typesCard}${placesCard}`;
}

// The beneficiaries of this partner as a table, and a form to add them in numbers.
function beneficiariesHtml(v: View, project: Project): string {
  const nodes = (v.nodes ?? []).filter((n) => n.projectId === project.id);
  const outcomes = (v.outcomes ?? []).filter((o) => o.projectId === project.id);
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const allocations = v.allocations ?? [];
  const levels = orderedLevels(project);
  const levelName = (id: string) => levels.find((l) => l.id === id)?.name ?? "";
  const placeName = (id: string | undefined) => nodes.find((n) => n.id === id)?.name ?? "";
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const policy = allocOptions(v.projects ?? [], v.bufferMonths, today).policy;
  const held = new Set(allocations.map((a) => a.outcomeId));
  const rows = outcomes.slice(0, MAX_ROWS).map((o) => {
    const used = fillOf(o, fws, allocations, commitments, policy).used;
    const cap = capacityOf(o, fws);
    return `<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.type)}</td><td>${esc(placeName(o.nodeId))}</td><td>${used} of ${cap} ${meter(used, cap)}</td><td>${o.active ? "Active" : "Offboarded"}</td><td><button data-oc-active="${esc(o.id)}" data-active="${o.active ? "0" : "1"}">${o.active ? "Offboard" : "Activate"}</button>${held.has(o.id) ? "" : ` <button data-oc-remove="${esc(o.id)}">Remove</button>`}</td></tr>`;
  }).join("");
  const unused = outcomes.filter((o) => !held.has(o.id)).map((o) => o.id);
  return `<section><h3>Add beneficiaries <span class="muted">(numbered test records)</span></h3>
    <div class="actions"><select id="pj-ben-type" aria-label="Type"><option value="">Type...</option>${project.types.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (at ${esc(levelName(t.levelId))})</option>`).join("")}</select>
      <select id="pj-ben-node" aria-label="Place"><option value="">Place...</option>${nodes.map((n) => `<option value="${esc(n.id)}">${esc(n.name)} (${esc(levelName(n.levelId))})</option>`).join("")}</select>
      <input id="pj-ben-name" placeholder="Name, for example Orphan" /><input id="pj-ben-count" type="number" min="1" max="500" value="10" aria-label="How many" />
      <button class="primary" data-action="add-beneficiaries"${project.types.length && nodes.length ? "" : " disabled"}>Add</button></div>
    <p class="muted">Several at once are numbered: Orphan 1, Orphan 2 and so on. Add the types and places on the Structure tab first.</p></section>
  <section><h3>Beneficiaries <span class="muted">(${outcomes.length})</span></h3>
    ${unused.length ? `<div class="actions"><button data-action="remove-unused" data-ids="${esc(unused.slice(0, 1000).join(","))}">Remove ${Math.min(unused.length, 1000)} with no sponsor</button></div>` : ""}
    ${outcomes.length ? `<div class="twrap"><table><thead><tr><th>Name</th><th>Type</th><th>Place</th><th>Sponsored of units</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${outcomes.length > MAX_ROWS ? `<p class="muted">Showing ${MAX_ROWS} of ${outcomes.length}.</p>` : ""}` : `<div class="empty">No beneficiaries yet.</div>`}</section>`;
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
  const head = `<header><div><h2>${project ? esc(project.name) : "New partner"}</h2>${project ? `<span class="muted">${esc(project.type ?? "No type")}</span> <span class="pill ${live ? "ok" : "review"}">${esc(status)}</span> <span class="pill ${project.ddStatus === "approved" ? "ok" : "review"}">Due diligence: ${esc(dd)}</span>` : `<span class="muted">Save the profile first. The structure and the beneficiaries come after.</span>`}</div><button data-pf="cancel" aria-label="Close">Close</button></header>`;
  const tabs = `<nav class="pf-tabs">${TABS.map((t) => `<button data-pf-tab="${t.id}" class="${t.id === tab ? "on" : ""}"${!project && t.id !== "profile" ? " disabled" : ""}>${t.label}</button>`).join("")}</nav>`;
  const message = v.message ? `<div class="note">${esc(v.message)}</div>` : "";
  const body = tab === "profile" || !project ? partnerProfileHtml(profile, id, ctx, error) : `<div class="pf-body">${message}${tab === "structure" ? structureHtml(v, project) : beneficiariesHtml(v, project)}</div>`;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Partner"><div class="pf-box">${head}${tabs}<div id="pw-content">${body}</div></div></div>`;
}
