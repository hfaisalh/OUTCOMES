/**
 * partner-outcomes.ts
 *
 * What it does: the two parts of the partner's screen that show how outcomes work (DECISIONS 251): the journey strip (how many gifts are at each point, with a line on what happens there) and the table of the partner's gifts, each followed from assigned to complete.
 * Who calls it: app/partner-home.ts. Depends on: modules/13-partner-portal/outcomes.ts (the rule). Pure: it takes the rows and returns HTML.
 * Data flow: rows come from the partner's own slice, so no donor details can appear. Read-only for now: answering a batch comes next.
 */

import { pipeline, STANDING_LABEL, type PartnerOutcome, type Standing } from "../modules/13-partner-portal/outcomes";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// What happens at each point, in the partner's own words. Refused is shown apart, since it leaves the journey.
const STEPS: { id: Standing; says: string }[] = [
  { id: "to-answer", says: "A gift is assigned to you. Accept or refuse it within the days set." },
  { id: "confirmed", says: "You accepted. It is placed on a child who needs funding, or made into an outcome." },
  { id: "placed", says: "It funds a child or an outcome. You deliver in phases and send what is asked." },
  { id: "complete", says: "Delivered, reviewed and reported. The donor is told." },
];

// The colour of each point: amber when it waits on the partner, blue while in hand, green when done, red when refused.
const PILL: Record<Standing, string> = { "to-answer": "unrouted", confirmed: "blue", placed: "blue", complete: "ready", refused: "review" };

export function journeyHtml(rows: PartnerOutcome[]): string {
  const n = pipeline(rows);
  return `<section class="card pj" aria-label="How outcomes work"><h2>How outcomes work</h2>
    <ol class="pj-steps">${STEPS.map((s) => `<li class="pj-step${n[s.id] > 0 ? " has" : ""}"><b class="pj-n">${n[s.id]}</b><span class="pj-t">${esc(STANDING_LABEL[s.id])}</span><span class="muted pj-s">${esc(s.says)}</span></li>`).join("")}</ol>
    ${n.refused > 0 ? `<p class="muted pj-refused">${n.refused} refused gift${n.refused === 1 ? "" : "s"} went back to MWF to be given to someone else.</p>` : ""}</section>`;
}

export function outcomesTableHtml(rows: PartnerOutcome[]): string {
  if (rows.length === 0) return `<section class="card"><h2>Your gifts and outcomes</h2><div class="empty">No gift has been assigned to you yet. When one is, it appears here and you follow it to Complete.</div></section>`;
  const tr = (r: PartnerOutcome): string => `<tr><td>${esc(r.benefit)}<div class="muted">${esc(r.project)}</div></td><td>${r.batch ?? ""}</td><td><span class="pill ${PILL[r.standing]}">${esc(STANDING_LABEL[r.standing])}</span>${r.reason ? `<div class="muted">${esc(r.reason)}</div>` : ""}</td><td>${esc(r.funds) || `<span class="muted">Not placed yet</span>`}</td><td>${esc(r.step) || `<span class="muted">None yet</span>`}</td></tr>`;
  return `<section class="card"><h2>Your gifts and outcomes</h2><div class="tablewrap"><table><thead><tr><th>Benefit</th><th>Batch</th><th>Where it is</th><th>Funds</th><th>Last step</th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div></section>`;
}
