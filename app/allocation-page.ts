/**
 * allocation-page.ts
 *
 * What it does: draws the Place gifts page (DECISIONS 66). A summary for each project (how many beneficiaries, units, sponsored,
 * free, inside the buffer, waiting, surplus or deficit), the gifts waiting for a place with where each would go, and the places with room.
 * A person drags a gift onto a place, or chooses a place from a list, and the suggestion is only a starting point. Pure: it takes a View
 * and returns HTML.
 * Who calls it: app/main.ts. Depends on: Modules 4b, 5 and 6, and esc and View from pages.ts.
 */

import { allocatable } from "../modules/04b-commitments/commitments";
import { autoAllocate, perPeriodRule, takesCapacity } from "../modules/05-outcomes/outcomes";
import { allocationSummary, allocOptions, pathOf, rollupOf, suggestions } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

const meter = (used: number, places: number) => `<span class="meter" aria-hidden="true"><i style="width:${places > 0 ? Math.min(Math.round((used / places) * 100), 100) : 0}%"></i></span>`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const MAX_GIFTS = 100;
const MAX_PLACES = 200;

export function allocationPage(v: View): string {
  const projects = v.projects ?? [];
  const nodes = v.nodes ?? [];
  const outcomes = v.outcomes ?? [];
  const allocations = v.allocations ?? [];
  const fws = v.frameworks ?? [];
  const today = v.today ?? "2026-01-01";
  const opts = allocOptions(projects, v.bufferMonths, today);
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const sum = allocationSummary(projects, outcomes, fws, allocations, commitments, opts);
  const byOutcome = new Map(outcomes.map((o) => [o.id, o]));
  const dry = autoAllocate(commitments, outcomes, fws, allocations, "", opts);
  const why = new Map(dry.unplaced.map((u) => [u.commitmentKey, u.why]));
  const suggested = suggestions(commitments, outcomes, fws, allocations, opts);
  const placed = new Set(allocations.map((a) => a.commitmentKey));
  const waiting = commitments.filter((c) => takesCapacity(c, fws, opts.policy) && !placed.has(c.subscriptionId)).sort((a, b) => (a.firstPaid || "9999").localeCompare(b.firstPaid || "9999") || a.subscriptionId.localeCompare(b.subscriptionId));
  const roll = rollupOf(nodes, outcomes, fws, allocations, commitments, opts.policy);
  const totals = sum.rows.reduce((t, r) => ({ free: t.free + r.free, used: t.used + r.used, buffer: t.buffer + r.inBuffer, capacity: t.capacity + r.capacity }), { free: 0, used: 0, buffer: 0, capacity: 0 });
  const waitingParts = waiting.reduce((n, c) => n + c.partsPerInstalment, 0);

  const nodeLabel = (id: string) => pathOf(nodes, projects, id).slice(1).join(" > ") || id;
  const placeOptions = nodes.filter((n) => (roll.byNode.get(n.id)?.places ?? 0) > 0).slice(0, MAX_PLACES).map((n) => `<option value="${esc(n.id)}">${esc(nodeLabel(n.id))} (${(roll.byNode.get(n.id)?.places ?? 0) - (roll.byNode.get(n.id)?.used ?? 0)} free)</option>`).join("");

  const head = `<h1>Place gifts</h1>
    <p class="sub">Gifts that are waiting for a place, and where there is room. The suggestion for each gift is only a starting point: drag a gift onto a place, or choose a place from its list. A gift for a particular project goes to that project, and a general gift is spread across places so more are sponsored.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics"><div class="metric"><b>${waiting.length}</b><span>Gifts waiting (${waitingParts} parts)</span></div><div class="metric"><b>${totals.free}</b><span>Units with no sponsor</span></div><div class="metric"><b>${totals.buffer}</b><span>Sponsors inside the buffer</span></div><div class="metric ${totals.free - waitingParts >= 0 ? "ok" : "warn"}"><b>${signed(totals.free - waitingParts)}</b><span>Surplus or deficit of places</span></div></div>`;

  const rows = sum.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.beneficiaries}</td><td>${r.capacity}</td><td>${r.used} ${meter(r.used, r.capacity)}</td><td>${r.free}</td><td>${r.inBuffer}</td><td>${r.waitingParts}</td><td class="${r.free - r.waitingParts >= 0 ? "" : "bad"}">${signed(r.free - r.waitingParts)}</td></tr>`).join("");
  const buffer = `<label class="muted">A plan that misses payments keeps its place for <select data-buffer aria-label="Payment buffer">${[0, 1, 2, 3, 6].map((n) => `<option value="${n}"${n === (v.bufferMonths ?? 1) ? " selected" : ""}>${n}</option>`).join("")}</select> missed payment${(v.bufferMonths ?? 1) === 1 ? "" : "s"}, then the place is released.</label>`;
  const summary = `<div class="card"><h2>By project</h2>
    ${sum.rows.length ? `<div class="twrap"><table><thead><tr><th>Project</th><th>Beneficiaries</th><th>Units</th><th>Sponsored</th><th>Free</th><th>In buffer</th><th>Waiting (parts)</th><th>Surplus or deficit</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No projects yet. Create one on the Projects page.</div>`}
    <p class="muted">${sum.generalWaiting.gifts} general gift${sum.generalWaiting.gifts === 1 ? "" : "s"} waiting (${sum.generalWaiting.parts} parts), which can go to any project. Surplus or deficit is the free units minus the parts of waiting gifts.</p>
    ${buffer}</div>`;

  const gift = (c: (typeof waiting)[number]) => {
    const sug = suggested.get(c.subscriptionId);
    const o = sug ? byOutcome.get(sug) : undefined;
    const directed = opts.projectIdFor?.(c.projectName) !== undefined;
    return `<div class="gift" draggable="true" data-drag-key="${esc(c.subscriptionId)}">
      <div class="row"><b>${esc(c.itemName)}</b><span class="tag ${directed ? "dir" : ""}">${directed ? `Directed: ${esc(c.projectName)}` : "General"}</span></div>
      <span class="note">${c.partsPerInstalment} part${c.partsPerInstalment === 1 ? "" : "s"}, ${c.once ? `one payment for ${c.planned} months` : c.planned === null ? "monthly, no end date" : `monthly, ${c.paid} of ${c.planned} paid`}. Given ${esc(c.firstPaid)}.</span>
      ${o ? `<span class="suggest">Suggested: ${esc(o.nodeId ? nodeLabel(o.nodeId) : "")}${o.nodeId ? " &gt; " : ""}${esc(o.name)}</span>` : `<span class="tag hold">Waiting</span> <span class="note">${esc(why.get(c.subscriptionId) ?? "")}</span>`}
      <select data-place-select="${esc(c.subscriptionId)}" aria-label="Place in"><option value="">Place in...</option>${placeOptions}</select></div>`;
  };
  const left = `<div class="card"><h2>Gifts waiting <span class="muted">(${waiting.length})</span></h2>
    <div class="actions"><button class="primary" data-action="auto-allocate"${waiting.length ? "" : " disabled"}>Place all suggestions</button><span class="muted">Releases what no longer holds, then places each waiting gift as suggested. Nothing already placed is moved.</span></div>
    ${waiting.length ? waiting.slice(0, MAX_GIFTS).map(gift).join("") + (waiting.length > MAX_GIFTS ? `<p class="muted">Showing ${MAX_GIFTS} of ${waiting.length}, oldest first.</p>` : "") : `<div class="empty">Nothing is waiting. Every gift that holds a place has one.</div>`}</div>`;

  const placeRows = nodes.map((n) => ({ n, r: roll.byNode.get(n.id) })).filter((x) => (x.r?.places ?? 0) > 0).slice(0, MAX_PLACES);
  const right = `<div class="card"><h2>Places <span class="muted">(drop a gift on one)</span></h2>
    ${placeRows.length ? placeRows.map(({ n, r }) => `<div class="place" data-drop-node="${esc(n.id)}"><span><b>${esc(n.name)}</b> <small>${esc(nodeLabel(n.id))}</small></span><span>${meter(r?.used ?? 0, r?.places ?? 0)} ${(r?.places ?? 0) - (r?.used ?? 0)} free</span></div>`).join("") : `<div class="empty">No places with beneficiaries yet. Add them on the Projects page.</div>`}
    ${nodes.length > MAX_PLACES ? `<p class="muted">Showing ${MAX_PLACES} places.</p>` : ""}</div>`;

  return `${head}${summary}<div class="cols2">${left}${right}</div>`;
}
