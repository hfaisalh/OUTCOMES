# 18 Automation

**Purpose.** What OUTCOMES does by itself, and when (DECISIONS 326): reminders to partners, moving a gift a partner has not answered, the partner's inbox, and the daily run. Nothing here is fixed in code: every value is a setting on the Rules page.

**Inputs.** The settings (`autoRules` in the saved setup, and `moveAfterDays` on each workflow), the work orders, partners, workflows, and the records of assignments, answers, allocations and steps.

**Outputs.** New answers (a move is a refusal, "No answer within N days", by Automation), assignments with moved gifts taken back, and messages in the partners' inboxes.

**Files.**
- `rules.ts` the settings and their defaults (reminders on; scheduled Assign and Allocate off).
- `messages.ts` the inbox: add (no duplicates, latest 100 each), read, and the wording of each kind. No donor details.
- `sweep.ts` the daily sweep: who to remind, who is late, which unanswered gifts to move.
- `input.ts` builds the sweep's input from the records, and the messages that follow an assignment run and a rejection at review.
- `run.ts` the sweep over a whole set of records. The server and the demo both call it.

**Decisions.**
- A partner answers gift by gift, so only unanswered gifts move, never a whole batch.
- A move reuses the refusal route. Automatic assignment no longer offers a gift back to a partner that refused it (`refusedBy`, `contextFrom({ refused })`).
- The run is: sweep, then Assign, then Allocate, each only if its setting is on. The scheduled job is the existing daily CRM pick-up (`vercel.json`, 03:00), which then calls the run for every organisation that has "Run by itself once a day" on, as a system session named Automation. A person can press Run now.
- The hosting plan allows the scheduled job once a day, so the time of day is not a setting.

**How to test.** `npx vitest run modules/18-automation`. The server run and the scheduled run are tested in `modules/00-platform/partner-handler.test.ts` with an invented organisation.
