# Module 10: Outcomes list

## Purpose
The list of outcomes that gifts create (OUT-0001): for benefits where the gift comes first (a pump, a camp) or that have no beneficiary (a mosque). One line for each, with the benefit, project, partner, donor, plan, how far funded, and what the gift did in each of twelve months.

## Inputs
Placement records of kind "outcome" (module 09), the gifts' plans (`commitmentsFor` in module 07), the partner of each gift (module 08), and the units that make a whole outcome (item or workflow).

## Outputs
`outcomeRows`: one row for each outcome with funded %, live or ended (and why), the month cells and an allocation score. The page is `app/outcome-records-page.ts`.

## Rules
See the header of `outcome-records.ts`. Funded is the units the gift holds out of the whole. An ended outcome stays in the list, marked ended.

## Decisions
DECISIONS 197.

## How to test
`npx vitest run modules/10-outcome-records app/outcome-records-page.test.ts`

## Not built yet
Several gifts funding one outcome, recipients, and the stages after allocation.
