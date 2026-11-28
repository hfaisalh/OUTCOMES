/**
 * list-controls.ts
 *
 * What it does: the controls shared by the lists (DECISIONS 214, 215, 217): sorting by a column heading, the funnel that filters a column by its values, the column chooser of the Gifts list, and the filters of the Beneficiaries and Outcomes lists.
 * Who calls it: loaded by app/main.ts; its handlers register themselves on the page when it is loaded. Depends on: the shared state (state.ts), the shell's calls (shell.ts) and the list tools (table-tools.ts, list-events.ts).
 * Data flow: a click or a change updates state (the sort, the filter, the hidden columns), then asks the shell to draw again; the Gifts columns a person hides are remembered in the browser only.
 */

import { shell } from "../shell";
import { saveHiddenCols, state } from "../state";
import { GIFT_HIDDEN_DEFAULT } from "../gifts/gifts-page";
import { type BeneficiaryFilter } from "../../modules/07-beneficiaries/beneficiaries";

// Filtering a Gifts column by its values (DECISIONS 217): the funnel in a heading opens its list of values, a tick keeps a value, "Show all" or a chip's cross clears the column, and "Done" closes the list.
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest?.("[data-gkclear]")) { state.giftKeys = null; shell.draw(); return; }
  const open = t.closest?.("[data-gfilt]") as HTMLElement | null;
  const clear = t.closest?.("[data-gfclear]") as HTMLElement | null;
  if (!open && !clear) return;
  if (open) { const col = open.dataset.gfilt ?? ""; state.giftFiltOpen = state.giftFiltOpen === col ? "" : col; }
  if (clear) { const { [clear.dataset.gfclear ?? ""]: _gone, ...rest } = state.giftColFilters; state.giftColFilters = rest; }
  shell.draw();
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | null;
  const col = t?.dataset?.gfv;
  if (!t || !col) return;
  const cur = state.giftColFilters[col] ?? [];
  state.giftColFilters = { ...state.giftColFilters, [col]: t.checked ? [...new Set([...cur, t.value])] : cur.filter((x) => x !== t.value) };
  shell.draw();
});
// The column chooser of the Gifts list (DECISIONS 215): a button opens it, a tick shows or hides a column, and one link goes back to the usual columns.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-gcols]") as HTMLElement | null;
  if (!b?.dataset?.gcols) return;
  if (b.dataset.gcols === "toggle") state.giftColsOpen = !state.giftColsOpen;
  else { state.giftHidden = [...GIFT_HIDDEN_DEFAULT]; saveHiddenCols(state.giftHidden); }
  shell.draw();
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | null;
  const id = t?.dataset?.gcol;
  if (!t || !id) return;
  state.giftHidden = t.checked ? state.giftHidden.filter((x) => x !== id) : [...new Set([...state.giftHidden, id])];
  saveHiddenCols(state.giftHidden);
  shell.draw();
});
// A click on a heading of the Gifts list sorts by it; a second click reverses it (DECISIONS 214).
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-gsort]") as HTMLElement | null;
  if (!b?.dataset?.gsort) return;
  const key = b.dataset.gsort;
  state.giftSort = state.giftSort.key === key ? { key, dir: state.giftSort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" as const };
  shell.draw();
});
// A click on a column heading of the Beneficiaries list sorts by it; a second click reverses it.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-regsort]") as HTMLElement | null;
  if (!b?.dataset?.regsort) return;
  const key = b.dataset.regsort;
  state.registerSort = state.registerSort.key === key ? { key, dir: state.registerSort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" as const };
  shell.draw();
});
// A click on a heading of the Outcomes list sorts by it; a second click reverses it.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-orsort]") as HTMLElement | null;
  if (!b?.dataset?.orsort) return;
  const key = b.dataset.orsort;
  state.outcomeRecSort = state.outcomeRecSort.key === key ? { key, dir: state.outcomeRecSort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" as const };
  shell.draw();
});
// The filters on the Outcomes list.
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement | null;
  if (!t?.dataset?.orf) return;
  state.outcomeRecFilter = { ...state.outcomeRecFilter, [t.dataset.orf]: t.value } as typeof state.outcomeRecFilter;
  shell.draw();
});
// The filters on the Beneficiaries page.
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement | null;
  if (!t?.dataset?.regf) return;
  state.registerFilter = { ...state.registerFilter, [t.dataset.regf]: t.value } as BeneficiaryFilter;
  shell.draw();
});
