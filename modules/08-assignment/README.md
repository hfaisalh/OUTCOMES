# Module 8: Assignment

## Purpose
Hands each released gift to a partner (DECISIONS 170): the first eligible partner, in the order of the gift's project, that has room. It is the step between a work order and the partner confirming it.

## Inputs
Work orders (the gifts, with their workflow), partners (their eligibility, capacity per benefit), projects (their partners in order, the benefits they offer), and each workflow's Assignment setting (automatic or suggest) and Reassign switch.

## Outputs
- Assignments: one record per gift (partner, project, item, units, automatic or by a person). Kept apart from the gifts so they can be reset.
- For every gift still to be assigned, a suggestion: who it would go to, or why no one, with every partner considered and whether it has room.

## Rules
- Which gifts: ready, with a workflow, not excluded, not a custom amount, not a legacy upload, not already assigned.
- Which partners: a project's partners in the project's order. A gift with no project goes to any eligible partner that delivers its item. Eligible: active, due diligence approved and in date, delivers the item, capacity not 0.
- Room for a sponsorship benefit (where the beneficiary comes first) is the partner's own approved enrolled children: the units of one whole child for each, less what is assigned (DECISIONS 183). A typed capacity is only a ceiling. A partner with no child of its own has no room.
- Room for any other benefit: capacity for the item, less what is already assigned (including earlier in the same run). A gift's units must fit, or the next partner is tried. No capacity set means no limit.
- Order: urgent first, then the oldest payment.
- A workflow set to automatic assigns at once. One set to suggest waits for a person, who can confirm or choose another eligible partner. Reassigning needs the workflow's Reassign switch.
- A gift with no one to go to waits with the reason (project not offering the benefit, not set up, no partner, every partner full).

## Not built yet
- Confirmation (the partner's answer within the days the workflow allows), the urgent flag on a gift, and Allocation rewired so an assigned gift fills an open place in a cluster (DECISIONS 165).

## Files
| File | What it does |
|---|---|
| `assignment.ts` | The rules as pure functions (which gifts, which partners, room, suggest, run, assign by a person, unassign, loads) and `applyAssignmentAction`, used by the server and the demo |
| `assignment.test.ts` | Tests and examples on invented gifts and partners |

The screen is `app/assignment-page.ts`. Assignments are saved on the organisation's setup as `assignments`.

## How to test
`npm test`. To try it: load the sample setup (Settings, Organisation), give an item a workflow (Workflows), open Allocation then Assignment, press Assign automatically (or Confirm all suggestions), and read who each gift went to and why. Reset assignments clears it.
