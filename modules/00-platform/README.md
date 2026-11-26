# Module 0: Platform (sign-in, storage, pick-up)

## Purpose
The server side of OUTCOMES: signing people in from the CRM (DECISIONS 32), storing setups and work orders per organisation, and the pick-up that reads the CRM, creates work orders and reports back (DECISIONS 20, 28 to 31).

## Inputs
- A launch token from the CRM (`docs/LAUNCH-SPEC.md`).
- The CRM feed (`docs/CRM-FEED-SPEC.md`), read through Module 1c.
- Environment variables (`docs/SERVER-SETUP.md`).

## Outputs
- A session cookie, and JSON for the page: who is signed in, the setup, work orders and the last pick-up.
- Work orders saved per organisation, and status sent back to the CRM.

## Files
| File | What it does |
|---|---|
| `launch-token.ts` | Signs and checks tokens. Launch tokens live 2 minutes at most, sessions one hour |
| `http.ts` | The shared pieces of every endpoint: request and response shapes, the dependencies, JSON and text answers, who is signed in, the permission check |
| `handlers.ts` | The endpoints as plain functions: launch, logout, me, config, work orders, pick-up, import, audits, triage, exclude |
| `outcomes-handler.ts` | The Outcomes endpoint, the largest: outcomes, projects, partners, the Beneficiary register, enrolments, assignment, confirmation, progress, placement. Answers every request with the whole picture (`reply`) |
| `store.ts` | The storage interface, and a memory version for tests and demos |
| `pg-store.ts`, `../../sql/` | The Postgres version and its tables (001 tables, 002 setup version, 003 change log, 004 record tables) |
| `record-tables.ts` | How a setup is split into its document and its lists of records, and put back (pure) |
| `change-log.ts` | What a save changed, for the change log (pure) |
| `OWNER_PASSPHRASE` sign-in, `/api/import`, `/api/audits` | Owner sign-in until the CRM sign-in exists, uploads of CRM export files, and the audit history (DECISIONS 43) |
| `pickup.ts` | One pick-up for one organisation, and rerouting when an item is sorted |
| `../../api/*.ts` | Thin Vercel files. `_server.ts` reads the environment and wires the database |

## Rules
- The organisation comes from the signed session, never from the request. Tested: one organisation cannot see another's work orders.
- Each endpoint needs a permission. A launch token works once and cannot be used as a session.
- A pick-up is safe to repeat. A failure is recorded in plain English and earlier work is kept. The last good time only moves forward on success.
- Changes in the CRM after a work order exists are held for review, never applied.
- With no `DATABASE_URL` a temporary memory store is used and the page says so.

## Not built yet
- Refreshing a session by asking the CRM (needs a CRM endpoint).
- Writing feedback report links (Module 7 supplies them to the report-back step).
- Audit log of who changed what. (The batch audit is built, see `modules/01f-batch-audit/`.)

## How to test
`npm test`. The handlers are tested without a network, using the memory store and invented data.
