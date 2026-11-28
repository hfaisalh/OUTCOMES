/**
 * order.ts
 *
 * What it does: the order in which a gift looks for a place, as settings an organisation can change (DECISIONS 293). It used to be fixed in the code; now the steps are a list that can be put in a different order and switched off.
 * Who calls it: allocation.ts (optionsFor sorts the open places by it), the server (the `alloc-steps` request), the Automation rules page and the tests. Depends on nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: two things never move. A plan that runs again is offered its previous beneficiary first (DECISIONS 186), and when every step has had its say the earliest enrolled place wins, so the result is always the same. Both are shown on the page, locked.
 * - Rule: three steps can be reordered and switched off: "own" (the assigned partner's own beneficiaries, DECISIONS 183), "priority" (a beneficiary marked Priority, DECISIONS 282) and "fill" (the place with the fewest units already funded, so more beneficiaries are sponsored, DECISIONS 183).
 * - Rule: a step that is off is skipped. A saved list that is missing a step, repeats one or names one that does not exist is repaired, never refused, so an older or damaged setting cannot stop allocation.
 */

export type StepId = "own" | "priority" | "fill";
export interface Step { id: StepId; on: boolean }

export const STEP_IDS: StepId[] = ["own", "priority", "fill"];
export const DEFAULT_STEPS: Step[] = STEP_IDS.map((id) => ({ id, on: true }));

// What a person sees for each step: a short name, and what it does.
export const STEP_TEXT: Record<StepId, { name: string; does: string }> = {
  own: { name: "The partner's own beneficiaries", does: "A gift goes first to a beneficiary the assigned partner gave, since a partner's room is its own beneficiaries." },
  priority: { name: "Beneficiaries marked Priority", does: "A beneficiary marked Priority is funded before one that is not." },
  fill: { name: "The place with the least funded", does: "The beneficiary with the fewest units already funded goes first, so more beneficiaries are sponsored." },
};

// Reads a saved list into a safe one: known steps once each, in the saved order, any missing step added at the end and on.
export function normaliseSteps(raw: unknown): Step[] {
  const seen = new Set<StepId>();
  const out: Step[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const id = (x as { id?: unknown } | null)?.id;
      if (STEP_IDS.includes(id as StepId) && !seen.has(id as StepId)) {
        seen.add(id as StepId);
        out.push({ id: id as StepId, on: (x as { on?: unknown }).on !== false });
      }
    }
  }
  for (const id of STEP_IDS) if (!seen.has(id)) out.push({ id, on: true });
  return out;
}

// Moves a step to a new position (0 is first). An unknown step or a position outside the list changes nothing.
export function reorder(steps: Step[], id: StepId, to: number): Step[] {
  const from = steps.findIndex((s) => s.id === id);
  if (from < 0 || to < 0 || to >= steps.length || from === to) return steps;
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as Step);
  return next;
}

export const setStepOn = (steps: Step[], id: StepId, on: boolean): Step[] => steps.map((s) => (s.id === id ? { ...s, on } : s));

// --- The rule itself ---
// What the comparison needs to know about two open places.
export interface PlaceFacts { own: boolean; priority: boolean; used: number }

// Negative when `a` should be tried before `b`. Steps that are off are skipped; a tie goes to the next step.
export function comparePlaces(steps: Step[], a: PlaceFacts, b: PlaceFacts): number {
  for (const s of steps) {
    if (!s.on) continue;
    const d = s.id === "own" ? Number(b.own) - Number(a.own) : s.id === "priority" ? Number(b.priority) - Number(a.priority) : a.used - b.used;
    if (d !== 0) return d;
  }
  return 0;
}

// The order in words, for the rules list: "the partner's own beneficiaries, then ..., then ...".
export function orderText(steps: Step[]): string {
  const on = steps.filter((s) => s.on).map((s) => STEP_TEXT[s.id].name.toLowerCase());
  return on.length === 0 ? "no step (only the earliest enrolled)" : on.join(", then ");
}
