/**
 * partner-home.ts
 *
 * What it does: the partner's own screen (DECISIONS 249, 250, 251). A top bar like the staff screens (brand, the partner, the page version, who is signed in, Sign out), the journey strip and gifts table that show how outcomes work, the figures for children, the partner's projects and profile, and its list of children.
 * Who calls it: app/main.ts when the session belongs to a partner. Depends on: the partner slice type and outcome rule (modules/13-partner-portal), partner-outcomes.ts and the waiting rule's words. Pure: it takes the slice and returns HTML.
 * Data flow: GET /api/outcomes answers a partner session with only that partner's slice, so nothing here can show another partner's data. Accepting or refusing a gift is in (partner-session.ts). Adding beneficiaries comes next.
 */

import { partnerOutcomes } from "../modules/13-partner-portal/outcomes";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { answerCardHtml, journeyHtml, outcomesTableHtml, type PartnerUi } from "./partner-outcomes";

// --- Helpers ---
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tile = (n: number, label: string): string => `<div class="metric"><b>${n}</b><span>${esc(label)}</span></div>`;
const ELIGIBILITY: Record<string, string> = { ready: "Ready", review: "Needs review", declined: "Cannot be offered", "": "Not decided" };

const clusterCount = (cs: { status: string }[]): string => { const n = cs.filter((c) => c.status === "active").length; return `${n} ${n === 1 ? "cluster" : "clusters"}`; };

// --- The screen ---
export function partnerHomeHtml(slice: PartnerSlice, who: string, version: string, ui: PartnerUi, canReturn = false): string {
  const gifts = partnerOutcomes(slice);
  const p = slice.partner;
  const people = slice.beneficiaries.filter((b) => b.kind === "person");
  const enrolled = new Set(slice.enrolments.filter((e) => e.status === "active").map((e) => e.beneficiaryId));
  const waiting = people.filter((b) => b.eligibility === "ready" && !enrolled.has(b.id)).length;
  const review = people.filter((b) => b.eligibility === "review").length;
  const projectName = (id: string): string => slice.giftProjects.find((g) => g.id === id)?.name ?? "";
  // Rule: the project shown is the one the child is enrolled in, or else the one it is waiting for.
  const projectOf = (id: string, target: string): string => projectName(slice.enrolments.find((e) => e.beneficiaryId === id && e.status === "active")?.giftProjectId ?? target);

  const rows = people.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.name)}</td><td>${esc(projectOf(b.id, b.targetProjectId ?? ""))}</td><td>${enrolled.has(b.id) ? "Enrolled" : esc(ELIGIBILITY[b.eligibility] ?? b.eligibility)}</td></tr>`).join("");
  const projects = slice.giftProjects.map((g) => `<li><b>${esc(g.name)}</b><span class="muted"> ${clusterCount(g.clusters ?? [])}</span></li>`).join("");
  const facts = [["Reference", p.reference], ["Type", p.type], ["Countries", p.countries], ["Reports by", p.reportVia], ["Batch size", p.batchSize !== undefined ? String(p.batchSize) : ""]].filter(([, v]) => v);

  return `<div class="phome">
    <header class="phome-bar"><div class="phome-brand">OUTCOMES<small>${esc(p.name)}</small></div>
      <div class="phome-who"><span class="badge-demo">${canReturn ? "Testing as partner" : "Partner"}</span><span class="ver" title="The version of this page. If it is not the latest, refresh the page.">${esc(version)}</span><span>${esc(who)}</span>${canReturn ? `<button data-action="view-as" data-partner="">Back to staff</button>` : ""}<button data-action="sign-out">Sign out</button></div></header>
    <main class="phome-main">
      <h1>Welcome, ${esc(p.name)}</h1><p class="sub">Your gifts, beneficiaries and outcomes. You see only your own.</p>
      ${journeyHtml(gifts)}${answerCardHtml(gifts, ui)}
      <div class="metrics">${tile(people.length, "Beneficiaries")}${tile(enrolled.size, "Enrolled")}${tile(waiting, "Waiting for a vacancy")}${tile(review, "Need details")}</div>
      <div class="phome-grid">
        <div class="phome-col">${outcomesTableHtml(gifts)}
          <section class="card"><h2>Your beneficiaries</h2>${rows ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Name</th><th>Project</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No beneficiaries yet. Adding them comes next.</div>`}</section></div>
        <aside class="phome-side">
          <section class="card"><h2>Your projects</h2>${projects ? `<ul class="phome-list">${projects}</ul>` : `<div class="empty">No project has been given to you yet.</div>`}</section>
          <section class="card"><h2>Your profile</h2>${facts.length ? `<table><tbody>${facts.map(([k, v]) => `<tr><td class="muted">${esc(k as string)}</td><td>${esc(v as string)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Your profile has no details yet.</div>`}</section>
        </aside>
      </div>
    </main></div>`;
}
