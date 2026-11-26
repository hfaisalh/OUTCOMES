/**
 * list-events.ts
 *
 * What it does: the clicks, changes and keys of the lists' shared tools (DECISIONS 222, 224, 226, 229, 231, 232): sort by a heading, filter by value, choose columns, the tiles that filter a page, the drop-down panel (placed under its button, closed by a click outside or Escape, searched as you type), and the buttons of the Confirmation and Progress pages.
 * Who calls it: app/main.ts, once, at the end of its set-up, handing in the state, the redraw and the server request. Depends on: nothing of main.ts, only the shape of the state it is given (ListEventState), so it can be read and tested on its own.
 * It changes the state it is given and asks for a redraw. The rules these buttons trigger live in the modules (confirmation, progress), never here.
 */
import type { TableToolsState } from "./table-tools";
import type { ConfirmFilter } from "./confirmation-page";

// --- What this file needs of the app ---
// Only the fields it reads or sets. The app's own state has more, and satisfies this shape.
export interface ListEventState {
  tt: TableToolsState;
  giftFiltOpen: string;
  giftColsOpen: boolean;
  registerFilter: { show?: string };
  outcomeRecFilter: { show: string };
  assignFilter: string;
  allocFilter: string;
  prgFilter: string;
  cnfFilter: ConfirmFilter;
}
export interface ListEventDeps { state: ListEventState; draw: () => void; outcomeChange: (body: Record<string, unknown>) => Promise<void> }

// --- The drop-down panel sits under the button that opened it ---
export function placePopover(): void {
  const pop = document.querySelector?.(".vpop") as HTMLElement | null;
  if (!pop) return;
  const anchor = (document.querySelector?.('.fbtn[aria-pressed="true"], [aria-expanded="true"][data-gcols], [aria-expanded="true"][data-tt-cols]') ?? null) as HTMLElement | null;
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth || 240;
  pop.style.top = `${Math.round(r.bottom + 4)}px`;
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)))}px`;
}

export function installListEvents({ state, draw, outcomeChange }: ListEventDeps): void {
  const closePopover = (): boolean => {
    if (!document.querySelector?.(".vpop")) return false;
    state.giftFiltOpen = ""; state.giftColsOpen = false; state.tt.open = null;
    return true;
  };

  // --- Tools on every list: sort by a heading, filter by value, choose columns ---
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const at = (a: string): [string, number] | null => { const el = t.closest(`[${a}]`) as HTMLElement | null; if (!el) return null; const [k, c] = (el.getAttribute(a) ?? "").split("|"); return [k ?? "", Number(c ?? 0)]; };
    const tt = state.tt;
    const sort = at("data-tt-sort");
    if (sort) { const [k, col] = sort; const cur = tt.sort[k]; tt.sort[k] = cur?.col === col ? (cur.dir === "asc" ? { col, dir: "desc" } : undefined) : { col, dir: "asc" }; return draw(); }
    const filt = at("data-tt-filter");
    if (filt) { const [k, col] = filt; tt.open = tt.open?.kind === "filter" && tt.open.key === k && tt.open.col === col ? null : { key: k, kind: "filter", col }; return draw(); }
    const cols = t.closest("[data-tt-cols]") as HTMLElement | null;
    if (cols) { const k = cols.dataset.ttCols ?? ""; tt.open = tt.open?.kind === "cols" && tt.open.key === k ? null : { key: k, kind: "cols", col: 0 }; return draw(); }
    const clr = at("data-tt-clearcol");
    if (clr) { const [k, col] = clr; (tt.filters[k] ??= {})[col] = []; return draw(); }
    const reset = t.closest("[data-tt-reset]") as HTMLElement | null;
    if (reset) { const k = reset.dataset.ttReset ?? ""; delete tt.filters[k]; delete tt.sort[k]; delete tt.hidden[k]; return draw(); }
    if (t.closest("[data-tt-done]")) { tt.open = null; return draw(); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    const v = t.getAttribute?.("data-tt-val"), c = t.getAttribute?.("data-tt-col");
    if (v) { const [k, col] = v.split("|"); const f = ((state.tt.filters[k!] ??= {})); const cur = f[Number(col)] ?? []; f[Number(col)] = t.checked ? [...cur, t.value] : cur.filter((x) => x !== t.value); return draw(); }
    if (c) { const [k, col] = c.split("|"); const h = state.tt.hidden[k!] ?? []; state.tt.hidden[k!] = t.checked ? h.filter((x) => x !== Number(col)) : [...h, Number(col)]; return draw(); }
  });

  // --- Tiles that choose what a page shows (pressing the same tile again shows all) ---
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-regshow]") as HTMLElement | null;
    if (!b) return;
    const mode = b.dataset.regshow ?? "";
    state.registerFilter = { ...state.registerFilter, show: state.registerFilter.show === mode ? "" : mode };
    draw();
  });

  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-orshow]") as HTMLElement | null;
    if (!b) return;
    const mode = (b.dataset.orshow ?? "") as string;
    state.outcomeRecFilter = { ...state.outcomeRecFilter, show: state.outcomeRecFilter.show === mode ? "" : mode };
    draw();
  });

  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-tile]") as HTMLElement | null;
    if (!b) return;
    const [which, id] = (b.dataset.tile ?? "").split(":");
    if (which === "asg") state.assignFilter = state.assignFilter === id ? "all" : id!;
    else if (which === "alloc") state.allocFilter = state.allocFilter === id ? "all" : id!;
    else if (which === "prg") state.prgFilter = state.prgFilter === id ? "all" : id!;
    else if (which === "cnf") state.cnfFilter = state.cnfFilter === id ? "all" : (id as ConfirmFilter);
    else return;
    draw();
  });

  // --- The drop-down panel: closes on a click outside or Escape, and its search box narrows a long list as you type ---
  if (typeof window !== "undefined") { window.addEventListener("scroll", placePopover, true); window.addEventListener("resize", placePopover); }
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest?.(".vpop, .fbtn, [data-gcols], [data-tt-cols], [data-gfilt], [data-tt-filter]")) return;
    if (closePopover()) draw();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && closePopover()) draw(); });
  document.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement | null;
    if (!t?.dataset?.vpopSearch) return;
    const q = t.value.trim().toLowerCase();
    t.closest(".vpop")?.querySelectorAll<HTMLElement>(".vpop-item").forEach((l) => { l.hidden = q !== "" && !(l.textContent ?? "").toLowerCase().includes(q); });
  });

  // --- The buttons of the Confirmation page (a person answers for the partner) and the Progress page (steps and batches) ---
  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-cnf]") as HTMLElement | null;
    if (!b) return;
    const key = b.dataset.key ?? "";
    if (b.dataset.cnf === "confirm") return void outcomeChange({ action: "cnf-confirm", key });
    const reason = (document.querySelector?.(`[data-cnf-reason="${key.replace(/"/g, "")}"]`) as HTMLInputElement | null)?.value ?? "";
    void outcomeChange({ action: "cnf-reject", key, reason });
  });

  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest?.("[data-prg]") as HTMLElement | null;
    if (!b) return;
    const d = b.dataset;
    if (d.prg === "next") return void outcomeChange({ action: "prg-next", key: d.key });
    if (d.prg === "undo") return void outcomeChange({ action: "prg-undo", key: d.key });
    if (d.prg === "close") return void outcomeChange({ action: "prg-close-batch", partnerId: d.partner, batch: Number(d.batch) });
    if (d.prg === "open") return void outcomeChange({ action: "prg-open-batch", partnerId: d.partner, batch: Number(d.batch) });
  });
}
