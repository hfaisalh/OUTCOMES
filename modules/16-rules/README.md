# 16 Automation rules

**Purpose.** One plain-English list of the rules OUTCOMES follows when it assigns, confirms, allocates and enrols by itself, so it is obvious what the automation does. Shown on the Automation rules page (Set up), with the settings that can be changed beside each group.

**Inputs.** The live settings: grace days, whether an ID is needed, the default or a partner's batch size.

**Outputs.** Five sections in the order a gift travels: assign, confirm, allocate, waiting, release. Each rule has its words and the decision it comes from.

**Rules.** This module only describes. The behaviour stays in modules 07 (waiting list), 08 (assignment), 09 (allocation) and 11 (confirmation). When a rule there changes, change its line here; `rules.test.ts` checks the numbers and the allocation order so a mismatch shows.

**Changing a rule.** Per workflow: assign mode, urgent first, move to another partner, days to confirm (Workflows page handlers). Global: ID required, grace days. The order of the allocation steps is code, not setting.

**Files.** `rules.ts`, `app/setup/rules-page.ts`.

**Decisions.** DECISIONS 283.

**How to test.** `npx vitest run modules/16-rules app/setup/rules-page.test.ts`.
