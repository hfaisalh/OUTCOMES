/**
 * benefits.ts
 *
 * What it does: which kind of benefit each gift item has (DECISIONS 143, 146). A benefit is what a gift item delivers, so each item has one. Its kind says what the
 * specific beneficiary is, which decides the fields and evidence of its profile. A kind is an outcome type, configured on the Benefits page. This module holds a suggestion of a kind
 * from an item's name and the rule for choosing one. The kind of each item is set once, in Settings, and flows through the work order unchanged.
 * Who calls it: the Benefits page (app/benefits-page.ts), the demo (app/main.ts) and the server (modules/00-platform/handlers.ts). Depends on: nothing. Pure.
 *
 * Rules:
 * - The six standard kinds (Person(s), Activity, Build, Distribution, Programme, Waqf) are the starting set. Staff add others. Micro finance is a fund, dealt with separately (DECISIONS 145).
 * - An item's kind is the one a person chose, else the one suggested from its name, else none ("" and it asks for a choice).
 * - A suggestion changes nothing. Only a person's choice is saved.
 */

// The ids of the standard kinds, which the suggestion uses. A kind is an outcome type (modules/05-outcomes/outcome-types.ts), so staff can change these or add others.
export const STANDARD_KINDS = ["person", "activity", "build", "distribution", "programme", "waqf"] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

// Rule: a kind suggested from an item's name, the more specific words first. Blank when nothing fits, so a person chooses.
const HINTS: [RegExp, StandardKind][] = [
  [/waqf/i, "waqf"],
  [/qurbani|sacrifice|aqiqah|food pack|ration|clothing|blanket|\btent|distribution|hamper/i, "distribution"],
  [/camp|iftar|event|training|workshop|seminar/i, "activity"],
  [/feeding|clinic service|mobile clinic|running cost|programme|program\b/i, "programme"],
  [/pump|well|tanker|filtration|\bplant\b|home|house|shelter|school build|mosque|masjid|construct|build/i, "build"],
  [/sponsor|scholarship|orphan|student|hifz|aalim|alim|uni(versity)?\b|patient|surgery|rickshaw|startup|start-up|trade|livelihood|widow|family/i, "person"],
];
export function suggestKind(itemName: string): StandardKind | "" {
  for (const [re, kind] of HINTS) if (re.test(itemName)) return kind;
  return "";
}

// Rule: the kind of an item: the one chosen, else the suggestion, else none. `chosen` says whether a person chose it. A kind that no longer exists (removed) is ignored,
// and a suggestion is only offered when the organisation has that kind.
export function kindOf(itemKinds: Record<string, string>, itemId: string, itemName: string, known: string[]): { kind: string; chosen: boolean } {
  const c = itemKinds[itemId];
  if (c !== undefined && known.includes(c)) return { kind: c, chosen: true };
  const sug = suggestKind(itemName);
  return { kind: sug !== "" && known.includes(sug) ? sug : "", chosen: false };
}

// Rule: choosing a kind saves it for the item. An empty kind takes the choice back, so the suggestion shows again. A kind that is not in `known` or an unknown item is refused.
export function setItemKind(itemKinds: Record<string, string>, itemId: string, kind: string, known: string[]): { value: Record<string, string> } | { error: string } {
  if (itemId === "" || itemId.length > 200) return { error: "That item was not found." };
  if (kind !== "" && !known.includes(kind)) return { error: "That kind was not found." };
  const next = { ...itemKinds };
  if (kind === "") delete next[itemId]; else next[itemId] = kind;
  return { value: next };
}
