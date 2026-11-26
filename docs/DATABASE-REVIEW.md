# Database review (26/11/26)

Written while checking code health. **Steps 1 to 4 were applied on 26/11/26 (DECISIONS 235 to 237).** The rest is a plan, for Faisal and the MWF developers to agree before any change.

## How the data is held today

| Table (sql/001_init.sql) | What it holds | Shape |
|---|---|---|
| `org_config` | **Everything a person sets or does in OUTCOMES**: frameworks and categories, projects, partners, outcomes, the Beneficiary register (children), enrolments, assignments, confirmations, progress, placements, parked outcomes, item settings | **One JSON document per organisation** |
| `work_orders` | One row per CRM line | One JSON document per row, keyed by org and key |
| `review`, `runs`, `triage`, `audits`, `used_launch` | Held changes, the last pick-up, marks, batch audits, used sign-in tokens | One JSON document each (audits: one per import) |

The batch audit (DECISIONS 21, 43) and the database connection are both built and in use. The earlier line "next: connect the database" in CLAUDE.md was out of date and has been corrected.

## What worries me, in order

1. **Lost updates.** Every action reads the whole `org_config` document, changes one part, and writes the whole thing back (`putConfig`, last write wins). Two people acting within the same second, or a person acting while the scheduled pick-up saves, can silently undo each other's change. Today there are few users so it is rare; it gets worse as the team grows, and nothing tells anyone it happened.
2. **Children's data in one JSON block.** The Beneficiary register is inside `org_config`. CLAUDE.md says child data is sensitive and access is role based. A single document cannot be given a different permission, cannot be backed up or erased per child, and grows without limit (a row in Postgres can hold about 1 GB, but every action re-reads and re-writes all of it, so it also gets slower).
3. **No history of who changed what.** Confirmations and progress record who and when, but the rest (assignments, placements, enrolments) only holds the latest state. There is no audit trail a developer or an auditor could replay.
4. **Rules in two places.** The demo (in the browser) and the server both run the same pure functions, which is good, but the server answer repeats the whole picture on every request. Fine at this size, heavy later.

## Suggested steps, smallest and safest first

1. **DONE (DECISIONS 235). Version the document (fixes 1).** Add a `version` number to `org_config`; `putConfig` writes only if the version it read is still current, otherwise the person sees "someone else changed this, reload". One column (`ALTER TABLE org_config ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0`), safe to run twice, and a small change to `pg-store.ts` and the handlers. It must be deployed in the right order: run the migration first, then deploy the code. **Needs your yes, because it touches the live database.**
2. **DONE (DECISIONS 236). A change log table (fixes 3).** `change_log (org, at, by, action, key, before, after)` written by the handlers for every `asg-`, `plc-`, `cnf-`, `prg-`, enrolment and register action. Additive, nothing reads it yet.
3. **DONE (DECISIONS 237). Move the Beneficiary register and enrolments to their own tables (fixes 2).** One row per beneficiary, with the role check in front of it, so a child's record can be read, exported and erased on its own. A larger change: needs a one-off copy from the JSON document and a switch-over. Do this with the MWF developers, after step 1, and only once the Salesforce question is answered (whether OUTCOMES stays beside Salesforce or moves inside it, which decides where child data should live at all).
4. **DONE (DECISIONS 237). Move assignments, placements, confirmations and progress to rows** keyed by gift, so a change touches one row, not the whole organisation.

## What was not done, and why

- Steps 3 and 4 are done as one change inside the store. Per-child download and erase was added after (DECISIONS 240). Not done: database-level roles, and moving outcomes, allocations, projects and partners (still in the document, they are settings and few).
- Step 1 was run in the safe order: backup (real-data/, git-ignored), migration, then code.
- Steps 3 and 4 depend on the Salesforce answer in CLAUDE.md ("will the developers rebuild inside Salesforce or run OUTCOMES beside it?").
