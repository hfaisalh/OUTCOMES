/**
 * areas-session.ts
 *
 * What it does: what happens on the Areas page (DECISIONS 275): "Find place" searches for the typed area and lists the matches under its row; choosing one gives every beneficiary who typed that area the checked place.
 * Who calls it: app/main.ts, for data-action values that start with "ar-". Depends on: the place search (api.ts) and a callback that sends the change (outcomeChange in main.ts).
 * Data flow: Find place -> searchPlaces(text) -> results kept in areasUi -> redraw. Choose -> send { action: "ben-area", area, location } -> the server saves and answers with the fresh register and places.
 */

import { searchPlaces } from "./api";
import { noAreasUi, type AreasUi } from "./areas-page";

export const areasUi: AreasUi = noAreasUi();

export async function areasAction(action: string, el: HTMLElement, send: (body: Record<string, unknown>) => Promise<void>, redraw: () => void): Promise<void> {
  const key = el.dataset["key"] ?? "";
  if (action === "ar-find") {
    if (areasUi.finding === key) { Object.assign(areasUi, noAreasUi()); return redraw(); } // pressing again closes it
    Object.assign(areasUi, { finding: key, results: [], searching: true });
    redraw();
    const asked = key;
    const found = await searchPlaces(el.dataset["text"] ?? "");
    if (areasUi.finding === asked) { areasUi.results = found; areasUi.searching = false; redraw(); }
  } else if (action === "ar-choose") {
    const place = areasUi.results[Number(el.dataset["i"])];
    if (!place) return;
    const text = (document.querySelector(`[data-action="ar-find"][data-key="${CSS.escape(key)}"]`) as HTMLElement | null)?.dataset["text"] ?? key;
    Object.assign(areasUi, noAreasUi());
    await send({ action: "ben-area", area: text, location: place });
    redraw();
  }
}
