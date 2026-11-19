# Module 1f: Batch audit

## Purpose
Items can be added to, changed in or removed from the CRM after an import (DECISIONS 21, 43). Each import is compared with the work orders already saved, line by line, and the differences are reported. Nothing is lost silently, and nothing is changed by the audit.

## Inputs
- The lines of one import (a feed, from uploaded export files or a scheduled pick-up).
- The work orders already saved.
- Whether the import is complete for its dates.

## Outputs
An audit record per import: lines read, dates covered, counts and the findings. Saved by the pick-up (`modules/00-platform/pickup.ts`), shown on the Audit page.

## Findings
| Kind | Meaning |
|---|---|
| added | A line needing feedback with no work order yet |
| changed | Same line, different amount or supporter |
| moved | Same line, now on another item |
| no_longer_needs_feedback | The item stopped asking for feedback |
| removed | A saved work order whose line is gone from the CRM. Judged only when the import is complete, and only for work orders paid inside the dates the import covers |

## Rules
- The audit only reports. Work orders are never changed or deleted by it.
- A first import reports everything as added (counted and sampled, not listed).
- The last 100 audits are kept per organisation.

## How to test
`npm test`. `audit.test.ts` uses invented lines.
