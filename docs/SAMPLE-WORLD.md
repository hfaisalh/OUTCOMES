# The sample world

Invented data to test everything as built (DECISIONS 329). Safe to commit and share: donors are "Sample Supporter A" to "N", partners and beneficiaries are marked Sample, and nothing real is used.

## What it is

Three parts, loaded in this order:

1. **The gifts** (`samples/world/`): three CRM Export Centre files made by `scripts/make-sample-world.mjs`: Donation lines (65 lines), Catalogue (9 items) and Recurring plans (16). Dates are counted back from one day, so the gifts are of every age. After a few weeks, make them again: `node scripts/make-sample-world.mjs` (today) or `node scripts/make-sample-world.mjs 2026-12-15`.
2. **The sample setup** (Settings, Organisation, Load sample setup): partners, projects with clusters, beneficiaries, households and enrolments. This is the existing sample, built from the items that exist.
3. **The sample scenario** (Settings, Organisation, Load sample scenario): the records of a working organisation, dated back from today.

## To reload from nothing

1. Remove all data.
2. Data, Upload files: add the three files from `samples/world/` together.
3. Workflows: Add the standard workflows, then suggest them from the item names, then apply them to the gifts.
4. Settings, Organisation: Load sample setup, then Load sample scenario.
5. Open Home. The setup guide should show every step done.

## What each part gives you to look at

| Gifts | Covers |
|---|---|
| Orphan sponsorship, 8 plans | new, mid-way, paused, cancelled, a payment overdue past the grace days, a plan that runs until cancelled |
| Hifz sponsorship, 3 plans | a second sponsorship workflow |
| Aalim scholarship, 2 plans of 12 | one has finished its term (completed), one is part-way |
| Small pump, 6 one-off gifts | ages from 3 to 130 days: fresh, on pace, behind and past the time |
| Large pump, 2 plans of 4 | one fully paid, one waiting for its last payments (not started) |
| Build a home, 1 plan of 6 | fully paid long ago |
| Family startup, camp | gifts where the gift comes first |
| General donation | needs no feedback, so it is left out |

| Scenario | Covers |
|---|---|
| Assignments dated 2 to 60 days ago | fresh, due soon, late for an answer |
| Answers | on time, late, refused (with a reason) and missing |
| Allocations and steps | complete, work sent back at review, waiting for review, late on a phase, not started |
| Workflows | quarterly report loop for a year, moving an unanswered gift after 5 days (orphan) or 3 (pump), days to fulfil for three benefits |
| Rules | reminders 2 days before a deadline, scheduled Assign on, Allocate off |
| A partner's inbox | a new batch, a reminder, a late notice, a gift moved away, work sent back |
| Priority | one gift |

## Things to try after loading

- Home: the setup guide, and its steps ticked.
- Dashboard: the journey with Reviewed, the age chart, trends and the review tiles.
- Rules: Run now. An unanswered gift past its days moves, and reminders go to the partners' inboxes.
- Progress: open a row, review it, reject one with a reason.
- Sign in as a sample partner (Settings, Organisation, test sign-ins): the bell, the dashboard and the sent-back note.
- Workflows: the loop on a sponsorship, and the fulfilled stage.

Remove sample scenario clears the assignments, answers, allocations, steps and messages it made. It leaves the workflow settings as they are.
