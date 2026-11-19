# Data dictionary

What each field means. Names are generic and say what a thing means (DECISIONS 26). Each organisation can relabel them in its setup. The Salesforce column for each field is in the Salesforce preset (`modules/01-data-mapping/presets/salesforce.ts`).

## Vocabulary

| Generic term | Meaning | MWF and Salesforce word |
|---|---|---|
| Transaction | One thing that was given or paid, with one or more lines | Gift |
| Line | One part of a transaction: a fund and an outcome with an amount | Gift transaction designation line |
| Supporter | Whoever gave or paid | Donor |
| Fund | Where the money goes | Designation |
| Outcome | What is delivered. The routing key (DECISIONS 5) | Outcome Activity |
| Group | A centre, branch or region a transaction came through (DECISIONS 8) | Centre, Community Centre |
| Commitment | A recurring or instalment arrangement | Gift Commitment |
| Lookup list | Names for fund and outcome IDs, set once | Code book (SF META) |

## Transaction fields

| Field | Meaning |
|---|---|
| `reference` | Unique reference of the transaction. A repeat is flagged (DECISIONS 17) |
| `externalOrderId` | An order number from another system, such as a website |
| `batch` | The batch the transaction belongs to (DECISIONS 20) |
| `receivedDate` | When it was received. Required, YYYY-MM-DD. A date in the future is flagged |
| `transactionDate` | When it was made, if different. YYYY-MM-DD |
| `totalAmount` | Total, for reference only |
| `currency`, `legalEntity`, `division`, `campaign`, `representative` | Reporting details |

## Supporter and group

| Field | Meaning |
|---|---|
| `supporterId` | The supporter's ID in the source system |
| `supporterAltId` | An older or other ID |
| `supporterName` | Display name only. Contact details are never stored |
| `supporterType` | For example individual, or a group booked on their behalf |
| `group` | The group the transaction came through. When there is no individual supporter the report goes to the group (DECISIONS 8) |

## Transaction classification (always present, blank if no fit, DECISIONS 16)

Channel, Platform, Merchant, Type, Method, Mode, Frequency, Settlement. Frequency matters most: it drives the lifecycle (renewals, lapses). Raw values in the file are mapped once to master values (for example "Recurring Donation" to "Recurring").

## Commitments (recurring and instalments)

A transaction is a commitment when it has a schedule type or a commitment amount.

| Field | Meaning |
|---|---|
| `commitmentAmount` | Amount each period |
| `commitmentStart` | When it starts. Required for a commitment |
| `commitmentEnd` | When it ends. **Optional**: some run until stopped. If given, a real date not before the start |
| `scheduleType`, `period`, `interval`, `dayOfPeriod` | The schedule, for example Recurring, Monthly, every 1, day 15 |
| `commitmentType`, `commitmentForm` | Type of commitment, and whether it is written |
| `instalmentCount` | Number of instalments. Normally set in the product configuration of the platform that took the transaction, so it should come in the export (DECISIONS 18). A commitment without a count shows **Indefinitely**. A one-off keeps it blank |

## Lines

Lines arrive in one of three layouts (see the module README). Line fields for the one-row-per-line layouts:

| Field | Meaning |
|---|---|
| `lineFund`, `lineFundId` | Fund name, or its ID to be looked up |
| `lineOutcome`, `lineOutcomeId` | Outcome name, or its ID to be looked up |
| `lineAmount`, `lineQuantity`, `lineUnitPrice` | Amount, quantity (default 1), unit price. With no line amount the total is used |
| `lineIntention`, `lineLabel`, `lineNote` | Intention (for example Sadaqah), a label such as a dedication, a note |

For `lines-column` sources, `linesData` holds the packed lines and `lineCount` the number the source says there are. The preset reads them.

## Issues

Each issue has the source row (header is row 1), the reference, an optional line number, a code and a plain message. Issues never block an import.

| Code | Meaning |
|---|---|
| `missing_reference` | No reference |
| `duplicate_reference` | The reference is already used on an earlier row |
| `bad_date` | Received date missing (when required) or not a real YYYY-MM-DD date, or another date is filled but not valid |
| `future_date` | The received date is in the future, probably a typo |
| `missing_supporter` | No supporter ID (when required) |
| `amount_mismatch` | Lines do not add up to the total. Only for `lines-column` sources, and skipped when the upload holds only some lines of each transaction |
| `line_problem` | Lines empty, unreadable, or the line count does not match |
| `unknown_id` | A fund or outcome ID is not in the lookup list, or a required one is missing |
| `missing_required` | A required field or required custom field is blank |
| `missing_start_date`, `end_before_start` | Commitment dates |
| `inconsistent_rows` | Rows of one transaction (one-row-per-line) disagree on supporter, date, group or currency |

## Auto-matching of columns

A column is matched in this order: (1) the preset's exact column name, if a preset is used, (2) by name, meaning its name ignoring case, spaces and punctuation equals a field's label, key or a known alias (shown as "by name" so staff can check it), (3) known contact and bank columns are dropped with a reason. Nothing is guessed from partial names. Aliases live in `field-hints.ts`.

## Setup (saved per data source, per organisation)

| Part | Meaning |
|---|---|
| `presetId`, `layout` | The source preset (or none) and how lines are laid out |
| `requiredFields` | Fields the source must supply, set per organisation |
| `feedbackItemsOnly` | The upload holds only some lines of each transaction, so totals are not checked |
| `mapping` | For each source column: map to a field, drop, or leave unmapped |
| `customFields` | Extra fields. **Manual**: staff fill them in. **Calculated**: a rule fills them (copy, concat, starts_with, value_map) |
| `valueMaps`, `masterValues` | Raw value to master value per field, and the master values on offer |
| `labels` | The organisation's own wording for fields |
| `lookups` | Fund and outcome names by ID |

## MWF reference prefixes

| Prefix | Meaning |
|---|---|
| `EVO-` | The donation was taken at an event. Example shape: EVO-707-001 |

Other prefixes are added here as MWF confirms them.

## Work orders (Module 1c)

A work order is one instruction token: deliver this line and report back to this supporter.

| Field | Meaning |
|---|---|
| `key` | `transactionRef:lineId`. Unique, so a line never makes two work orders |
| `itemId`, `itemName` | The CRM item. The CRM says whether it needs feedback |
| `frameworkId` | Set in OUTCOMES. Empty while unrouted. `default` when the organisation has no frameworks |
| `status` | `unrouted`, `ready`, `in_progress`, `delivered`, `reported` |
| `subscriptionId`, `instalmentNumber`, `instalmentCount` | The recurring plan the line belongs to, which instalment, and how many (a number or Indefinitely) |
| `supporterId`, `supporterName` | The CRM id and a display name only |

The feed columns are listed in `docs/CRM-FEED-SPEC.md`.
