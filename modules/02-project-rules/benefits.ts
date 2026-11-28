/**
 * benefits.ts
 *
 * What it does: the types of benefit (DECISIONS 143) and which type each gift item has. Called "kind" in the code and the saved settings, shown as "type" on screen (DECISIONS 147). A benefit is what a gift item delivers, so each item has one. Its kind says what the
 * specific beneficiary is, which decides the fields and evidence of its profile. This module holds the list of kinds, a suggestion of a kind from an item's name, and the rule
 * for choosing one. The kind of each item is set once, in Settings, and flows through the work order unchanged.
 * Who calls it: the Benefits page (app/setup/benefits-page.ts), the demo (app/main.ts) and the server (modules/00-platform/handlers.ts). Depends on: nothing. Pure.
 *
 * Rules:
 * - Six kinds for now: Person(s), Activity, Build, Distribution, Programme, Waqf. Micro finance is dealt with separately and is not a kind yet (DECISIONS 143).
 * - An item's kind is the one a person chose, else the one suggested from its name, else none ("" and it asks for a choice).
 * - A suggestion changes nothing. Only a person's choice is saved.
 */

export type BenefitKind = "person" | "activity" | "build" | "distribution" | "programme" | "waqf";

export interface KindInfo {
  id: BenefitKind;
  label: string;
  what: string; // what the beneficiary is, in plain words
  counted: string; // what is counted
  proof: string; // what proves it was delivered
  examples: string;
}

export const KINDS: KindInfo[] = [
  { id: "person", label: "Person(s)", what: "One person or a list of people: a person, a family, a cohort", counted: "People", proof: "Profile updates, photos, reports", examples: "Orphan sponsorship, scholarship, a family startup" },
  { id: "activity", label: "Activity", what: "An event on a date, for people or an institution", counted: "The event", proof: "Date, location, attendance, photos", examples: "Medical camp, iftar, training" },
  { id: "build", label: "Build", what: "Something made or installed at a location, with its own ID and stages", counted: "The item", proof: "Location, progress stages, photos, handover", examples: "Water pump, house, school, solar well" },
  { id: "distribution", label: "Distribution", what: "Goods handed over in quantity", counted: "Quantity", proof: "Quantity delivered, recipients, receipts", examples: "Qurbani, food packs, tents, planting" },
  { id: "programme", label: "Programme", what: "An ongoing service funded regularly", counted: "People served each month", proof: "Monthly counts", examples: "Feeding programme, mobile clinic" },
  { id: "waqf", label: "Waqf", what: "An asset given to the organisation that earns income. Set up later", counted: "The asset", proof: "To be set up", examples: "A donated property" },
];

export const KIND_IDS: BenefitKind[] = KINDS.map((k) => k.id);
export const isKind = (x: string): x is BenefitKind => (KIND_IDS as string[]).includes(x);
export const kindLabel = (id: string): string => KINDS.find((k) => k.id === id)?.label ?? "";

// Rule: a kind suggested from an item's name, the more specific words first. Blank when nothing fits, so a person chooses.
const HINTS: [RegExp, BenefitKind][] = [
  [/waqf/i, "waqf"],
  [/qurbani|sacrifice|aqiqah|food pack|ration|clothing|blanket|\btent|distribution|hamper/i, "distribution"],
  [/camp|iftar|event|training|workshop|seminar/i, "activity"],
  [/feeding|clinic service|mobile clinic|running cost|programme|program\b/i, "programme"],
  [/pump|well|tanker|filtration|\bplant\b|home|house|shelter|school build|mosque|masjid|construct|build/i, "build"],
  [/sponsor|scholarship|orphan|student|hifz|aalim|alim|uni(versity)?\b|patient|surgery|rickshaw|startup|start-up|trade|livelihood|widow|family/i, "person"],
];
export function suggestKind(itemName: string): BenefitKind | "" {
  for (const [re, kind] of HINTS) if (re.test(itemName)) return kind;
  return "";
}

// Rule: the kind of an item: the one chosen, else the suggestion, else none. `chosen` says whether a person chose it.
export function kindOf(itemKinds: Record<string, string>, itemId: string, itemName: string): { kind: BenefitKind | ""; chosen: boolean } {
  const c = itemKinds[itemId];
  if (c !== undefined && isKind(c)) return { kind: c, chosen: true };
  return { kind: suggestKind(itemName), chosen: false };
}

// Rule: choosing a kind saves it for the item. An empty kind takes the choice back, so the suggestion shows again. An unknown kind or item is refused.
export function setItemKind(itemKinds: Record<string, string>, itemId: string, kind: string): { value: Record<string, string> } | { error: string } {
  if (itemId === "" || itemId.length > 200) return { error: "That item was not found." };
  if (kind !== "" && !isKind(kind)) return { error: "That type was not found." };
  const next = { ...itemKinds };
  if (kind === "") delete next[itemId]; else next[itemId] = kind;
  return { value: next };
}

// Rule (DECISIONS 188): the units that make one whole beneficiary belong to the benefit (the item), not to its workflow. Orphan sponsorship is 3 parts shared by donors, a scholarship is 1. An item with no number of
// its own takes its workflow's. Whole numbers from 1 to 20. Empty takes the item's own number back.
export const MAX_ITEM_UNITS = 20;
export function setItemUnits(itemUnits: Record<string, number>, itemId: string, units: unknown): { value: Record<string, number> } | { error: string } {
  if (itemId === "" || itemId.length > 200) return { error: "That item was not found." };
  const raw = typeof units === "number" ? String(units) : typeof units === "string" ? units.trim() : "";
  if (raw === "" || raw === "0") { const { [itemId]: _gone, ...rest } = itemUnits; return { value: rest }; }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ITEM_UNITS) return { error: `Units per beneficiary is a whole number from 1 to ${MAX_ITEM_UNITS}, or empty to use the workflow's.` };
  return { value: { ...itemUnits, [itemId]: n } };
}
export const unitsOfItem = (itemUnits: Record<string, number> | undefined, itemId: string, fallback: number): number => Math.max(1, itemUnits?.[itemId] ?? fallback);
