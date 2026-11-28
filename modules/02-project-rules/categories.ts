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
 * Frameworks are reusable **templates** (DECISIONS 59, replacing the embedded framework of decision 40). A
 * template holds the settings that decide the flow of an order: what one delivery is, how often the donor hears
 * back, which report they receive, how an instalment counts and how many units make one beneficiary. A **category**
 * has a default template, and an **item** can pick a different one. The template that applies to an item is its
 * own if it has one, otherwise its category's.
 *
 * Rule: categories live in OUTCOMES, not in the CRM. The CRM only says whether an item needs
 * feedback (DECISIONS 31). An item with no category is unrouted, never lost.
 * Rule: a framework does not hold duration or instalment counts. Those come from the CRM item (DECISIONS 18).
 * What it does hold is how an instalment COUNTS toward a unit (DECISIONS 52, 58): that is a property of the kind of
 * item, so it is a setting of the category.
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

// How an instalment counts toward a unit (DECISIONS 52). Not guessed: a category without it shows a reminder.
// - per_period: a unit is one part for one period (a month). Each instalment is 1 unit, and a single payment is as many units as the plan has payments. Sponsorships, scholarships.
// - share_of_whole: a unit is the whole item. Each instalment is a share of it, a single payment is 1 unit, and it is complete only when every instalment is paid. Pumps, wells, buildings.
// The stage of the journey at which a gift counts as fulfilled (DECISIONS 316). What comes after, such as reports that repeat, is left to the workflow.
export type Fulfilled = "allocated" | "delivered" | "complete";
export const FULFILLED_LABELS: Record<Fulfilled, string> = { allocated: "Allocated: a beneficiary or outcome is funded", delivered: "Delivered: the partner's phases are done", complete: "Complete: reviewed, reported, the donor told" };
export const FULFILLED_STAGE: Record<Fulfilled, number> = { allocated: 3, delivered: 4, complete: 5 }; // the number of the journey stage
export type InstalmentRule = "per_period" | "share_of_whole";

export const INSTALMENT_LABELS: Record<InstalmentRule, string> = {
  per_period: "One period of the item (for example a month of sponsorship)",
  share_of_whole: "A share of one whole item (for example 1/10 of a pump)",
};

// The settings that decide the flow of an order. Before decision 59 these were held inside each category (the "legacy" shape, still read and migrated).
export interface Framework {
  assign?: "auto" | "suggest"; // how a released work order is handed to a partner (DECISIONS 137). Absent: the outcome type's setting, else suggest
  confirmDays?: number; // days a partner has to confirm (approve or reject) an assigned batch (DECISIONS 139). Absent: 3
  confirmTell?: string; // what the donor is told when the partner has confirmed
  reassign?: boolean; // a person may move a work order from one partner to another (DECISIONS 138). Absent: yes
  urgent?: boolean; // an urgent gift jumps to high priority (DECISIONS 138). Absent: yes
  feedback?: boolean; // the donor is asked for feedback once the order is complete (DECISIONS 140). Absent: yes
  approve?: boolean; // MWF approves a report before the donor sees the data (DECISIONS 138). Absent: yes
  stages?: ImplStage[]; // the implementation stages, in order (DECISIONS 137)
  icon?: string; // the workflow's own icon from the icon library, a target when none is chosen (DECISIONS 134)
  unit: string; // what one thing delivered is, for example "child", "pump", "animal"
  cycle: Cycle;
  reportType: string; // the name of the report the donor receives
  instalment?: InstalmentRule; // how an instalment counts toward a unit. Absent means not set yet
  loopMonths?: number; // how many months the repeating report runs for, from the first report. Absent: for as long as the gift runs (DECISIONS 318)
  fulfilled?: Fulfilled; // the stage at which a gift counts as fulfilled (DECISIONS 316). Absent: allocated for a unit that is one period, complete otherwise
}

// A framework template (DECISIONS 59): defined once, used by any number of categories and items.
export interface FrameworkTemplate extends Framework {
  id: string; // stable, made from the name when added
  name: string;
  unitsPerBeneficiary: number; // units that make one whole beneficiary: 3 parts for an orphan, 1 for a scholarship (a whole number, 1 or more)
  tasks?: WorkflowTask[]; // what happens after delivery: the checks and updates, with when each is due (DECISIONS 130)
}

// A task of a workflow: a check or an update due some months after the outcome is delivered or started, optionally asking for photos.
export interface WorkflowTask { id: string; label: string; afterMonths: number; photo: boolean }

// A stage of the partner's implementation, set on the workflow (DECISIONS 137): its name, the days allowed from the one before, what the partner must supply, whether photos are
// asked for, whether the clock may be paused, and what the donor is told when it is finished.
export interface ImplStage { id: string; label: string; days: number; needs: string[]; photo: boolean; canPause: boolean; tell: string }

export interface Category {
  id: string; // stable, saved with the map. Made from the name when added
  name: string;
  keywords: string[]; // lower case words that suggest this category when found in an item's name
  frameworkId: string; // the category's default framework template, "" when not chosen yet
  framework?: Framework; // legacy: a setup saved before decision 59. Migrated to a template by migrateSetup
}

// Everything an organisation sets up here.
export interface Setup {
  categories: Category[];
  itemMap: ItemMap; // CRM item id to category id
  frameworks: FrameworkTemplate[];
  itemFramework: Record<string, string>; // CRM item id to a framework template id, only for items that differ from their category
}

// CRM item id to category id. An item that is not in the map is unrouted.
export type ItemMap = Record<string, string>;

export const emptyTemplate = (id: string, name: string, cycle: Cycle = "on_delivery"): FrameworkTemplate => ({ id, name, unit: "", cycle, reportType: "", unitsPerBeneficiary: 1 });

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
export function addCategory(categories: Category[], name: string, frameworkId = ""): Changed<Category[]> {
  const clean = tidy(name);
  if (clean === "") return { value: categories, error: "Give the category a name." };
  if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { value: categories, error: `There is already a category called "${clean}".` };
  const base = slugify(clean) || "category";
  let id = base;
  for (let n = 2; categories.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return { value: [...categories, { id, name: clean, keywords: clean.toLowerCase().split(" ").filter((w) => w.length > 2), frameworkId }] };
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

// ---- Framework templates (DECISIONS 59) ----

const freshId = (name: string, taken: string[]): string => {
  const base = slugify(name) || "framework";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

// Rule: a template needs a name, and no two templates share a name (ignoring case).
export function addFramework(frameworks: FrameworkTemplate[], name: string, cycle: Cycle = "on_delivery"): Changed<FrameworkTemplate[]> {
  const clean = tidy(name);
  if (clean === "") return { value: frameworks, error: "Give the framework a name." };
  if (frameworks.some((f) => f.name.toLowerCase() === clean.toLowerCase())) return { value: frameworks, error: `There is already a framework called "${clean}".` };
  return { value: [...frameworks, emptyTemplate(freshId(clean, frameworks.map((f) => f.id)), clean, cycle)] };
}

// Rule: a copy starts the same and has its own name, so a small difference is a copy with one field changed.
export function duplicateFramework(frameworks: FrameworkTemplate[], id: string): Changed<FrameworkTemplate[]> {
  const from = frameworks.find((f) => f.id === id);
  if (!from) return { value: frameworks, error: "That framework was not found." };
  let name = `${from.name} (copy)`;
  for (let n = 2; frameworks.some((f) => f.name.toLowerCase() === name.toLowerCase()); n++) name = `${from.name} (copy ${n})`;
  return { value: [...frameworks, { ...from, id: freshId(name, frameworks.map((f) => f.id)), name }] };
}

export function renameFramework(frameworks: FrameworkTemplate[], id: string, name: string): Changed<FrameworkTemplate[]> {
  const clean = tidy(name);
  if (clean === "") return { value: frameworks, error: "Give the framework a name." };
  if (frameworks.some((f) => f.id !== id && f.name.toLowerCase() === clean.toLowerCase())) return { value: frameworks, error: `There is already a framework called "${clean}".` };
  return { value: frameworks.map((f) => (f.id === id ? { ...f, name: clean } : f)) };
}

// Rule: units per beneficiary is a whole number of 1 or more. Anything else is kept as it was.
export const updateTemplate = (frameworks: FrameworkTemplate[], id: string, patch: Partial<Omit<FrameworkTemplate, "id">>): FrameworkTemplate[] =>
  frameworks.map((f) => {
    if (f.id !== id) return f;
    const next = { ...f, ...patch };
    if (!Number.isInteger(next.unitsPerBeneficiary) || next.unitsPerBeneficiary < 1) next.unitsPerBeneficiary = f.unitsPerBeneficiary;
    return next;
  });

// Rule: a framework that a category or an item uses cannot be removed. Say where it is used instead.
export function removeFramework(s: Setup, id: string): Changed<Setup> {
  const cats = s.categories.filter((c) => c.frameworkId === id).map((c) => c.name);
  const items = Object.values(s.itemFramework).filter((f) => f === id).length;
  if (cats.length > 0 || items > 0) {
    const where = [cats.length ? `the categories ${cats.join(", ")}` : "", items ? `${items} item${items === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
    return { value: s, error: `This framework is used by ${where}. Choose another framework for them first.` };
  }
  return { value: { ...s, frameworks: s.frameworks.filter((f) => f.id !== id) } };
}

// A category's default framework. An id that is not a template is ignored.
export const setCategoryFramework = (categories: Category[], frameworks: FrameworkTemplate[], categoryId: string, frameworkId: string): Category[] =>
  frameworkId !== "" && !frameworks.some((f) => f.id === frameworkId) ? categories : categories.map((c) => (c.id === categoryId ? { ...c, frameworkId } : c));

// An item's own framework. An empty id clears it, so the item follows its category again.
export function setItemFramework(itemFramework: Record<string, string>, frameworks: FrameworkTemplate[], itemId: string, frameworkId: string): Record<string, string> {
  const { [itemId]: _old, ...rest } = itemFramework;
  if (frameworkId === "") return rest;
  return frameworks.some((f) => f.id === frameworkId) ? { ...rest, [itemId]: frameworkId } : itemFramework;
}

// Rule: the framework of an item is its own if it has one, otherwise its category's, otherwise none ("").
export function resolveFrameworkId(s: Setup, itemId: string): string {
  const own = s.itemFramework[itemId];
  if (own !== undefined && s.frameworks.some((f) => f.id === own)) return own;
  const cat = s.categories.find((c) => c.id === s.itemMap[itemId]);
  return cat && s.frameworks.some((f) => f.id === cat.frameworkId) ? cat.frameworkId : "";
}

// The resolved framework of every item that has a category or its own framework (the planner uses it).
export function frameworkByItem(s: Setup): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of new Set([...Object.keys(s.itemMap), ...Object.keys(s.itemFramework)])) {
    const f = resolveFrameworkId(s, id);
    if (f !== "") out[id] = f;
  }
  return out;
}

/**
 * Rule: a setup saved before decision 59 holds a framework inside each category. It is moved to templates: categories whose
 * frameworks are identical share one template, otherwise each category gets a template with its own name. Nothing is lost
 * and nothing an organisation sorted moves. Safe to run on a current setup: it returns it as it is.
 */
export function migrateSetup(raw: { categories: Category[]; itemMap: ItemMap; frameworks?: FrameworkTemplate[]; itemFramework?: Record<string, string> }): Setup {
  const frameworks = [...(raw.frameworks ?? [])];
  const seen = new Map<string, string>(); // legacy content to template id
  const categories = raw.categories.map((c) => {
    if (c.frameworkId !== undefined && c.frameworkId !== "") {
      const { framework: _legacy, ...rest } = c;
      return rest as Category;
    }
    if (!c.framework) return { id: c.id, name: c.name, keywords: c.keywords, frameworkId: "" };
    const key = JSON.stringify([c.framework.unit, c.framework.cycle, c.framework.reportType, c.framework.instalment ?? null]);
    let id = seen.get(key);
    if (id === undefined) {
      id = freshId(c.name, frameworks.map((f) => f.id));
      const name = frameworks.some((f) => f.name.toLowerCase() === c.name.toLowerCase()) ? `${c.name} framework` : c.name;
      frameworks.push({ ...c.framework, id, name, unitsPerBeneficiary: 1 });
      seen.set(key, id);
    }
    return { id: c.id, name: c.name, keywords: c.keywords, frameworkId: id };
  });
  return { categories, itemMap: raw.itemMap, frameworks, itemFramework: raw.itemFramework ?? {} };
}

// Rule: how a number of units splits into whole beneficiaries and a shared remainder. 3 parts of a 3 part orphan is one dedicated orphan,
// 1 part is a share pooled with other donors' parts, 4 parts is one dedicated and one shared part. The pooling itself is the allocation module's.
export const allocationShape = (units: number, perBeneficiary: number): { dedicated: number; shared: number } => ({ dedicated: Math.floor(units / perBeneficiary), shared: units % perBeneficiary });

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

// Rule: the units earned by the payments held for ONE commitment (a recurring gift), from the category's rule.
// `parts` is the parts in each instalment (bundle quantity x order quantity), `paid` the instalments paid, `planned` the plan's
// count (null when it runs until cancelled). Units can be a fraction. `target` is what the commitment adds up to, null when open ended.
export function unitsForCommitment(rule: InstalmentRule, o: { parts: number; paid: number; planned: number | null }): { units: number; target: number | null; complete: boolean } {
  if (rule === "per_period") return { units: o.parts * o.paid, target: o.planned === null ? null : o.parts * o.planned, complete: o.planned !== null && o.paid >= o.planned };
  // share_of_whole: only meaningful with a known count, because each instalment is 1/planned of the whole.
  if (o.planned === null) return { units: 0, target: null, complete: false };
  const share = Math.min(o.paid, o.planned) / o.planned;
  return { units: o.parts * share, target: o.parts, complete: o.paid >= o.planned };
}

// Rule: the units in one payment made at once. `monthsCovered` is how many periods the item's plan has (for a per_period item). A share_of_whole item is 1 whole.
export const unitsForSinglePayment = (rule: InstalmentRule, parts: number, monthsCovered: number): number => (rule === "per_period" ? parts * monthsCovered : parts);

// A framework is ready to run when its settings are filled in. Staff see this as a reminder, never a block.
export function missingFramework(f: FrameworkTemplate): string[] {
  const missing: string[] = [];
  if (f.unit.trim() === "") missing.push("what one delivery is (unit)");
  if (f.reportType.trim() === "") missing.push("report type");
  if (f.instalment === undefined) missing.push("how an instalment counts");
  return missing;
}

// Rule: a saved category is understood in the current shape (a framework id) or the legacy one (a framework inside it). Anything else is treated as empty.
export const isCurrentCategory = (x: unknown): x is Category => {
  const c = x as Category | null;
  if (!c || typeof c.id !== "string" || typeof c.name !== "string" || !Array.isArray(c.keywords)) return false;
  const legacy = !!c.framework && typeof c.framework === "object" && (c.framework.instalment === undefined || c.framework.instalment === "per_period" || c.framework.instalment === "share_of_whole");
  return typeof c.frameworkId === "string" || legacy;
};

export const isFrameworkTemplate = (x: unknown): x is FrameworkTemplate => {
  const f = x as FrameworkTemplate | null;
  return !!f && typeof f.id === "string" && f.id !== "" && typeof f.name === "string" && typeof f.unit === "string" && typeof f.reportType === "string" && typeof f.cycle === "string" && f.cycle in CYCLE_LABELS
    && Number.isInteger(f.unitsPerBeneficiary) && f.unitsPerBeneficiary >= 1 && (f.instalment === undefined || f.instalment === "per_period" || f.instalment === "share_of_whole") && (f.icon === undefined || typeof f.icon === "string") && (f.assign === undefined || f.assign === "auto" || f.assign === "suggest") && (f.confirmDays === undefined || (Number.isInteger(f.confirmDays) && f.confirmDays >= 0 && f.confirmDays <= 60)) && (f.confirmTell === undefined || typeof f.confirmTell === "string") && [f.reassign, f.urgent, f.approve, f.feedback].every((b) => b === undefined || typeof b === "boolean")
    && (f.stages === undefined || (Array.isArray(f.stages) && f.stages.length <= 20 && f.stages.every((t) => !!t && typeof t.id === "string" && typeof t.label === "string" && Number.isInteger(t.days) && t.days >= 0 && t.days <= 365 && Array.isArray(t.needs) && t.needs.every((n) => typeof n === "string") && typeof t.photo === "boolean" && typeof t.canPause === "boolean" && typeof t.tell === "string")))
    && (f.tasks === undefined || (Array.isArray(f.tasks) && f.tasks.length <= 30 && f.tasks.every((t) => !!t && typeof t.id === "string" && typeof t.label === "string" && Number.isInteger(t.afterMonths) && t.afterMonths >= 0 && t.afterMonths <= 120 && typeof t.photo === "boolean")))
;
};
