/**
 * partner-session.ts
 *
 * What it does: what happens when a partner presses Accept, Refuse, Send or Cancel on its own screen (DECISIONS 254): it sends the answer to the server, shows the server's own words back (or the error), and keeps the small state of the refusal form.
 * Who calls it: app/main.ts, for any click whose action starts with "pt-". Depends on: api.ts (partnerAnswer) and the partner slice type. The screen itself is drawn by app/partner-home.ts from the slice and this state.
 * Data flow: a click carries the gift keys in data-keys, joined by "|". One key is a single answer, several are a batch. The server answers with the partner's fresh slice and a message.
 */

import { partnerAnswer, viewAs } from "./api";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import type { PartnerUi } from "./partner-outcomes";

// --- State of the screen: the open refusal form and the last message or error ---
export const partnerUi: PartnerUi = { refusing: null, message: "", error: "" };

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

export async function handlePartnerAction(action: string, el: HTMLElement, apply: (s: PartnerSlice) => void, redraw: () => void): Promise<void> {
  partnerUi.message = "";
  if (action === "pt-accept") await send(body(true, keysOf(el), ""), apply);
  else if (action === "pt-refuse") { partnerUi.refusing = keysOf(el); partnerUi.error = ""; }
  else if (action === "pt-refuse-cancel") { partnerUi.refusing = null; partnerUi.error = ""; }
  else if (action === "pt-refuse-send") {
    const reason = (document.getElementById("pt-reason") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    if (reason === "") partnerUi.error = "Say why you cannot take it, so MWF can choose another partner.";
    else await send(body(false, partnerUi.refusing ?? [], reason), apply);
  }
  redraw();
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
