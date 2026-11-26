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
| | *Menu: Gifts, Projects, Allocation, and a Settings gear for setup (DECISIONS 66). The earlier Intake entry is gone.* | | |
| 4b | **Commitments** | Built | Each recurring gift as one record, instalments grouped by subscription, paid of planned, things needing a look, and unlinked recurring lines with suggestions. Read only, no allocation. See `modules/04b-commitments/README.md` (DECISIONS 52, 53). |
| 6 | **Partners** (code: Projects) | Built | Projects with levels you define, types of beneficiary, places and numbered beneficiaries, with a roll-up. The partner profile pop-up with configurable types and fields, due diligence gating and items per partner, directed and general allocation, spreading, the payment buffer and the Place gifts page are in. Activities and profile fields come next. See `modules/06-projects/README.md` (DECISIONS 65, 66). |
| 7 | **Beneficiary register** | Built (register and enrolment), Allocation rewiring next | People and households with a permanent ID and a duplicate check. Separate from outcomes (what is delivered). Next: the "who receives" setting per type and the Beneficiaries tab on every cluster to enrol. See `modules/07-beneficiaries/README.md`, DECISIONS 163. |
| 8 | **Assignment** | Built | Each released gift goes to the first eligible partner with room, in the project's order, following the workflow's automatic or suggest setting. Results are separate records with a Reset. Next: Allocation rewired onto enrolments. See `modules/08-assignment/README.md`, DECISIONS 170. |
| 9 | **Placement (Allocation rewired)** | Built | An assigned gift fills an open place (an approved beneficiary enrolled in a cluster for the benefit) or, where the gift comes first, creates an outcome. Lowest fill first, units must fit, reasons for waiting, a Reset. Next: Month by month on these records, releasing a place when a plan stops paying. See `modules/09-placement/README.md`, DECISIONS 175. |
| 10 | **Outcomes list** | Built (list), recipients and shared funding next | One line for each outcome a gift creates (OUT-0001) with benefit, project, partner, donor, plan, funded, twelve month pies, stage and status, filters and sort (DECISIONS 197). Not built: several gifts funding one outcome, recipients, stages after allocation. |
| 11 | **Confirmation** | Built (page, storage, server, on-behalf) | The partner confirms or rejects an assigned gift within the workflow's days (3 if none). A rejection needs a reason and sends the gift back to Assignment (DECISIONS 202). Not built: storage, the page, the days setting, holding Placement until confirmed. |
| 8b | **Batches** | Label and covered count built | Each partner's assignments are numbered in batches of the partner's own size (10 if not set), without waiting to fill. A batch shows how many work orders are covered and what they wait for (DECISIONS 203). Not built: Complete state, the days to build records and transfer, auto confirm on behalf for prefilled stock, the advance rule (parked), orphans (parked). |
| 9b | **Parked outcomes** | Built | A partner loads outcomes ahead of any gift (a pump site, a house plot), in a cluster. A gift assigned to the partner takes one, and the partner's capacity counts them (DECISIONS 209). Not built: requiring stock before assignment, more details per outcome, loading from a file. |
| 5a | **Outcomes (first cut)** | Built | Outcomes with a framework and capacity, one pie per outcome by status, automatic allocation of recurring commitments, move and release. Expected, missed and one-off payments for per-period items are in. See `modules/05-outcomes/README.md` (DECISIONS 60 to 64). |
| 5 | **Frameworks** | | One at a time, starting with Orphan Sponsorship: beneficiaries, care types, allocation, lifecycle (renewals, lapses, offboarding). |
| 6 | **Field data capture** | | Institute / partner portal, mobile entry, approvals. |
| 7 | **Donor feedback** | | Report templates (drag blocks), quarterly reports, write back to Salesforce. |
| 8 | **Dashboards** | | Coverage, compliance, outstanding feedback. |

Reference: earlier prototype covering parts of 1, 5, 6, 8 in `github.com/hfaisalh/mwf-impact-tracker` (see `docs/` there for diagrams and the sprint mapping).

## Later to-do: reorganise the code by feature (agreed in principle, 24/11/2026)

To do **after** the steps that make Outcomes work end to end (beneficiary enrolment, Assignment, Confirmation, Allocation, Review, Report, Feedback). Not before, so a move does not collide with building.

- **One folder per feature**, not one file: `features/<feature>/` with `rules/` (pure functions, portable to Apex), `screens/`, `tests/` and a `README.md`. Features: Gifts, Projects (with clusters), Partners, Beneficiaries, Allocation, Dashboard, Data, Workflows, Benefits. Plus `platform/` (sign-in, storage, pick-up, the server) and `shared/` (tables, windows, icons used by every feature).
- Split the big switches by feature too: the server's `handlers.ts` and the click and change handlers in `app/main.ts` (about 1,600 lines).
- Rename the code's `Project` to `Partner` and `GiftProject` to `Project` in the same pass, and remove the old partner Structure tab (replaced by clusters).
- Do it once, mechanically, one feature at a time, with the tests green after each. No behaviour change.
- Until then, new files keep the current layout and carry the feature name in the file name (as `register-page.ts` does), so the later move is only a relocation.

## Later to-do: a layered flow chart that shows the rules and what each stage needs (25/11/2026)

Take the lead from layered, editorial diagram styles (for example diagramdesign.dev), without installing anything: improve the flow chart on the Workflows page. To be done with the UX work on outcomes, since the same card serves both.

- **Three layers with a switch:** **Flow** (stages, approvals, rejections, as today), **Rules** (the decisions applied at that stage, in plain words, with this workflow's own settings), **Needs** (what the stage depends on, and whether it is ready now).
- **Click a stage** to open a card beside the chart: what it does, its rules, its needs and what happens when it fails.
- **Needs are live**, reusing the checks we already have (the connected-end-to-end check on the Benefits page, partner eligibility, room from children), shown as a tick or a cross with a count.
- **Built or not built** is shown on every stage (Confirmation, Review, Report and Feedback are not built yet).
- Written from the recorded decisions and the workflow's own settings, so the chart and the system cannot disagree. Plain words only. The same card is reused on the outcomes screen, for one gift.
