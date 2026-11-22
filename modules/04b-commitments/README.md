# Module 4b: Commitments

## Purpose
Groups the work orders into commitments, and `gifts.ts` turns them into the rows of the Gifts list (DECISIONS 77), which replaced the separate Commitments page. The list is one compact line per gift with symbols and a details window (DECISIONS 78). A commitment is each recurring gift as one record: all its paid instalments grouped by subscription id, with "paid out of planned", the parts per instalment and anything odd (DECISIONS 53). Read only. It prepares the ground for allocation without allocating anything.

## Inputs
The saved work orders (excluded ones are left out).

## Outputs
- A list of commitments, those needing a look first: subscription, supporter, item, parts, paid of planned, first and last paid date, the line ids.
- One-off payments for per-period items are built by `oneOffCommitments` and `allocatable` for the Outcomes tab only. They cover the months of the item's plan from the month paid and free their parts after (DECISIONS 64). They are not listed here.
- A list of recurring lines with no subscription id, each with suggested commitments (same supporter and item, nearest date first).

## Rules
- Needs a look: a gap in instalment numbers, a plan that starts late (the export begins part way through it), instalments with different parts, or lines that disagree on supporter or item.
- A suggestion links nothing. A person checks the CRM.
- Units are shown on the page, not in the module: the category's setting for how an instalment counts decides whether an instalment is a month or a share of a whole (DECISIONS 52, 58), with `unitsForCommitment` in Module 2. A category without the setting shows no units.

## How to test
`npm test`. `commitments.test.ts` is pure and shows each rule on invented work orders.


## Catch-up payments (DECISIONS 84)
`catch-up.ts` spots a payment that looks like it covers more than one instalment (worth 2 to 6 times the usual value), suggests the months it fills (a gap first, else the months before), and counts covered months. A person applies or dismisses each suggestion. Tests: `catch-up.test.ts`.


## Prices learned from the CRM (DECISIONS 127)
`parts.ts` checks each payment against the prices its item has really sold at: the catalogue price list, prices seen on 3 or more gifts, and prices a person accepted. A payment at any other price is a custom amount, marked for manual allocation. Nothing is typed in, so a price change in the CRM needs no change here. Tests: `parts.test.ts`.
