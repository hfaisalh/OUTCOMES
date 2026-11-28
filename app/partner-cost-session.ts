/**
 * partner-cost-session.ts
 *
 * What it does: what happens when a partner records, changes or removes a cost (DECISIONS 280): opening the form, saving it, removing a cost after a confirm, and keeping what was typed when the server refuses.
 * Who calls it: app/partner-session.ts, for data-action values that start with "pt-cost-". Depends on: the partner answer call (api.ts) and the state in partner-state.ts.
 * Data flow: Record or Edit opens the form in partnerUi.cost. Save reads the fields (pk-...), sends cost-add or cost-set, and on success applies the fresh slice and closes the form; on a refusal the form stays with the error.
 */

import { partnerAnswer } from "./api";
import type { CostForm } from "./partner-costs";
import { partnerUi } from "./partner-state";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";

const FIELDS = ["date", "category", "amount", "currency", "projectId", "itemId", "note"] as const;
const read = (): Record<string, string> => Object.fromEntries(FIELDS.map((f) => [f, (document.getElementById(`pk-${f}`) as HTMLInputElement | null)?.value ?? ""]));

export async function costAction(action: string, el: HTMLElement, current: PartnerSlice | null, apply: (s: PartnerSlice) => void): Promise<void> {
  if (partnerUi.cost) partnerUi.cost = { ...partnerUi.cost, fresh: false };
  if (action === "pt-cost-add") partnerUi.cost = { id: "", values: {}, error: "", fresh: true } satisfies CostForm;
  else if (action === "pt-cost-edit") {
    const c = current?.costs?.find((x) => x.id === el.dataset["id"]);
    if (c) partnerUi.cost = { id: c.id, values: { date: c.date, category: c.category, amount: String(c.amount), currency: c.currency, projectId: c.projectId, itemId: c.itemId ?? "", note: c.note }, error: "", fresh: true };
  } else if (action === "pt-cost-cancel") partnerUi.cost = null;
  else if (action === "pt-cost-save" && partnerUi.cost) {
    const form = partnerUi.cost;
    const values = read();
    try {
      const { message, ...slice } = await partnerAnswer({ action: form.id ? "cost-set" : "cost-add", ...(form.id ? { id: form.id } : {}), ...values });
      apply(slice as PartnerSlice);
      partnerUi.message = message ?? "";
      partnerUi.cost = null;
    } catch (e) {
      partnerUi.cost = { ...form, values, error: e instanceof Error ? e.message : "Could not save." }; // what was typed is kept
    }
  } else if (action === "pt-cost-remove") {
    const id = el.dataset["id"] ?? "";
    // The confirm is the browser's own, so a slip does not remove a cost.
    if (!(globalThis as { confirm?: (m: string) => boolean }).confirm?.(`Remove cost ${id}? This cannot be undone.`)) return;
    try {
      const { message, ...slice } = await partnerAnswer({ action: "cost-remove", id });
      apply(slice as PartnerSlice);
      partnerUi.message = message ?? "";
    } catch (e) {
      partnerUi.error = e instanceof Error ? e.message : "Could not remove it.";
    }
  }
}

// After a redraw the person's place is put back: the form opens on its first field, and an error is read out.
export function costFocus(action: string): void {
  if (action === "pt-cost-add" || action === "pt-cost-edit") (document.getElementById("pk-date") as HTMLElement | null)?.focus();
  else if (action === "pt-cost-save" && partnerUi.cost?.error) (document.getElementById("pk-error") as HTMLElement | null)?.focus();
  else if (action === "pt-cost-save" || action === "pt-cost-cancel") (document.querySelector('[data-action="pt-cost-add"]') as HTMLElement | null)?.focus();
}
