# Module 1: Data sources and field mapping

## Purpose

Turn a Salesforce gift export into clean, standard order lines that later modules can use. This module reads and maps data. It does not route gifts, decide anything about projects, or handle money.

Scope (decided 18 Nov 2026): the **Upload file** (the SF Upload tab of the Salesforce upload sheet) and the **code book** (the SF META tab). Other touchpoint sheets (web, JustGiving, Facebook, centres) are upstream of Salesforce and can become extra data sources later through the same mapping.

## Inputs

| Input | What it is |
|---|---|
| Upload file (CSV) | One row per gift, with the designation lines as JSON in `GiftTranxDesignationInfo__c`. This is the only file loaded each time. A template shows the expected columns |
| Code book (CSV) | Salesforce IDs to names for Designations and Outcome Activities. **Configuration**: loaded once, then saved with the setup (DECISIONS 19) |

## Outputs

| Output | What it is |
|---|---|
| Order lines | One line per designation in a gift, standard fields only, with Designation and Outcome Activity names (built) |
| Issues list | Things staff should look at, with the file row, never blocking (built) |
| Saved setup | Column mapping, custom fields and value mapping for one data source, saved as text (built) |

## Build steps

| Step | What | Status |
|---|---|---|
| 1 | This README and `docs/DATA-DICTIONARY.md` | Done |
| 2 | CSV reader and designation line splitter, with tests | Done |
| 3 | Decode IDs to names using the code book | Done |
| 4 | Suggest a standard field for each column, incl. the 8 classification fields | Done |
| 5 | Issue check (missing reference, bad date, unknown ID and more) | Done |
| 6 | Save and load a setup per source, with manual and calculated fields and value mapping | Done |
| 7 | Drag and drop mapping page (plain Vite and TypeScript, thin on purpose) | Done |

## Files

| File | Purpose |
|---|---|
| `csv.ts` | Parses CSV text into rows and records |
| `gifts.ts` | Reads a gift export and splits designation JSON into order lines |
| `standard-fields.ts` | The standard fields (incl. the 8 classification fields), known Salesforce column names, and columns dropped by default |
| `mapping.ts` | Suggests a field per column, and applies a mapping to a gift |
| `setup.ts` | The setup for one source: custom fields, value maps, apply, find unmapped values, save and load as text |
| `issues.ts` | Runs the whole pipeline on a file (`runImport`) and collects the issues list |
| `codebook.ts` | Reads the code book (SF META) and adds names to order lines |
| `template.ts`, `field-hints.ts` | The expected Upload file format (table and CSV template) and the extra column names used for auto-matching |
| `ui/` | The local page: `index.html`, `main.ts` (events and state), `views.ts` (HTML for each part), `styles.css`. No business rules live here |
| `csv.test.ts`, `gifts.test.ts`, `codebook.test.ts`, `mapping.test.ts`, `issues.test.ts`, `setup.test.ts`, `template.test.ts`, `ui/views.test.ts` | Tests, using only `samples/` (invented data) |

## Decisions

- Business rules are pure functions: no database, no screen, no Salesforce calls, so they can be ported to Apex or another stack (DECISIONS 11, 12).
- Bad data is reported as an issue, never thrown, so one bad gift does not stop a file.
- Contact details (email, phone, address) are not carried into order lines (CLAUDE.md, Privacy).
- Calculated fields use a small fixed set of rules (copy, join, starts with, swap values), not free code, so they port to Salesforce and are easy to check.
- Master values for the 8 classification fields are plain text for now. Full master lists (code, status, parent and so on, DECISIONS 16) come later.
- The page is a thin layer over the pure functions. The MWF developers can replace it with a CRM screen without touching the rules.
- Money amounts are kept as exported, for reference only (DECISIONS 3).

## How to see the page

```bash
npm install
npm run dev
```

Open the link it prints (http://localhost:5173). First time only: open **Configuration** and pick the code book CSV (export the SF META tab as CSV). It is then kept in this browser along with your setup. Each time after that, just pick the **Upload file** (export the SF Upload tab as CSV), or click **Download template** to see the expected columns. Files are read in the browser only and nothing is sent to a server. The setup and code book are kept in this browser's local storage until you click Forget saved setup. Drag a column onto a field, or tap a column then tap a field. Save setup downloads the setup as a `.json` file, and the "Saved setup" picker loads one back. Never put real exports in this repo.

## How to test

```bash
npm run check   # typecheck and tests
npm test        # tests only
```
