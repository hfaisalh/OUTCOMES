# 15 Partner costs

**Purpose.** A partner records what it spent on running its work beyond the work orders (administration, marketing, media and so on). Kept for reporting only. OUTCOMES does not manage money: nothing is paid or approved.

**Inputs.** A partner's request: `cost-add`, `cost-set`, `cost-remove` (date, category, amount, currency, optional project and note).

**Outputs.** `config.partnerCosts` (records `PC-0001`...). The partner's slice carries only its own costs; the staff reply carries all of them.

**Rules (pure, in `costs.ts`).** Own costs only; amount above zero, 2 decimals; a category from the list; a project the partner delivers; one total per currency, never mixed.

**Files.** `costs.ts` (rules), `modules/00-platform/partner-handler.ts` (the `cost-` actions), `app/partner-costs.ts` and `app/partner-cost-session.ts` (the partner's card and form), `app/costs-card.ts` (staff Dashboard card).

**Decisions.** DECISIONS 280.

**How to test.** `npx vitest run modules/15-partner-costs modules/00-platform/partner-handler.test.ts app/partner-costs.test.ts`.
