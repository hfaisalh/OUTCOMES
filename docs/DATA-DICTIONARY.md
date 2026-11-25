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
| Credit chain | The parties a gift is credited to besides the donor, nearest first, such as an agent, then a group, then an organisation above it (DECISIONS 44). Optional | Soft credit, Affiliation |
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
| `categoryId` | Set in OUTCOMES. Empty while unrouted. `default` when the organisation has no categories |
| `status` | `unrouted`, `ready`, `in_progress`, `delivered`, `reported` |
| `subscriptionId`, `instalmentNumber`, `instalmentCount` | The recurring plan the line belongs to, which instalment, and how many (a number or Indefinitely) |
| `supporterId`, `supporterName` | The CRM id and a display name only |

The feed columns are listed in `docs/CRM-FEED-SPEC.md`.

## Categories and their framework (Module 2)

An item belongs to one **category** (for example Sponsorship or Transactional). The category has properties, and one of them is its **framework**: the settings that decide the flow of every order in the category (DECISIONS 40).

| Field | Meaning |
|---|---|
| `id`, `name` | Stable id (made from the name) and the name staff see |
| `keywords` | Words that suggest this category when found in a CRM item's name |
| `framework.unit` | What one delivery is, for example child, pump, animal |
| `framework.cycle` | How often the donor hears back: monthly, quarterly, half_yearly, annual, on_delivery |
| `framework.reportType` | The report the donor receives |
| item map | `{ CRM item id: category id }`. An item not in the map is unrouted |

## Parts (decision 51)

| Field | Meaning |
|---|---|
| `bundleQty` (work order, feed line) | Parts of the item in the bundle the line was bought as. Absent on a work order means 1. Comes from the CRM's bundle configuration through the Catalogue prices export |
| `periodCount` (work order, feed line) | For a one-off payment: the months it covers, the item's instalment plan length from the Catalogue prices export. Absent means one period. Decision 64 |
| parts | `bundleQty` x `quantity`. The base for units. Months are added later by the category (a sponsorship counts months, a water pump does not) |

## Cluster (DECISIONS 161, 162)
A cluster is a part of a gift project's distribution: a school, a university, a home, a region, or a sub cluster inside one (a faculty, a department, a classroom). Stored on the gift project as `clusters`.

| Field | Meaning |
|---|---|
| `id` | Permanent identifier made from the name |
| `name` | What it is called here. Used once among the clusters inside the same cluster |
| `label` | What kind of thing it is (Home, Faculty, Classroom). Free text, suggested from its brothers and sisters |
| `parentId` | The cluster it sits in. Empty for a master cluster |
| `place` | Where it is |
| `capacity` | The total number of places. Set on a master cluster only. Sub clusters show an even share of it as a guide, never a limit |
| `status` | Active or closed |
| `roles` | The people it needs, for example Principal or Warden. Who holds them comes with the beneficiary register |
| `levelId` | Older projects only: the level it was in. Read into `label` and then dropped |

## Beneficiary (DECISIONS 163)
A person or household that receives what a gift delivers. Stored on the organisation's setup as `beneficiaries` (`records` and `counters`).

| Field | Meaning |
|---|---|
| `id` | Permanent ID with the kind's prefix: PRS for a person, HH for a household. A number is never reused |
| `kind` | `person` or `household`. Never changes |
| `name` | A person's name, or a household's family name. Names are compared ignoring case, punctuation and spaces |
| `status` | Active or inactive. An enrolled record is made inactive, not removed |
| `area` | A village or district. Not a full address. Contact details are not kept |
| `dob` | A person's date of birth, YYYY-MM-DD, or empty. With the name it decides whether two records are the same person |
| `gender` | Person: female, male, or empty |
| `guardian` | Person: the parent or guardian's name |
| `guardianRelation` | Person: the guardian's relation to the child (mother, uncle, grandmother) |
| `placeOfBirth` | Person |
| `idNumber` | Person: national ID or B-form number, spaces removed. The same number is the same person, whatever the name |
| `fatherStatus`, `motherStatus` | Person: living, deceased, or empty when not known |
| `eligibility` | Person: the admission decision: ready (prepare for enrolment), review (needs management consent or further review), declined (cannot offer a place), or empty when not checked |
| `eligibilityNote` | Person: the reason, in a few words |
| `partnerId`, `partnerRef` | The partner that gave the record, and that partner's own ID for it. For a sponsorship benefit the partner's room is the units of its own approved enrolled children (DECISIONS 183) |
| `memberIds` | Household: the IDs of the persons in it |
| `size` | Household: how many people, when the persons are not listed |
| `notes` | Free text |
| `sample` | True when made by the sample setup (DECISIONS 168). Enrolments, projects and partners made by it are marked in the same way (a partner by a reference starting SAMPLE-) |

## Enrolment (DECISIONS 167)
A beneficiary placed in a cluster of a project for one benefit. Stored on the organisation's setup as `enrolments` (`records` and a `counter`).

| Field | Meaning |
|---|---|
| `id` | Permanent ID, for example EN-0001. Never reused |
| `beneficiaryId` | The beneficiary, from the register |
| `giftProjectId` | The project |
| `clusterId` | The cluster or sub cluster of that project |
| `itemId` | The benefit: a CRM item |
| `role` | A role the cluster lists (Principal, Warden), or empty for an ordinary beneficiary. A role holder does not count towards capacity |
| `status` | Active or ended. An ended enrolment is kept |
| `since`, `endedOn` | Dates, YYYY-MM-DD |

## Type features: who receives and who comes first (DECISIONS 166)
| Field | Meaning |
|---|---|
| `receiver` | `person` (the person themselves), `household`, `list` (a list of people), `none` (a community or institution), or empty. Older saved values `group` and `institution` read as household and none |
| `first` | `beneficiary` (enrolled first, waits for a sponsor) or `gift` (the gift creates the outcome, recipients come after) |

## Assignment (DECISIONS 170)
Which partner a gift was assigned to. Stored on the organisation's setup as `assignments` (`records`), apart from the gifts so they can be reset.

| Field | Meaning |
|---|---|
| `key` | `sub:` and the subscription id for a recurring gift (all its payments are one assignment), or the line id for a one-off payment (DECISIONS 172, 173) |
| `partnerId` | The partner it was assigned to |
| `giftProjectId` | The project the gift belongs to, empty when it has none |
| `itemId` | The benefit |
| `parts` | The units it takes from the partner's room |
| `how` | `auto` (the workflow assigned it) or `manual` (a person chose or confirmed it) |
| `at` | When, as an ISO time |

## Placement (DECISIONS 175)
Where an assigned gift went. Stored on the organisation's setup as `placements` (`records` and a `counter`), apart from the gifts so they can be reset.

| Field | Meaning |
|---|---|
| `key` | The assignment: `sub:` and the subscription id for a recurring gift, or the line id for a one-off payment |
| `kind` | `place` (it filled an open place) or `outcome` (it created an outcome) |
| `enrolmentId` | The place filled, which is an enrolment. Empty for an outcome |
| `outcomeRef` | The outcome created, for example OUT-0001, never reused. Empty for a place |
| `giftProjectId` | The project the place or outcome belongs to |
| `itemId`, `parts` | The benefit, and the units the gift put in the place |
| `how` | `auto` or `manual` (a person chose the place) |
| `at` | When the placement started, an ISO time |
| `to` | The day it ended, YYYY-MM-DD. Absent while it holds the place (DECISIONS 186) |
| `endReason` | Why it ended: `paused`, `cancelled`, `completed` (the plan), `child-left`, `released` (the gift left scope), `moved`, `taken-back`. An ended placement is kept as history |

## Item units per beneficiary (DECISIONS 188)
Stored on the organisation's setup as `itemUnits`, by CRM item id.

| Field | Meaning |
|---|---|
| `itemUnits[itemId]` | The units that make one whole beneficiary of this benefit: 3 for an orphan shared by donors, 1 for a scholarship. A whole number from 1 to 20. Absent: the workflow's `unitsPerBeneficiary` |

