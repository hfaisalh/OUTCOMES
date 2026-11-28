/**
 * partner-session.ts
 *
 * What it does: what happens when a partner presses Accept, Refuse, Send or Cancel on its own screen (DECISIONS 254): it sends the answer to the server, shows the server's own words back (or the error), and keeps the small state of the refusal form.
 * Who calls it: app/main.ts, for any click whose action starts with "pt-". Depends on: api.ts (partnerAnswer) and the partner slice type. The screen itself is drawn by app/partner-home.ts from the slice and this state.
 * Data flow: a click carries the gift keys in data-keys, joined by "|". One key is a single answer, several are a batch. The server answers with the partner's fresh slice and a message.
 */

import { costAction, costFocus } from "./partner-cost-session";
import { partnerAnswer, viewAs } from "./api";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import { csvAction } from "./partner-csv-session";
import { partnerUi } from "./partner-state";
import { SIMILAR } from "../modules/13-partner-portal/entry";

// --- State of the screen: the open refusal form and the last message or error ---
export { partnerUi };

const keysOf = (el: HTMLElement): string[] => (el.dataset["keys"] ?? "").split("|").filter((k) => k !== "");
const body = (yes: boolean, keys: string[], reason: string): Record<string, unknown> =>
  keys.length === 1 ? { action: yes ? "cnf-confirm" : "cnf-reject", key: keys[0], reason } : { action: yes ? "cnf-confirm-batch" : "cnf-reject-batch", keys, reason };

// --- Send an answer, then show what the server said ---
async function send(request: Record<string, unknown>, apply: (s: PartnerSlice) => void): Promise<void> {
  try {
    const { message, ...slice } = await partnerAnswer(request);
    apply(slice as PartnerSlice);
    partnerUi.message = message ?? "";
    partnerUi.error = "";
    partnerUi.refusing = null;
  } catch (e) {
    partnerUi.error = e instanceof Error ? e.message : "Could not save the answer.";
  }
}

export async function handlePartnerAction(action: string, el: HTMLElement, current: PartnerSlice | null, apply: (s: PartnerSlice) => void, redraw: () => void): Promise<void> {
  partnerUi.message = "";
  partnerUi.lastOpened = "";
  if (partnerUi.form) partnerUi.form = { ...partnerUi.form, fresh: false }; // the window eases in only when it opens
  if (partnerUi.csv) partnerUi.csv = { ...partnerUi.csv, fresh: false };
  const viaKeyboard = el.matches?.(":focus-visible") ?? false; // only a keyboard user gets the focus ring put back, so a mouse click leaves no outline behind
  if (action === "pt-toggle") {
    const id = el.dataset["batch"] ?? "";
    const wasOpen = partnerUi.open.includes(id);
    partnerUi.open = wasOpen ? partnerUi.open.filter((b) => b !== id) : [...partnerUi.open, id];
    if (!wasOpen) partnerUi.lastOpened = id; // only the batch just opened fades in, not every one on each redraw
  } else if (action.startsWith("pt-cost-")) {
    await costAction(action, el, current, apply);
  } else if (action.startsWith("pt-csv-")) {
    await csvAction(action, apply, el, current?.giftProjects ?? []);
  } else if (action === "pt-add") {
    partnerUi.form = { id: "", values: {}, error: "", similar: false, fresh: true };
  } else if (action === "pt-edit") {
    const b = current?.beneficiaries.find((x) => x.id === el.dataset["id"]);
    if (b) partnerUi.form = { id: b.id, values: valuesOf(b), error: "", similar: false, fresh: true };
  } else if (action === "pt-form-cancel") {
    partnerUi.form = null;
  } else if (action === "pt-form-save") {
    await saveForm(apply);
  } else if (action === "pt-details") {
    const key = el.dataset["key"] ?? "";
    partnerUi.details = partnerUi.details.includes(key) ? partnerUi.details.filter((k) => k !== key) : [...partnerUi.details, key];
  } else if (action === "pt-accept") await send(body(true, keysOf(el), ""), apply);
  else if (action === "pt-refuse") { partnerUi.refusing = keysOf(el); partnerUi.error = ""; }
  else if (action === "pt-refuse-cancel") { partnerUi.refusing = null; partnerUi.error = ""; }
  else if (action === "pt-refuse-send") {
    const reason = (document.getElementById("pt-reason") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    if (reason === "") partnerUi.error = "Say why you cannot take it, so MWF can choose another partner.";
    else await send(body(false, partnerUi.refusing ?? [], reason), apply);
  }
  redraw();
  restoreFocus(action, el, viaKeyboard);
  costFocus(action);
}

// --- The beneficiary form: what is shown when editing, and what is sent on Save ---
const FORM_FIELDS = ["name", "dob", "gender", "placeOfBirth", "idNumber", "fatherStatus", "motherStatus", "guardian", "guardianRelation", "area", "locationId", "partnerRef", "targetProjectId"] as const;
const valuesOf = (b: object): Record<string, string> => Object.fromEntries(FORM_FIELDS.map((f) => { const v = (b as Record<string, unknown>)[f]; return [f, typeof v === "string" ? v : ""]; }));
const readForm = (): Record<string, string> => Object.fromEntries(FORM_FIELDS.map((f) => [f, (document.getElementById(`pe-${f}`) as HTMLInputElement | null)?.value ?? ""]));

async function saveForm(apply: (s: PartnerSlice) => void): Promise<void> {
  const form = partnerUi.form;
  if (!form) return;
  const values = readForm();
  let location: unknown; // the place chosen from the list, if any (DECISIONS 274)
  try { const raw = (document.getElementById("pe-location") as HTMLInputElement | null)?.value ?? ""; location = raw === "" ? undefined : JSON.parse(raw); } catch { location = undefined; }
  const allowSimilar = (document.getElementById("pe-different") as HTMLInputElement | null)?.checked === true;
  try {
    const { message, ...slice } = await partnerAnswer({ action: form.id ? "ben-set" : "ben-add", ...(form.id ? { id: form.id } : {}), ...values, ...(location ? { location } : {}), allowSimilar });
    apply(slice as PartnerSlice);
    partnerUi.message = message ?? "";
    partnerUi.form = null;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not save.";
    partnerUi.form = { ...form, values, error, similar: error.startsWith(SIMILAR) }; // what was typed is kept, and the error is shown under the form
  }
}

// A redraw replaces the page, so keyboard focus is put back where the person was: the batch button they pressed, or the reason box they just opened.
function restoreFocus(action: string, el: HTMLElement, viaKeyboard: boolean): void {
  if (action === "pt-toggle" && viaKeyboard) (document.querySelector(`[data-action="pt-toggle"][data-batch="${el.dataset["batch"] ?? ""}"]`) as HTMLElement | null)?.focus();
  else if (action === "pt-details" && viaKeyboard) (document.querySelector(`[data-action="pt-details"][data-key="${el.dataset["key"] ?? ""}"]`) as HTMLElement | null)?.focus();
  else if (action === "pt-csv-open") (document.getElementById("pc-file") as HTMLElement | null)?.focus(); // the window opens ready for the file
  else if (action === "pt-csv-send") (document.getElementById("pc-summary") as HTMLElement | null)?.focus(); // the result is read out
  else if (action === "pt-csv-close" && viaKeyboard) (document.querySelector('[data-action="pt-csv-open"]') as HTMLElement | null)?.focus();
  else if (action === "pt-add" || action === "pt-edit") (document.getElementById("pe-name") as HTMLElement | null)?.focus(); // the form opens ready to type
  else if (action === "pt-form-save" && partnerUi.form?.error) (document.getElementById("pe-error") as HTMLElement | null)?.focus(); // the error is read out and in view
  else if ((action === "pt-form-save" || action === "pt-form-cancel") && viaKeyboard) (document.querySelector('[data-action="pt-add"]') as HTMLElement | null)?.focus();
  else if (action === "pt-refuse") (document.getElementById("pt-reason") as HTMLElement | null)?.focus();
}

// --- Switch between the staff view and a partner's view (testing, DECISIONS 255) ---
// The server gives a new session for the other view, so the page simply reloads into it.
export async function switchView(partnerId: string): Promise<void> {
  try {
    await viewAs(partnerId);
    (globalThis as { location?: { assign(u: string): void } }).location?.assign("/app/");
  } catch (e) {
    partnerUi.error = e instanceof Error ? e.message : "Could not switch the view.";
    (globalThis as { alert?: (m: string) => void }).alert?.(partnerUi.error);
  }
}

// --- The window's keys: Escape closes it, and Tab stays inside it (a dialog must not let focus wander to the page behind) ---
export function partnerKeys(e: KeyboardEvent, redraw: () => void): void {
  if (!partnerUi.form && !partnerUi.csv && !partnerUi.cost) return;
  if (e.key === "Escape") {
    if (partnerUi.csv?.busy) return; // not while rows are being added
    partnerUi.form = null;
    partnerUi.csv = null;
    partnerUi.cost = null;
    redraw();
    (document.querySelector('[data-action="pt-add"]') as HTMLElement | null)?.focus();
  } else if (e.key === "Tab") {
    const items = [...(document.querySelectorAll('.pf-overlay button:not([disabled]), .pf-overlay input, .pf-overlay select, .pf-overlay textarea') as unknown as HTMLElement[])];
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    const now = document.activeElement;
    if (e.shiftKey && now === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && now === last) { e.preventDefault(); first.focus(); }
  }
}
