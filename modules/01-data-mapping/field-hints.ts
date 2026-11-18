/**
 * field-hints.ts
 *
 * What it does: extra knowledge about each standard field that helps auto-matching and the
 * expected-format guide: other names a column might have, whether the field is required,
 * and an invented example value.
 * Who calls it: mapping.ts (auto-matching) and template.ts (template and format guide).
 * Depends on: nothing (plain data).
 *
 * Rule: aliases include the headers used in MWF's other touchpoint sheets (web export,
 * gift sheets), so those files match without work. Matching ignores case, spaces and
 * punctuation, so "PAY METH", "Pay Meth" and "pay_meth" are the same.
 */

export const ALIASES: Record<string, string[]> = {
  orderReference: ["reference", "order ref", "order reference", "ref no", "ref number", "refnumber", "donation ref", "donation reference"],
  websiteOrderId: ["order number", "order no", "order id", "website order"],
  batchName: ["batch", "gift batch", "batch name"],
  receivedDate: ["received date", "date received", "don date", "date", "order date", "payment date", "charge date", "banking date"],
  donationDate: ["donation date", "date of donation"],
  giftAmount: ["amount", "total amount", "gift amount", "donation amount", "total receipt amount", "order total amount"],
  currency: ["currency", "order currency"],
  legalEntity: ["legal entity", "entity"],
  forum: ["forum"],
  campaign: ["campaign", "campaign name"],
  rep: ["rep", "rep name", "fundraiser"],
  donorId: ["donor id", "sf donor id", "salesforce donor id", "account id"],
  legacyDonorId: ["old donor id", "legacy donor id", "qb donor id"],
  donorDisplayName: ["donor name", "legacy donor name"],
  accountType: ["donor type", "account type", "customer type"],
  centre: ["centre", "center", "centre name", "affiliation", "community centre"],
  recurringAmount: ["recurring amount", "monthly amount", "instalment amount", "installment amount"],
  startDate: ["start date", "effective start date", "commitment start date"],
  endDate: ["end date", "expected end date", "commitment end date"],
  scheduleType: ["schedule type", "schedule"],
  transactionPeriod: ["period", "transaction period", "payment period"],
  instalmentCount: ["number of instalments", "instalments", "installments", "no of instalments", "number of installments"],
  donorMessage: ["donor message", "message from donor"],
  description: ["description", "memo"],
  designationLines: ["designation lines", "designation info", "designations", "gift designations"],
  designationCount: ["designation count", "no of designations", "number of designations"],
  channel: ["channel"],
  platform: ["platform", "kiosk"],
  merchant: ["merchant", "payment processor", "processor", "payment gateway"],
  type: ["transaction type"],
  method: ["payment method", "pay meth", "pay method", "p meth", "method"],
  mode: ["mode", "payment mode"],
  frequency: ["frequency", "donation type", "recurrence"],
  settlement: ["settlement", "bank account", "deposit to"],
};

// Columns that carry contact details under other names. Dropped by default, like DEFAULT_DROPS.
export const CONTACT_ALIASES: string[] = [
  "title", "first name", "last name", "full name", "email", "e mail", "email address", "e mail address", "email 2", "e mail 2",
  "phone", "mobile", "telephone", "home tel", "mobile phone", "address", "street", "street address",
  "street 1", "street 2", "city", "town", "post code", "postcode", "zip", "zip code", "state", "country",
];

// Fields a file must have for the gift to be usable. Everything else is optional.
export const REQUIRED_FIELDS = new Set(["orderReference", "receivedDate", "donorId", "designationLines"]);

// Invented example values, for the template and the format guide. Not real data.
export const EXAMPLES: Record<string, string> = {
  orderReference: "EVO-707-001",
  websiteOrderId: "100245",
  batchName: "GB-1",
  receivedDate: "2026-11-07",
  donationDate: "2026-11-08",
  giftAmount: "120",
  currency: "GBP",
  legalEntity: "MWF United Kingdom",
  forum: "MWF",
  campaign: "General",
  rep: "AB",
  donorId: "001Tw00000DemoC01",
  legacyDonorId: "900001",
  donorDisplayName: "900001 - Demo Centre",
  accountType: "Community Centre",
  centre: "001Tw00000DemoC01",
  recurringAmount: "30",
  startDate: "2026-11-15",
  endDate: "2027-11-15",
  scheduleType: "Recurring",
  transactionPeriod: "Monthly",
  transactionInterval: "1",
  transactionDay: "15",
  commitmentType: "Pledge",
  formalCommitmentType: "Written",
  instalmentCount: "12",
  donorMessage: "",
  description: "G26-0001",
  designationLines:
    '{"allTrnxDesignations":[{"Amount":120,"Unit_Price__c":120,"Quantity__c":1,"Gift_Designation__c":"6gdTw000000DemoSPO","Outcome_Activity__c":"9OATw000002DemoOSP","Intention__c":"Sadqah"}]}',
  designationCount: "1",
  channel: "Card Machine",
  platform: "",
  merchant: "",
  type: "",
  method: "EVO",
  mode: "",
  frequency: "Donation",
  settlement: "CVB Nelson",
};
