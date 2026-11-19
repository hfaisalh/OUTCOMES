# Module 4: Needs attention

## Purpose
One place for everything that needs a person (DECISIONS 45). It reads saved data and changes nothing.

## Inputs
The saved work orders, the changes held for review (Module 1c), the problems from the latest import (kept with the audit and the last pick-up), and the person's earlier "reviewed" marks.

## Outputs
A list of entries, open first: items not in a category, import problems, and held changes. Each has a stable id, a title and plain-English detail.

## Rules
- One entry per unrouted item. It clears when the item is put in a category, and cannot be marked reviewed.
- Import problems describe the latest import only.
- A reviewed entry stays reviewed until reopened. Marks are saved per organisation.
- Viewing needs the permission to view work orders, marking needs the permission to map items.

## How to test
`npm test`. `triage.test.ts` is pure, `handlers.test.ts` covers the endpoint.
