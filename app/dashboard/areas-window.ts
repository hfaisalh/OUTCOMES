/**
 * areas-window.ts
 *
 * What it does: the pop-up window that fixes typed areas on the Dashboard (DECISIONS 276), and the project choice of the areas card. It lives apart from the page, so a redraw of the page does not close it.
 * Who calls it: loaded by app/main.ts, which gets `renderAreasWindow`. Depends on: the shell's calls (shell.ts), the window helpers (shared/windows.ts), the card and window drawing (areas-page.ts) and the areas state (areas-session.ts).
 * Data flow: Fix anomalies sets areasUi.open and draws the window; Esc and Close clear it; choosing a project draws the card again.
 */

import { trendsBenefit } from "./trends-session";
import { shell } from "../shell";
import { dropWindow, putWindow } from "../shared/windows";
import { areasWindowHtml } from "../dashboard/areas-page";
import { areasUi, areasView } from "../dashboard/areas-session";

// The window that fixes typed areas (DECISIONS 276). It lives apart from the page, so a redraw of the page does not close it.
export function renderAreasWindow(): void {
  let root = document.getElementById("area-root");
  if (!areasUi.open) { dropWindow(root); return; }
  if (!root) { root = document.createElement("div"); root.id = "area-root"; document.body.appendChild(root); }
  putWindow(root, areasWindowHtml(shell.view(), areasUi));
}
document.addEventListener("change", (e) => { const t = e.target as HTMLSelectElement | null; if (t?.id === "tr-benefit") { trendsBenefit(t.value, shell.draw); return; } if (t?.id === "ar-project") { areasView.project = t.value; shell.draw(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && areasUi.open) { areasUi.open = false; renderAreasWindow(); } });
