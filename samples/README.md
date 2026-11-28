# Sample files

Invented data, safe to commit and share. Never put real exports in this folder.

- `sf-upload-sample.csv`: 8 gifts (9 lines) in the Salesforce upload layout, including a centre-booked gift, a recurring sponsorship, a two-line gift, a missing reference and a bad date.
- `sf-meta-sample.csv`: the matching Salesforce code book (names for the fake IDs).
- `generic-flat-sample.csv`: 7 rows from an invented organisation with its own column names and one row per line (the Salesforce preset is not used). Includes a two-line transaction (R-003), a row with no outcome, a row with no reference, a bad date, and a contact column that must be dropped.

- `export-catalogue-prices-sample.csv`: the Catalogue prices export (bundles and their quantities) for the invented orphan item. `export-donation-lines-sample.csv` has one line bought as the "Sponsor an Orphan" bundle.
- `world/`: the sample world (3 CRM Export Centre files, made by `scripts/make-sample-world.mjs`). See `docs/SAMPLE-WORLD.md`.
