/**
 * presets/types.ts
 *
 * What it does: defines a source preset. A preset is everything that is specific to one source
 * system (its column names, how it packs lines, how its lookup list is laid out, its wording),
 * so the core stays generic (DECISIONS 26). An organisation with no preset maps its own columns.
 * Who calls it: presets/index.ts, mapping.ts, pipeline.ts, lookups.ts, template.ts.
 * Depends on: csv.ts and lines.ts types.
 */

import type { Table } from "../csv";
import type { LinesLayout, LinesParseResult, Lookups } from "../lines";

export interface Preset {
  id: string; // stable name saved in setups
  name: string; // plain English name shown to people
  columns: Record<string, string[]>; // generic field key to this source's exact column names
  drops: Record<string, string>; // source column to the reason it is dropped by default
  layout: LinesLayout; // how this source carries lines
  requiredFields: string[]; // fields this source must supply
  labels: Record<string, string>; // the wording the organisation using this source expects
  examples?: Record<string, string>; // example values that differ from the generic ones
  parseLinesColumn?(text: string): LinesParseResult; // reads a lines column, when layout is lines-column
  readLookups?(table: Table): { lookups: Lookups; problems: string[] }; // reads this source's lookup list layout
}
