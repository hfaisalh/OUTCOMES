# Data dictionary

What each field means. Terms follow Salesforce. Started with Module 1; grows with each module.

## Order line (output of Module 1)

| Field | Source in the export | Meaning |
|---|---|---|
| `giftReference` | `Legacy_Reference_No__c` | Unique reference of the gift, used for the duplicate check. Example: EVO-707-001 |
| `lineNumber` | position in the JSON list | 1, 2, 3 within the gift |
| `amount` | `Amount` | Line total in pounds, for reference only |
| `unitPrice` | `Unit_Price__c` | Price of one unit |
| `quantity` | `Quantity__c` | Number of units |
| `designationId` | `Gift_Designation__c` | Salesforce ID of the Designation (the fund) |
| `outcomeActivityId` | `Outcome_Activity__c` | Salesforce ID of the Outcome Activity. This is the routing key (DECISIONS 5) |
| `intention` | `Intention__c` | Donor's intention, for example Sadqah or Zakat |
| `plateName` | `GiftPlateName__c` | Name on a plaque, if any |
| `description` | `Description__c` (line) | Free text on the line |

## Decoded line (order line plus names)

| Field | Meaning |
|---|---|
| `designationName` | Name of the Designation, looked up from `designationId`. Empty if the ID is missing or not in the code book |
| `outcomeActivityName` | Name of the Outcome Activity, looked up from `outcomeActivityId`. Empty if missing or unknown |

## Transaction classification fields (DECISIONS 16)

Always present on every gift. Filled from the file where a column fits, otherwise blank. A blank never blocks an import.

| Field | Suggested Salesforce column | Notes |
|---|---|---|
| Channel | `Channel__c` | Card Machine, Bank, Website... |
| Platform | none | Blank unless a source maps one |
| Merchant | none | Blank unless a source maps one |
| Type | none | Monetary, Goods and so on. Blank unless a source maps one |
| Method | `PaymentMethod` | |
| Mode | none | Contactless, Chip and PIN and so on. Blank unless a source maps one |
| Frequency | `Donation_Type__c` | Donation, Recurring Donation, Custom Commitment. Master value mapping later turns these into One-off, Recurring and so on. Drives the sponsorship lifecycle |
| Settlement | `Bank_Account__r.Name` | |

## Columns dropped by default

Contact details (name, email, phone, address), bank and cheque details, and finance-only flags are dropped with a reason shown to staff. Staff can still map them. Dropped and unmapped columns are never copied into a standard gift. The full list is `DEFAULT_DROPS` in `modules/01-data-mapping/standard-fields.ts`.

## Issues (output of the issue check)

Each issue has the file row (header is row 1), the gift reference, an optional line number, a code and a plain message. Issues never block an import.

| Code | Meaning |
|---|---|
| `missing_reference` | The gift has no order reference |
| `duplicate_reference` | The reference is already used on an earlier row of the file |
| `bad_date` | Received date missing or not a real date in YYYY-MM-DD form, or the donation date is filled but not valid |
| `missing_donor` | No Salesforce donor ID |
| `amount_mismatch` | The line amounts do not add up to the gift amount |
| `line_problem` | Designation lines are empty, not valid JSON, or the count does not match |
| `missing_required` | A custom field marked required is blank |
| `unknown_id` | A Designation or Outcome Activity ID on a line is empty or not in the code book |

## Setup (saved per data source)

| Part | Meaning |
|---|---|
| `sourceName` | Name of the source, for example "UK Salesforce upload" |
| `mapping` | For each file column: map to a standard field, drop, or leave unmapped |
| `customFields` | Extra fields. **Manual**: staff fill them in. **Calculated**: a rule fills them |
| `valueMaps` | Raw file value to master value per field, for example Frequency: "Recurring Donation" to "Recurring" |

Custom field settings: key, label, kind (manual or calculated), type (text, number, date), required, default value, privacy (normal or sensitive) and, for calculated fields, one rule.

Calculated rules: **copy** (same as another field), **concat** (join fields, skipping blanks), **starts_with** (for example reference starts with EVO-, then Yes or No), **value_map** (swap listed values, else a fallback).

"Unmapped values" are values in the 8 classification fields that are not yet a master value or mapped to one. The mapping screen lists them for staff to map.

## Code book (SF META tab)

| Column | Meaning |
|---|---|
| `Unique Gift Designation` and the `Id` to its right | Designation name and Salesforce ID |
| `Unique Outcome Activity Name` and the `Id` to its right | Outcome Activity name and Salesforce ID |

The tab has several columns headed `Id`, so each is read as "the cell to the right of its name column".

## Order reference prefixes

| Prefix | Meaning |
|---|---|
| `EVO-` | The donation was taken at an event. Example shape: EVO-707-001 |

Other prefixes are added here as MWF confirms them.

## Gift export columns used so far

| Column | Meaning |
|---|---|
| `Legacy_Reference_No__c` | Unique reference of the gift |
| `GiftTranxDesignationInfo__c` | JSON with a list `allTrnxDesignations`, one entry per line |
| `Designation Count` | How many lines the gift should have, used as a check |

Full column list and how each is used: `docs/DATA-SOURCES.md`.

## Terms

| Term | Meaning |
|---|---|
| Designation | The fund a gift is booked to, for example EVENTS or GENERAL AID |
| Outcome Activity | What the gift is for, for example "Orphan Sponsorship Where Most Needed" |
| Gift Commitment | A recurring or custom payment schedule |
| Issue | Something staff should look at. Issues never block an import |
