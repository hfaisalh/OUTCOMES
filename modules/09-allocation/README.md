# Module 9: Allocation (the Allocate page)

## Purpose
Once a gift has a partner (Assignment, module 8), it is allocated (DECISIONS 175, 252, 253). Where the beneficiary comes first (sponsorship), the gift supports a beneficiary who still needs funding: an approved beneficiary enrolled in a cluster of the project for the benefit (module 7). Where the gift comes first (a pump, a camp) or the type has no beneficiary (a mosque), the gift creates an outcome.

## Inputs
Assignments (which partner each gift has), the enrolments (the places), the beneficiary register, projects and their partners, workflows (the units that make one whole beneficiary), and each item's type (who comes first, who receives).

## Outputs
- Placements: one record per assigned gift, a place filled or an outcome created, kept apart from the gifts so they can be reset.
- For every gift not placed yet, a suggestion: the place it would fill, or why none, with every place considered and whether the gift fits.

## Rules
- A place is an active enrolment, without a role, of an active beneficiary (a person must be Ready), for the gift's benefit. Its capacity is the units that make one whole beneficiary in the gift's workflow.
- A gift with a project fills that project's places only. A gift with no project goes to a project that offers the benefit and has the assigned partner among its partners.
- The assigned partner's own children first, then the lowest fill, then the earliest enrolled. A gift goes whole into one place when it fits, else it is spread over several (DECISIONS 181, 183).
- A gift-first type, or one with no beneficiary, creates an outcome (OUT-0001, never reused) and needs no place.
- A gift with no place waits with the reason. A person can choose another open place, or take a placement back.

## History (DECISIONS 186)
Nothing is deleted. A placement has a start and, when it ends, an end day and a reason (plan paused, cancelled or completed; child left; moved; taken back). It frees the child's place and stays as history. Each run first ends the placements of a parked plan and of a child who has left. A plan that runs again is offered its previous child if still free, else a new place. `history.ts` builds the rows for a gift and for a place; `app/history-window.ts` shows them in pop-ups.

## Not built yet
- Month by month on these records, releasing a place when a plan stops paying (the 15 day grace and approval), the gift's stage showing Allocated on the Gifts list, and the Partners page counting these records.

## Files
| File | What it does |
|---|---|
| `allocation.ts` | The rules as pure functions (places, suggest, run, place by a person, unplace, fills) and `applyPlacementAction`, used by the server and the demo |
| `allocation.test.ts` | Tests and examples on invented gifts, children and projects |
| `history.ts` | The allocation history as pure functions: every child a gift has held, every gift that has sponsored a child, and the counts |
| `history.test.ts` | Tests and examples |

The screen is `app/allocate-page.ts`. Placements are saved on the organisation's setup as `placements`.

## How to test
`npm test`. To try it: load the sample setup, give two sponsorship items a workflow, assign the gifts (Assignment, Confirm all suggestions), open Allocate, press Place automatically, and read which child each gift filled. Reset placements clears it.

## Names (DECISIONS 253)
This module was called Placement. People and code now use the same words, so a developer is never lost between the screen and the code.

| Screen says | Code says | Was |
|---|---|---|
| Allocate (page), Allocated, Not allocated yet | `modules/09-allocation`, `Allocation`, `Allocations`, `allocations` (saved list and table) | Placement, placements |
| Allocate automatically | request `alc-run` (also `alc-set`, `alc-undo`, `alc-reset`, `alc-stock-add`, `alc-stock-remove`), `data-alc` | `plc-*`, `data-plc` |
| Take the allocation back | `unallocate` | `unplace` |
| a beneficiary is funded | `kind: "beneficiary"` (or `"outcome"`) | `kind: "place"` |
| "The beneficiary left" | end reason `beneficiary-left` | `child-left` |
| (older, being retired) a gift allocated to an outcome | `OutcomeAllocation`, `outcomeAllocations` | Allocation, allocations |

"place" is used only for a **location** (a cluster's location, a beneficiary's place of birth).
