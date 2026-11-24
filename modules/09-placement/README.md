# Module 9: Placement (Allocation, rewired)

## Purpose
Once a gift has a partner (Assignment, module 8), it is placed (DECISIONS 175). Where the beneficiary comes first (sponsorship), the gift fills an open place: an approved beneficiary enrolled in a cluster of the project for the benefit (module 7). Where the gift comes first (a pump, a camp) or the type has no beneficiary (a mosque), the gift creates an outcome.

## Inputs
Assignments (which partner each gift has), the enrolments (the places), the beneficiary register, projects and their partners, workflows (the units that make one whole beneficiary), and each item's type (who comes first, who receives).

## Outputs
- Placements: one record per assigned gift, a place filled or an outcome created, kept apart from the gifts so they can be reset.
- For every gift not placed yet, a suggestion: the place it would fill, or why none, with every place considered and whether the gift fits.

## Rules
- A place is an active enrolment, without a role, of an active beneficiary (a person must be Ready), for the gift's benefit. Its capacity is the units that make one whole beneficiary in the gift's workflow.
- A gift with a project fills that project's places only. A gift with no project goes to a project that offers the benefit and has the assigned partner among its partners.
- The lowest fill first, then the earliest enrolled. A gift's units must fit.
- A gift-first type, or one with no beneficiary, creates an outcome (OUT-0001, never reused) and needs no place.
- A gift with no place waits with the reason. A person can choose another open place, or take a placement back.

## Not built yet
- Month by month on these records, releasing a place when a plan stops paying (the 15 day grace and approval), the gift's stage showing Allocated on the Gifts list, and the Partners page counting these records.

## Files
| File | What it does |
|---|---|
| `placement.ts` | The rules as pure functions (places, suggest, run, place by a person, unplace, fills) and `applyPlacementAction`, used by the server and the demo |
| `placement.test.ts` | Tests and examples on invented gifts, children and projects |

The screen is `app/allocate-page.ts`. Placements are saved on the organisation's setup as `placements`.

## How to test
`npm test`. To try it: load the sample setup, give two sponsorship items a workflow, assign the gifts (Assignment, Confirm all suggestions), open Allocate, press Place automatically, and read which child each gift filled. Reset placements clears it.
