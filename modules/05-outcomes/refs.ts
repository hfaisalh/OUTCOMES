/**
 * refs.ts
 *
 * What it does: IDs for outcomes and allocations (DECISIONS 105). Every outcome (an orphan, a pump, a house, an activity, a cart, a rickshaw, a livelihood)
 * and every allocation has an ID made of a prefix and a number, such as ORP-0007 or AL-0012, so a list says what each one is at a glance. The prefix of an
 * outcome comes from its outcome type and can be changed. The number counts up for each prefix and is never used twice.
 * Who calls it: the Outcomes endpoint (modules/00-platform/handlers.ts) and the demo (app/main.ts). Depends on: the outcome types. Pure functions.
 *
 * Rules:
 * - An ID is the prefix, a dash and the number with at least four digits (ORP-0007). The number goes past four digits when it needs to.
 * - A counter for a prefix only goes up. An ID already in use, from a typed or bulk assigned ID, is skipped, so nothing is ever given twice.
 * - Changing a type's prefix changes new IDs only. Existing IDs stay as they are.
 * - An outcome with no ID is given one when the setup is next read or changed, so older outcomes get theirs too.
 */

import type { OutcomeType } from "./outcome-types.js";
import type { OutcomeAllocation, Outcome } from "./outcomes.js";

export const DEFAULT_ALLOCATION_PREFIX = "AL";
export type RefCounters = Record<string, number>;

// Rule: a prefix is 2 to 5 capital letters or digits.
export const cleanPrefix = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
export const validPrefix = (s: string): boolean => /^[A-Z0-9]{2,5}$/.test(s);

// A suggested prefix for a name: its first three letters in capitals ("House build" gives HOU), made unique with a digit when taken.
export function defaultPrefix(name: string, taken: string[]): string {
  const base = cleanPrefix(name.replace(/[^A-Za-z]/g, "")).slice(0, 3).padEnd(2, "X");
  let p = base;
  for (let n = 2; taken.includes(p); n++) p = `${base.slice(0, 3)}${n}`.slice(0, 5);
  return p;
}

// The starter prefixes, then a suggestion for any type that has none (a type saved before IDs existed).
const STARTER: Record<string, string> = { orphan: "ORP", child: "CHD", "water-pump": "PMP" };
export function withPrefixes(types: OutcomeType[]): OutcomeType[] {
  const taken = types.map((t) => t.prefix ?? "").filter((x) => x !== "");
  return types.map((t) => {
    if (t.prefix) return t;
    const p = STARTER[t.id] && !taken.includes(STARTER[t.id] as string) ? (STARTER[t.id] as string) : defaultPrefix(t.name, taken);
    taken.push(p);
    return { ...t, prefix: p };
  });
}

const pad = (n: number): string => String(n).padStart(4, "0");
const numberOf = (ref: string, prefix: string): number => {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(ref);
  return m ? Number(m[1]) : 0;
};

// The next free ID for a prefix. `used` holds every ID already in use, so a typed one is never repeated.
export function nextRef(prefix: string, counters: RefCounters, used: Set<string>): { ref: string; counters: RefCounters } {
  let n = counters[prefix] ?? 0;
  let ref = "";
  do { n++; ref = `${prefix}-${pad(n)}`; } while (used.has(ref));
  return { ref, counters: { ...counters, [prefix]: n } };
}

export interface RefState {
  outcomes: Outcome[];
  outcomeAllocations: OutcomeAllocation[];
  counters: RefCounters;
}

/**
 * Rule: gives an ID to every outcome and allocation that has none, and the outcome type to every outcome that has none. An outcome with no type takes the
 * type that has its framework, else the orphan type (older outcomes were all orphans, and a type saved as "child" still counts), else the first type. Counters are first raised to the highest number already used
 * for each prefix, so they never go backwards. Running it again changes nothing.
 */
export function ensureRefs(s: RefState, types: OutcomeType[], allocationPrefix = DEFAULT_ALLOCATION_PREFIX): RefState & { changed: boolean } {
  const withP = withPrefixes(types);
  const prefixOf = (typeId: string): string => withP.find((t) => t.id === typeId)?.prefix ?? "OUT";
  const fallbackType = withP.find((t) => t.id === "orphan")?.id ?? withP.find((t) => t.id === "child")?.id ?? withP[0]?.id ?? "";
  const used = new Set<string>([...s.outcomes.map((o) => o.ref ?? ""), ...s.outcomeAllocations.map((a) => a.ref ?? "")].filter((x) => x !== ""));
  let counters: RefCounters = { ...s.counters };
  const prefixes = [...withP.map((t) => t.prefix as string), allocationPrefix];
  for (const p of prefixes) {
    const high = Math.max(0, ...[...used].map((r) => numberOf(r, p)));
    if (high > (counters[p] ?? 0)) counters = { ...counters, [p]: high };
  }
  let changed = false;
  const outcomes = s.outcomes.map((o) => {
    // The type is the one that has the outcome's framework, else the orphan type (older outcomes were all orphans).
    const typeId = o.outcomeTypeId ?? withP.find((t) => t.frameworkIds.includes(o.frameworkId))?.id ?? fallbackType;
    if (o.ref && o.outcomeTypeId) return o;
    changed = true;
    if (o.ref) return { ...o, outcomeTypeId: typeId };
    const n = nextRef(prefixOf(typeId), counters, used);
    counters = n.counters;
    used.add(n.ref);
    return { ...o, outcomeTypeId: typeId, ref: n.ref };
  });
  const outcomeAllocations = s.outcomeAllocations.map((a) => {
    if (a.ref) return a;
    changed = true;
    const n = nextRef(allocationPrefix, counters, used);
    counters = n.counters;
    used.add(n.ref);
    return { ...a, ref: n.ref };
  });
  return { outcomes, outcomeAllocations, counters, changed: changed || JSON.stringify(counters) !== JSON.stringify(s.counters) };
}
