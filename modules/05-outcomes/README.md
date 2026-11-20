# Module 5: Outcomes (first cut)

## Purpose
What a gift is for, and how full it is (DECISIONS 60, 61). An outcome is a child, a student, a widow, a tutor, a bride, a building, a location or an activity. Each has a framework, which gives its capacity in units. Recurring commitments fill that capacity automatically, in the order the donations were given.

## Inputs
Commitments (Module 4b), framework templates (Module 2), and the person's outcomes and allocations.

## Outputs
- Outcomes with a fill: capacity, used, free and availability (open, part funded, full, inactive).
- Allocations: which commitment is in which outcome, how many parts, and whether it was automatic or moved by a person.
- A list of commitments that found no room, with the reason.

## Rules
- Capacity of an outcome = the framework's units per beneficiary (3 parts for an orphan, 1 for a scholarship, 1 whole for a pump).
- A commitment takes its parts per instalment from the first active outcome with the same framework and room, oldest commitment first. A bundle of 3 takes a whole orphan. One already placed is never moved by automatic allocation.
- A fully paid limited per-period commitment stops taking capacity. A commitment to a whole item keeps it.
- Making an outcome inactive releases what was allocated to it, and the next automatic allocation places it elsewhere.
- A person can move a commitment to another active outcome with room, or release it.
- An outcome with allocations cannot be removed.
- The screen is one row per outcome, months across, a small pie per month with a slice for each unit of capacity, coloured by status: paid (green), expected (orange), missed (red), nothing expected (grey). It never colours by donor. A slice opens its commitment, which shows the donor and the plan (DECISIONS 62).
- Status comes from the plan: a month with a real payment is paid, then the plan's next due date starts a run of expected months for the instalments left. Passed months in that run are missed. A paused plan expects nothing ahead, and a cancelled one stops holding capacity.

## Not built yet
- One-off payments for items that are not per period (a pump paid once), reminders before a subscription ends, cohort management, and moving outcomes and allocations to their own table when there are thousands.

## Files
| File | What it does |
|---|---|
| `outcomes.ts` | All the rules above as pure functions |
| `outcomes.test.ts` | Tests and examples on invented data |

The endpoint is `/api/outcomes` (`handleOutcomes`), the screen is the Outcomes tab in Intake.

## How to test
`npm test`. To try it: open Intake, then Outcomes, add outcomes with a framework (for example 10 orphans on Sponsorship: shared parts), press Allocate automatically, then click a slice and a commitment.
