# Roadmap

One module at a time. Each ends with: working screen, tests, module README, decisions logged, Faisal's sign-off.

| # | Module | Status | What it does |
|---|---|---|---|
| 1 | **Data sources and field mapping** | Next (rebuild here) | Load Salesforce export + code book. Drag columns onto standard fields, drop the rest, add manual or calculated fields. Split designation JSON into lines. Always include the 8 classification fields (Channel, Platform, Merchant, Type, Method, Mode, Frequency, Settlement): fill where the file fits, else blank. Preview issues. Save the setup per source. |
| 1b | **Classification master lists** | After 1 | Master lists for the 8 fields with common fields. Drag raw file values onto master values (saved, reused). Dependency rules as warnings. |
| 2 | **Project Rules** | | Drag outcome activities into framework buckets (Orphan, Hifz, Water...). Per rule: unit, duration, feedback cycle, report type. Anything unsorted = no feedback. |
| 3 | **Donor link and centres** | | CRM donor ID + display name only. creditTo / reportTo rules. Flag centre-only lines. |
| 4 | **Import and triage** | | Run a file through 1 to 3. Keep feedback lines, route to frameworks, exceptions list (drag to fix). Duplicate check on reference. |
| 5 | **Frameworks** | | One at a time, starting with Orphan Sponsorship: beneficiaries, care types, allocation, lifecycle (renewals, lapses, offboarding). |
| 6 | **Field data capture** | | Institute / partner portal, mobile entry, approvals. |
| 7 | **Donor feedback** | | Report templates (drag blocks), quarterly reports, write back to Salesforce. |
| 8 | **Dashboards** | | Coverage, compliance, outstanding feedback. |

Reference: earlier prototype covering parts of 1, 5, 6, 8 in `github.com/hfaisalh/mwf-impact-tracker` (see `docs/` there for diagrams and the sprint mapping).
