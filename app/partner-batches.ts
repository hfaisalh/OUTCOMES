/**
 * partner-batches.ts
 *
 * What it does: the partner's list of batches (DECISIONS 254, 256). One row for each batch with a summary of where its gifts stand and, for a batch still waiting, Accept and Refuse. Each row opens (a disclosure button) to show the gifts inside it, so the page stays short and nothing is listed twice. A refusal asks for its reason where it belongs: under the gift being refused, or at the top of the batch for Refuse all.
 * Who calls it: app/partner-home.ts. Depends on: app/partner-outcomes.ts (the shared state type and colours) and modules/13-partner-portal/outcomes.ts (the rule). Pure: it takes the rows and the screen state and returns HTML. The clicks are handled in app/partner-session.ts.
 * Data flow: a button carries gift keys in data-keys (joined by "|") or a batch in data-batch. The open batches are kept in the screen state, so they stay open after an answer.
 * Each gift's benefit opens its details (partner-gift-details.ts). The batch row says the first day to answer by.
 * UX: one primary action for each batch (Accept all); a gift's own Accept and Refuse are secondary. The toggle is a real button with aria-expanded and aria-controls, at least 44px tall, with a visible focus ring; the body opens with a short fade that is switched off for reduced motion; Cancel closes the refusal form.
 */

import { pipeline, STANDING_LABEL, type PartnerOutcome, type Standing } from "../modules/13-partner-portal/outcomes";
import { shortDate } from "./dates";
import { giftDetailHtml } from "./partner-gift-details";
import { esc, PILL, plural, type PartnerUi } from "./partner-outcomes";

// --- Helpers ---
const NO_BATCH = "none";
const batchId = (r: PartnerOutcome): string => (r.batch === undefined ? NO_BATCH : String(r.batch));
const keysAttr = (rows: PartnerOutcome[]): string => esc(rows.map((r) => r.key).join("|"));
const CHEVRON = `<svg class="pb-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// The benefit's name is a button that opens the gift's details, so a partner can see what it is accepting before it answers.
const detailsToggle = (r: PartnerOutcome, open: boolean): string => `<button class="gd-toggle" data-action="pt-details" data-key="${esc(r.key)}" aria-expanded="${open}" aria-controls="gd-${esc(r.key)}">${CHEVRON}<span>${esc(r.benefit)}</span></button>`;

// One short summary of a batch, by status: "10 to answer", "8 allocated, 2 complete". Words, with a colour, never colour alone.
function summary(rows: PartnerOutcome[]): string {
  const n = pipeline(rows);
  const order: Standing[] = ["to-answer", "confirmed", "allocated", "complete", "refused"];
  return order.filter((s) => n[s] > 0).map((s) => `<span class="pill ${PILL[s]}">${n[s]} ${esc(STANDING_LABEL[s].toLowerCase())}</span>`).join(" ");
}

// The gifts inside one batch. A gift still waiting has its own Accept and Refuse, for answering some and not all.
function giftsHtml(rows: PartnerOutcome[], ui: PartnerUi): string {
  const refusing = ui.refusing;
  // Rule: a refusal of one gift opens its reason box right under that gift's row, so it is plain which gift is being refused.
  const here = refusing !== null && refusing.length === 1 ? refusing[0] : undefined;
  const tr = (r: PartnerOutcome): string => `<tr${r.key === here ? ` class="refusing"` : ""}><td>${detailsToggle(r, ui.details.includes(r.key))}<div class="muted">${esc(r.project)}</div></td>
    <td><span class="pill ${PILL[r.standing]}">${esc(STANDING_LABEL[r.standing])}</span>${r.reason ? `<div class="muted">${esc(r.reason)}</div>` : ""}</td>
    <td>${esc(r.funds) || `<span class="muted">Not allocated yet</span>`}</td><td>${esc(r.step) || `<span class="muted">None yet</span>`}</td>
    <td>${r.standing === "to-answer" ? `<div class="pb-ans"><button data-action="pt-accept" data-keys="${esc(r.key)}">Accept</button><button data-action="pt-refuse" data-keys="${esc(r.key)}">Refuse</button></div>` : ""}</td></tr>${r.detail && ui.details.includes(r.key) ? `<tr class="detail-row"><td colspan="5" id="gd-${esc(r.key)}">${giftDetailHtml(r.detail)}</td></tr>` : ""}${r.key === here ? `<tr class="refusing-form"><td colspan="5">${refuseForm(1)}</td></tr>` : ""}`;
  return `<div class="tablewrap"><table><thead><tr><th>Benefit</th><th>Where it is</th><th>Funds</th><th>Last step</th><th><span class="sr-only">Your answer</span></th></tr></thead><tbody>${rows.map(tr).join("")}</tbody></table></div>`;
}

// The refusal form, inside the batch it belongs to, with the reason box and a way out.
function refuseForm(count: number): string {
  return `<div class="pt-refuse"><label for="pt-reason"><b>Why can you not take ${count === 1 ? "this gift" : `these ${count} gifts`}?</b></label>
    <textarea id="pt-reason" rows="2" placeholder="For example: no capacity this month"></textarea>
    <div class="actions"><button class="primary" data-action="pt-refuse-send">Refuse ${plural(count, "gift", "gifts")}</button><button data-action="pt-refuse-cancel">Cancel</button></div></div>`;
}

// --- One batch ---
function batchHtml(id: string, rows: PartnerOutcome[], ui: PartnerUi): string {
  const waiting = rows.filter((r) => r.standing === "to-answer");
  const refusingHere = ui.refusing !== null && rows.some((r) => ui.refusing?.includes(r.key));
  const wholeBatchRefusal = refusingHere && (ui.refusing?.length ?? 0) > 1; // Refuse all: the reason box sits at the top of the batch, under its row
  const open = ui.open.includes(id) || refusingHere; // a refusal opens its own batch, so the form is never out of sight
  const name = id === NO_BATCH ? "Gifts without a batch" : `Batch ${id}`;
  const actions = waiting.length > 0 ? `<span class="actions"><button class="primary" data-action="pt-accept" data-keys="${keysAttr(waiting)}">Accept${waiting.length > 1 ? " all" : ""}</button><button data-action="pt-refuse" data-keys="${keysAttr(waiting)}">Refuse${waiting.length > 1 ? " all" : ""}</button></span>` : "";
  return `<li class="pb${open ? " open" : ""}">
    <div class="pb-head"><button class="pb-toggle" data-action="pt-toggle" data-batch="${esc(id)}" aria-expanded="${open}" aria-controls="pb-body-${esc(id)}">${CHEVRON}<span class="pb-name"><b>${esc(name)}</b> <span class="muted">${plural(rows.length, "gift", "gifts")}</span></span><span class="pb-sum">${summary(rows)}</span>${waiting.length > 0 ? `<span class="muted pb-due">answer by ${esc(shortDate(waiting.map((r) => r.detail?.answerBy ?? "9999").sort()[0] ?? ""))}</span>` : ""}</button>${actions}</div>
    ${open ? `<div class="pb-body${ui.lastOpened === id ? " pb-in" : ""}" id="pb-body-${esc(id)}" role="region" aria-label="Gifts in ${esc(name)}">${wholeBatchRefusal ? refuseForm(ui.refusing?.length ?? 0) : ""}${giftsHtml(rows, ui)}</div>` : ""}</li>`;
}

// --- The list: batches still waiting first, then by number ---
export function batchesHtml(rows: PartnerOutcome[], ui: PartnerUi): string {
  const notes = `${ui.message ? `<div class="note" role="status">${esc(ui.message)}</div>` : ""}${ui.error ? `<div class="note warnnote" role="alert">${esc(ui.error)}</div>` : ""}`;
  if (rows.length === 0) return `<section class="card"><h2>Your batches</h2>${notes}<div class="empty">No gift has been assigned to you yet. When one is, it appears here in a batch, and you follow it to Complete.</div></section>`;
  const by = new Map<string, PartnerOutcome[]>();
  for (const r of rows) by.set(batchId(r), [...(by.get(batchId(r)) ?? []), r]);
  const waits = (list: PartnerOutcome[]): number => list.filter((r) => r.standing === "to-answer").length;
  const ordered = [...by.entries()].sort(([a, x], [b, y]) => Number(waits(y) > 0) - Number(waits(x) > 0) || (a === NO_BATCH ? 1 : b === NO_BATCH ? -1 : Number(a) - Number(b)));
  return `<section class="card" aria-label="Your batches"><h2>Your batches</h2><p class="muted pb-hint">Open a batch to see its gifts. Accept or refuse the whole batch, or one gift at a time.</p>${notes}<ul class="pb-list">${ordered.map(([id, list]) => batchHtml(id, list, ui)).join("")}</ul></section>`;
}
