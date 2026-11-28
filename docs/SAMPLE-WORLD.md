# The sample world

Invented data to test everything as built (DECISIONS 329). Safe to commit and share: donors are "Sample Supporter A" to "N", partners and beneficiaries are marked Sample, and nothing real is used.

## What it is

Three parts, loaded in this order:

1. **The gifts** (`samples/world/`): three CRM Export Centre files made by `scripts/make-sample-world.mjs`: Donation lines (65 lines), Catalogue (9 items) and Recurring plans (16). Dates are counted back from one day, so the gifts are of every age. After a few weeks, make them again: `node scripts/make-sample-world.mjs` (today) or `node scripts/make-sample-world.mjs 2026-12-15`.
2. **The sample setup** (Settings, Organisation, Load sample setup): partners, projects with clusters, beneficiaries, households and enrolments. This is the existing sample, built from the items that exist.
3. **The sample scenario** (Settings, Organisation, Load sample scenario): the records of a working organisation, dated back from today.

## Safe for your own setup (DECISIONS 330)

- **Back up first.** `node --env-file=.env.local scripts/db-backup.mjs --org mwf` saves your setup and records to `real-data/` (kept out of git). `scripts/db-restore-config.mjs` puts the setup back. The setup is the workflows and their settings, the benefit connections and types, partners, projects, rules and automatic settings.
- **Remove all data** (`db-reset-records.mjs`) clears only the records (register, enrolments, assignments, allocations, answers, steps). It does not clear the setup or the gifts.
- **Uploading the world files** adds sample gifts beside the real ones. An upload counts as a complete read for its dates, so real gifts paid in that window and not in the files are flagged "no longer in the CRM feed" and held for review. Nothing is deleted. Restore them from Needs attention, or test on a separate database.
- **Add the standard workflows** only adds the ones that are missing. It never replaces yours.
- **Load sample scenario** touches only the sample gifts. It does not change your real gifts, records, workflows, benefit connections, days to fulfil or automatic settings. To see the report loop, moving and reminders at work, switch them on yourself on Workflows and Rules (they are settings, so you can).
- **Best of all:** test on a separate database (a Neon branch), so nothing real is near it.

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
| A partner's inbox | a new batch, a reminder, a late notice, a gift moved away, work sent back |
| Priority | one gift |

## Things to try after loading

- Home: the setup guide, and its steps ticked.
- Dashboard: the journey with Reviewed, the age chart, trends and the review tiles.
- Rules: set Days after the deadline on a workflow (for example 5), then Run now. An unanswered gift past its days moves, and reminders go to the partners' inboxes.
- Progress: open a row, review it, reject one with a reason.
- Sign in as a sample partner (Settings, Organisation, test sign-ins): the bell, the dashboard and the sent-back note.
- Workflows: the loop on a sponsorship, and the fulfilled stage.

Remove sample scenario clears only the assignments, answers, allocations, steps and messages of the sample gifts. Everything else stays.
