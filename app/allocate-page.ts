/**
 * allocate-page.ts
 *
 * What it does: draws the Allocate page (DECISIONS 175), the rewired Allocation. Once a gift has a partner, it supports a beneficiary who still needs funding (an approved beneficiary enrolled in a cluster of the project for the benefit) or,
 * where the gift comes first, creates an outcome. The page shows how many assigned gifts are allocated, have created an outcome or wait, why the waiting ones wait, every beneficiary to fund and how much of the need is met, and every gift with
 * where it went or why not. A button allocates every gift that can be allocated, and one clears the lot so a test can be run again. A person can choose another beneficiary for any gift. Pure: it takes a View and
 * returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/09-allocation/allocation.ts, 08-assignment, 07-beneficiaries (enrolments) and esc and View from pages.ts.
 */

import { normaliseSteps } from "../modules/09-allocation/order";
import { prioritySet } from "../modules/08-assignment/priority-gifts";
import { siteBadge } from "./site-chip";
import { assignables, contextFrom, emptyAssignments } from "../modules/08-assignment/assignment";
import { clusterStateOf, pathOf } from "../modules/06-projects/clusters";
import { itemRulesOf, emptyEnrolments } from "../modules/07-beneficiaries/enrolments";
import { emptyAllocations, fills, isActive, allocateContext, suggestAllocations, syncAllocations, type AllocationSuggestion } from "../modules/09-allocation/allocation";
import { emptyRegister } from "../modules/07-beneficiaries/beneficiaries";
import type { SavedFeatures } from "../modules/02-project-rules/kind-features";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
// The filters say what they mean: ready to be allocated, waiting with no beneficiary to fund, or already allocated (DECISIONS 179).
const FILTERS = [{ id: "all", label: "All gifts" }, { id: "ready", label: "Ready to allocate" }, { id: "waiting", label: "Waiting, no beneficiary to fund" }, { id: "allocated", label: "Allocated" }];
const WHY: Record<string, string> = { "no-beneficiary": "no approved beneficiary is enrolled in the gift's project", "no-project-beneficiary": "no approved beneficiary is enrolled with the assigned partner", full: "every beneficiary for the benefit is fully funded", "no-type": "the item has no type yet (choose one on the Benefits page)" };

export function allocatePage(v: View): string {
  const partners = v.projects ?? [];
  const gps = v.giftProjects ?? [];
  const today = v.today ?? "2026-01-01";
  const now = `${today}T00:00:00Z`;
  const assignments = (v.assignments ?? emptyAssignments()).records;
  const recorded = v.allocations ?? emptyAllocations(); // all of it, history included
  const enrolments = (v.enrolments ?? emptyEnrolments()).records;
  const people = (v.beneficiaries ?? emptyRegister()).records;
  const actx = contextFrom({ urgent: prioritySet(v.priorityGifts), workOrders: v.workOrders, partners, giftProjects: gps, frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now });
  const units = assignables(actx);
  const unitOf = new Map(units.map((u) => [u.key, u]));
  const names = new Map(v.workOrders.map((w) => [w.itemId, w.itemName]));
  const ctx = allocateContext({ steps: v.allocationSteps ?? normaliseSteps(undefined), urgent: prioritySet(v.priorityGifts), assignments, assignables: units, workOrders: v.workOrders, enrolments, beneficiaries: people, giftProjects: gps, frameworks: v.frameworks ?? [], rulesOf: (i) => itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, i, names.get(i) ?? ""), now, itemUnits: v.itemUnits });
  // Rule (DECISIONS 187): the page shows the true state now. An allocation of a gift whose plan has been parked, whose child has left, or whose assignment was withdrawn is shown as ended even before a run records it.
  const synced = syncAllocations(ctx, recorded);
  const allocations = synced.value;
  const pendingEnds = synced.ended;
  const heldRecords = allocations.records.filter(isActive); // the allocations that hold a beneficiary now (DECISIONS 186)
  const pname = (id: string): string => partners.find((p) => p.id === id)?.name ?? id;
  const person = (id: string): string => people.find((b) => b.id === id)?.name ?? id;
  const sug = suggestAllocations(ctx, allocations);
  const filter = v.allocFilter ?? "all";
  const allocatedCount = new Set(heldRecords.filter((p) => p.kind === "beneficiary").map((p) => p.key)).size; // a gift spread over several beneficiaries counts once
  const outcomeCount = heldRecords.filter((p) => p.kind === "outcome").length;
  const waiting = sug.filter((s) => s.kind === "").length;
  const ready = sug.filter((s) => s.kind !== "").length;
  const why = Object.entries(WHY).map(([k, label]) => ({ n: sug.filter((s) => s.blocked === k).length, label })).filter((x) => x.n > 0);
  // Which project and benefit the waiting gifts belong to, the biggest first, so the cause is seen without scrolling.
  const waitingBy = new Map<string, number>();
  for (const x of sug.filter((s) => s.kind === "")) {
    const gpId = assignments.find((a) => a.key === x.key)?.giftProjectId ?? "";
    const label = `${gpId === "" ? "No project" : gps.find((g) => g.id === gpId)?.name ?? gpId} · ${names.get(x.itemId) ?? x.itemId}`;
    waitingBy.set(label, (waitingBy.get(label) ?? 0) + 1);
  }
  const waitingList = [...waitingBy.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  const metric = (n: number, label: string, cls = ""): string => `<div class="metric${cls ? ` ${cls}` : ""}"><b>${n}</b><span>${esc(label)}</span></div>`;

  // Where a beneficiary is: the project and the cluster path from the master cluster down.
  const where = (gpId: string, clusterId: string): string => {
    const gp = gps.find((g) => g.id === gpId);
    return `${gp ? esc(gp.name) : ""} › ${esc(pathOf(clusterStateOf(gp?.levels, gp?.clusters), clusterId).map((c) => c.name).join(" › "))}`;
  };
  const allocationLabel = (enrolmentId: string): string => { const e = enrolments.find((x) => x.id === enrolmentId); return e ? `${esc(person(e.beneficiaryId))} <span class="muted">${esc(e.id)}</span>` : esc(enrolmentId); };

  // Every beneficiary to fund, and how much of the need is met.
  const fillList = fills(ctx, allocations);
  const placeRows = fillList.slice(0, MAX_ROWS).map((f) => {
    const e = enrolments.find((x) => x.id === f.enrolmentId);
    if (!e) return "";
    const state = f.used >= f.capacity ? '<span class="pill">Funded</span>' : f.used > 0 ? '<span class="pill warn">Part funded</span>' : '<span class="pill muted">Open</span>';
    return `<tr><td>${allocationLabel(e.id)}</td><td>${esc(names.get(e.itemId) ?? e.itemId)}</td><td class="muted">${where(e.giftProjectId, e.clusterId)}</td><td class="num">${f.used} of ${f.capacity}</td><td>${state}</td></tr>`;
  }).join("");

  // Every gift: allocated, creating an outcome, or waiting.
  // A gift spread over several places has several records (DECISIONS 181): they are one row, with each child and the units it took.
  const recsByKey = new Map<string, (typeof allocations.records)>();
  for (const rec of heldRecords) recsByKey.set(rec.key, [...(recsByKey.get(rec.key) ?? []), rec]);
  const rowsAll: { key: string; rec?: (typeof allocations.records)[number]; recs?: (typeof allocations.records); s?: AllocationSuggestion }[] = [
    ...sug.map((s) => ({ key: s.key, s })),
    ...[...recsByKey.entries()].map(([key, recs]) => ({ key, rec: recs[0], recs })),
  ];
  const shown = rowsAll.filter((r) => unitOf.has(r.key)).filter((r) => filter === "all" || (filter === "allocated" ? !!r.rec : filter === "waiting" ? !r.rec && r.s?.kind === "" : filter === "ready" ? !r.rec && r.s?.kind !== "" : true));
  const rows = shown.slice(0, MAX_ROWS).map((r) => {
    const u = unitOf.get(r.key)!;
    const a = assignments.find((x) => x.key === r.key);
    const opts = r.s ? r.s.options : [];
    const choose = (selected: string): string => `<select data-alc="set" data-key="${esc(r.key)}" aria-label="Choose a beneficiary"><option value="">${selected ? "" : r.s?.enrolmentId ? "Suggested: " + esc(person(enrolments.find((e) => e.id === r.s?.enrolmentId)?.beneficiaryId ?? "")) : "No beneficiary needs funding"}</option>${opts.map((o) => `<option value="${esc(o.enrolmentId)}"${o.enrolmentId === (selected || r.s?.enrolmentId) ? " selected" : ""}${o.fits ? "" : " disabled"}>${esc(o.name)} (${o.used} of ${o.capacity})</option>`).join("")}</select>`;
    let place: string, note: string;
    if (r.rec?.kind === "outcome") { place = `<b>${esc(r.rec.outcomeRef)}</b> <button type="button" class="iconact" data-alc="undo" data-key="${esc(r.key)}" title="Take the allocation back" aria-label="Take the allocation back">&times;</button>`; note = '<span class="pill">Outcome created</span>'; }
    else if (r.rec) {
      const recs = r.recs ?? [r.rec];
      place = `${recs.map((x) => `${allocationLabel(x.enrolmentId)}${recs.length > 1 ? ` <span class="muted">(${x.parts} unit${x.parts === 1 ? "" : "s"})</span>` : ""}`).join("<br>")} <button type="button" class="iconact" data-alc="undo" data-key="${esc(r.key)}" title="Take the allocation back" aria-label="Take the allocation back">&times;</button>`;
      note = `<span class="pill">Allocated</span> ${recs.length > 1 ? `<span class="muted">Spread over ${recs.length} beneficiaries</span>` : `<span class="muted">${esc(where(r.rec.giftProjectId, enrolments.find((e) => e.id === r.rec?.enrolmentId)?.clusterId ?? ""))}</span>`}`;
    }
    else if (r.s?.kind === "outcome") { place = '<span class="muted">Outcome, no beneficiary to fund</span>'; note = `<span class="muted">${esc(r.s.why)}</span>`; }
    else { place = choose(""); note = `<span class="muted">${esc(r.s?.why ?? "")}</span>`; }
    return `<tr><td><b>${esc(u.w.itemName)}</b><br>${siteBadge(u.w.site, u.w.currency)}<span class="muted">${esc(u.w.supporterName)} · ${esc(u.w.paidDate.slice(0, 10))}${u.payments > 1 ? ` · recurring, ${u.payments} payments` : ""}</span></td><td>${esc(pname(a?.partnerId ?? ""))}</td><td class="num">${a?.parts ?? ""}</td><td>${place}</td><td>${note}</td></tr>`;
  }).join("");
  // Tiles (DECISIONS 226): a tile that counts a group is a button that shows just that group, and sets the same Show choice as the drop-down.
  const tile = (id: string, n: number, label: string, cls = ""): string => `<button type="button" class="metric tile${cls ? ` ${cls}` : ""}" data-tile="alloc:${id}" aria-pressed="${filter === id ? "true" : "false"}"><b>${n}</b><span>${esc(label)}</span></button>`;
  const filters = `<div class="filters"><select data-allocf="filter" aria-label="Show">${FILTERS.map((f) => `<option value="${f.id}"${f.id === filter ? " selected" : ""}>${f.label}</option>`).join("")}</select></div>`;

  return `<h1>Allocate</h1>
    <p class="sub">An assigned gift is allocated. Where the beneficiary comes first (sponsorship), it supports a beneficiary who still needs funding: an approved beneficiary enrolled in a cluster of its project for its benefit, the one least funded first. Where the gift comes first (a pump, a camp), it creates an outcome and its recipients are enrolled after. A gift with no beneficiary to fund waits, and says why.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(assignments.length, "Assigned gifts")}${tile("allocated", allocatedCount, "Allocated to a beneficiary")}${metric(outcomeCount, "Outcomes created")}${tile("waiting", waiting, "Waiting, no beneficiary to fund", waiting ? "warn" : "")}</div>
    ${why.length ? `<p class="muted"><b>Why gifts wait:</b> ${why.map((x) => `${x.n} ${esc(x.label)}`).join(" · ")}.</p>` : ""}
    ${waitingList.length ? `<p class="muted"><b>Waiting, by project and benefit:</b> ${waitingList.map(([l, n]) => `${esc(l)} (${n})`).join(" · ")}${waitingBy.size > waitingList.length ? ` · and ${waitingBy.size - waitingList.length} more` : ""}.</p>` : ""}
    <div class="actions"><button class="primary" data-alc="run"${ready || pendingEnds ? "" : " disabled"}>Allocate automatically</button><button data-alc="reset"${allocations.records.length ? "" : " disabled"}>Reset allocations</button></div>
    ${pendingEnds ? `<p class="muted">${pendingEnds} allocation${pendingEnds === 1 ? " has" : "s have"} ended (a plan was parked, a child left, or an assignment was withdrawn). Allocate automatically records it, and keeps it in the history.</p>` : ""}
    ${assignments.length === 0 ? '<div class="empty">No gift has been assigned yet. Assign gifts to partners on the Assignment tab first.</div>' : ""}
    <div class="card"><h2>Beneficiaries to fund <span class="muted">(${fillList.length})</span></h2>${placeRows ? `<div class="tablewrap"><table><thead><tr><th>Beneficiary</th><th>Benefit</th><th>Where</th><th class="num">Units</th><th>State</th></tr></thead><tbody>${placeRows}</tbody></table></div>${fillList.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No beneficiary needs funding. Enrol approved beneficiaries in a cluster, on the cluster\'s Beneficiaries tab.</div>'}</div>
    <div class="card"><h2>Gifts <span class="muted">(${shown.length})</span></h2>${filters}
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Partner</th><th class="num">Units</th><th>Beneficiary</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No gifts here.</div>'}</div>`;
}
