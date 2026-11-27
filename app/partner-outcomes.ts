/**
 * partner-outcomes.ts
 *
 * What it does: the parts of the partner's screen about gifts (DECISIONS 251, 254): the journey strip, the "Waiting for your answer" card with Accept and Refuse for each batch, the refusal form, and the table that follows each gift from assigned to complete.
 * Who calls it: app/partner-home.ts. Depends on: modules/13-partner-portal/outcomes.ts (the rule). Pure: it takes the rows and the small screen state and returns HTML. The clicks are handled in app/partner-session.ts.
 * Data flow: rows come from the partner's own slice, so no donor details can appear. A button carries the gift keys in data-keys, joined by "|".
 */

import { pipeline, STANDING_LABEL, type PartnerOutcome, type Standing } from "../modules/13-partner-portal/outcomes";

// --- Types and helpers ---
export interface PartnerUi { refusing: string[] | null; message: string; error: string }
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const keysAttr = (keys: string[]): string => esc(keys.join("|"));
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// What happens at each point, in the partner's own words. Refused is shown apart, since it leaves the journey.
const STEPS: { id: Standing; says: string }[] = [
  { id: "to-answer", says: "A gift is assigned to you. Accept or refuse it within the days set." },
  { id: "confirmed", says: "You accepted. It is allocated to a beneficiary who needs funding, or made into an outcome." },
  { id: "allocated", says: "It funds a beneficiary or an outcome. You deliver in phases and send what is asked." },
  { id: "complete", says: "Delivered, reviewed and reported. The donor is told." },
];
// The colour of each point: amber when it waits on the partner, blue while in hand, green when done, red when refused.
const PILL: Record<Standing, string> = { "to-answer": "unrouted", confirmed: "blue", allocated: "blue", complete: "ready", refused: "review" };

// --- The journey strip ---
export function journeyHtml(rows: PartnerOutcome[]): string {
  const n = pipeline(rows);
  return `<section class="card pj" aria-label="How outcomes work"><h2>How outcomes work</h2>
    <ol class="pj-steps">${STEPS.map((s) => `<li class="pj-step${n[s.id] > 0 ? " has" : ""}"><b class="pj-n">${n[s.id]}</b><span class="pj-t">${esc(STANDING_LABEL[s.id])}</span><span class="muted pj-s">${esc(s.says)}</span></li>`).join("")}</ol>
    ${n.refused > 0 ? `<p class="muted pj-refused">${plural(n.refused, "refused gift", "refused gifts")} went back to MWF to be given to someone else.</p>` : ""}</section>`;
}

// --- Waiting for your answer: one line for each batch, and the refusal form ---
export function answerCardHtml(rows: PartnerOutcome[], ui: PartnerUi): string {
  const waiting = rows.filter((r) => r.standing === "to-answer");
  const byBatch = new Map<string, PartnerOutcome[]>();
  for (const r of waiting) byBatch.set(String(r.batch ?? ""), [...(byBatch.get(String(r.batch ?? "")) ?? []), r]);
  const notes = `${ui.message ? `<div class="note" role="status">${esc(ui.message)}</div>` : ""}${ui.error ? `<div class="note warnnote" role="alert">${esc(ui.error)}</div>` : ""}`;
  const form = ui.refusing ? `<div class="pt-refuse"><label for="pt-reason"><b>Why can you not take ${ui.refusing.length === 1 ? "this gift" : `these ${ui.refusing.length} gifts`}?</b></label><textarea id="pt-reason" rows="2" placeholder="For example: no capacity this month"></textarea><div class="actions"><button class="primary" data-action="pt-refuse-send">Refuse ${plural(ui.refusing.length, "gift", "gifts")}</button><button data-action="pt-refuse-cancel">Cancel</button></div></div>` : "";
  if (waiting.length === 0) return notes ? `<section class="card"><h2>Waiting for your answer</h2>${notes}</section>` : "";
  const line = ([batch, list]: [string, PartnerOutcome[]]): string => {
    const keys = keysAttr(list.map((r) => r.key));
    return `<li class="pt-batch"><span><b>${batch ? `Batch ${esc(batch)}` : "Gifts"}</b> <span class="muted">${plural(list.length, "gift", "gifts")} waiting</span></span><span class="actions"><button class="primary" data-action="pt-accept" data-keys="${keys}">Accept${list.length > 1 ? " all" : ""}</button><button data-action="pt-refuse" data-keys="${keys}">Refuse${list.length > 1 ? " all" : ""}</button></span></li>`;
  };
  return `<section class="card" aria-label="Waiting for your answer"><h2>Waiting for your answer</h2>${notes}<ul class="pt-batches">${[...byBatch.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(line).join("")}</ul>${form}</section>`;
}

// --- The gifts, followed from assigned to complete ---
export function outcomesTableHtml(rows: PartnerOutcome[]): string {
  if (rows.length === 0) return `<section class="card"><h2>Your gifts and outcomes</h2><div class="empty">No gift has been assigned to you yet. When one is, it appears here and you follow it to Complete.</div></section>`;
  const tr = (r: PartnerOutcome): string => `<tr><td>${esc(r.benefit)}<div class="muted">${esc(r.project)}</div></td><td>${r.batch ?? ""}</td><td><span class="pill ${PILL[r.standing]}">${esc(STANDING_LABEL[r.standing])}</span>${r.reason ? `<div class="muted">${esc(r.reason)}</div>` : ""}</td><td>${esc(r.funds) || `<span class="muted">Not allocated yet</span>`}</td><td>${esc(r.step) || `<span class="muted">None yet</span>`}</td></tr>`;
  return `<section class="card"><h2>Your gifts and outcomes</h2><div class="tablewrap"><table><thead><tr><th>Benefit</th><th>Batch</th><th>Where it is</th><th>Funds</th><th>Last step</th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div></section>`;
}
