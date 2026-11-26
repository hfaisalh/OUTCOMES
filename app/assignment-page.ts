/**
 * assignment-page.ts
 *
 * What it does: draws the Assignment page (DECISIONS 170), the step where each released gift is handed to a partner. It shows how many gifts need a partner, are suggested, are assigned and wait with no one, the room each
 * partner has left for each benefit, and a table of the gifts with who each goes to or why no one. A button assigns automatically every gift whose workflow is set to automatic, one confirms every suggestion, and one
 * clears the lot so a test can be run again. A person can choose another partner for any gift from its list. Pure: it takes a View and returns HTML.
 * A recurring gift is one row, however many payments it has (DECISIONS 172). Who calls it: app/main.ts. Depends on: modules/08-assignment/assignment.ts, projects.ts (the types) and esc and View from pages.ts.
 */

import { assignables, contextFrom, emptyAssignments, loads, projectOfOrder, suggestAssignments, toAssign, type Suggestion } from "../modules/08-assignment/assignment";
import { batchRollup, batchSizeOf, labelBatches } from "../modules/08-assignment/batches";
import { isActive } from "../modules/09-placement/placement";
import { eligiblePartners } from "../modules/06-projects/projects";
import { itemRulesOf } from "../modules/07-beneficiaries/enrolments";
import type { SavedFeatures } from "../modules/02-project-rules/kind-features";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
// The filters say what they mean: ready to be assigned, waiting with no partner, or already assigned (DECISIONS 179).
const FILTERS = [{ id: "all", label: "All gifts" }, { id: "ready", label: "Ready to assign" }, { id: "waiting", label: "Waiting, no partner" }, { id: "assigned", label: "Assigned" }];

export function assignmentPage(v: View): string {
  const partners = v.projects ?? [];
  const existing = { records: labelBatches((v.assignments ?? emptyAssignments()).records, (id) => batchSizeOf((v.projects ?? []).find((p) => p.id === id))) }; // an assignment made before batches existed is labelled here, oldest first
  const today = v.today ?? "2026-01-01";
  const names = new Map(v.workOrders.map((w) => [w.itemId, w.itemName]));
  const ctx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z`, enrolments: v.enrolments?.records ?? [], beneficiaries: v.beneficiaries?.records ?? [], rulesOf: (i) => itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, i, names.get(i) ?? ""), itemUnits: v.itemUnits, stock: v.placements?.stock });
  const pname = (id: string): string => partners.find((p) => p.id === id)?.name ?? id;
  const units = new Map(assignables(ctx).map((u) => [u.key, u])); // a recurring gift is one row, however many payments it has (DECISIONS 172)
  const suggestions = suggestAssignments(ctx, existing);
  const sugOf = new Map<string, Suggestion>(suggestions.map((s) => [s.key, s]));
  const waiting = suggestions.filter((s) => s.partnerId === "").length;
  const suggested = suggestions.filter((s) => s.partnerId !== "" && s.mode === "suggest").length;
  const toGo = suggestions.filter((s) => s.partnerId !== "" && s.mode === "auto").length;
  const filter = v.assignFilter ?? "all";

  // Why gifts wait, counted by reason, so a long list is understood at a glance.
  const REASONS: Record<string, string> = { "none-delivers": "no partner delivers the item", full: "every eligible partner is full", "no-partner": "the project has no partner yet", "not-offered": "the project does not offer the benefit", "not-set-up": "the project is not set up" };
  const why = Object.entries(REASONS).map(([k, label]) => ({ n: suggestions.filter((s) => s.blocked === k).length, label })).filter((x) => x.n > 0);
  const metric = (n: number, label: string, cls = ""): string => `<div class="metric${cls ? ` ${cls}` : ""}"><b>${n}</b><span>${esc(label)}</span></div>`;
  const rooms = loads(partners.filter((p) => (p.itemIds ?? []).length > 0 || existing.records.some((a) => a.partnerId === p.id)), existing, ctx);
  const itemName = (id: string): string => v.workOrders.find((w) => w.itemId === id)?.itemName ?? id;
  // Rule (DECISIONS 183): for a sponsorship benefit the available capacity is what the partner has registered, and a typed capacity is only a ceiling. Other benefits use the typed capacity.
  const roomRows = rooms.map((l) => {
    const room = l.derived !== undefined ? (l.capacity === undefined ? l.derived : Math.min(l.derived, l.capacity)) : l.capacity;
    // Rule (decision 206): Registered is what the partner has loaded for the benefit (the people enrolled, for a benefit where the beneficiary comes first), Allowed is the capacity set on the partner, and Remaining is the lower of
    // the two less what is assigned. When the partner has registered more than it is allowed and is full, the table says how many are waiting beyond the allowed number, so capacity can be raised where there is a pipeline.
    const waitingBeyond = l.derived !== undefined && l.capacity !== undefined && l.derived > l.capacity && l.taken >= l.capacity ? l.derived - l.capacity : 0;
    return `<tr><td>${esc(pname(l.partnerId))}</td><td>${esc(itemName(l.itemId))}</td><td class="num">${l.derived !== undefined ? l.derived : '<span class="muted">\u2013</span>'}</td><td class="num">${l.capacity ?? '<span class="muted">no limit</span>'}</td><td class="num">${l.taken}</td><td class="num">${room === undefined ? "" : Math.max(0, room - l.taken)}</td><td>${waitingBeyond ? `<span class="pill warn" title="Registered by the partner but over the allowed capacity. Raise the allowed capacity on the partner to assign more.">${waitingBeyond} waiting beyond allowed</span>` : ""}</td></tr>`;
  }).join("");

  // Rule (DECISIONS 203): a batch is a rolling label on each partner's assignments, and a work order is covered once it has a place or an outcome. The count is what the partner and MWF both look at.
  const coveredKeys = new Set((v.placements?.records ?? []).filter(isActive).map((p) => p.key));
  const sizeOf = (id: string): number => batchSizeOf(partners.find((p) => p.id === id));
  const batchRows = batchRollup(existing.records, coveredKeys, sizeOf);
  const waitingFor = (partnerId: string, batch: number): string => {
    const open = existing.records.filter((a) => a.partnerId === partnerId && a.batch === batch && !coveredKeys.has(a.key));
    const outcomes = open.filter((a) => { const r = itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, a.itemId, names.get(a.itemId) ?? ""); return !!r && (r.first === "gift" || r.receiver === "none"); }).length;
    const people = open.length - outcomes;
    return [people ? `${people} waiting for beneficiary records` : "", outcomes ? `${outcomes} waiting for outcome records` : ""].filter(Boolean).join(", ") || '<span class="pill ready">All covered</span>';
  };
  const batchCard = batchRows.length ? `<div class="card"><h2>Batches</h2><p class="muted">Each partner's assignments are numbered in batches (the partner's batch size, 10 if not set). A batch never waits to fill: every gift is assigned and starts at once. A work order is covered when it has a child's place or an outcome.</p><table><thead><tr><th>Partner</th><th class="num">Batch</th><th class="num">Work orders</th><th class="num">Covered</th><th>Waiting</th><th>State</th></tr></thead><tbody>${batchRows.map((b) => `<tr><td>${esc(pname(b.partnerId))}</td><td class="num">${b.batch}</td><td class="num">${b.total} of ${b.size}</td><td class="num">${b.covered} of ${b.total}</td><td>${waitingFor(b.partnerId, b.batch)}</td><td><span class="pill${b.state === "full" ? "" : " ready"}">${b.state === "full" ? "Full" : "Open"}</span></td></tr>`).join("")}</tbody></table></div>` : "";

  // The gifts shown: those that still need a partner (with their suggestion) and those already assigned.
  const rowsAll: { key: string; assigned: string; sug?: Suggestion }[] = [
    ...suggestions.map((s) => ({ key: s.key, assigned: "", sug: s })),
    ...existing.records.map((a) => ({ key: a.key, assigned: a.partnerId })),
  ];
  const shown = rowsAll.filter((r) => filter === "all" || (filter === "assigned" ? r.assigned !== "" : filter === "waiting" ? r.assigned === "" && !r.sug?.partnerId : filter === "ready" ? r.assigned === "" && !!r.sug?.partnerId : true)).filter((r) => units.has(r.key));
  const rows = shown.slice(0, MAX_ROWS).map((r) => {
    const unit = units.get(r.key)!;
    const w = unit.w;
    const gp = projectOfOrder(w, v.giftProjects ?? []);
    const opts = eligiblePartners(partners, w.itemId, today).map((p) => `<option value="${esc(p.id)}"${p.id === (r.assigned || r.sug?.partnerId) ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    const who = r.assigned
      ? `<select data-asg="set" data-key="${esc(unit.key)}" aria-label="Assigned partner">${opts}</select> <button type="button" class="iconact" data-asg="unassign" data-key="${esc(unit.key)}" title="Take the assignment back" aria-label="Unassign">&times;</button>`
      : `<select data-asg="set" data-key="${esc(unit.key)}" aria-label="Choose a partner"><option value="">${r.sug?.partnerId ? `Suggested: ${esc(pname(r.sug.partnerId))}` : "No partner with room"}</option>${opts}</select>`;
    // Every partner considered for this gift, in order, with its room or why not: so a surprising suggestion can be understood without asking.
    const considered = r.sug && r.sug.candidates.length ? `<details class="muted"><summary>Partners considered (${r.sug.candidates.length})</summary><ul>${r.sug.candidates.map((c) => `<li>${esc(c.name)}: ${c.ok ? "has room" : "no room"} (${esc(c.why)})</li>`).join("")}</ul></details>` : "";
    const note = r.assigned ? '<span class="pill">Assigned</span>' : r.sug?.partnerId ? `<span class="muted">${esc(r.sug.mode === "auto" ? "Will be assigned automatically" : "Suggested, needs confirming")}. ${esc(r.sug.why)}</span>${considered}` : `<span class="muted">${esc(r.sug?.why ?? "")}</span>${considered}`;
    return `<tr><td><b>${esc(w.itemName)}</b><br><span class="muted">${esc(w.supporterName)} · ${esc(w.paidDate.slice(0, 10))}${unit.payments > 1 ? ` · recurring, ${unit.payments} payments` : ""}</span>${r.sug?.urgent ? ' <span class="pill warn">Urgent</span>' : ""}</td><td>${gp ? esc(gp.name) : '<span class="muted">No project</span>'}</td><td class="num">${r.sug?.parts ?? existing.records.find((a) => a.key === w.key)?.parts ?? ""}</td><td>${who}</td><td class="num">${existing.records.find((a) => a.key === r.key)?.batch ?? ""}</td><td>${note}</td></tr>`;
  }).join("");
  // Tiles (DECISIONS 226): a tile that counts a group is a button that shows just that group, and sets the same Show choice as the drop-down.
  const tile = (id: string, n: number, label: string, cls = ""): string => `<button type="button" class="metric tile${cls ? ` ${cls}` : ""}" data-tile="asg:${id}" aria-pressed="${filter === id ? "true" : "false"}"><b>${n}</b><span>${esc(label)}</span></button>`;
  const filters = `<div class="filters"><select data-asgf="filter" aria-label="Show">${FILTERS.map((f) => `<option value="${f.id}"${f.id === filter ? " selected" : ""}>${f.label}</option>`).join("")}</select></div>`;

  return `<h1>Assignment</h1>
    <p class="sub">Each released gift is handed to a partner. A gift for a project goes to that project's partners in its order, and the first that is active, in date, delivers the item and has room takes it. A gift with no project goes to any partner that delivers its item. A workflow set to automatic assigns at once, one set to suggest waits for a person.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(toAssign(ctx, existing).length, "Need a partner")}${tile("ready", toGo + suggested, "Have a partner ready")}${tile("assigned", existing.records.length, "Assigned")}${tile("waiting", waiting, "Wait, no partner with room", waiting ? "warn" : "")}</div>
    ${why.length ? `<p class="muted"><b>Why gifts wait:</b> ${why.map((x) => `${x.n} ${esc(x.label)}`).join(" · ")}.</p>` : ""}
    <div class="actions"><button class="primary" data-asg="run">Assign automatically</button><button data-asg="confirm"${suggested + toGo ? "" : " disabled"}>Confirm all suggestions</button><button data-asg="reset"${existing.records.length ? "" : " disabled"}>Reset assignments</button></div>
    <div class="card"><h2>Capacity with each partner</h2>${rooms.length ? `<table><thead><tr><th>Partner</th><th>Benefit</th><th class="num">Registered</th><th class="num">Allowed</th><th class="num">Assigned</th><th class="num">Remaining</th><th></th></tr></thead><tbody>${roomRows}</tbody></table>` : '<div class="empty">No partner delivers a benefit yet. Add partners on the Partners page.</div>'}</div>
    ${batchCard}
    <div class="card"><h2>Gifts <span class="muted">(${shown.length})</span></h2>${filters}
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Project</th><th class="num">Units</th><th>Partner</th><th class="num">Batch</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No gifts here. Gifts appear when they are released and have a workflow.</div>'}</div>`;
}
