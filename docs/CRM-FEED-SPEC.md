# CRM feed specification

For the developers of any CRM that OUTCOMES connects to (DECISIONS 28 to 31). MWF's CRM is the first. The feed is **one row per transaction line**, read through a **database view** or an **API** (the same rows either way). A working example is `samples/crm-feed-sample.csv` (invented data).

## What the feed must hold

Paid lines only is not required: OUTCOMES filters by status itself. Send all lines that changed, and set the status and the deleted and replaced markers honestly.

| Column | Meaning | Notes |
|---|---|---|
| `line_id` | Unique id of the line in the CRM | Required. Never reused |
| `transaction_ref` | The transaction's reference or order reference | Required |
| `status` | The transaction's payment status | A configurable list says which values mean paid (MWF: `paid` or `2`) |
| `is_deleted` | 1 if deleted | Deleted lines are left out |
| `superseded_by` | Reference of the transaction that replaced this one, else empty | Replaced lines are left out |
| `paid_at` | When it was paid | `YYYY-MM-DD` or `YYYY-MM-DD hh:mm:ss` |
| `supporter_id` | The CRM's donor id | The id only, so the CRM can find the donor |
| `supporter_name` | Display name | Name only, no contact details |
| `group_name` | Centre or branch the gift came through | Empty when none |
| `channel`, `merchant`, `payment_mode` | Classification details | Become Channel, Merchant and Method |
| `item_id`, `item_name` | The catalogue item on the line | The trigger is at item level |
| `item_recurring` | 1 if the item is recurring | |
| `item_frequency` | Number of instalments set on the item (for example 12) | Empty means Indefinitely (DECISIONS 18) |
| **`needs_feedback`** | **The item-level trigger: does this item need feedback reports** | **The column name and yes-values are set in the connector settings, because MWF's CRM adds it in its next push (DECISIONS 30)** |
| `subscription_id`, `instalment_number` | Link to the recurring plan, and which instalment this line is | Empty for a one-off |
| `amount`, `quantity` | For reference only. OUTCOMES does not manage money | |
| `intention` | For example Sadaqah, Zakat | |

## What the feed must not hold

Email, phone, address, bank details, or any child (beneficiary) data. Contact details stay in the CRM (CLAUDE.md privacy rules). The CRM sends reports and messages to its own donors.

## Reading it

- **Database view:** create a view with the columns above. Give OUTCOMES a **read-only** database user that can read only that view. Write a small reader that returns the rows as text (`CrmReader` in `modules/01c-crm-connector/reader.ts`).
- **API:** `GET <base>/feed?since=<ISO time>` answering `{ "rows": [ ... ] }` with the same columns, using a read-only bearer token.

## Reporting back

OUTCOMES sends `POST <base>/report-back` with `{ "items": [ ... ] }`, using a separate write token that can only record these items. Each item: `workOrderKey`, `transactionRef`, `lineId`, `supporterId`, `status` (`in_progress`, `delivered` or `reported`), `reportUrl` (https, empty until a report exists), `updatedAt`. The CRM uses these for its donor portal and its communications. Nothing about money, contact details or children is ever sent back.

## Where the frameworks are

Not in the CRM (DECISIONS 31). The CRM says only whether an item needs feedback. Which framework (Orphan, Hifz, Water and so on) an item belongs to is set in OUTCOMES.
