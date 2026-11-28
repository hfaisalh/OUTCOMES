/**
 * rules-steps.ts
 *
 * What it does: the "Order of steps" control on the Automation rules page (DECISIONS 293): the steps a gift tries when it looks for a place, as a list that can be dragged into another order, moved with arrows, and switched on and off. Two steps are fixed and shown locked.
 * Who calls it: app/rules-page.ts draws `stepsHtml`; app/main.ts calls `initStepOrder` once so the list reacts. Depends on: the order rules (modules/09-allocation/order.ts) and the switch (switch.ts).
 * Data flow: a drag, an arrow or a switch builds the new list with the pure `reorder` and `setStepOn`, and sends { action: "alloc-steps", steps }; the server saves it and answers with the list, and the page redraws.
 * UX: dragging is never the only way: every step has Move up and Move down buttons that work from the keyboard (WCAG dragging alternative); the grip shows what can be dragged; the row being dragged is dimmed and the place it will land is lined; the two fixed steps cannot be moved and say why; the list is announced as a list with its order.
 */

import { reorder, setStepOn, STEP_TEXT, type Step, type StepId } from "../modules/09-allocation/order";
import { esc } from "./pages";
import { switchHtml } from "./switch";

const GRIP = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><g fill="currentColor"><circle cx="5.5" cy="4" r="1.3"/><circle cx="10.5" cy="4" r="1.3"/><circle cx="5.5" cy="8" r="1.3"/><circle cx="10.5" cy="8" r="1.3"/><circle cx="5.5" cy="12" r="1.3"/><circle cx="10.5" cy="12" r="1.3"/></g></svg>`;
const LOCK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const ARROW = (up: boolean): string => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="${up ? "M3.5 10 8 5.5 12.5 10" : "M3.5 6 8 10.5 12.5 6"}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// --- The list ---
export function stepsHtml(steps: Step[]): string {
  const fixed = (n: string, text: string, why: string): string => `<li class="ru-step ru-fixed"><span class="ru-lock" title="${esc(why)}">${LOCK}</span><span class="ru-sbody"><b>${esc(text)}</b><span class="muted">${esc(why)}</span></span></li>`;
  const row = (s: Step, i: number): string => `<li class="ru-step${s.on ? "" : " ru-off"}" draggable="true" data-step="${s.id}" data-index="${i}"><span class="ru-grip" title="Drag to change the order">${GRIP}</span>
    <span class="ru-sbody"><b>${esc(STEP_TEXT[s.id].name)}</b><span class="muted">${esc(STEP_TEXT[s.id].does)}</span></span>
    <span class="ru-sctl"><button type="button" class="ru-mv" data-step-move="up" data-step-id="${s.id}" aria-label="Move ${esc(STEP_TEXT[s.id].name)} up"${i === 0 ? " disabled" : ""}>${ARROW(true)}</button><button type="button" class="ru-mv" data-step-move="down" data-step-id="${s.id}" aria-label="Move ${esc(STEP_TEXT[s.id].name)} down"${i === steps.length - 1 ? " disabled" : ""}>${ARROW(false)}</button>${switchHtml({ label: `Use the step: ${STEP_TEXT[s.id].name}`, on: s.on, attrs: `data-step-on="${s.id}"`, compact: true })}</span></li>`;
  return `<h3>Order of steps</h3><p class="muted ru-hint">A gift tries these in turn and takes the first place that wins. Drag a step, or use the arrows, to change the order. Switch a step off to skip it.</p>
    <ol class="ru-steps" aria-label="Allocation order, first to last">${fixed("", "A plan that runs again keeps its previous beneficiary", "Fixed: always first")}${steps.map(row).join("")}${fixed("", "The earliest enrolled", "Fixed: always last, so the result is always the same")}</ol>`;
}

// --- Behaviour ---
export function initStepOrder(current: () => Step[], send: (steps: Step[]) => void): void {
  let dragging: StepId | null = null;
  const stepOf = (e: Event): HTMLElement | null => ((e.target as HTMLElement | null)?.closest?.("[data-step]") as HTMLElement | null);
  const clear = (): void => document.querySelectorAll(".ru-step.ru-over,.ru-step.ru-drag").forEach((x) => x.classList.remove("ru-over", "ru-drag"));
  document.addEventListener("dragstart", (e) => {
    const li = stepOf(e);
    if (!li) return;
    dragging = li.dataset["step"] as StepId;
    li.classList.add("ru-drag");
    e.dataTransfer?.setData("text/plain", `step:${dragging}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", (e) => {
    const li = stepOf(e);
    if (!li || dragging === null) return;
    e.preventDefault();
    clear();
    li.classList.add("ru-over");
  });
  document.addEventListener("drop", (e) => {
    const li = stepOf(e);
    if (!li || dragging === null) return;
    e.preventDefault();
    const to = Number(li.dataset["index"]);
    const id = dragging;
    dragging = null;
    clear();
    const next = reorder(current(), id, to);
    if (next !== current()) send(next);
  });
  document.addEventListener("dragend", () => { dragging = null; clear(); });
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement | null)?.closest?.("[data-step-move]") as HTMLElement | null;
    if (!b) return;
    const id = b.dataset["stepId"] as StepId;
    const at = current().findIndex((s) => s.id === id);
    const next = reorder(current(), id, at + (b.dataset["stepMove"] === "up" ? -1 : 1));
    if (next !== current()) send(next);
  });
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.dataset?.["stepOn"] === undefined) return;
    send(setStepOn(current(), t.dataset["stepOn"] as StepId, t.checked));
  });
}
