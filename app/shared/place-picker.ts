/**
 * place-picker.ts
 *
 * What it does: the Area field with place suggestions (DECISIONS 274). A person types a village or district; matching places appear under the field; choosing one fills the field with the place's full name and remembers which place it is. If nothing fits, what was typed is kept as an unchecked area.
 * Who calls it: the partner form (partner-entry-form.ts) draws the field with `placeFieldHtml`; main.ts calls `initPlacePicker` once so the field reacts. Depends on: the pure place rules (modules/14-locations/locations.ts).
 * Data flow: typing -> a short wait -> `search(text)` (a request for the server's place search) -> the list under the field. A choice is written to two hidden fields (pe-locationId, pe-location) that the form's Save reads.
 * UX: a combobox (role, aria-expanded, aria-controls, listbox options), Up and Down move through the list, Enter chooses, Esc closes the list only (not the window), the list sits under the field and never moves the form, a status line says whether the place is checked, and the field is 44px on touch like the others.
 */

import { label, type Place } from "../../modules/14-locations/locations";

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

// --- The field ---
export function placeFieldHtml(id: string, text: string, placeId: string, hint: string, title = "Area"): string {
  return `<label class="pe-f pl" id="${id}-wrap"><span class="pe-l">${esc(title)}</span>
    <input id="${id}" class="pl-input" value="${esc(text)}" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" aria-describedby="${id}-status">
    <ul class="pl-list" id="${id}-list" role="listbox" aria-label="Places that match" hidden></ul>
    <input type="hidden" id="pe-locationId" value="${esc(placeId)}"><input type="hidden" id="pe-location" value="">
    <span class="muted pe-hint pl-status" id="${id}-status" aria-live="polite">${esc(statusText(placeId !== "", text, hint))}</span></label>`;
}
const statusText = (checked: boolean, typed: string, hint: string): string => (checked ? "Checked place." : typed.trim() === "" ? hint : "Not a checked place yet. Choose one from the list, or keep what you typed.");

// --- The list ---
export const optionsHtml = (id: string, places: Place[]): string => places.map((p, i) => `<li role="option" id="${id}-o${i}" class="pl-opt" data-i="${i}" aria-selected="false"><b>${esc(p.name)}</b> <span class="muted">${esc(label({ name: "", district: p.district, region: p.region, country: p.country }).replace(/^, /, ""))}</span></li>`).join("");

// --- Behaviour ---
let timer: ReturnType<typeof setTimeout> | undefined;
let shown: Place[] = [];
let active = -1;
const WAIT_MS = 350;

function setStatus(input: HTMLInputElement, checked: boolean): void {
  const s = document.getElementById(`${input.id}-status`);
  if (s) s.textContent = statusText(checked, input.value, "A village or district, not a full address.");
}
function show(input: HTMLInputElement, places: Place[]): void {
  const list = document.getElementById(`${input.id}-list`) as HTMLElement;
  shown = places;
  active = -1;
  list.innerHTML = optionsHtml(input.id, places);
  list.hidden = places.length === 0;
  input.setAttribute("aria-expanded", String(places.length > 0));
}
function choose(input: HTMLInputElement, p: Place): void {
  input.value = label(p);
  (document.getElementById("pe-locationId") as HTMLInputElement).value = p.id;
  (document.getElementById("pe-location") as HTMLInputElement).value = JSON.stringify(p);
  show(input, []);
  setStatus(input, true);
}
function mark(input: HTMLInputElement, next: number): void {
  active = (next + shown.length) % shown.length;
  document.querySelectorAll(`#${input.id}-list .pl-opt`).forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
  input.setAttribute("aria-activedescendant", `${input.id}-o${active}`);
}

// `search` asks the server for places. Wired once for the whole page, by delegation, because the form is redrawn.
export function initPlacePicker(search: (text: string) => Promise<Place[]>): void {
  document.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement | null;
    if (!input?.classList?.contains("pl-input")) return;
    // Typing over a chosen place un-checks it: the text no longer says which place it was.
    (document.getElementById("pe-locationId") as HTMLInputElement).value = "";
    (document.getElementById("pe-location") as HTMLInputElement).value = "";
    setStatus(input, false);
    clearTimeout(timer);
    if (input.value.trim().length < 3) return show(input, []);
    timer = setTimeout(() => { const asked = input.value; void search(asked).then((p) => { if (input.value === asked) show(input, p); }); }, WAIT_MS);
  });
  document.addEventListener("keydown", (e) => {
    const input = e.target as HTMLInputElement | null;
    if (!input?.classList?.contains("pl-input") || shown.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); mark(input, active + (e.key === "ArrowDown" ? 1 : -1)); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(input, shown[active] as Place); }
    else if (e.key === "Escape") { e.stopPropagation(); show(input, []); } // closes the list, not the window
  }, true);
  document.addEventListener("mousedown", (e) => {
    const opt = (e.target as HTMLElement | null)?.closest?.(".pl-opt") as HTMLElement | null;
    const input = document.querySelector(".pl-input") as HTMLInputElement | null;
    if (opt && input) { e.preventDefault(); choose(input, shown[Number(opt.dataset["i"])] as Place); }
  });
}
