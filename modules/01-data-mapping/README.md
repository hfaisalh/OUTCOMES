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
| Issues list | Things staff should look at, never blocking (started) |
| Saved setup | The column mapping for one data source (later step) |

## Build steps

| Step | What | Status |
|---|---|---|
| 1 | This README and `docs/DATA-DICTIONARY.md` | Done |
| 2 | CSV reader and designation line splitter, with tests | Done |
| 3 | Decode IDs to names using the code book | Done |
| 4 | Suggest a standard field for each column | Next |
| 5 | Issue check (missing reference, bad date, unknown ID) | |
| 6 | Save and load a setup per source, with manual and calculated fields | |
| 7 | Drag and drop mapping screen (after the stack is chosen) | |

## Files

| File | Purpose |
|---|---|
| `csv.ts` | Parses CSV text into rows and records |
| `gifts.ts` | Reads a gift export and splits designation JSON into order lines |
| `codebook.ts` | Reads the code book (SF META) and adds names to order lines |
| `csv.test.ts`, `gifts.test.ts`, `codebook.test.ts` | Tests, using only `samples/` (invented data) |

## Decisions

- Business rules are pure functions: no database, no screen, no Salesforce calls, so they can be ported to Apex or another stack (DECISIONS 11, 12).
- Bad data is reported as an issue, never thrown, so one bad gift does not stop a file.
- Contact details (email, phone, address) are not carried into order lines (CLAUDE.md, Privacy).
- Money amounts are kept as exported, for reference only (DECISIONS 3).

## How to test

```bash
npm run check   # typecheck and tests
npm test        # tests only
```
