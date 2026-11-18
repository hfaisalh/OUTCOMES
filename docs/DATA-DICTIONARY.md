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
