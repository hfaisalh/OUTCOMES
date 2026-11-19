# Roadmap

One module at a time. Each ends with: working screen, tests, module README, decisions logged, Faisal's sign-off.

| # | Module | Status | What it does |
|---|---|---|---|
| 1 | **Data sources and field mapping** | Rebuilt (generic), awaiting sign-off | Generic model with source presets (Salesforce is one). Load a file or Google Sheet. Drag columns onto fields, drop the rest, add manual or calculated fields. Three line layouts. Always the 8 classification fields. Auto-match, template, value mapping, issue list, saved setup. See `modules/01-data-mapping/README.md`. |
| 1b | **Classification master lists** | After 1 | Master lists for the 8 fields with common fields. Drag raw file values onto master values (saved, reused). Dependency rules as warnings. |
| 1c | **CRM connector and work orders** | Built (logic), awaiting sign-off | Read the CRM feed (database view or API), create work orders from lines whose item needs feedback, keep unmapped items unrouted, report status back to the CRM. See `modules/01c-crm-connector/README.md` and `docs/CRM-FEED-SPEC.md` (DECISIONS 28 to 31). |
| 2 | **Project Rules** | | Drag outcome activities into framework buckets (Orphan, Hifz, Water...). Per rule: unit, feedback cycle, report type. Duration and instalment counts are NOT held here, they come from the source (DECISIONS 18). Maps CRM items to frameworks (DECISIONS 31). An item flagged in the CRM but not mapped is unrouted, not lost. |
| 3 | **Donor link and centres** | | CRM donor ID + display name only. creditTo / reportTo rules. Flag centre-only lines. |
| 4 | **Import and triage** | | Run a file through 1 to 3. Keep feedback lines, route to frameworks, exceptions list (drag to fix). Duplicate check on reference. |
| 5 | **Frameworks** | | One at a time, starting with Orphan Sponsorship: beneficiaries, care types, allocation, lifecycle (renewals, lapses, offboarding). |
| 6 | **Field data capture** | | Institute / partner portal, mobile entry, approvals. |
| 7 | **Donor feedback** | | Report templates (drag blocks), quarterly reports, write back to Salesforce. |
| 8 | **Dashboards** | | Coverage, compliance, outstanding feedback. |

Reference: earlier prototype covering parts of 1, 5, 6, 8 in `github.com/hfaisalh/mwf-impact-tracker` (see `docs/` there for diagrams and the sprint mapping).
