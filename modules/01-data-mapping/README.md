# Module 1: Data sources and field mapping

## Purpose

Turn a Salesforce gift export into clean, standard order lines that later modules can use. This module reads and maps data. It does not route gifts, decide anything about projects, or handle money.

Scope (decided 18 Nov 2026): the **SF Upload** tab and the **SF META** code book only. Other touchpoint sheets (web, JustGiving, Facebook, centres) are upstream of Salesforce and can become extra data sources later through the same mapping.

## Inputs

| Input | What it is |
|---|---|
| Gift export (CSV) | One row per gift, 64 Salesforce columns, with the designation lines as JSON in `GiftTranxDesignationInfo__c` |
| Code book (CSV) | Salesforce IDs to names for Designations and Outcome Activities |

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
| 7 | Drag and drop mapping screen (after the stack is chosen) | Next |

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
| `csv.test.ts`, `gifts.test.ts`, `codebook.test.ts`, `mapping.test.ts`, `issues.test.ts`, `setup.test.ts` | Tests, using only `samples/` (invented data) |

## Decisions

- Business rules are pure functions: no database, no screen, no Salesforce calls, so they can be ported to Apex or another stack (DECISIONS 11, 12).
- Bad data is reported as an issue, never thrown, so one bad gift does not stop a file.
- Contact details (email, phone, address) are not carried into order lines (CLAUDE.md, Privacy).
- Calculated fields use a small fixed set of rules (copy, join, starts with, swap values), not free code, so they port to Salesforce and are easy to check.
- Master values for the 8 classification fields are plain text for now. Full master lists (code, status, parent and so on, DECISIONS 16) come later.
- Money amounts are kept as exported, for reference only (DECISIONS 3).

## How to test

```bash
npm run check   # typecheck and tests
npm test        # tests only
```
