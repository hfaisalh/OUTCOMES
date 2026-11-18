# Data sources

What we learned from MWF's real files (18 Nov 2026). No donor data is stored in this repo.

## 1. Salesforce gift upload ("SF Upload" tab)

Source: Google Sheet "Upload Sheet Making - UK", tab **SF Upload**. About 525 rows a batch, 64 columns, one row per gift.

Key columns:

| Column | Meaning | Use in OUTCOMES |
|---|---|---|
| `Legacy_Reference_No__c` | Unique reference (e.g. EVO-707-001) | Order reference, duplicate check |
| `Website_Order_Id__c` | Web order number | Order no. |
| `GiftReceivedDate`, `Donation_Date__c` | Dates | Received date, donation date |
| `Donation_Type__c` | Donation / Recurring Donation / Custom Commitment | Drives lifecycle |
| `GiftAmount` | Total | Kept for reference only |
| `DonorId` | Salesforce Account ID | **Donor link** |
| `Legacy_Donor_ID__c`, `Legacy_Donor_Name__c` | Old ID and "ID - Name" | Display name |
| `Type__c` | Donor or Community Centre | **Centre detection** |
| `Affiliation__c` | Centre the gift came through | **Soft credit / creditTo** |
| `Forum__c` | MWF / MQI / MWL | Reporting |
| `PaymentMethod`, `Channel__c`, `Bank_Account__r.Name`, `Campaign.Name`, `Legacy_Rep__c` | Channel | Reporting |
| `Recurring_Amount__c`, `EffectiveStartDate`, `TransactionPeriod`, `Schedule_Type__c`, `Commitment_Type__c` | Commitment | Sponsorship start / renewals |
| `Donor_Message__c`, `Description__c` | Free text (memo, dua requests) | Staff notes |
| `GiftTranxDesignationInfo__c` | **JSON list of lines** | Split into order lines |
| FirstName, LastName, Email, HomePhone, Street, PostalCode | Contact | **Not stored** (stays in CRM) |

Likely fit for the 8 classification fields (blank where nothing fits):

| Field | SF Upload column | Example values |
|---|---|---|
| Channel | `Channel__c` | Card Machine, Bank, Website, Centre |
| Platform | none yet (blank) | |
| Merchant | `PaymentMethod` (partly) | EVO, Stripe, Sagepay |
| Type | none (blank, nearly all monetary) | |
| Method | `PaymentMethod` | EVO, Online Transfer, Apple Pay, Cash, Bank Deposit |
| Mode | none yet (blank) | |
| Frequency | `Donation_Type__c` / `TransactionPeriod` | Donation, Recurring Donation, Custom Commitment, Monthly |
| Settlement | `Bank_Account__r.Name` | CVB Nelson, Sagepay GBP, HSBC1 |

`GiftTranxDesignationInfo__c` example (one gift can have several lines):

```json
{"allTrnxDesignations":[{"Amount":120,"Unit_Price__c":120,"Quantity__c":1,
  "Gift_Designation__c":"6gd...","Outcome_Activity__c":"9OA...",
  "Intention__c":"Sadqah","GiftPlateName__c":"","Description__c":"..."}]}
```

## 2. Code book ("SF META" tab)

Turns Salesforce IDs into names. 31 designations, 478 outcome activities. Every column headed `Id` sits to the right of its name column (e.g. "Unique Outcome Activity Name" | "Id"). Tested: all 527 lines of a real batch decoded with no gaps.

Real example of what a batch contains:

| Designation | Outcome Activity | Lines |
|---|---|---|
| GENERAL AID | Sadqah General Aid | 245 |
| EVENTS | Event Income - Derby Fundraising Festival | 62 |
| EVENTS | Orphan Sponsorship - (fundraiser) - Birmingham - 14-Nov-2026 | 21 |
| ON - SP ORPHAN | Orphan Sponsorship Where Most Needed | 6 |
| WATER FOR ALL | Clean Water Where Most Needed | 3 |

## 3. QuickBooks (not an input, background only)

- "QB GS READY UPLOAD" tab: same gifts in QuickBooks format (26 columns, no donor contact details).
- QB products file (2,588 items, 2,064 flagged "Feedback Product", column TYPE gives the framework). Hierarchy: main pots, sub pots by institute, event pots, clearing ("ALLOCATED") pots, and 2,015 child products named `...:SPONSORSHIPS:LAHORE:N-A-0365 - Name`.
- Child ID prefixes: N-A Aghosh, N-B Bait ul Zahra, N-H Hifz, N-S School, N-C College. Useful later to import existing beneficiaries.

## Test data

`samples/` holds invented files in the real column layout. Use them in tests and demos. Real exports must never be committed.
