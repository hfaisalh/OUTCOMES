/**
 * home-events.ts
 *
 * What it does: what happens when someone presses a door or a step on the Home page (DECISIONS 328): a door opens or closes, a step of the setup guide is shown.
 * Who calls it: loaded by app/main.ts. Depends on: the screen state (app/state.ts) and the shell's draw (app/shell.ts).
 * Data flow: a click sets state.home and asks for a redraw. Nothing is saved: where you were lasts until the page is reloaded.
 */

import { shell } from "../shell";
import { state } from "../state";

document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  const door = t.closest?.("[data-door]") as HTMLElement | null;
  if (door) { const id = door.dataset.door ?? ""; state.home = { ...state.home, door: state.home.door === id ? "" : id }; shell.draw(); return; }
  const step = t.closest?.("[data-guide]") as HTMLElement | null;
  if (step && !(step as HTMLButtonElement).disabled) { state.home = { ...state.home, step: step.dataset.guide ?? "" }; shell.draw(); }
});
