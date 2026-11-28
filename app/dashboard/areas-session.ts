/**
 * areas-session.ts
 *
 * What it does: what happens in the Dashboard's areas card and its fix window (DECISIONS 275, 276): "Fix anomalies" opens the window, "Find place" searches for the typed area and lists the matches under its row; choosing one gives every beneficiary who typed that area the checked place.
 * Who calls it: app/main.ts, for data-action values that start with "ar-". Depends on: the place search (api.ts) and a callback that sends the change (outcomeChange in main.ts).
 * Data flow: Find place -> searchPlaces(text) -> results kept in areasUi -> redraw. Choose -> send { action: "ben-area", area, location } -> the server saves and answers with the fresh register and places.
 */

import { searchPlaces } from "../shared/api";
import { noAreasUi, noAreasView, type AreasUi, type AreasView } from "./areas-page";

export const areasUi: AreasUi = noAreasUi();
export const areasView: AreasView = noAreasView(); // which map the Dashboard card shows (DECISIONS 278)

// `redraw` redraws the page and the window. Opening and closing keep the window state; a choice keeps it open.
export async function areasAction(action: string, el: HTMLElement, send: (body: Record<string, unknown>) => Promise<void>, redraw: () => void): Promise<void> {
  const key = el.dataset["key"] ?? "";
  if (action === "ar-mode") { areasView.mode = el.dataset["mode"] === "served" ? "served" : "from"; return redraw(); }
  if (action === "ar-open") { Object.assign(areasUi, noAreasUi(true)); redraw(); (document.getElementById("ar-close") as HTMLElement | null)?.focus(); return; }
  if (action === "ar-close") { Object.assign(areasUi, noAreasUi()); redraw(); (document.querySelector('[data-action="ar-open"]') as HTMLElement | null)?.focus(); return; }
  if (action === "ar-find") {
    if (areasUi.finding === key) { Object.assign(areasUi, noAreasUi(true)); return redraw(); } // pressing again closes the matches
    Object.assign(areasUi, { finding: key, results: [], searching: true });
    redraw();
    const asked = key;
    const found = await searchPlaces(el.dataset["text"] ?? "");
    if (areasUi.finding === asked) { areasUi.results = found; areasUi.searching = false; redraw(); }
  } else if (action === "ar-choose") {
    const place = areasUi.results[Number(el.dataset["i"])];
    if (!place) return;
    const text = (document.querySelector(`[data-action="ar-find"][data-key="${CSS.escape(key)}"]`) as HTMLElement | null)?.dataset["text"] ?? key;
    Object.assign(areasUi, noAreasUi(true));
    await send({ action: "ben-area", area: text, location: place });
    redraw();
  }
}
