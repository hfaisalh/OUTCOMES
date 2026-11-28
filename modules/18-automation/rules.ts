/**
 * rules.ts
 *
 * What it does: the settings of the automatic work (DECISIONS 326): whether OUTCOMES runs by itself once a day, which jobs it does when it runs (assign, allocate, remind), and when it reminds a partner. Nothing here is fixed in the code: every value is a setting on the Rules page, with the default below.
 * Who calls it: the Rules page (app/setup/rules-settings.ts), the server and demo (the auto-rule request) and the sweep (sweep.ts). Depends on: nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: the defaults are chosen to be safe with real data. Reminders go out (they only add a message to the partner's inbox); the scheduled Assign and Allocate are OFF until a person switches them on. Assign still follows each workflow's own Automatic or Suggest setting.
 * - Rule: moving an unanswered gift to another partner is set for each workflow (moveAfterDays on the workflow) and is off until set.
 */

export interface AutoRules {
  daily: boolean; // run by itself once a day (the scheduled job). Off: only "Run now" runs it
  assign: boolean; // when it runs, assign released gifts (each workflow's own Automatic or Suggest setting still applies)
  allocate: boolean; // when it runs, allocate assigned gifts to places or outcomes
  remind: boolean; // when it runs, put reminders in the partners' inboxes
  remindBefore: number; // days before a deadline to remind a partner, 0 to 14 (0: only on the day)
  remindLate: boolean; // remind a partner each day it is late
}
export const DEFAULT_AUTO: AutoRules = { daily: true, assign: false, allocate: false, remind: true, remindBefore: 1, remindLate: true };
export const MAX_REMIND_BEFORE = 14;

export const autoRulesOf = (saved: Partial<AutoRules> | undefined): AutoRules => ({ ...DEFAULT_AUTO, ...(saved ?? {}) });

const FLAGS = ["daily", "assign", "allocate", "remind", "remindLate"] as const;
// Sets one rule. A yes or no setting takes true or false; the days take a whole number from 0 to 14.
export function setAutoRule(saved: Partial<AutoRules> | undefined, key: unknown, value: unknown): { value: AutoRules } | { error: string } {
  const cur = autoRulesOf(saved);
  if (typeof key === "string" && (FLAGS as readonly string[]).includes(key)) {
    if (typeof value !== "boolean") return { error: "That setting is on or off." };
    return { value: { ...cur, [key]: value } };
  }
  if (key === "remindBefore") {
    const n = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : NaN);
    if (!Number.isInteger(n) || n < 0 || n > MAX_REMIND_BEFORE) return { error: `Remind a partner 0 to ${MAX_REMIND_BEFORE} days before a deadline.` };
    return { value: { ...cur, remindBefore: n } };
  }
  return { error: "That setting is not known." };
}
