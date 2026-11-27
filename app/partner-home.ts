/**
 * partner-home.ts
 *
 * What it does: the first screen of a partner's own sign-in (DECISIONS 249, 250): who is signed in, the partner's short profile, the projects it delivers, how many children are waiting and enrolled, its gifts and answers, and the list of its children.
 * Who calls it: app/main.ts when the session belongs to a partner. Depends on: the partner slice type (modules/13-partner-portal/scope.ts) and the waiting rule's words (modules/07-beneficiaries/waiting.ts). Pure: it takes the slice and returns HTML.
 * Data flow: GET /api/outcomes answers a partner session with only that partner's slice, so nothing here can show another partner's data. Read-only for now: adding children, accepting a batch and work order details come next.
 */

import type { PartnerSlice } from "../modules/13-partner-portal/scope";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tile = (n: number, label: string): string => `<div class="metric"><b>${n}</b><span>${esc(label)}</span></div>`;

const ELIGIBILITY: Record<string, string> = { ready: "Ready", review: "Needs review", declined: "Cannot be offered", "": "Not decided" };

export function partnerHomeHtml(slice: PartnerSlice, who: string): string {
  const p = slice.partner;
  const people = slice.beneficiaries.filter((b) => b.kind === "person");
  const enrolled = new Set(slice.enrolments.filter((e) => e.status === "active").map((e) => e.beneficiaryId));
  const waiting = people.filter((b) => b.eligibility === "ready" && !enrolled.has(b.id)).length;
  const review = people.filter((b) => b.eligibility === "review").length;
  const answered = new Set(slice.confirmations.map((c) => c.key));
  const toAnswer = slice.assignments.filter((a) => !answered.has(a.key)).length;
  const projectName = (id: string): string => slice.giftProjects.find((g) => g.id === id)?.name ?? "";

  const rows = people.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.name)}</td><td>${esc(projectName(b.targetProjectId ?? ""))}</td><td>${enrolled.has(b.id) ? "Enrolled" : esc(ELIGIBILITY[b.eligibility] ?? b.eligibility)}</td></tr>`).join("");
  const projects = slice.giftProjects.map((g) => `<li><b>${esc(g.name)}</b><span class="muted"> ${g.clusters?.filter((c) => c.status === "active").length ?? 0} groups</span></li>`).join("");
  const facts = [["Reference", p.reference], ["Type", p.type], ["Countries", p.countries], ["Reports by", p.reportVia], ["Batch size", p.batchSize !== undefined ? String(p.batchSize) : ""]].filter(([, v]) => v);

  return `<div class="phome">
    <header class="phome-bar"><div class="signin-brand">OUTCOMES<small>${esc(p.name)}</small></div><div class="phome-who"><span class="muted">${esc(who)}</span><button data-action="sign-out">Sign out</button></div></header>
    <main class="phome-main">
      <h1>Welcome, ${esc(p.name)}</h1>
      <div class="metrics">${tile(people.length, "Children")}${tile(enrolled.size, "Enrolled")}${tile(waiting, "Waiting for a vacancy")}${tile(review, "Need details")}${tile(toAnswer, "Gifts to answer")}</div>
      <div class="phome-grid">
        <section class="card phome-children"><h2>Your children</h2>${rows ? `<table><thead><tr><th>ID</th><th>Name</th><th>Project</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">No children yet. Adding them comes next.</div>`}</section>
        <aside class="phome-side">
          <section class="card"><h2>Your projects</h2>${projects ? `<ul class="phome-list">${projects}</ul>` : `<div class="empty">No project has been given to you yet.</div>`}</section>
          <section class="card"><h2>Your profile</h2>${facts.length ? `<table><tbody>${facts.map(([k, v]) => `<tr><td class="muted">${esc(k as string)}</td><td>${esc(v as string)}</td></tr>`).join("")}</tbody></table>` : `<div class="empty">Your profile has no details yet.</div>`}</section>
        </aside>
      </div>
    </main></div>`;
}
