/**
 * categories.ts
 *
 * What it does: the categories an organisation delivers through (Sponsorship, Transactional and so
 * on) and the rules for sorting CRM items into them: add, rename and remove categories, put an item
 * in one, suggest a category from an item's name, and set each category's framework.
 * Who calls it: the Categories page in app/, and the work-order planner (as the item to category map).
 * Depends on: nothing (pure functions, no database, no screen). Every function returns a new value
 * and leaves its input unchanged, so it ports easily to Apex or another stack.
 *
 * Two levels (DECISIONS 40): many CRM **items** sit in one **category**. The category has properties
 * (its name, the words that suggest it) and one of them is its **framework**: the settings that
 * decide the flow of every order in the category (what one delivery is, how often the donor hears
 * back, which report they receive).
 *
 * Rule: categories live in OUTCOMES, not in the CRM. The CRM only says whether an item needs
 * feedback (DECISIONS 31). An item with no category is unrouted, never lost.
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

// The framework: the settings that decide the flow of the orders in a category.
export interface Framework {
  unit: string; // what one thing delivered is, for example "child", "pump", "animal"
  cycle: Cycle;
  reportType: string; // the name of the report the donor receives
}

export interface Category {
  id: string; // stable, saved with the map. Made from the name when added
  name: string;
  keywords: string[]; // lower case words that suggest this category when found in an item's name
  framework: Framework;
}

// CRM item id to category id. An item that is not in the map is unrouted.
export type ItemMap = Record<string, string>;

export const emptyFramework = (cycle: Cycle = "on_delivery"): Framework => ({ unit: "", cycle, reportType: "" });

// Lower case, letters and numbers joined by hyphens: "Orphan Sponsorship" becomes "orphan-sponsorship".
export const slugify = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export interface Changed<T> {
  value: T;
  error?: string; // plain English, set when nothing was changed
}

const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

/**
 * Rule: a category needs a name, and no two categories may share a name (ignoring case) or an id.
 * The name's words become its first keywords so "Sponsorship" suggests itself.
 */
export function addCategory(categories: Category[], name: string, cycle: Cycle = "on_delivery"): Changed<Category[]> {
  const clean = tidy(name);
  if (clean === "") return { value: categories, error: "Give the category a name." };
  if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { value: categories, error: `There is already a category called "${clean}".` };
  const base = slugify(clean) || "category";
  let id = base;
  for (let n = 2; categories.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return { value: [...categories, { id, name: clean, keywords: clean.toLowerCase().split(" ").filter((w) => w.length > 2), framework: emptyFramework(cycle) }] };
}

export function renameCategory(categories: Category[], id: string, name: string): Changed<Category[]> {
  const clean = tidy(name);
  if (clean === "") return { value: categories, error: "Give the category a name." };
  if (categories.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) return { value: categories, error: `There is already a category called "${clean}".` };
  return { value: categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

// Rule: removing a category sends its items back to unrouted. The items themselves are kept.
export function removeCategory(categories: Category[], map: ItemMap, id: string): { categories: Category[]; map: ItemMap } {
  return { categories: categories.filter((c) => c.id !== id), map: Object.fromEntries(Object.entries(map).filter(([, cat]) => cat !== id)) };
}

export const updateFramework = (categories: Category[], id: string, framework: Partial<Framework>): Category[] =>
  categories.map((c) => (c.id === id ? { ...c, framework: { ...c.framework, ...framework } } : c));

export const setKeywords = (categories: Category[], id: string, text: string): Category[] =>
  categories.map((c) => (c.id === id ? { ...c, keywords: text.toLowerCase().split(/[,\n]/).map((w) => w.trim()).filter(Boolean) } : c));

/**
 * Rule: put an item in a category. An empty category id sends it back to unrouted. An id that is
 * not a category is ignored, so a stale drop can never create a broken map.
 */
export function assignItem(map: ItemMap, categories: Category[], itemId: string, categoryId: string): ItemMap {
  const { [itemId]: _old, ...rest } = map;
  if (categoryId === "") return rest;
  return categories.some((c) => c.id === categoryId) ? { ...rest, [itemId]: categoryId } : map;
}

/**
 * Rule: auto-suggest first, a person corrects. A category is suggested when one of its keywords is
 * a whole word of the item's name (ignoring case). If two categories match, the one with the longest
 * matching keyword wins, and a tie suggests nothing, because a wrong suggestion is worse than none.
 */
export function suggestCategory(itemName: string, categories: Category[]): string {
  const words = new Set(itemName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const matches: { id: string; length: number }[] = [];
  for (const c of categories) {
    const hit = c.keywords.filter((k) => words.has(k.toLowerCase())).sort((a, b) => b.length - a.length)[0];
    if (hit) matches.push({ id: c.id, length: hit.length });
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

// Suggestions for every item that has no category yet. Items with no suggestion are left out.
export function suggestAll(items: ItemInfo[], map: ItemMap, categories: Category[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    if (map[item.id] !== undefined) continue;
    const cat = suggestCategory(item.name, categories);
    if (cat !== "") out[item.id] = cat;
  }
  return out;
}

// Accept suggestions: the suggested items are put in their categories, nothing already sorted changes.
export function acceptSuggestions(map: ItemMap, suggestions: Record<string, string>): ItemMap {
  const next = { ...map };
  for (const [item, cat] of Object.entries(suggestions)) if (next[item] === undefined) next[item] = cat;
  return next;
}

// Items in a category, and those with none.
export function groupItems(items: ItemInfo[], map: ItemMap, categories: Category[]): { unsorted: ItemInfo[]; byCategory: Record<string, ItemInfo[]> } {
  const byCategory: Record<string, ItemInfo[]> = Object.fromEntries(categories.map((c) => [c.id, []]));
  const unsorted: ItemInfo[] = [];
  for (const item of items) {
    const list = byCategory[map[item.id] ?? ""];
    if (list) list.push(item);
    else unsorted.push(item);
  }
  return { unsorted, byCategory };
}

// A category is ready to run when its framework is filled in. Staff see this as a reminder, never a block.
export function missingFramework(c: Category): string[] {
  const missing: string[] = [];
  if (c.framework.unit.trim() === "") missing.push("what one delivery is (unit)");
  if (c.framework.reportType.trim() === "") missing.push("report type");
  return missing;
}

// Rule: setup saved by an earlier version (frameworks as a separate list) is not understood, so it is treated as empty.
export const isCurrentCategory = (x: unknown): x is Category => {
  const c = x as Category | null;
  return !!c && typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.keywords) && !!c.framework && typeof c.framework === "object";
};
