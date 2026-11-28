/**
 * gift-actions.ts
 *
 * What it does: the small changes a person makes to a gift's work order from the Gifts list and its window: exclude or restore, the months a payment covers, the months of a one-off gift, mark for manual allocation, the parts of a payment, and "I checked the notes". Each one is done on the server when signed in and in the browser in the demo, then the page is redrawn. It also holds the click and change handlers of the buttons that start them.
 * Who calls it: app/main.ts, once, at set-up (installGiftActions), which hands back applyExclusion for the window's bulk buttons. Depends on: app/shared/api.ts for the server calls and the rules in modules/04b-commitments and 01c-crm-connector (the same rules the server runs).
 * Data flow: a button click -> an apply function -> the server (live) or the rule on state.workOrders (demo) -> state.message -> draw().
 */
import { loadAttention, setCovers as setCoversApi, setExcluded, setLooked as setLookedApi, setManualApi, setParts as setPartsApi, setPeriodsApi } from "../shared/api";
import { setCovers, setLooked, setParts, setPeriods } from "../../modules/04b-commitments/catch-up";
import { setManual } from "../../modules/04b-commitments/parts";
import { excludeWorkOrder, restoreWorkOrder, type ReviewItem, type WorkOrder } from "../../modules/01c-crm-connector/work-orders";

// --- What this file needs of the app ---
// Only the fields it reads or sets. The app's own state has more, and satisfies this shape.
export interface GiftActionState {
  live: () => boolean;
  workOrders: WorkOrder[];
  review: ReviewItem[];
  selected: string[];
  message: string;
  attention: Awaited<ReturnType<typeof loadAttention>>["items"];
}
export interface GiftActionDeps { state: GiftActionState; draw: () => void; reloadLive: () => Promise<void>; deriveDemoParts: () => void }

export function installGiftActions({ state, draw, reloadLive, deriveDemoParts }: GiftActionDeps): { applyExclusion: (keys: string[], restoring: boolean, reason: string) => Promise<void> } {
  // Applies an exclude or restore to the chosen work orders, on the server when live, in the browser in the demo.
  async function applyExclusion(keys: string[], restoring: boolean, reason: string): Promise<void> {
    const word = restoring ? "Restored" : "Excluded";
    try {
      if (state.live()) {
        const r = await setExcluded(keys, restoring ? "restore" : "exclude", reason);
        const back = new Map(r.workOrders.map((w) => [w.key, w]));
        state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
        if (!restoring) state.review = state.review.filter((x) => !back.has(x.key));
        state.message = `${word} ${r.workOrders.length}.${r.skipped ? ` Skipped ${r.skipped}: ${r.firstError ?? ""}` : ""}`;
        await loadAttention().then((a) => (state.attention = a.items)).catch(() => undefined);
      } else {
        let done = 0;
        let firstError = "";
        state.workOrders = state.workOrders.map((w) => {
          if (!keys.includes(w.key)) return w;
          const r = restoring ? restoreWorkOrder(w) : excludeWorkOrder(w, reason, "Sample User", new Date().toISOString());
          if ("order" in r) { done++; return r.order; }
          firstError ||= r.error;
          return w;
        });
        state.message = `${word} ${done}.${keys.length - done ? ` Skipped ${keys.length - done}: ${firstError}` : ""}`;
      }
      state.selected = state.selected.filter((k) => !keys.includes(k));
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }

  // Says how many instalments a payment covers (DECISIONS 84), on the server when live, in the browser in the demo.
  async function applyCovers(key: string, covers: number): Promise<void> {
    try {
      if (state.live()) {
        const r = await setCoversApi(key, covers);
        const back = new Map(r.workOrders.map((w) => [w.key, w]));
        state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
      } else {
        state.workOrders = state.workOrders.map((w) => {
          if (w.key !== key) return w;
          const r = setCovers(w, covers);
          return "order" in r ? r.order : w;
        });
      }
      state.message = covers === 1 ? "Marked as a normal payment." : `Marked as covering ${covers} instalments.`;
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }
  // The calendar icon on a payment: choose the months, then save (DECISIONS 118).
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-months-save]") as HTMLElement | null;
    if (!b) return;
    const key = b.dataset.monthsSave ?? "";
    void applyCovers(key, Number((document.getElementById(`pm-select-${key}`) as HTMLSelectElement | null)?.value ?? "1"));
  });
  // "N parts a month": the donor raised the gift, so it is not a catch-up. The payment is marked a single month and its parts are set (DECISIONS 118).
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-increase]") as HTMLElement | null;
    if (!b) return;
    const key = b.dataset.increase ?? "";
    void applyCovers(key, 1).then(() => applyParts([key], Number(b.dataset.n)));
  });
  // The months a one-off payment covers (DECISIONS 126). The server then works the parts out again, so the list is read again.
  async function applyPeriods(keys: string[], periods: number): Promise<void> {
    try {
      if (state.live()) {
        await setPeriodsApi(keys, periods);
        await reloadLive();
      } else {
        state.workOrders = state.workOrders.map((w) => {
          if (!keys.includes(w.key)) return w;
          const r = setPeriods(w, periods);
          return "order" in r ? r.order : w;
        });
        deriveDemoParts();
      }
      state.message = periods === 0 ? "Back to what the CRM says." : `Saved: ${periods} month${periods === 1 ? "" : "s"}.`;
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const save = t.closest?.("[data-periods-save]") as HTMLElement | null;
    if (save) { const key = save.dataset.periodsSave ?? ""; return void applyPeriods([key], Number((document.getElementById(`pm-select-${key}`) as HTMLSelectElement | null)?.value ?? "1")); }
    const back = t.closest?.("[data-periods-set]") as HTMLElement | null;
    if (back) return void applyPeriods([back.dataset.periodsSet ?? ""], Number(back.dataset.n));
  });
  // Marks a gift for manual allocation, or takes the mark back (DECISIONS 113).
  async function applyManual(keys: string[], on: boolean): Promise<void> {
    try {
      if (state.live()) {
        const r = await setManualApi(keys, on);
        const back = new Map(r.workOrders.map((w) => [w.key, w]));
        state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
      } else {
        state.workOrders = state.workOrders.map((w) => {
          if (!keys.includes(w.key)) return w;
          const r = setManual(w, on);
          return "order" in r ? r.order : w;
        });
      }
      state.message = on ? "Marked for manual allocation." : "Back to automatic.";
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-manual-set]") as HTMLElement | null;
    if (b) void applyManual((b.dataset.keys ?? b.dataset.manualSet ?? "").split(" ").filter((k) => k !== ""), b.dataset.on === "1");
  });
  // Sets the parts of a payment when its quantity looked wrong, or confirms the CRM's (DECISIONS 87).
  async function applyParts(keys: string[], parts: number): Promise<void> {
    try {
      if (state.live()) {
        const r = await setPartsApi(keys, parts);
        const back = new Map(r.workOrders.map((w) => [w.key, w]));
        state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
      } else {
        state.workOrders = state.workOrders.map((w) => {
          if (!keys.includes(w.key)) return w;
          const r = setParts(w, parts);
          return "order" in r ? r.order : w;
        });
      }
      state.message = parts === 0 ? "Back to what the price says." : `Saved: ${parts} part${parts === 1 ? "" : "s"}.`;
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }
  // Choose the parts in the drop-down, then Save (DECISIONS 116).
  document.addEventListener("click", (e) => {
    const sv = (e.target as HTMLElement).closest?.("[data-parts-save]") as HTMLElement | null;
    if (!sv) return;
    const n = Number((document.getElementById("gp-select") as HTMLSelectElement | null)?.value ?? "");
    void applyParts((sv.dataset.keys ?? "").split(" ").filter((k) => k !== ""), n);
  });
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-parts-set]") as HTMLElement | null;
    if (b) void applyParts((b.dataset.keys ?? b.dataset.partsSet ?? "").split(" ").filter((k) => k !== ""), Number(b.dataset.n));
  });
  // A person says they checked what the notes of a gift say (DECISIONS 86), or reopens it.
  async function applyLooked(key: string, looked: string): Promise<void> {
    try {
      if (state.live()) {
        const r = await setLookedApi(key, looked);
        const back = new Map(r.workOrders.map((w) => [w.key, w]));
        state.workOrders = state.workOrders.map((w) => back.get(w.key) ?? w);
      } else {
        state.workOrders = state.workOrders.map((w) => {
          if (w.key !== key) return w;
          const r = setLooked(w, looked);
          return "order" in r ? r.order : w;
        });
      }
      state.message = looked === "" ? "Reopened." : "Marked as checked.";
    } catch (e) {
      state.message = e instanceof Error ? e.message : "That did not work.";
    }
    draw();
  }
  document.addEventListener("click", (e) => {
    const l = (e.target as HTMLElement).closest("[data-looked]") as HTMLElement | null;
    if (l) void applyLooked(l.dataset.looked as string, l.dataset.text ?? "");
  });
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("[data-covers-set]") as HTMLElement | null;
    if (b) void applyCovers(b.dataset.coversSet as string, Number(b.dataset.n));
  });
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.dataset?.coversKey !== undefined) void applyCovers(t.dataset.coversKey, Number(t.value));
  });
  return { applyExclusion };
}
