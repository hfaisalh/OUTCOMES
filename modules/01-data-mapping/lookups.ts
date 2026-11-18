/**
 * lookups.ts
 *
 * What it does: reads a lookup list (names for fund and outcome IDs) from CSV text. It is
 * configuration, loaded once, and optional: a source that carries names directly needs none.
 * Who calls it: the page, when someone picks a lookup list file.
 * Depends on: csv.ts, lines.ts and presets/types.ts (pure functions, no database, no screen).
 *
 * Two layouts are accepted:
 * 1. Generic: three columns named Type, Name and ID, where Type is Fund or Outcome.
 * 2. The layout of the chosen source preset (for Salesforce, the SF META tab). Tried first.
 */

import { parseCsv } from "./csv";
import { emptyLookups, type Lookups } from "./lines";
import type { Preset } from "./presets/types";

const key = (s: string) => s.trim().toLowerCase();

const FUND_TYPES = new Set(["fund", "designation"]);
const OUTCOME_TYPES = new Set(["outcome", "outcome activity"]);

export function readLookups(csvText: string, preset?: Preset | null): { lookups: Lookups; problems: string[] } {
  const table = parseCsv(csvText);

  // Layout 2 first: if the source's own layout yields names, use it. (A real code book may also
  // have columns called Type or Id, so the generic layout must not be guessed first.)
  const fromPreset = preset?.readLookups?.(table);
  if (fromPreset && Object.keys(fromPreset.lookups.funds).length + Object.keys(fromPreset.lookups.outcomes).length > 0) return fromPreset;

  // Layout 1: the generic Type, Name, ID list.
  const header = (table[0] ?? []).map(key);
  const typeCol = header.findIndex((h) => h === "type" || h === "kind");
  const nameCol = header.indexOf("name");
  const idCol = header.findIndex((h) => h === "id" || h === "code");
  if (typeCol !== -1 && nameCol !== -1 && idCol !== -1) {
    const lookups = emptyLookups();
    const problems: string[] = [];
    table.slice(1).forEach((row, i) => {
      const type = key(row[typeCol] ?? "");
      const name = (row[nameCol] ?? "").trim();
      const id = (row[idCol] ?? "").trim();
      if (type === "" && name === "" && id === "") return;
      const target = FUND_TYPES.has(type) ? lookups.funds : OUTCOME_TYPES.has(type) ? lookups.outcomes : null;
      if (!target) return void problems.push(`Row ${i + 2}: Type "${row[typeCol] ?? ""}" is not Fund or Outcome`);
      if (name === "" || id === "") return void problems.push(`Row ${i + 2}: Name and ID are both needed`);
      target[id] = name;
    });
    return { lookups, problems };
  }

  return fromPreset ?? { lookups: emptyLookups(), problems: ["The lookup list needs the columns Type, Name and ID"] };
}
