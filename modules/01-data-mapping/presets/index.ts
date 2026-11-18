/**
 * presets/index.ts
 *
 * What it does: the list of source presets, and a lookup by ID.
 * Who calls it: pipeline.ts, mapping.ts, setup.ts and the page.
 * Depends on: the individual presets. Add a new source system by adding a preset here.
 */

import { salesforcePreset } from "./salesforce";
import type { Preset } from "./types";

export const PRESETS: Preset[] = [salesforcePreset];

/** The preset with this ID, or null (a generic source with no preset). */
export function getPreset(id: string | null | undefined): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}
