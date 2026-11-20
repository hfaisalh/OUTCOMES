# Roadmap

One module at a time. Each ends with: working screen, tests, module README, decisions logged, Faisal's sign-off.

| # | Module | Status | What it does |
|---|---|---|---|
| 1 | **Data sources and field mapping** | Rebuilt (generic), awaiting sign-off | Generic model with source presets (Salesforce is one). Load a file or Google Sheet. Drag columns onto fields, drop the rest, add manual or calculated fields. Three line layouts. Always the 8 classification fields. Auto-match, template, value mapping, issue list, saved setup. See `modules/01-data-mapping/README.md`. |
| 0b | **Platform (sign-in, storage, pick-up)** | Built, needs the database | Launch token from the CRM, per-organisation storage, scheduled pick-up, live mode in the shell. See `modules/00-platform/README.md`, `docs/LAUNCH-SPEC.md`, `docs/SERVER-SETUP.md`. |
| 0 | **Application shell** | Started | CRM-style shell in `app/`: side menu from CRM permissions, top bar, work orders home screen on the sample feed, dashboard, frameworks, settings. Grown with each module (DECISIONS 32 to 34). |
| 1b | **Classification master lists** | After 1 | Master lists for the 8 fields with common fields. Drag raw file values onto master values (saved, reused). Dependency rules as warnings. |
| 1c | **CRM connector and work orders** | Built (logic), awaiting sign-off | Read the CRM feed (database view or API), create work orders from lines whose item needs feedback, keep unmapped items unrouted, report status back to the CRM. See `modules/01c-crm-connector/README.md` and `docs/CRM-FEED-SPEC.md` (DECISIONS 28 to 31). |
| 1d | **Pretend CRM for testing** | Built | A feed generator that behaves like a CRM, with new gifts arriving over time and later changes, plus a test sign-in, so OUTCOMES can be tested before the real CRM feed exists. See `modules/01d-mock-crm/README.md` (DECISIONS 39). |
| 1e | **CRM export adapter (stopgap)** | Built | Turns the CRM Export Centre files (Donation lines, Catalogue items, Recurring plans) into feed rows so OUTCOMES can run on real data before the CRM has a feed. `npm run feed:from-exports`. See `modules/01e-crm-export-adapter/README.md` (DECISIONS 42). |
| 1f | **Batch audit** | Built | Every import is compared with the saved work orders and reports added, changed, moved and removed lines. Audit page, owner sign-in and saved real data on the server. See `modules/01f-batch-audit/README.md` (DECISIONS 21, 43). |
| 2 | **Project Rules** | Built (logic and screen), awaiting sign-off | Sort CRM items into categories (Sponsorship, Transactional...). Each category holds its framework, the flow settings. Per rule: unit, feedback cycle, report type. Duration and instalment counts are NOT held here, they come from the source (DECISIONS 18). Maps CRM items to frameworks (DECISIONS 31). An item flagged in the CRM but not mapped is unrouted, not lost. |
| 3 | **Donor link and centres** | Capacity built, screens wait for the CRM | Optional credit chain (agent, group, organisation) and who a report goes to are built and tested (`modules/01c-crm-connector/credits.ts`, DECISIONS 44). The roll-up screens wait until the CRM holds the links. | CRM donor ID + display name only. creditTo / reportTo rules. Flag centre-only lines. |
| 4 | **Needs attention (was import and triage)** | Built | One list of everything that needs a person: items to sort, import problems, changes held by the audit. Mark reviewed with a note, reopen. See `modules/04-triage/README.md` (DECISIONS 45). |
| | *Menu: modules 1c to 4b appear in the app as one entry, **Intake**, with tabs (DECISIONS 54).* | | |
| 4b | **Commitments** | Built | Each recurring gift as one record, instalments grouped by subscription, paid of planned, things needing a look, and unlinked recurring lines with suggestions. Read only, no allocation. See `modules/04b-commitments/README.md` (DECISIONS 52, 53). |
| 6 | **Projects** | Part built | Projects with levels you define, types of beneficiary, places and numbered beneficiaries, with a roll-up. Directed and general allocation, activities and profile fields come next. See `modules/06-projects/README.md` (DECISIONS 65). |
| 5a | **Outcomes (first cut)** | Built | Outcomes with a framework and capacity, one pie per outcome by status, automatic allocation of recurring commitments, move and release. Expected, missed and one-off payments for per-period items are in. See `modules/05-outcomes/README.md` (DECISIONS 60 to 64). |
| 5 | **Frameworks** | | One at a time, starting with Orphan Sponsorship: beneficiaries, care types, allocation, lifecycle (renewals, lapses, offboarding). |
| 6 | **Field data capture** | | Institute / partner portal, mobile entry, approvals. |
| 7 | **Donor feedback** | | Report templates (drag blocks), quarterly reports, write back to Salesforce. |
| 8 | **Dashboards** | | Coverage, compliance, outstanding feedback. |

Reference: earlier prototype covering parts of 1, 5, 6, 8 in `github.com/hfaisalh/mwf-impact-tracker` (see `docs/` there for diagrams and the sprint mapping).
