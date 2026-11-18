# Module 1: Data sources and field mapping

## Purpose

Turn a source file (or Google Sheet) of transactions into clean, standard transactions and lines that later modules can use, whatever the source calls its columns. This module reads and maps data. It does not route transactions, decide anything about projects, or handle money.

It is **generic** (DECISIONS 26). Field names say what a thing means (Reference, Supporter ID, Fund, Outcome, Group, Commitment). Everything specific to one source system lives in a **preset**. MWF's Salesforce upload is one preset. An organisation with no preset maps its own columns.

## How it fits together

| Layer | What it is | Where |
|---|---|---|
| Generic model | Fields, lines, checks. No source names | `fields.ts`, `lines.ts`, `pipeline.ts` |
| Source presets | One source's column names, how it packs lines, its lookup list layout, its wording | `presets/` (Salesforce in `presets/salesforce.ts`) |
| Organisation setup | Preset, lines layout, required fields, column mapping, value mapping, custom fields, wording, lookup lists | `setup.ts` |

## Inputs

| Input | What it is |
|---|---|
| Upload file (CSV) or Google Sheet tab | The transactions. The only thing loaded each time. A template shows the expected columns |
| Lookup lists (optional, CSV) | Names for fund and outcome IDs. **Configuration**: loaded once, saved with the setup. Not needed when the file carries names. Accepts a Type, Name, ID list or the source preset's own layout (Salesforce: the SF META tab) |

## Lines layouts

| Layout | Meaning |
|---|---|
| `lines-column` | One row per transaction, lines packed in one column that the preset knows how to read |
| `one-row-per-line` | One row per line. Rows with the same reference are one transaction |
| `one-line-per-transaction` | One row per transaction with its single line's fields on the row |

## Outputs

| Output | What it is |
|---|---|
| Transactions | Standard fields only, the 8 classification fields always present (blank if no fit) |
| Lines | Fund and outcome with names filled in, amount, quantity, intention |
| Issues list | Things staff should look at, with the source row, never blocking |
| Setup | Saved as text. Mapping, wording, lookups, required fields, layout |

## Files

| File | Purpose |
|---|---|
| `csv.ts` | Parses CSV text into rows and records |
| `fields.ts`, `field-hints.ts` | The generic fields, other names a column might have, examples |
| `lines.ts` | The generic line, building lines from rows, filling names from lookup lists |
| `presets/` | Source presets. `salesforce.ts` holds all Salesforce and MWF specifics |
| `lookups.ts` | Reads a lookup list |
| `mapping.ts` | Suggests a field per column, applies a mapping to a row |
| `setup.ts` | The setup, custom fields, value maps, values still to map, save and load |
| `pipeline.ts` | `runImport(rows, setup)`: the whole pipeline and the issue checks |
| `template.ts` | The expected format as a table and a CSV template |
| `sheets.ts`, `sheets-api.ts` | Reads a tab of a Google Sheet with a read-only token |
| `ui/` | The local page. `main.ts` events and state, `views.ts` HTML, `sheet-source.ts` Google Sheet, `google.ts` sign-in. No business rules here |

Tests sit next to each file (`*.test.ts`) and use only the invented files in `samples/`.

## Decisions

- Business rules are pure functions: no database, no screen, no network, so they can be ported to another stack (DECISIONS 11, 12).
- Bad data is reported as an issue, never thrown, so one bad row does not stop a file.
- Contact details (email, phone, address) are never carried into a transaction (CLAUDE.md, Privacy).
- Money amounts are kept as supplied, for reference only (DECISIONS 3).
- Calculated fields use a small fixed set of rules (copy, join, starts with, swap values), not free code.
- Master values for the 8 classification fields are plain text for now. Full master lists (DECISIONS 16) come later.
- The page is a thin layer over the pure functions, so the developers can replace it with a CRM screen.
- Required fields are set per organisation. The Salesforce preset requires reference, received date, donor ID, designation and outcome activity.

## How to see the page

```bash
npm install
npm run dev
```

Open the link it prints (http://localhost:5173). Pick the **Source type** in Configuration (Salesforce, or Generic file to map your own columns) and the lines layout. Then pick the **Upload file**, or load it from a Google Sheet. Click **Download template** to see the expected columns. If the file carries IDs, pick the lookup lists once. They are kept in this browser with your setup until you click Forget saved setup. Drag a column onto a field, or tap a column then tap a field. Save setup downloads the setup as a `.json` file, and the Saved setup picker loads one back. Files are read in the browser only. Never put real exports in this repo.

## Demo

Click **Demo: Salesforce sample** or **Demo: another organisation's file** (or open `http://localhost:5173/?demo=salesforce` or `?demo=generic`). They load the invented files from `samples/`, nothing is saved, and a reload leaves the demo. Use them to show the page without any real data.

## Loading from a Google Sheet

Paste the sheet link and click **Load from Google Sheet**. Each person signs in with their own Google account, read-only, and sees only sheets shared with them. One-time client ID setup: `docs/GOOGLE-SETUP.md`. The same loading logic (`sheets-api.ts`) is what the developers' scheduled job will use with a service account (DECISIONS 20, 22).

## How to test

```bash
npm run check   # typecheck and tests
npm test        # tests only
```
