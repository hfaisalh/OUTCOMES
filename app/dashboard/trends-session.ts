/**
 * trends-session.ts
 *
 * What it does: what happens on the trends part of the Dashboard (DECISIONS 304): choosing 6 or 12 months and choosing a benefit.
 * Who calls it: app/main.ts, for data-action values that start with "tr-" and for the change of the benefit list. Depends on: the small state in trends-card.ts.
 * Data flow: a click or a choice changes the state here and asks for a redraw. Nothing is saved: the choice lasts until the page is reloaded.
 */

import { noTrendsView, type TrendsView } from "./trends-card";

export const trendsView: TrendsView = noTrendsView();

export function trendsAction(action: string, el: HTMLElement, redraw: () => void): void {
  if (action === "tr-range") { trendsView.months = el.dataset["n"] === "6" ? 6 : 12; redraw(); }
}
// A choice in one of the lists above the charts: the benefit, the partner, or the measure to compare partners on.
export function trendsChoose(id: string, value: string, redraw: () => void): void {
  if (id === "tr-benefit") trendsView.benefit = value;
  else if (id === "tr-partner") trendsView.partner = value;
  else if (id === "tr-target") trendsView.target = Number(value) > 0 ? Number(value) : 90;
  else if (id === "tr-metric") trendsView.metric = (["score", "completed", "onTime", "answer", "complete"].includes(value) ? value : "score") as TrendsView["metric"];
  redraw();
}
