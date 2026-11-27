# CRM feed specification

For the developers of any CRM that OUTCOMES connects to (DECISIONS 28 to 31). MWF's CRM is the first. The feed is **one row per transaction line**, read through a **database view** or an **API** (the same rows either way). A working example is `samples/crm-feed-sample.csv` (invented data).

## What the feed must hold

Paid lines only is not required: OUTCOMES filters by status itself. Send all lines that changed, and set the status and the deleted and replaced markers honestly.

| Column | Meaning | Notes |
|---|---|---|
| `line_id` | Unique id of the line in the CRM | Required. Never reused. OUTCOMES identifies a work order by this alone (DECISIONS 46) |
| `transaction_ref` | The transaction's reference or order reference | Required |
| `status` | The transaction's payment status | A configurable list says which values mean paid (MWF: `paid` or `2`) |
| `is_deleted` | 1 if deleted | Deleted lines are left out |
| `superseded_by` | Reference of the transaction that replaced this one, else empty | Replaced lines are left out |
| `paid_at` | When it was paid | `YYYY-MM-DD` or `YYYY-MM-DD hh:mm:ss` |
| `supporter_id` | The CRM's donor id | The id only, so the CRM can find the donor |
| `supporter_name` | Display name | Name only, no contact details |
| `group_name` | Centre or branch the gift came through | Empty when none |
| `channel`, `merchant`, `payment_mode` | Classification details | Become Channel, Merchant and Method |
| `item_id`, `item_name` | The catalogue item on the line | Required |
| **`item_feedback`** | **The item-level trigger: does this item need feedback reports** | **MWF's CRM has it (migration 074): `1` = Acknowledgement only (the default), `2` = Feedback report. OUTCOMES treats `2` as yes. The column name and yes-values are connector settings, so another CRM can use its own (DECISIONS 30, 41)** |
| `is_recurring` | 1 if the line is recurring | Taken from the line, not the item |
| `instalment_count` | Number of payments the plan has, for example 12 | **Set on the catalogue line the supporter chose, never on the item.** Empty on a recurring line means Indefinitely (DECISIONS 18, 41). Blank on a one-off |
| `subscription_id`, `instalment_number` | Link to the recurring plan, and which instalment this line is | Empty for a one-off |
| `amount`, `quantity` | `amount` is the price of **one unit** (the CRM's Item Cost), `quantity` the number of units. For reference only. OUTCOMES does not manage money | Decision 81 |
| `line_total` | Optional. What the whole line cost (the CRM's Total Amount). When present it is shown as the value, otherwise `amount` x `quantity` is | Decision 82 |
| `currency` | Optional. The currency code of the amount, for example GBP. Shown beside values, never used in a rule | Decision 80 |
| `project_name` | Optional. The project the donor chose on the line, as the CRM names it (for example "Aghosh"). Blank or "Where Needed Most" means a general gift that can go to any project. Matched to an OUTCOMES project by name or alias | Decision 66 |
| `tribute` | Optional. The donor's tribute or dedication for the gift (for example "In loving memory of Hajra Begum"), up to 500 characters. For an outcome with a plaque it is what the plaque says, and the partner needs it to carry out the work order. Later it may also appear in donor reports as a prayer for the tribute | Decision 247 |
| `site` | Optional. Where the gift came from, as a country code (GB, US, NO, or a new site as the CRM names it), up to 12 characters, capitals. A label only: a gift from any site is itemised, assigned, confirmed and allocated in exactly the same way. Shown as a chip on the Gifts list and the gift window, and filterable. The MWF Export Centre adapter takes it from the Site column, else from the currency (GBP is GB, USD is US, NOK is NO) |
| `plan_carried_over` | Optional. `1` when the recurring plan was carried over from a previous website, empty otherwise. A marker only, so a person can check the item and project the migration chose. The MWF Export Centre adapter reads the Recurring plans export's Legacy plan column, or, without that column, a gateway reference that starts with `archive:` |
| `cause` | Optional. The cause the gift was given to (for example Water for All, Orphan Care). Shown beside gifts that have no named project | Decision 109 |
| `custom_amount` | Optional. `1` when the line is of the CRM's Custom Amount item (the donor chose the amount). Such gifts are allocated by hand | Decision 129 |
| `period_count` | Optional. For a one-off line: the months it covers, which is the item's instalment plan length (for example 12). Blank or missing means one period. Ignored on recurring lines | Decision 64 |
| `bundle_qty` | Optional. Parts of the item in the bundle the line was bought as (for example "Sponsor an Orphan" = 3). Blank or missing means the item on its own, 1. Parts = `bundle_qty` x `quantity`. Never worked out from the amount | Decision 51 |
| `intention` | For example Sadaqah, Zakat | |

## Optional columns: credit chain (planned in the CRM, DECISIONS 44)

Not needed today. OUTCOMES reads them when they appear, so adding them later changes nothing else. They describe who a gift is credited to besides the donor, for example a rep (agent), the branch the rep belongs to (group), and the company above the branch (organisation). The CRM's own links decide the chain, OUTCOMES keeps no second list.

| Column | Meaning | Notes |
|---|---|---|
| `supporter_kind` | What the donor on the line is | `individual` (or blank), `organisation` (a donor in its own right, gets the report), or `group` (a group giving on its own name, so the report goes to the nearest credit) |
| `credit_1_role`, `credit_1_id`, `credit_1_name` | The nearest credited party | For example role `agent`. Id and display name only |
| `credit_2_...`, `credit_3_...`, `credit_4_...` | The next levels up, in order | For example the group, then the organisation. Up to four. Leave blank when there are none |

The role is the CRM's own word and OUTCOMES does not interpret it. Order matters, nearest first. Where an agent is named the group and organisation follow from the CRM's links, so the feed simply lists them.

## What the feed must not hold

Email, phone, address, bank details, or any child (beneficiary) data. Contact details stay in the CRM (CLAUDE.md privacy rules). The CRM sends reports and messages to its own donors.

## Reading it

- **Database view:** create a view with the columns above. Give OUTCOMES a **read-only** database user that can read only that view. Write a small reader that returns the rows as text (`CrmReader` in `modules/01c-crm-connector/reader.ts`).
- **API:** `GET <base>/feed?since=<ISO time>` answering `{ "rows": [ ... ] }` with the same columns, using a read-only bearer token.

## Reporting back

OUTCOMES sends `POST <base>/report-back` with `{ "items": [ ... ] }`, using a separate write token that can only record these items. Each item: `workOrderKey`, `transactionRef`, `lineId`, `supporterId`, `status` (`in_progress`, `delivered` or `reported`), `reportUrl` (https, empty until a report exists), `updatedAt`. The CRM uses these for its donor portal and its communications. Nothing about money, contact details or children is ever sent back.

## Where the frameworks are

Not in the CRM (DECISIONS 31). The CRM says only whether an item needs feedback. Which framework (Orphan, Hifz, Water and so on) an item belongs to is set in OUTCOMES.

## For the MWF CRM developers: where each column comes from

Read from `mwf_crm` on 19 Nov 2026 (code only, no data). Please confirm the columns marked "check".

| Feed column | Where it comes from |
|---|---|
| `line_id` | `crm_transaction_detail.id` |
| `transaction_ref` | the transaction's reference, from `crm_transaction` (check the column) |
| `status`, `is_deleted`, `superseded_by`, `paid_at` | `crm_transaction` (check the columns). Paid is `2` |
| `item_id`, `item_name` | `crm_transaction_detail.id_item`, joined to `crm_items` |
| `item_feedback` | `crm_items.item_feedback` (migration 074): 1 = Acknowledgement only, 2 = Feedback report |
| `is_recurring` | `crm_transaction_detail.is_recurring` |
| `instalment_count` | `crm_subscriptions.installment_limit` for a subscription line (empty means no limit). Otherwise the line's own `frequency` when `is_continuously` = 2 (limited), empty when `is_continuously` = 1 (until cancelled) |
| `subscription_id`, `instalment_number` | `crm_transaction_detail.id_subscription`, `installment_no` |
| `intention` | `crm_transaction_detail.id_intention`, joined to the intentions list |
| `channel`, `merchant`, `payment_mode` | the transaction's channel, merchant and payment mode (check the columns) |
| `supporter_id`, `supporter_name`, `group_name` | the donor and the centre on the transaction (check the columns). Id and display name only |

Notes:
- Price, frequency and instalments are configured on the **catalogue price list line** (`id_vdetail` on the donation line points at it), not on the item. Some lines have `id_vdetail` = 0 (legacy imports, activated subscriptions), so the view reads the line's own `frequency` and `is_continuously` and does not depend on the catalogue line.
- Every existing item is `item_feedback` = 1 until staff set it, so nothing is flagged until then. The migration is applied on sandbox and pending on live.
- Optional later: the item code (for example MWF-EDU-001, migration 075) and the cause could be added so OUTCOMES can suggest a category.
- Read-only access to the view only. No contact details, bank details or child data in it.
