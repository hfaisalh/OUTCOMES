/**
 * scatter-open.ts
 *
 * What it does: a click (or Enter, or Space) on a bubble of the "Gift age against stage" chart opens the Gifts list with only the gifts counted in that bubble (DECISIONS 312).
 * Who calls it: loaded by app/main.ts. Depends on: the trends data (trends-data.ts), the age rules (modules/17-dashboard/age.ts), the trends choices (trends-session.ts) and the shell.
 * Data flow: a bubble's stage and age band -> the gifts of the current Benefit and Partner choice in that bubble -> shell.openGifts(label, keys) -> the Gifts list with a chip that removes the filter.
 */

import { ageOf, bandLabel, bandOf, stageOf, STAGES } from "../../modules/17-dashboard/age";
import { shell } from "../shell";
import { trendsData } from "./trends-data";
import { trendsView } from "./trends-session";

function open(el: HTMLElement): void {
  const [stage, band] = (el.dataset["scatter"] ?? "").split("|").map(Number) as [number, number];
  const v = shell.view();
  const d = trendsData(v, trendsView.benefit, trendsView.months, trendsView.partner);
  const target = trendsView.target ?? 90;
  const keys = (d.lives ?? []).filter((g) => stageOf(g) === stage && bandOf(ageOf(g, d.today ?? ""), target) === band).map((g) => g.key);
  shell.openGifts(`${STAGES[stage]}, ${bandLabel(band, target)}`, keys);
}

document.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest?.("[data-scatter]") as HTMLElement | null; if (b) open(b); });
document.addEventListener("keydown", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-scatter]") as HTMLElement | null;
  if (b && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(b); }
});
