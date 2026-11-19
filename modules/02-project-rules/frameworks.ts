/**
 * frameworks.ts
 *
 * What it does: the frameworks an organisation delivers through (Orphan Sponsorship, Hifz, Water and
 * so on) and the rules for sorting CRM items into them: add, rename and remove frameworks, put an
 * item in one, suggest a framework from an item's name, and set each framework's feedback rules.
 * Who calls it: the Frameworks page in app/, and the work-order planner (as the item to framework map).
 * Depends on: nothing (pure functions, no database, no screen). Every function returns a new value
 * and leaves its input unchanged, so it ports easily to Apex or another stack.
 *
 * Rule: frameworks live in OUTCOMES, not in the CRM. The CRM only says whether an item needs
 * feedback (DECISIONS 31). An item with no framework is unrouted, never lost.
 * Rule: a framework does not hold duration or instalment counts. Those come from the CRM item (DECISIONS 18).
 */

// How often a donor hears back.
export type Cycle = "monthly" | "quarterly" | "half_yearly" | "annual" | "on_delivery";

export const CYCLE_LABELS: Record<Cycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Every six months",
  annual: "Yearly",
  on_delivery: "Once, when delivered",
};

// What a framework needs to know to run its feedback.
export interface FrameworkRules {
  unit: string; // what one thing delivered is, for example "child", "pump", "animal"
  cycle: Cycle;
  reportType: string; // the name of the report the donor receives
}

export interface Framework {
  id: string; // stable, saved with the map. Made from the name when added
  name: string;
  keywords: string[]; // lower case words that suggest this framework when found in an item's name
  rules: FrameworkRules;
}

// CRM item id to framework id. An item that is not in the map is unrouted.
export type ItemMap = Record<string, string>;

export const emptyRules = (): FrameworkRules => ({ unit: "", cycle: "on_delivery", reportType: "" });

// Lower case, letters and numbers joined by hyphens: "Orphan Sponsorship" becomes "orphan-sponsorship".
export const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Changed<T> {
  value: T;
  error?: string; // plain English, set when nothing was changed
}

/**
 * Rule: a framework needs a name, and no two frameworks may share a name (ignoring case) or an id.
 * The name also becomes its first keyword so "Hifz" suggests itself.
 */
export function addFramework(frameworks: Framework[], name: string): Changed<Framework[]> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean === "") return { value: frameworks, error: "Give the framework a name." };
  if (frameworks.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return { value: frameworks, error: `There is already a framework called "${clean}".` };
  const base = slugify(clean) || "framework";
  let id = base;
  for (let n = 2; frameworks.some((f) => f.id === id); n++) id = `${base}-${n}`;
  return { value: [...frameworks, { id, name: clean, keywords: clean.toLowerCase().split(" ").filter((w) => w.length > 2), rules: emptyRules() }] };
}

export function renameFramework(frameworks: Framework[], id: string, name: string): Changed<Framework[]> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean === "") return { value: frameworks, error: "Give the framework a name." };
  if (frameworks.some((f) => f.id !== id && f.name.toLowerCase() === clean.toLowerCase())) return { value: frameworks, error: `There is already a framework called "${clean}".` };
  return { value: frameworks.map((f) => (f.id === id ? { ...f, name: clean } : f)) };
}

// Rule: removing a framework sends its items back to unrouted. The items themselves are kept.
export function removeFramework(frameworks: Framework[], map: ItemMap, id: string): { frameworks: Framework[]; map: ItemMap } {
  return { frameworks: frameworks.filter((f) => f.id !== id), map: Object.fromEntries(Object.entries(map).filter(([, fw]) => fw !== id)) };
}

export const updateRules = (frameworks: Framework[], id: string, rules: Partial<FrameworkRules>): Framework[] =>
  frameworks.map((f) => (f.id === id ? { ...f, rules: { ...f.rules, ...rules } } : f));

export const setKeywords = (frameworks: Framework[], id: string, text: string): Framework[] =>
  frameworks.map((f) => (f.id === id ? { ...f, keywords: text.toLowerCase().split(/[,\n]/).map((w) => w.trim()).filter(Boolean) } : f));

/**
 * Rule: put an item in a framework. An empty framework id sends it back to unrouted. An id that is
 * not a framework is ignored, so a stale drop can never create a broken map.
 */
export function assignItem(map: ItemMap, frameworks: Framework[], itemId: string, frameworkId: string): ItemMap {
  const { [itemId]: _old, ...rest } = map;
  if (frameworkId === "") return rest;
  return frameworks.some((f) => f.id === frameworkId) ? { ...rest, [itemId]: frameworkId } : map;
}

/**
 * Rule: auto-suggest first, a person corrects. A framework is suggested when one of its keywords is
 * a whole word of the item's name (ignoring case). If two frameworks match, the one with the longest
 * matching keyword wins, and a tie suggests nothing, because a wrong suggestion is worse than none.
 */
export function suggestFramework(itemName: string, frameworks: Framework[]): string {
  const words = new Set(itemName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const matches: { id: string; length: number }[] = [];
  for (const f of frameworks) {
    const hit = f.keywords.filter((k) => words.has(k.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (hit) matches.push({ id: f.id, length: hit.length });
  }
  if (matches.length === 0) return "";
  matches.sort((a, b) => b.length - a.length);
  const top = matches[0] as { id: string; length: number };
  return matches[1] && matches[1].length === top.length ? "" : top.id;
}

export interface ItemInfo {
  id: string;
  name: string;
}

// Suggestions for every item that has no framework yet. Items with no suggestion are left out.
export function suggestAll(items: ItemInfo[], map: ItemMap, frameworks: Framework[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    if (map[item.id] !== undefined) continue;
    const fw = suggestFramework(item.name, frameworks);
    if (fw !== "") out[item.id] = fw;
  }
  return out;
}

// Accept suggestions: the suggested items are put in their frameworks, nothing already sorted changes.
export function acceptSuggestions(map: ItemMap, suggestions: Record<string, string>): ItemMap {
  const next = { ...map };
  for (const [item, fw] of Object.entries(suggestions)) if (next[item] === undefined) next[item] = fw;
  return next;
}

// Items in a framework, and those with none.
export function groupItems(items: ItemInfo[], map: ItemMap, frameworks: Framework[]): { unsorted: ItemInfo[]; byFramework: Record<string, ItemInfo[]> } {
  const byFramework: Record<string, ItemInfo[]> = Object.fromEntries(frameworks.map((f) => [f.id, []]));
  const unsorted: ItemInfo[] = [];
  for (const item of items) {
    const list = byFramework[map[item.id] ?? ""];
    if (list) list.push(item);
    else unsorted.push(item);
  }
  return { unsorted, byFramework };
}

// A framework is ready to run when its rules are filled in. Staff see this as a reminder, never a block.
export function missingRules(f: Framework): string[] {
  const missing: string[] = [];
  if (f.rules.unit.trim() === "") missing.push("what one delivery is (unit)");
  if (f.rules.reportType.trim() === "") missing.push("report type");
  return missing;
}
