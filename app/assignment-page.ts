/**
 * assignment-page.ts
 *
 * What it does: draws the Assignment page (DECISIONS 170), the step where each released gift is handed to a partner. It shows how many gifts need a partner, are suggested, are assigned and wait with no one, the room each
 * partner has left for each benefit, and a table of the gifts with who each goes to or why no one. A button assigns automatically every gift whose workflow is set to automatic, one confirms every suggestion, and one
 * clears the lot so a test can be run again. A person can choose another partner for any gift from its list. Pure: it takes a View and returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/08-assignment/assignment.ts, projects.ts (the types) and esc and View from pages.ts.
 */

import { contextFrom, emptyAssignments, loads, projectOfOrder, suggestAssignments, toAssign, type Suggestion } from "../modules/08-assignment/assignment";
import { eligiblePartners } from "../modules/06-projects/projects";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
const FILTERS = [{ id: "all", label: "All gifts" }, { id: "open", label: "Needs a partner" }, { id: "assigned", label: "Assigned" }];

export function assignmentPage(v: View): string {
  const partners = v.projects ?? [];
  const existing = v.assignments ?? emptyAssignments();
  const today = v.today ?? "2026-01-01";
  const ctx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z` });
  const pname = (id: string): string => partners.find((p) => p.id === id)?.name ?? id;
  const byKey = new Map(v.workOrders.map((w) => [w.key, w]));
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
  const rooms = loads(partners.filter((p) => (p.itemIds ?? []).length > 0 || existing.records.some((a) => a.partnerId === p.id)), existing);
  const itemName = (id: string): string => v.workOrders.find((w) => w.itemId === id)?.itemName ?? id;
  const roomRows = rooms.map((l) => `<tr><td>${esc(pname(l.partnerId))}</td><td>${esc(itemName(l.itemId))}</td><td class="num">${l.capacity ?? "no limit"}</td><td class="num">${l.taken}</td><td class="num">${l.capacity === undefined ? "" : Math.max(0, l.capacity - l.taken)}</td></tr>`).join("");

  // The gifts shown: those that still need a partner (with their suggestion) and those already assigned.
  const rowsAll: { key: string; assigned: string; sug?: Suggestion }[] = [
    ...suggestions.map((s) => ({ key: s.key, assigned: "", sug: s })),
    ...existing.records.map((a) => ({ key: a.key, assigned: a.partnerId })),
  ];
  const shown = rowsAll.filter((r) => filter === "all" || (filter === "open" ? r.assigned === "" : r.assigned !== "")).filter((r) => byKey.has(r.key));
  const rows = shown.slice(0, MAX_ROWS).map((r) => {
    const w = byKey.get(r.key)!;
    const gp = projectOfOrder(w, v.giftProjects ?? []);
    const opts = eligiblePartners(partners, w.itemId, today).map((p) => `<option value="${esc(p.id)}"${p.id === (r.assigned || r.sug?.partnerId) ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    const who = r.assigned
      ? `<select data-asg="set" data-key="${esc(w.key)}" aria-label="Assigned partner">${opts}</select> <button type="button" class="iconact" data-asg="unassign" data-key="${esc(w.key)}" title="Take the assignment back" aria-label="Unassign">&times;</button>`
      : `<select data-asg="set" data-key="${esc(w.key)}" aria-label="Choose a partner"><option value="">${r.sug?.partnerId ? `Suggested: ${esc(pname(r.sug.partnerId))}` : "No partner with room"}</option>${opts}</select>`;
    const note = r.assigned ? '<span class="pill">Assigned</span>' : r.sug?.partnerId ? `<span class="muted">${esc(r.sug.mode === "auto" ? "Will be assigned automatically" : "Suggested, needs confirming")}. ${esc(r.sug.why)}</span>` : `<span class="muted">${esc(r.sug?.why ?? "")}</span>`;
    return `<tr><td><b>${esc(w.itemName)}</b><br><span class="muted">${esc(w.supporterName)} · ${esc(w.paidDate.slice(0, 10))}</span>${r.sug?.urgent ? ' <span class="pill warn">Urgent</span>' : ""}</td><td>${gp ? esc(gp.name) : '<span class="muted">No project</span>'}</td><td class="num">${r.sug?.parts ?? existing.records.find((a) => a.key === w.key)?.parts ?? ""}</td><td>${who}</td><td>${note}</td></tr>`;
  }).join("");
  const filters = `<div class="filters"><select data-asgf="filter" aria-label="Show">${FILTERS.map((f) => `<option value="${f.id}"${f.id === filter ? " selected" : ""}>${f.label}</option>`).join("")}</select></div>`;

  return `<h1>Assignment</h1>
    <p class="sub">Each released gift is handed to a partner. A gift for a project goes to that project's partners in its order, and the first that is active, in date, delivers the item and has room takes it. A gift with no project goes to any partner that delivers its item. A workflow set to automatic assigns at once, one set to suggest waits for a person.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(toAssign(ctx, existing).length, "Need a partner")}${metric(toGo + suggested, "Have a partner ready")}${metric(existing.records.length, "Assigned")}${metric(waiting, "Wait, no partner with room", waiting ? "warn" : "")}</div>
    ${why.length ? `<p class="muted"><b>Why gifts wait:</b> ${why.map((x) => `${x.n} ${esc(x.label)}`).join(" · ")}.</p>` : ""}
    <div class="actions"><button class="primary" data-asg="run">Assign automatically</button><button data-asg="confirm"${suggested + toGo ? "" : " disabled"}>Confirm all suggestions</button><button data-asg="reset"${existing.records.length ? "" : " disabled"}>Reset assignments</button></div>
    <div class="card"><h2>Room left with each partner</h2>${rooms.length ? `<table><thead><tr><th>Partner</th><th>Benefit</th><th class="num">Capacity</th><th class="num">Assigned</th><th class="num">Free</th></tr></thead><tbody>${roomRows}</tbody></table>` : '<div class="empty">No partner delivers a benefit yet. Add partners on the Partners page.</div>'}</div>
    <div class="card"><h2>Gifts <span class="muted">(${shown.length})</span></h2>${filters}
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Project</th><th class="num">Units</th><th>Partner</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No gifts here. Gifts appear when they are released and have a workflow.</div>'}</div>`;
}
