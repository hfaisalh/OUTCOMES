/**
 * beneficiaries-page.ts
 *
 * What it does: draws the Outcomes list page, once called Beneficiaries (DECISIONS 76, 163). Everyone who can be sponsored, across all partners, as one table with filters. Each belongs to
 * a partner and can be placed in that partner's branch and groups afterwards, with an ID of its own. New beneficiaries are added with a partner, a name,
 * a number and how they are sponsored. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: Modules 4b, 5 and 6, and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { capacityOf, fillOf, perPeriodRule } from "../modules/05-outcomes/outcomes";
import { allocOptions, type Node, type Project } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

const MAX_ROWS = 300;
const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;
export interface BenFilter { partner: string; type: string; placed: string; text: string }
export const NO_BEN_FILTER: BenFilter = { partner: "", type: "", placed: "", text: "" };

// The nodes of one partner that are inside a place, by name.
const insidePlace = (nodes: Node[], placeId: string, id: string): boolean => { let up = nodes.find((n) => n.id === id)?.parentId ?? ""; while (up !== "" && up !== placeId) up = nodes.find((n) => n.id === up)?.parentId ?? ""; return up === placeId; };

export function beneficiariesPage(v: View): string {
  const partners = v.projects ?? [];
  const nodes = v.nodes ?? [];
  const all = v.outcomes ?? [];
  const fws = v.frameworks ?? [];
  const f = v.benFilter ?? NO_BEN_FILTER;
  const today = v.today ?? "2026-01-01";
  const outcomeAllocations = v.outcomeAllocations ?? [];
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const policy = allocOptions(partners, v.graceDays, today, v.requireRef === true, v.giftProjects ?? []).policy;
  const partnerName = (id: string | undefined) => partners.find((p) => p.id === id)?.name ?? "";
  const held = new Set(outcomeAllocations.map((a) => a.outcomeId));

  const text = f.text.trim().toLowerCase();
  const shown = all.filter((o) => (f.partner === "" || (f.partner === "none" ? o.projectId === undefined : o.projectId === f.partner)) && (f.type === "" || o.type === f.type) && (f.placed === "" || (f.placed === "yes" ? !!o.nodeId : !o.nodeId)) && (text === "" || `${o.name} ${o.ref ?? ""}`.toLowerCase().includes(text)));
  const types = [...new Set(all.map((o) => o.type))].filter((t) => t !== "").sort();
  const legacy = all.filter((o) => o.projectId === undefined).length;

  const head = `<h1>Outcomes</h1>
    <p class="sub">What gifts are allocated to, with capacity: orphans, students, teachers, pumps. (The people and households themselves are on the Beneficiaries page.) Each belongs to a partner. Add them with only a name, a number and how they are sponsored, then add them to the partner's branch and groups, and give them an ID, when you are ready.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}`;

  const add = `<div class="card"><h2>Add beneficiaries <span class="muted">(numbered test records)</span></h2>
    <div class="actions"><select id="ben-partner" aria-label="Partner"><option value="">Partner...</option>${partners.map((p) => `<option value="${esc(p.id)}"${p.id === f.partner ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <input id="ben-name" placeholder="Name, for example Orphan" /><input id="ben-count" type="number" min="1" max="500" value="10" aria-label="How many" />
      <select id="ben-fw" aria-label="Sponsored as"><option value="">Sponsored as...</option>${fws.map((fw) => `<option value="${esc(fw.id)}">${esc(fw.name)}</option>`).join("")}</select>
      <button class="primary" data-action="ben-add"${partners.length ? "" : " disabled"}>Add</button></div>
    <p class="muted">${partners.length ? "A kind that already exists in the partner is used again by name. Several at once are numbered: Orphan 1, Orphan 2 and so on." : "Create a partner first, on the Partners page."}</p></div>`;

  const idTool = f.partner !== "" && f.partner !== "none" ? `<div class="actions"><span class="muted">Give every one in ${esc(partnerName(f.partner))} without an ID the next number:</span><input id="pj-ref-prefix" placeholder="Prefix, for example A-" style="width:150px" /><input id="pj-ref-start" type="number" min="0" value="1" aria-label="Start from" style="width:90px" /><button data-action="assign-refs" data-partner="${esc(f.partner)}">Assign IDs</button></div>` : "";

  const filters = `<div class="filters"><select data-benf="partner" aria-label="Partner"><option value="">All partners</option>${partners.map((p) => `<option value="${esc(p.id)}"${p.id === f.partner ? " selected" : ""}>${esc(p.name)}</option>`).join("")}${legacy ? `<option value="none"${f.partner === "none" ? " selected" : ""}>Not in a partner (${legacy})</option>` : ""}</select>
    <select data-benf="type" aria-label="Kind"><option value="">All kinds</option>${types.map((t) => `<option value="${esc(t)}"${t === f.type ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>
    <select data-benf="placed" aria-label="Located"><option value="">Located or not</option><option value="yes"${f.placed === "yes" ? " selected" : ""}>In a location</option><option value="no"${f.placed === "no" ? " selected" : ""}>Not in a location</option></select>
    <input data-benf="text" value="${esc(f.text)}" placeholder="Search name or ID" aria-label="Search" /></div>`;

  const rows = shown.slice(0, MAX_ROWS).map((o) => {
    const p: Project | undefined = partners.find((x) => x.id === o.projectId);
    const type = p?.types.find((t) => t.id === o.typeId);
    const mine = nodes.filter((n) => n.projectId === o.projectId);
    const used = fillOf(o, fws, outcomeAllocations, commitments, policy).used;
    const cap = capacityOf(o, fws);
    // The place: a list of the partner's places that suit this kind. Groups: one list for each kind of group that applies, with the groups inside its place.
    const placeSel = p ? `<select data-set-place="${esc(o.id)}" aria-label="Location of ${esc(o.name)}"><option value="">No location</option>${mine.filter((n) => !type || type.levelId === "" || n.levelId === type.levelId).map((n) => `<option value="${esc(n.id)}"${n.id === o.nodeId ? " selected" : ""}>${esc(n.name)}</option>`).join("")}</select>` : "";
    const groupSels = p && type && o.nodeId ? (type.groupingIds ?? []).map((lid) => `<select data-set-group="${esc(o.id)}" data-level="${esc(lid)}" aria-label="${esc(p.levels.find((l) => l.id === lid)?.name ?? "Group")} of ${esc(o.name)}"><option value="">${esc(p.levels.find((l) => l.id === lid)?.name ?? "Group")}...</option>${mine.filter((n) => n.levelId === lid && insidePlace(nodes, o.nodeId as string, n.id)).map((n) => `<option value="${esc(n.id)}"${(o.groupIds ?? []).includes(n.id) ? " selected" : ""}>${esc(n.name)}</option>`).join("")}</select>`).join(" ") : "";
    return `<tr><td><input class="refbox" data-ref="${esc(o.id)}" value="${esc(o.ref ?? "")}" placeholder="ID" aria-label="ID of ${esc(o.name)}" /></td><td><b>${esc(o.name)}</b></td><td>${esc(partnerName(o.projectId)) || '<span class="muted">No partner</span>'}</td><td>${esc(o.type)}</td><td>${placeSel}</td><td>${groupSels}</td><td>${used} of ${cap} ${meter(used, cap)}</td><td>${o.active ? "Active" : "Offboarded"}</td><td><button data-oc-active="${esc(o.id)}" data-active="${o.active ? "0" : "1"}">${o.active ? "Offboard" : "Activate"}</button>${held.has(o.id) ? "" : ` <button data-oc-remove="${esc(o.id)}">Remove</button>`}</td></tr>`;
  }).join("");
  const unused = shown.filter((o) => !held.has(o.id)).map((o) => o.id);
  const table = `<div class="card"><h2>Beneficiaries <span class="muted">(${shown.length}${shown.length !== all.length ? ` of ${all.length}` : ""})</span></h2>
    ${filters}${idTool}
    ${unused.length && (f.partner !== "" || f.type !== "" || text !== "") ? `<div class="actions"><button data-action="remove-unused" data-ids="${esc(unused.slice(0, 1000).join(","))}">Remove the ${Math.min(unused.length, 1000)} shown that have no sponsor</button></div>` : ""}
    ${shown.length ? `<div class="twrap"><table class="ptable"><thead><tr><th>ID</th><th>Name</th><th>Partner</th><th>Kind</th><th>Location</th><th>Groups</th><th>Sponsored of units</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">Showing ${MAX_ROWS} of ${shown.length}. Use the filters to narrow the list.</p>` : ""}` : `<div class="empty">${all.length ? "No beneficiaries match the filters." : "No beneficiaries yet. Add the first above."}</div>`}</div>`;
  return `${head}${add}${table}`;
}
