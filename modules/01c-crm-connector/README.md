# Module 1c: CRM connector and work orders

## Purpose
Take the CRM as the data input (DECISIONS 28 to 31): read its feed, turn lines whose item needs feedback into **work orders** (instruction tokens), and report status back so the CRM's donor portal and communications can use it. OUTCOMES holds no product configuration of its own.

## Inputs
- The CRM feed, one row per line, from a database view or an API (`docs/CRM-FEED-SPEC.md`).
- Connector settings: the trigger column name, which values mean yes, which status values mean paid (`MWF_CRM_CONFIG` in `feed.ts`).
- The item to framework map, set in OUTCOMES (DECISIONS 31), and whether the organisation uses frameworks.
- The work orders that already exist.

## Outputs
- `readFeed`: clean feed lines, rows left out (not paid, deleted, replaced) and issues.
- `planWorkOrders`: work orders to create, to reroute, unchanged, and a **review** list (changed, trigger removed, vanished) that is never changed automatically (DECISIONS 21).
- `buildReportBack`: the small status message for the CRM. Status and report link only.

## Files
| File | What it does |
|---|---|
| `feed.ts` | Reads feed rows. Paid, deleted and replaced rules. Trigger. Instalment count |
| `work-orders.ts` | Routing, idempotence (one work order per line), unrouted, review list |
| `report-back.ts` | What goes back to the CRM, and what never does |
| `reader.ts` | `CrmReader` and `CrmReporter` interfaces, API versions, plain-English errors |
| `sample.ts` | Loads the invented sample for the tests |

## Rules in short
- One work order per paid line whose item needs feedback. Each paid instalment is its own line, linked to its subscription.
- Running the same feed twice creates nothing new.
- An item not yet in a framework gives an **unrouted** work order. It never blocks. An organisation with no frameworks uses the default journey.
- If the trigger column is missing from the feed, nothing is created and one issue says so.

## Not built yet
- A database reader (written by the organisation's developers against their view).
- The pick-up job that runs read, plan and report back on a schedule, and saves work orders (needs the storage decision).
- The screen to map items to frameworks (Module 2) and the unrouted list (Module 4).

## How to test
`npm test` (tests in this folder use `samples/crm-feed-sample.csv`, invented data only). `npm run check` also type-checks.
