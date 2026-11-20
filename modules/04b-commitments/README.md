# Module 4b: Commitments

## Purpose
Shows each recurring gift as one commitment: all its paid instalments grouped by subscription id, with "paid out of planned", the parts per instalment and anything odd (DECISIONS 53). Read only. It prepares the ground for allocation without allocating anything.

## Inputs
The saved work orders (excluded ones are left out).

## Outputs
- A list of commitments, those needing a look first: subscription, supporter, item, parts, paid of planned, first and last paid date, the line ids.
- A list of recurring lines with no subscription id, each with suggested commitments (same supporter and item, nearest date first).

## Rules
- Needs a look: a gap in instalment numbers, a plan that starts late (the export begins part way through it), instalments with different parts, or lines that disagree on supporter or item.
- A suggestion links nothing. A person checks the CRM.
- Units are shown on the page, not in the module: the category's setting for how an instalment counts decides whether an instalment is a month or a share of a whole (DECISIONS 52, 58), with `unitsForCommitment` in Module 2. A category without the setting shows no units.

## How to test
`npm test`. `commitments.test.ts` is pure and shows each rule on invented work orders.
