# Module 1e: CRM export adapter (stopgap)

## Purpose
Until the CRM has a feed view or API (`docs/CRM-FEED-SPEC.md`), run OUTCOMES on files from the CRM's **Export Centre** (DECISIONS 42). The adapter turns them into feed rows, so everything after it (reading the feed, work orders, categories) is unchanged.

## Inputs
Three CSV exports, with the Export Centre's own column labels:
| Export | Columns used |
|---|---|
| Donation lines (paid) | Line ID, Item Name, Item Code, Intention, Instalment no, Subscription ID, Order Quantity, Order Reference, Order Status, Source, Item Cost, Payment Gateway, Merchant, Donor ID, Payment Date, Period, First Name (Billing), Last Name (Billing) |
| Catalogue items | Item SKU, Feedback type |
| Recurring plans | Plan ID, Instalments planned, Until cancelled |
| Catalogue prices (optional) | Item SKU, Bundle, Quantity. Gives each bundle its parts. Tick Item Bundle in Donation lines too |

Contact, address, Gift Aid and card columns are never read, even if present.

## Output
Feed rows (`FeedRow`) and a list of issues, plus plain counts. Joins: item code = Item SKU gives the trigger; Subscription ID = Plan ID gives the instalment count.

## Rules in short
- "Feedback report" in the catalogue means the item needs feedback. Anything else does not.
- A line is recurring when it has a Subscription ID (not 0) or its Period is not "One-time".
- A plan until cancelled gives no count, a limited plan gives its planned number, a missing plan gives no count. The feed reader shows no count on a recurring line as "Indefinitely".
- Dates `dd/mm/yyyy hh:mm` become `YYYY-MM-DD hh:mm:ss`.

## Known limits of the export
No centre column, no deleted or replaced markers, no line total. Replaced orders cannot be detected.

## How to run it on real files
**In the app (recommended):** run `npm run dev`, open `/app/`, and on Work orders choose the three files in "Use your own CRM export files". They are read in the browser only, nothing is uploaded or saved. Any order works, and Recurring plans is optional. A ready feed file also works.

**On the command line:**
1. Put the three CSVs in `real-data/crm-exports/` as `donation-lines.csv`, `catalogue-items.csv`, `recurring-plans.csv`. That folder is ignored by git. Never commit real exports.
2. `npm run feed:from-exports` writes `real-data/crm-feed.csv` and prints counts only.

## How to test
`npm test`. Tests use the invented `samples/export-*.csv` files.
