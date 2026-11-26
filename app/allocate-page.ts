/**
 * allocate-page.ts
 *
 * What it does: draws the Allocate page (DECISIONS 175), the rewired Allocation. Once a gift has a partner, it fills an open place (an approved beneficiary enrolled in a cluster of the project for the benefit) or,
 * where the gift comes first, creates an outcome. The page shows how many assigned gifts are placed, have created an outcome or wait, why the waiting ones wait, every place with how full it is, and every gift with
 * where it went or why not. A button places every gift that can be placed, and one clears the lot so a test can be run again. A person can choose another open place for any gift. Pure: it takes a View and
 * returns HTML.
 * Who calls it: app/main.ts. Depends on: modules/09-placement/placement.ts, 08-assignment, 07-beneficiaries (enrolments) and esc and View from pages.ts.
 */

import { assignables, contextFrom, emptyAssignments } from "../modules/08-assignment/assignment";
import { clusterStateOf, pathOf } from "../modules/06-projects/clusters";
import { itemRulesOf, emptyEnrolments } from "../modules/07-beneficiaries/enrolments";
import { emptyPlacements, fills, isActive, placementContext, suggestPlacements, syncPlacements, type PlaceSuggestion } from "../modules/09-placement/placement";
import { emptyRegister } from "../modules/07-beneficiaries/beneficiaries";
import type { SavedFeatures } from "../modules/02-project-rules/kind-features";
import { esc, type View } from "./pages";

const MAX_ROWS = 150;
// The filters say what they mean: ready to be placed, waiting with no place, or already placed (DECISIONS 179).
const FILTERS = [{ id: "all", label: "All gifts" }, { id: "ready", label: "Ready to place" }, { id: "waiting", label: "Waiting, no place" }, { id: "placed", label: "Placed" }];
const WHY: Record<string, string> = { "no-places": "no approved beneficiary is enrolled in the gift's project", "no-project-places": "no approved beneficiary is enrolled with the assigned partner", full: "every place for the benefit is full", "no-type": "the item has no type yet (choose one on the Benefits page)" };

export function allocatePage(v: View): string {
  const partners = v.projects ?? [];
  const gps = v.giftProjects ?? [];
  const today = v.today ?? "2026-01-01";
  const now = `${today}T00:00:00Z`;
  const assignments = (v.assignments ?? emptyAssignments()).records;
  const recorded = v.placements ?? emptyPlacements(); // all of it, history included
  const enrolments = (v.enrolments ?? emptyEnrolments()).records;
  const people = (v.beneficiaries ?? emptyRegister()).records;
  const actx = contextFrom({ workOrders: v.workOrders, partners, giftProjects: gps, frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now });
  const units = assignables(actx);
  const unitOf = new Map(units.map((u) => [u.key, u]));
  const names = new Map(v.workOrders.map((w) => [w.itemId, w.itemName]));
  const ctx = placementContext({ assignments, assignables: units, workOrders: v.workOrders, enrolments, beneficiaries: people, giftProjects: gps, frameworks: v.frameworks ?? [], rulesOf: (i) => itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, i, names.get(i) ?? ""), now, itemUnits: v.itemUnits });
  // Rule (DECISIONS 187): the page shows the true state now. A placement of a gift whose plan has been parked, whose child has left, or whose assignment was withdrawn is shown as ended even before a run records it.
  const synced = syncPlacements(ctx, recorded);
  const placements = synced.value;
  const pendingEnds = synced.ended;
  const heldRecords = placements.records.filter(isActive); // the placements that hold a place now (DECISIONS 186)
  const pname = (id: string): string => partners.find((p) => p.id === id)?.name ?? id;
  const person = (id: string): string => people.find((b) => b.id === id)?.name ?? id;
  const sug = suggestPlacements(ctx, placements);
  const sugOf = new Map<string, PlaceSuggestion>(sug.map((s) => [s.key, s]));
  const filter = v.allocFilter ?? "all";
  const placedCount = new Set(heldRecords.filter((p) => p.kind === "place").map((p) => p.key)).size; // a gift spread over several places counts once
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

  // Where a place is: the project and the cluster path from the master cluster down.
  const where = (gpId: string, clusterId: string): string => {
    const gp = gps.find((g) => g.id === gpId);
    return `${gp ? esc(gp.name) : ""} › ${esc(pathOf(clusterStateOf(gp?.levels, gp?.clusters), clusterId).map((c) => c.name).join(" › "))}`;
  };
  const placeLabel = (enrolmentId: string): string => { const e = enrolments.find((x) => x.id === enrolmentId); return e ? `${esc(person(e.beneficiaryId))} <span class="muted">${esc(e.id)}</span>` : esc(enrolmentId); };

  // Every place, and how full it is.
  const fillList = fills(ctx, placements);
  const placeRows = fillList.slice(0, MAX_ROWS).map((f) => {
    const e = enrolments.find((x) => x.id === f.enrolmentId);
    if (!e) return "";
    const state = f.used >= f.capacity ? '<span class="pill">Full</span>' : f.used > 0 ? '<span class="pill warn">Part funded</span>' : '<span class="pill muted">Open</span>';
    return `<tr><td>${placeLabel(e.id)}</td><td>${esc(names.get(e.itemId) ?? e.itemId)}</td><td class="muted">${where(e.giftProjectId, e.clusterId)}</td><td class="num">${f.used} of ${f.capacity}</td><td>${state}</td></tr>`;
  }).join("");

  // Every gift: placed, creating an outcome, or waiting.
  // A gift spread over several places has several records (DECISIONS 181): they are one row, with each child and the units it took.
  const recsByKey = new Map<string, (typeof placements.records)>();
  for (const rec of heldRecords) recsByKey.set(rec.key, [...(recsByKey.get(rec.key) ?? []), rec]);
  const rowsAll: { key: string; rec?: (typeof placements.records)[number]; recs?: (typeof placements.records); s?: PlaceSuggestion }[] = [
    ...sug.map((s) => ({ key: s.key, s })),
    ...[...recsByKey.entries()].map(([key, recs]) => ({ key, rec: recs[0], recs })),
  ];
  const shown = rowsAll.filter((r) => unitOf.has(r.key)).filter((r) => filter === "all" || (filter === "placed" ? !!r.rec : filter === "waiting" ? !r.rec && r.s?.kind === "" : filter === "ready" ? !r.rec && r.s?.kind !== "" : true));
  const rows = shown.slice(0, MAX_ROWS).map((r) => {
    const u = unitOf.get(r.key)!;
    const a = assignments.find((x) => x.key === r.key);
    const opts = r.s ? r.s.options : [];
    const choose = (selected: string): string => `<select data-plc="set" data-key="${esc(r.key)}" aria-label="Choose a place"><option value="">${selected ? "" : r.s?.enrolmentId ? "Suggested: " + esc(person(enrolments.find((e) => e.id === r.s?.enrolmentId)?.beneficiaryId ?? "")) : "No open place"}</option>${opts.map((o) => `<option value="${esc(o.enrolmentId)}"${o.enrolmentId === (selected || r.s?.enrolmentId) ? " selected" : ""}${o.fits ? "" : " disabled"}>${esc(o.name)} (${o.used} of ${o.capacity})</option>`).join("")}</select>`;
    let place: string, note: string;
    if (r.rec?.kind === "outcome") { place = `<b>${esc(r.rec.outcomeRef)}</b> <button type="button" class="iconact" data-plc="unplace" data-key="${esc(r.key)}" title="Take the placement back" aria-label="Unplace">&times;</button>`; note = '<span class="pill">Outcome created</span>'; }
    else if (r.rec) {
      const recs = r.recs ?? [r.rec];
      place = `${recs.map((x) => `${placeLabel(x.enrolmentId)}${recs.length > 1 ? ` <span class="muted">(${x.parts} unit${x.parts === 1 ? "" : "s"})</span>` : ""}`).join("<br>")} <button type="button" class="iconact" data-plc="unplace" data-key="${esc(r.key)}" title="Take the placement back" aria-label="Unplace">&times;</button>`;
      note = `<span class="pill">Placed</span> ${recs.length > 1 ? `<span class="muted">Spread over ${recs.length} places</span>` : `<span class="muted">${esc(where(r.rec.giftProjectId, enrolments.find((e) => e.id === r.rec?.enrolmentId)?.clusterId ?? ""))}</span>`}`;
    }
    else if (r.s?.kind === "outcome") { place = '<span class="muted">Outcome, no place needed</span>'; note = `<span class="muted">${esc(r.s.why)}</span>`; }
    else { place = choose(""); note = `<span class="muted">${esc(r.s?.why ?? "")}</span>`; }
    return `<tr><td><b>${esc(u.w.itemName)}</b><br><span class="muted">${esc(u.w.supporterName)} · ${esc(u.w.paidDate.slice(0, 10))}${u.payments > 1 ? ` · recurring, ${u.payments} payments` : ""}</span></td><td>${esc(pname(a?.partnerId ?? ""))}</td><td class="num">${a?.parts ?? ""}</td><td>${place}</td><td>${note}</td></tr>`;
  }).join("");
  // Tiles (DECISIONS 226): a tile that counts a group is a button that shows just that group, and sets the same Show choice as the drop-down.
  const tile = (id: string, n: number, label: string, cls = ""): string => `<button type="button" class="metric tile${cls ? ` ${cls}` : ""}" data-tile="alloc:${id}" aria-pressed="${filter === id ? "true" : "false"}"><b>${n}</b><span>${esc(label)}</span></button>`;
  const filters = `<div class="filters"><select data-allocf="filter" aria-label="Show">${FILTERS.map((f) => `<option value="${f.id}"${f.id === filter ? " selected" : ""}>${f.label}</option>`).join("")}</select></div>`;

  return `<h1>Allocate</h1>
    <p class="sub">An assigned gift is placed. Where the beneficiary comes first (sponsorship), it fills an open place: an approved beneficiary enrolled in a cluster of its project for its benefit, the one with the least filled first. Where the gift comes first (a pump, a camp), it creates an outcome and its recipients are enrolled after. A gift with no place waits, and says why.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(assignments.length, "Assigned gifts")}${tile("placed", placedCount, "Placed in a place")}${metric(outcomeCount, "Outcomes created")}${tile("waiting", waiting, "Wait, no open place", waiting ? "warn" : "")}</div>
    ${why.length ? `<p class="muted"><b>Why gifts wait:</b> ${why.map((x) => `${x.n} ${esc(x.label)}`).join(" · ")}.</p>` : ""}
    ${waitingList.length ? `<p class="muted"><b>Waiting, by project and benefit:</b> ${waitingList.map(([l, n]) => `${esc(l)} (${n})`).join(" · ")}${waitingBy.size > waitingList.length ? ` · and ${waitingBy.size - waitingList.length} more` : ""}.</p>` : ""}
    <div class="actions"><button class="primary" data-plc="run"${ready || pendingEnds ? "" : " disabled"}>Place automatically</button><button data-plc="reset"${placements.records.length ? "" : " disabled"}>Reset placements</button></div>
    ${pendingEnds ? `<p class="muted">${pendingEnds} placement${pendingEnds === 1 ? " has" : "s have"} ended (a plan was parked, a child left, or an assignment was withdrawn). Place automatically records it, and keeps it in the history.</p>` : ""}
    ${assignments.length === 0 ? '<div class="empty">No gift has been assigned yet. Assign gifts to partners on the Assignment tab first.</div>' : ""}
    <div class="card"><h2>Places <span class="muted">(${fillList.length})</span></h2>${placeRows ? `<div class="tablewrap"><table><thead><tr><th>Beneficiary</th><th>Benefit</th><th>Where</th><th class="num">Units</th><th>State</th></tr></thead><tbody>${placeRows}</tbody></table></div>${fillList.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No place is open. Enrol approved beneficiaries in a cluster, on the cluster\'s Beneficiaries tab.</div>'}</div>
    <div class="card"><h2>Gifts <span class="muted">(${shown.length})</span></h2>${filters}
      ${rows ? `<div class="tablewrap"><table><thead><tr><th>Gift</th><th>Partner</th><th class="num">Units</th><th>Place</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>${shown.length > MAX_ROWS ? `<p class="muted">The first ${MAX_ROWS} are shown.</p>` : ""}` : '<div class="empty">No gifts here.</div>'}</div>`;
}
