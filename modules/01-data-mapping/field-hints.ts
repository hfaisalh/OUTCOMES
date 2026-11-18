/**
 * field-hints.ts
 *
 * What it does: extra knowledge about each generic field that helps auto-matching and the
 * expected-format guide: other names a column might have, an invented example, and which
 * fields are required by default.
 * Who calls it: mapping.ts (auto-matching) and template.ts (template and format guide).
 * Depends on: nothing (plain data).
 *
 * Rule: matching ignores case, spaces and punctuation, so "PAY METH", "Pay Meth" and "pay_meth"
 * are the same. Aliases include the headers used in common sheets and exports.
 */

export const ALIASES: Record<string, string[]> = {
  reference: ["ref", "order ref", "order reference", "ref no", "ref number", "refnumber", "transaction reference", "donation ref", "donation reference"],
  externalOrderId: ["order number", "order no", "order id", "website order", "web order"],
  batch: ["gift batch", "batch name", "batch number", "batch no"],
  receivedDate: ["date received", "don date", "date", "order date", "payment date", "charge date", "banking date"],
  transactionDate: ["donation date", "gift date", "date of donation"],
  totalAmount: ["amount", "gift amount", "donation amount", "total receipt amount", "order total amount", "total"],
  currency: ["order currency"],
  legalEntity: ["entity"],
  division: ["forum", "brand"],
  representative: ["rep", "rep name", "fundraiser", "agent"],
  supporterId: ["donor id", "sf donor id", "salesforce donor id", "account id", "customer id", "contact id"],
  supporterAltId: ["old donor id", "legacy donor id", "qb donor id", "legacy id"],
  supporterName: ["donor name", "legacy donor name", "customer name"],
  supporterType: ["donor type", "account type", "customer type"],
  group: ["centre", "center", "centre name", "branch", "region", "affiliation", "community centre"],
  commitmentAmount: ["recurring amount", "monthly amount", "instalment amount", "installment amount"],
  commitmentStart: ["start date", "effective start date", "commitment start date"],
  commitmentEnd: ["end date", "expected end date", "commitment end date"],
  scheduleType: ["schedule"],
  period: ["transaction period", "payment period"],
  interval: ["transaction interval"],
  dayOfPeriod: ["transaction day", "day of month"],
  commitmentForm: ["formal commitment type"],
  instalmentCount: ["instalments", "installments", "no of instalments", "number of installments"],
  supporterMessage: ["donor message", "message from donor", "message"],
  description: ["memo", "note", "notes"],
  linesData: ["lines", "designation lines", "designation info", "designations", "gift designations"],
  lineCount: ["designation count", "number of lines"],
  lineFund: ["fund", "designation", "fund name", "designation name"],
  lineFundId: ["designation id"],
  lineOutcome: ["outcome", "outcome activity", "outcome name", "project", "item", "item name", "product"],
  lineOutcomeId: ["outcome activity id", "product id"],
  lineAmount: ["item amount", "amount per line"],
  lineQuantity: ["qty"],
  lineUnitPrice: ["price", "rate"],
  lineIntention: ["intension"],
  lineLabel: ["plate name", "dedication", "on behalf of"],
  lineNote: ["line description"],
  channel: [],
  platform: ["kiosk"],
  merchant: ["payment processor", "processor", "payment gateway"],
  type: ["transaction type"],
  method: ["payment method", "pay meth", "pay method", "p meth"],
  mode: ["payment mode"],
  frequency: ["donation type", "recurrence"],
  settlement: ["bank account", "deposit to"],
};

// Columns that carry contact details under other names. Dropped by default, they are never stored.
export const CONTACT_ALIASES: string[] = [
  "title", "first name", "last name", "full name", "email", "e mail", "email address", "e mail address", "email 2", "e mail 2",
  "phone", "mobile", "telephone", "home tel", "mobile phone", "address", "street", "street address",
  "street 1", "street 2", "city", "town", "post code", "postcode", "zip", "zip code", "state", "country",
];

// Fields a source must have for a transaction to be usable, unless the organisation changes it.
export const DEFAULT_REQUIRED = ["reference", "receivedDate"];

// Invented example values, for the template and the format guide. Not real data.
export const EXAMPLES: Record<string, string> = {
  reference: "TX-1001",
  externalOrderId: "100245",
  batch: "B-0001",
  receivedDate: "2026-11-07",
  transactionDate: "2026-11-07",
  totalAmount: "120",
  currency: "GBP",
  legalEntity: "Example Charity UK",
  division: "North",
  campaign: "Winter appeal",
  representative: "AB",
  supporterId: "S-100",
  supporterAltId: "100",
  supporterName: "Example Supporter",
  supporterType: "Individual",
  group: "Example Branch",
  commitmentAmount: "30",
  commitmentStart: "2026-11-15",
  commitmentEnd: "2027-11-15",
  scheduleType: "Recurring",
  period: "Monthly",
  interval: "1",
  dayOfPeriod: "15",
  commitmentType: "Pledge",
  commitmentForm: "Written",
  instalmentCount: "12",
  supporterMessage: "",
  description: "Example note",
  lineCount: "1",
  lineFund: "General fund",
  lineFundId: "",
  lineOutcome: "Orphan sponsorship",
  lineOutcomeId: "",
  lineAmount: "120",
  lineQuantity: "1",
  lineUnitPrice: "120",
  lineIntention: "Sadaqah",
  lineLabel: "",
  lineNote: "",
  channel: "Card machine",
  platform: "",
  merchant: "",
  type: "",
  method: "Card",
  mode: "",
  frequency: "One-off",
  settlement: "Main account",
};
