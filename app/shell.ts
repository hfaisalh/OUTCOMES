/**
 * shell.ts
 *
 * What it does: the few calls the shell (app/main.ts) offers to the feature files that react to buttons on their own screens (DECISIONS 298): draw the page again, send a change to the server (or apply it in the demo), build the View, and say what the last request refused with.
 * Who calls it: the feature files (for example beneficiaries/beneficiary-window.ts), which only read it; app/main.ts, which fills it in once at the start. Depends on: the View type only.
 * Data flow: main.ts calls `Object.assign(shell, {...})` with the real functions as the page starts. Until then each is a harmless stand-in, so a feature file can be loaded and tested alone.
 */

import type { View } from "./shared/pages";

export const shell = {
  draw: (): void => undefined,
  redrawLists: (): void => undefined,
  outcomeChange: async (_body: Record<string, unknown>): Promise<void> => undefined,
  view: (): View => ({}) as View,
  lastError: (): string => "",
};
