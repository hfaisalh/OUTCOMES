/**
 * priority-gifts.ts
 *
 * What it does: gifts marked Priority (DECISIONS 284). A person marks a gift so its benefit is assigned to a partner, and then allocated, ahead of the others.
 * Who calls it: the server (modules/00-platform/outcomes-handler.ts), the demo and the pages (they build the assignment and allocation contexts from it), and the tests. Depends on nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: the list holds assignment keys: "sub:" and the subscription for a recurring gift, the payment's key for a one-off. A recurring gift is one assignment, so one mark covers all its payments.
 * - Rule: Priority puts a gift ahead of the others in the order of assignment and of allocation. Between gifts that have it, and between those that do not, the order is unchanged: the oldest payment first.
 * - Rule: a workflow can switch this off with its "Urgent first" setting (DECISIONS 138); then its gifts keep the usual order whatever is marked.
 * - Rule: it changes the order only. It never makes a gift eligible: a gift with no partner room or no beneficiary still waits.
 */

export const prioritySet = (list: readonly string[] | undefined): Set<string> => new Set(list ?? []);

// Marks or unmarks one gift. Returns the same list when nothing changes.
export function setGiftPriority(list: readonly string[] | undefined, key: string, on: boolean): string[] {
  const now = list ?? [];
  const has = now.includes(key);
  if (key === "" || has === on) return [...now];
  return on ? [...now, key] : now.filter((k) => k !== key);
}
