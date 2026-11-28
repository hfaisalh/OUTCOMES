/**
 * costs.ts
 *
 * What it does: the rules for the costs a partner records (DECISIONS 280): what it spent on running its work, beyond what each work order delivers, such as administration, marketing and media. They are kept for reporting only.
 * Who calls it: the partner server (modules/00-platform/partner-handler.ts), the partner's screen, the staff Dashboard card and the tests. Depends on nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 * Data flow: a partner adds, corrects or removes its own costs. MWF reads all of them. Totals are worked out here, one figure for each currency.
 *
 * Rules:
 * - Rule (DECISIONS 290): a cost may be for one benefit the partner has activated on its profile. The rate agreed for a benefit is usually all inclusive; when it is not, the extra delivery costs are recorded here against the benefit. A future invoice can then be worked out from the agreed rate and these costs.
 * - Rule: record only. OUTCOMES does not manage money (CLAUDE.md): a cost is never paid, approved, matched to a gift or taken from anything. Finance stays in Salesforce and QuickBooks.
 * - Rule: a partner changes only its own costs. A cost has an amount above zero, a date, a category and a currency.
 * - Rule: currencies are never mixed. A total is given for each currency, as on the Gifts page.
 */

// --- Types ---
export interface PartnerCost {
  id: string; // PC-0001, permanent
  partnerId: string;
  date: string; // YYYY-MM-DD, when it was spent
  category: string; // one of the organisation's cost categories
  amount: number; // above zero, at most 2 decimal places
  currency: string; // 3 capital letters, for example GBP or PKR
  projectId: string; // the project it was for, "" for the partner's work in general
  itemId: string; // the benefit it was for, one the partner has activated on its profile, "" when not for one benefit (DECISIONS 290)
  note: string; // a few words, may be empty
  by: string; // who recorded it, a display name
  at: string; // ISO time it was recorded or last changed
}
export interface PartnerCosts { records: PartnerCost[]; counter: number }
export const emptyCosts = (): PartnerCosts => ({ records: [], counter: 0 });

// The starter list. An organisation can have its own later.
export const COST_CATEGORIES = ["Administration", "Staff", "Marketing", "Media", "Travel", "Equipment", "Other"];
export const MAX_AMOUNT = 1_000_000_000;

type Result = { value: PartnerCosts; id: string } | { error: string };
const clean = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const validDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

// Reads what a person typed into a clean cost, or an error in plain words.
function read(raw: Record<string, unknown>, categories: string[], projectIds: string[], benefitIds: string[]): Omit<PartnerCost, "id" | "partnerId" | "by" | "at"> | { error: string } {
  const date = clean(raw["date"], 10);
  if (!validDate(date)) return { error: "Write the date as YYYY-MM-DD, for example 2026-11-28." };
  const category = clean(raw["category"], 40);
  if (!categories.includes(category)) return { error: "Choose a category from the list." };
  const text = clean(raw["amount"], 20).replace(/,/g, "");
  const amount = Number(text);
  if (text === "" || !Number.isFinite(amount) || amount <= 0 || amount >= MAX_AMOUNT || Math.round(amount * 100) / 100 !== amount) return { error: "The amount is a number above zero with at most 2 decimal places, for example 1250.50." };
  const currency = clean(raw["currency"], 10).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "The currency is 3 letters, for example GBP or PKR." };
  const projectId = clean(raw["projectId"], 80);
  if (projectId !== "" && !projectIds.includes(projectId)) return { error: "Choose one of your own projects, or none." };
  const itemId = clean(raw["itemId"], 100);
  if (itemId !== "" && !benefitIds.includes(itemId)) return { error: "Choose one of the benefits you deliver, or none." };
  return { date, category, amount, currency, projectId, itemId, note: clean(raw["note"], 200) };
}

// --- Adding, correcting, removing ---
export function addCost(s: PartnerCosts, partnerId: string, raw: Record<string, unknown>, categories: string[], projectIds: string[], benefitIds: string[], by: string, at: string): Result {
  const c = read(raw, categories, projectIds, benefitIds);
  if ("error" in c) return c;
  const counter = s.counter + 1;
  const id = `PC-${String(counter).padStart(4, "0")}`;
  return { value: { records: [...s.records, { id, partnerId, ...c, by, at }], counter }, id };
}

export function setCost(s: PartnerCosts, partnerId: string, id: string, raw: Record<string, unknown>, categories: string[], projectIds: string[], benefitIds: string[], by: string, at: string): Result {
  const mine = s.records.find((r) => r.id === id && r.partnerId === partnerId); // Rule: only its own
  if (!mine) return { error: "That cost was not found." };
  const c = read(raw, categories, projectIds, benefitIds);
  if ("error" in c) return c;
  return { value: { ...s, records: s.records.map((r) => (r.id === id ? { ...mine, ...c, by, at } : r)) }, id };
}

export function removeCost(s: PartnerCosts, partnerId: string, id: string): Result {
  if (!s.records.some((r) => r.id === id && r.partnerId === partnerId)) return { error: "That cost was not found." };
  return { value: { ...s, records: s.records.filter((r) => r.id !== id) }, id };
}

// --- What the partner may send, and the answer to it ---
// A request from a partner screen. `null` when it is not about costs.
export function applyCostAction(s: PartnerCosts, partnerId: string, body: Record<string, unknown>, categories: string[], projectIds: string[], benefitIds: string[], by: string, at: string): (Result & { message?: string }) | null {
  const id = typeof body["id"] === "string" ? body["id"] : "";
  if (body["action"] === "cost-add") { const r = addCost(s, partnerId, body, categories, projectIds, benefitIds, by, at); return "error" in r ? r : { ...r, message: "Cost recorded." }; }
  if (body["action"] === "cost-set") { const r = setCost(s, partnerId, id, body, categories, projectIds, benefitIds, by, at); return "error" in r ? r : { ...r, message: "Cost saved." }; }
  if (body["action"] === "cost-remove") { const r = removeCost(s, partnerId, id); return "error" in r ? r : { ...r, message: "Cost removed." }; }
  return null;
}

// --- Reporting ---
export const ownCosts = (s: PartnerCosts, partnerId: string): PartnerCost[] => s.records.filter((r) => r.partnerId === partnerId);

// One total for each currency, biggest first. `by` picks what the rows are: the partner, the category, the project or the month (YYYY-MM).
export type CostBy = "partner" | "category" | "project" | "benefit" | "month";
export interface CostRow { key: string; totals: { currency: string; amount: number }[]; count: number }
export function costRows(records: PartnerCost[], by: CostBy): CostRow[] {
  const groups = new Map<string, { sums: Map<string, number>; count: number }>();
  for (const r of records) {
    const key = by === "partner" ? r.partnerId : by === "category" ? r.category : by === "project" ? r.projectId : by === "benefit" ? (r.itemId ?? "") : r.date.slice(0, 7);
    const g = groups.get(key) ?? { sums: new Map<string, number>(), count: 0 };
    g.sums.set(r.currency, Math.round(((g.sums.get(r.currency) ?? 0) + r.amount) * 100) / 100);
    g.count++;
    groups.set(key, g);
  }
  const biggest = (r: CostRow): number => Math.max(0, ...r.totals.map((t) => t.amount));
  return [...groups].map(([key, g]) => ({ key, count: g.count, totals: [...g.sums].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount) })).sort((a, b) => biggest(b) - biggest(a) || a.key.localeCompare(b.key));
}

// All records added up, one figure for each currency, as text: "GBP 1,250.50 · PKR 40,000.00".
export function totalText(records: { currency: string; amount: number }[]): string {
  const sums = new Map<string, number>();
  for (const r of records) sums.set(r.currency, Math.round(((sums.get(r.currency) ?? 0) + r.amount) * 100) / 100);
  return [...sums].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" · ") || "None";
}
