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
import { asksForPlace, autoAllocate, holdingReport, perPeriodRule, releaseApprovals } from "../modules/05-outcomes/outcomes";
import { allocationSummary, allocOptions, isActivePartner, isLegacy, pathOf, rollupOf, suggestions, type Project } from "../modules/06-projects/projects";
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
  const opts = allocOptions(projects, v.graceDays, today, v.requireRef === true);
  const commitments = allocatable(v.workOrders, perPeriodRule(fws), today);
  const sum = allocationSummary(projects, outcomes, fws, allocations, commitments, opts);
  const byOutcome = new Map(outcomes.map((o) => [o.id, o]));
  const dry = autoAllocate(commitments, outcomes, fws, allocations, "", opts);
  const why = new Map(dry.unplaced.map((u) => [u.commitmentKey, u.why]));
  const suggested = suggestions(commitments, outcomes, fws, allocations, opts);
  const placed = new Set(allocations.map((a) => a.commitmentKey));
  const waiting = commitments.filter((c) => asksForPlace(c, fws, opts.policy) && !placed.has(c.subscriptionId)).sort((a, b) => (a.firstPaid || "9999").localeCompare(b.firstPaid || "9999") || a.subscriptionId.localeCompare(b.subscriptionId));
  const roll = rollupOf(nodes, outcomes, fws, allocations, commitments, opts.policy);
  const totals = sum.rows.reduce((t, r) => ({ free: t.free + r.free, used: t.used + r.used, grace: t.grace + r.inGrace, due: t.due + r.releaseDue, capacity: t.capacity + r.capacity }), { free: 0, used: 0, grace: 0, due: 0, capacity: 0 });
  const waitingParts = waiting.reduce((n, c) => n + c.partsPerInstalment, 0);

  const nodeLabel = (id: string) => pathOf(nodes, projects, id).slice(1).join(" > ") || id;
  const partnerRows = sum.rows.filter((r) => r.projectId !== "" && r.beneficiaries > 0);
  const placeOptions = partnerRows.map((r) => `<option value="partner:${esc(r.projectId)}">${esc(r.name)}, anyone (${r.free} free)</option>`).join("") + nodes.filter((n) => (roll.byNode.get(n.id)?.places ?? 0) > 0).slice(0, MAX_PLACES).map((n) => `<option value="${esc(n.id)}">${esc(nodeLabel(n.id))} (${(roll.byNode.get(n.id)?.places ?? 0) - (roll.byNode.get(n.id)?.used ?? 0)} free)</option>`).join("");

  const head = `<h1>Place gifts</h1>
    <p class="sub">Gifts that are waiting for a place, and where there is room. The suggestion for each gift is only a starting point: drag a gift onto a place, or choose a place from its list. A gift for a particular project goes to that project's partners, and a general gift is spread across places so more are sponsored.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics"><div class="metric"><b>${waiting.length}</b><span>Gifts waiting (${waitingParts} parts)</span></div><div class="metric"><b>${totals.free}</b><span>Units with no sponsor</span></div><div class="metric"><b>${totals.grace}</b><span>Behind, inside the grace days</span></div><div class="metric ${totals.free - waitingParts >= 0 ? "ok" : "warn"}"><b>${signed(totals.free - waitingParts)}</b><span>Surplus or deficit of places</span></div></div>`;

  // Whether each partner takes gifts, and if not, why, so "nothing is placed" is never a mystery (DECISIONS 69).
  const takes = (p: Project | undefined): string => {
    if (!p) return "";
    if (isActivePartner(p, today)) return (p.itemIds ?? []).length ? `Yes, ${(p.itemIds ?? []).length} item${(p.itemIds ?? []).length === 1 ? "" : "s"}` : "Yes, any item";
    if ((p.status ?? "pending") !== "active") return `No: status is ${(p.status ?? "pending").replace("_", " ")}`;
    if (p.ddStatus !== "approved") return "No: due diligence is not approved";
    return "No: the approval is past its review date";
  };
  const hold = holdingReport(commitments, fws, opts.policy);
  const notAsking = [hold.noFramework ? `${hold.noFramework} have no framework (set one for the item or its category)` : "", hold.noRule ? `${hold.noRule} are on a framework that does not say how an instalment counts` : "", hold.cancelled ? `${hold.cancelled} are cancelled in the CRM` : "", hold.lapsed ? `${hold.lapsed} have missed more payments than the buffer` : "", hold.finished ? `${hold.finished} are fully paid` : ""].filter((x) => x !== "");
  const holdNote = `<p class="muted">${hold.total} gift${hold.total === 1 ? "" : "s"} in all, ${hold.holding} asking for a place${notAsking.length ? `. Not asking: ${notAsking.join("; ")}` : ""}.</p>`;
  const rows = sum.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.beneficiaries}</td><td>${r.capacity}</td><td>${r.used} ${meter(r.used, r.capacity)}</td><td>${r.free}</td><td>${r.inGrace}</td><td>${r.releaseDue}</td><td>${r.waitingParts}</td><td class="${r.free - r.waitingParts >= 0 ? "" : "bad"}">${signed(r.free - r.waitingParts)}</td><td>${esc(takes(projects.find((p) => p.id === r.projectId)))}</td></tr>`).join("");
  const buffer = `<label class="muted">A payment that is still unpaid <input type="number" min="0" max="90" value="${v.graceDays ?? 15}" data-grace aria-label="Grace days" style="width:64px" /> days after it was due makes the child eligible for reallocation. The place stays until a manager approves the release below.</label>`;
  const summary = `<div class="card"><h2>By partner</h2>
    ${sum.rows.length ? `<div class="twrap"><table><thead><tr><th>Partner</th><th>Beneficiaries</th><th>Units</th><th>Sponsored</th><th>Free</th><th>Behind, in grace</th><th>Release due</th><th>Waiting (parts)</th><th>Surplus or deficit</th><th>Takes gifts</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No partners yet. Create one on the Partners page.</div>`}
    <p class="muted">${sum.generalWaiting.gifts} general gift${sum.generalWaiting.gifts === 1 ? "" : "s"} waiting (${sum.generalWaiting.parts} parts), which can go to any partner. Surplus or deficit is the free units minus the parts of waiting gifts.</p>
    ${holdNote}
    ${buffer}
    <label class="muted"><input type="checkbox" data-require-ref${v.requireRef ? " checked" : ""} /> Place gifts only on beneficiaries that have an ID. Give IDs on each partner's Beneficiaries tab.</label></div>`;

  const gift = (c: (typeof waiting)[number]) => {
    const sug = suggested.get(c.subscriptionId);
    const o = sug ? byOutcome.get(sug) : undefined;
    const directed = (opts.projectIdsFor?.(c.projectName) ?? []).length > 0;
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
  const partnerDrops = partnerRows.map((r) => `<div class="place" data-drop-partner="${esc(r.projectId)}"><span><b>${esc(r.name)}</b> <small>anyone in this partner</small></span><span>${meter(r.used, r.capacity)} ${r.free} free</span></div>`).join("");
  const right = `<div class="card"><h2>Places <span class="muted">(drop a gift on one)</span></h2>
    ${partnerDrops}
    ${placeRows.length ? placeRows.map(({ n, r }) => `<div class="place" data-drop-node="${esc(n.id)}"><span><b>${esc(n.name)}</b> <small>${esc(nodeLabel(n.id))}</small></span><span>${meter(r?.used ?? 0, r?.places ?? 0)} ${(r?.places ?? 0) - (r?.used ?? 0)} free</span></div>`).join("") : partnerRows.length ? "" : `<div class="empty">No beneficiaries yet. Add them on the Partners page.</div>`}
    ${nodes.length > MAX_PLACES ? `<p class="muted">Showing ${MAX_PLACES} places.</p>` : ""}</div>`;

  // Beneficiaries made before partners existed keep the gifts that were placed on them, so new partners get nothing until these are dealt with (DECISIONS 73).
  const legacy = outcomes.filter(isLegacy);
  const legacyUsed = sum.rows.find((r) => r.projectId === "")?.used ?? 0;
  const legacyCard = legacy.length ? `<div class="card"><h2>Beneficiaries not in a partner <span class="muted">(${legacy.length})</span></h2>
    <p class="muted">These were added before partners existed, and ${legacyUsed} of their units are sponsored. Gifts already placed on them stay there, so a new partner gets none of those. Move them into a partner (the gifts stay with them), or remove them and release their gifts so they can be placed again.</p>
    <div class="actions"><select id="al-adopt" aria-label="Partner"><option value="">Move them into...</option>${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select><button data-action="adopt-legacy">Move them</button><button data-action="clear-legacy">Remove them and release their gifts</button></div></div>` : "";
  // The places a manager may release: unpaid beyond the grace days. Nothing is released by itself (DECISIONS 74).
  const approvals = releaseApprovals(allocations, commitments, fws, opts.policy);
  const byKey = new Map(commitments.map((c) => [c.subscriptionId, c]));
  const approvalsCard = approvals.length ? `<div class="card"><h2>Release approvals <span class="muted">(${approvals.length})</span></h2>
    <p class="muted">Each of these payments is unpaid more than ${v.graceDays ?? 15} days after it was due. The place stays until a manager approves the release, and then the child can be given to another sponsor. Only a manager can approve.</p>
    <div class="twrap"><table><thead><tr><th>Sponsor</th><th>Gift</th><th>Beneficiary</th><th>Days overdue</th><th></th></tr></thead><tbody>${approvals.slice(0, 100).map((x) => { const c = byKey.get(x.commitmentKey); return `<tr><td>${esc(c?.supporterName ?? "")}</td><td>${esc(c?.itemName ?? "")} <span class="muted">${x.parts} part${x.parts === 1 ? "" : "s"}</span></td><td>${esc(byOutcome.get(x.outcomeId)?.name ?? x.outcomeId)}</td><td>${x.daysOverdue}</td><td><button data-action="approve-release" data-key="${esc(x.commitmentKey)}">Approve release</button></td></tr>`; }).join("")}</tbody></table></div>${approvals.length > 100 ? `<p class="muted">Showing 100 of ${approvals.length}.</p>` : ""}</div>` : "";
  return `${head}${summary}${approvalsCard}${legacyCard}<div class="cols2">${left}${right}</div>`;
}
