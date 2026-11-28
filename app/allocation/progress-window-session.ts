/**
 * progress-window-session.ts
 *
 * What it does: opens and closes the Progress window (DECISIONS 322) and draws it outside the page, so a redraw after a decision does not lose it. A click on a gift row opens it; Close, Esc, a click outside it, or taking a decision from it closes it.
 * Who calls it: loaded by app/main.ts, which calls renderPrgWindow after every draw. Depends on: the shell (shell.ts), the window helpers (shared/windows.ts) and the window drawing (progress-window.ts).
 * Data flow: a click sets prgUi.key and draws; renderPrgWindow draws the window from the current view, and closes itself when the gift is no longer allocated.
 */

import { shell } from "../shell";
import { dropWindow, putWindow } from "../shared/windows";
import { progressWindowHtml } from "./progress-window";

export const prgUi = { key: "" };

export function renderPrgWindow(): void {
  let root = document.getElementById("prg-root");
  if (prgUi.key === "") return dropWindow(root);
  if (!root) { root = document.createElement("div"); root.id = "prg-root"; document.body.appendChild(root); }
  const html = progressWindowHtml(shell.view(), prgUi.key);
  if (html === "") { prgUi.key = ""; return dropWindow(root); }
  const keep = root.querySelector?.(".pf-body")?.scrollTop ?? 0;
  const typed = (root.querySelector?.(".rj") as HTMLInputElement | null)?.value ?? "";
  putWindow(root, html);
  const body = root.querySelector?.(".pf-body"); if (body) body.scrollTop = keep;
  const box = root.querySelector?.(".rj") as HTMLInputElement | null; if (box && typed) box.value = typed; // keep a reason being typed
}

document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const close = t.closest?.("[data-prgwinclose]") as HTMLElement | null;
  // Taking a decision from the window closes it as the action is sent (the action itself is handled with the other Progress buttons).
  if (close && close.dataset.prgwinclose === "1") { prgUi.key = ""; return; }
  if (close && (close.dataset.prgwinclose !== "overlay" || t === close)) { prgUi.key = ""; shell.draw(); return; }
  const open = t.closest?.("[data-prgwin]") as HTMLElement | null;
  if (open && (open.tagName === "BUTTON" || !t.closest("input,select,button,a"))) { prgUi.key = open.dataset.prgwin ?? ""; shell.draw(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && prgUi.key !== "") { prgUi.key = ""; shell.draw(); return; }
  const row = (e.target as HTMLElement).closest?.("tr[data-prgwin]") as HTMLElement | null;
  if (row && e.key === "Enter" && e.target === row) { prgUi.key = row.dataset.prgwin ?? ""; shell.draw(); }
});
