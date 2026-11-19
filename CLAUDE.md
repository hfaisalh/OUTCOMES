# CLAUDE.md

Read this first, every session. Then read `docs/DECISIONS.md`, `docs/DATA-SOURCES.md` and `docs/ROADMAP.md`.

## What OUTCOMES is

A fulfilment and donor-feedback system for **Minhaj Welfare Foundation (MWF)**.

- MWF takes donations through many touchpoints. They all land in **Salesforce** (the CRM, the source of truth).
- Some donations are for projects that need **feedback reports** back to the donor (orphan sponsorship, Hifz, water pumps, houses, and so on).
- OUTCOMES takes those transactions as **instruction tokens** ("deliver this, report back to this donor"), routes each to its project framework, tracks delivery, and produces the feedback.
- It does **not** manage money. Finance stays in Salesforce and QuickBooks.
- It is built to become a **module inside the existing CRM** later. Developers will take it over, so clarity matters more than cleverness.

## White-label and standalone

OUTCOMES is built so other organisations can use it, standalone or inside a CRM (DECISIONS 23 to 26). Every record, setup and setting belongs to an organisation. Source-specific names go in a preset, never in the core. Roles are configuration (DECISIONS 25). Login comes from the CRM where there is one (DECISIONS 24).

## Who you are working with

Faisal (MWF). Not a developer. Prefers:

- **Small steps.** One module at a time. Confirm before moving to the next.
- **Direct and concise** answers. Short lists, tables where they help.
- **Never use the em dash character** in anything you write (code comments and docs included). Use commas, colons or brackets.
- Drag and drop interfaces wherever matching or sorting is involved. Auto-suggest first, user drags to correct.

## Coding standards (required)

The code will be handed to MWF developers. Every change must follow these:

1. **One folder per module** (`modules/<nn>-<name>/`), each with a `README.md`: purpose, inputs, outputs, decisions, how to test.
2. **Every file starts with a header comment**: what it does, who calls it, what it depends on.
3. **Plain-English comments** on each section and on every business rule, e.g. `// Rule: gifts booked to a centre report to the centre.`
4. **Business rules live in pure functions** (no database, no UI) so they can be ported to Salesforce (Apex) or another stack.
5. **Tests double as examples.** Use invented sample data only (see `samples/`). Never commit real donor data.
6. **Decisions go in `docs/DECISIONS.md`** with date and reason. Field meanings go in `docs/DATA-DICTIONARY.md`.
7. Names: use the generic terms in the core (Transaction, Line, Supporter, Fund, Outcome, Group, Commitment; see `docs/DATA-DICTIONARY.md`). Salesforce and MWF terms (Designation, Outcome Activity, Gift Commitment, Donor, Centre) live only in the Salesforce preset and in MWF's own wording (DECISIONS 26).
8. Small commits with clear messages. Run tests before every push.

## Privacy

- Donor contact details stay in Salesforce. OUTCOMES stores the CRM donor ID and a display name only.
- Child (beneficiary) data is sensitive: role-based access, institute staff never see donor contact details.
- Uploaded files are parsed in the browser where possible. Only setups and needed records are saved.

## Stack (provisional, confirm with MWF developers)

- Open question: will the developers rebuild inside Salesforce (Apex / Lightning) or run OUTCOMES alongside it via the Salesforce API? Until answered, keep logic portable (pure TypeScript functions with tests) and the UI thin.
- Earlier prototype (for reference only, do not copy blindly): `github.com/hfaisalh/mwf-impact-tracker`. Next.js + Supabase + Vercel. Its `packages/core/src/imports/mapping.ts` is the most recent and closest to the new design.

## Where we are

See `docs/ROADMAP.md`. Module 1 (data sources and field mapping) is rebuilt on the generic model and awaits sign-off. Module 1c (CRM connector and work orders, DECISIONS 28 to 31) is built as logic and awaits sign-off. Next: the batch planner and audit (DECISIONS 20, 21), then Module 2.
