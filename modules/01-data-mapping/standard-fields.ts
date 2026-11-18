/**
 * standard-fields.ts
 *
 * What it does: the list of standard fields every gift can be mapped onto, and the
 * known Salesforce column names that fit each one. It also lists columns that are
 * dropped by default and why.
 * Who calls it: mapping.ts (suggestions and applying a mapping), the mapping screen.
 * Depends on: nothing (plain data, no database, no screen).
 *
 * Rule (DECISIONS 16): the 8 classification fields are always present on every gift.
 * If nothing in the file fits one, it stays blank. A blank never blocks an import.
 */

export type FieldGroup = "gift" | "donor" | "centre" | "commitment" | "classification" | "notes" | "lines";

export interface StandardField {
  key: string; // stable name used in code
  label: string; // plain English label shown on screen
  group: FieldGroup;
  // Salesforce column names that fit this field (matched ignoring upper or lower case).
  salesforceColumns: string[];
  // Rule: the 8 classification fields exist on every record even when blank.
  alwaysPresent?: boolean;
}

export const STANDARD_FIELDS: StandardField[] = [
  // Section: the gift itself
  { key: "orderReference", label: "Order reference", group: "gift", salesforceColumns: ["Legacy_Reference_No__c"] },
  { key: "websiteOrderId", label: "Website order no.", group: "gift", salesforceColumns: ["Website_Order_Id__c"] },
  { key: "batchName", label: "Gift batch", group: "gift", salesforceColumns: ["GiftBatch.Name"] },
  { key: "receivedDate", label: "Received date", group: "gift", salesforceColumns: ["GiftReceivedDate"] },
  { key: "donationDate", label: "Donation date", group: "gift", salesforceColumns: ["Donation_Date__c"] },
  { key: "giftAmount", label: "Gift amount (reference only)", group: "gift", salesforceColumns: ["GiftAmount"] },
  { key: "currency", label: "Currency", group: "gift", salesforceColumns: ["CurrencyIsoCode"] },
  { key: "legalEntity", label: "Legal entity", group: "gift", salesforceColumns: ["Legal_Entity__r.Name"] },
  { key: "forum", label: "Forum", group: "gift", salesforceColumns: ["Forum__c"] },
  { key: "campaign", label: "Campaign", group: "gift", salesforceColumns: ["Campaign.Name"] },
  { key: "rep", label: "Rep", group: "gift", salesforceColumns: ["Legacy_Rep__c"] },

  // Section: donor (ID and display name only, contact details stay in Salesforce)
  { key: "donorId", label: "Donor ID (Salesforce)", group: "donor", salesforceColumns: ["DonorId"] },
  { key: "legacyDonorId", label: "Old donor ID", group: "donor", salesforceColumns: ["Legacy_Donor_ID__c"] },
  { key: "donorDisplayName", label: "Donor display name", group: "donor", salesforceColumns: ["Legacy_Donor_Name__c"] },

  // Section: centre (decides who the feedback report goes to, DECISIONS 8)
  { key: "accountType", label: "Donor or Community Centre", group: "centre", salesforceColumns: ["Type__c"] },
  { key: "centre", label: "Centre the gift came through", group: "centre", salesforceColumns: ["Affiliation__c"] },

  // Section: recurring and custom commitments
  { key: "recurringAmount", label: "Recurring amount", group: "commitment", salesforceColumns: ["Recurring_Amount__c"] },
  { key: "startDate", label: "Commitment start date", group: "commitment", salesforceColumns: ["EffectiveStartDate"] },
  { key: "endDate", label: "Commitment end date", group: "commitment", salesforceColumns: ["ExpectedEndDate"] },
  { key: "scheduleType", label: "Schedule type", group: "commitment", salesforceColumns: ["Schedule_Type__c"] },
  { key: "transactionPeriod", label: "Period", group: "commitment", salesforceColumns: ["TransactionPeriod"] },
  { key: "commitmentType", label: "Commitment type", group: "commitment", salesforceColumns: ["Commitment_Type__c"] },
  { key: "formalCommitmentType", label: "Formal commitment type", group: "commitment", salesforceColumns: ["Formal_Commitment_Type__c"] },
  { key: "transactionInterval", label: "Interval (every N periods)", group: "commitment", salesforceColumns: ["TransactionInterval"] },
  { key: "transactionDay", label: "Day of the period", group: "commitment", salesforceColumns: ["TransactionDay"] },

  // Section: staff notes
  { key: "donorMessage", label: "Donor message", group: "notes", salesforceColumns: ["Donor_Message__c"] },
  { key: "description", label: "Description", group: "notes", salesforceColumns: ["Description__c"] },

  // Section: designation lines (split into order lines by gifts.ts)
  { key: "designationLines", label: "Designation lines (JSON)", group: "lines", salesforceColumns: ["GiftTranxDesignationInfo__c"] },
  { key: "designationCount", label: "Designation count", group: "lines", salesforceColumns: ["Designation Count"] },

  // Section: the 8 classification fields (DECISIONS 16). Always present, blank if no fit.
  { key: "channel", label: "Channel", group: "classification", alwaysPresent: true, salesforceColumns: ["Channel__c"] },
  { key: "platform", label: "Platform", group: "classification", alwaysPresent: true, salesforceColumns: [] },
  { key: "merchant", label: "Merchant", group: "classification", alwaysPresent: true, salesforceColumns: [] },
  { key: "type", label: "Type", group: "classification", alwaysPresent: true, salesforceColumns: [] },
  { key: "method", label: "Method", group: "classification", alwaysPresent: true, salesforceColumns: ["PaymentMethod"] },
  { key: "mode", label: "Mode", group: "classification", alwaysPresent: true, salesforceColumns: [] },
  // Rule: Donation_Type__c (Donation, Recurring Donation, Custom Commitment) is the
  // best fit for Frequency. The value mapping step later turns these into One-off,
  // Recurring and so on. Frequency drives the sponsorship lifecycle.
  { key: "frequency", label: "Frequency", group: "classification", alwaysPresent: true, salesforceColumns: ["Donation_Type__c"] },
  { key: "settlement", label: "Settlement", group: "classification", alwaysPresent: true, salesforceColumns: ["Bank_Account__r.Name"] },
];

// Columns dropped by default, with the reason shown to staff. Staff can still map them.
// Rule: contact details and bank or card numbers are never stored (CLAUDE.md, Privacy).
export const DEFAULT_DROPS: Record<string, string> = {
  Salutation: "Contact detail, stays in Salesforce",
  FirstName: "Contact detail, stays in Salesforce",
  LastName: "Contact detail, stays in Salesforce",
  OrganizationName: "Contact detail, stays in Salesforce",
  Email: "Contact detail, stays in Salesforce",
  HomePhone: "Contact detail, stays in Salesforce",
  Street: "Contact detail, stays in Salesforce",
  City: "Contact detail, stays in Salesforce",
  PostalCode: "Contact detail, stays in Salesforce",
  State: "Contact detail, stays in Salesforce",
  Country: "Contact detail, stays in Salesforce",
  Cheque_Account_Number__c: "Bank detail, never stored",
  Cheque_Sort_Code__c: "Bank detail, never stored",
  Cheque_No__c: "Bank detail, never stored",
  Direct_Debit_No__c: "Bank detail, never stored",
  Gift_Aid_Status__c: "Finance, stays in Salesforce",
  Tax_Payer_Status__c: "Finance, stays in Salesforce",
  Gift_Transaction_Status__c: "Finance, stays in Salesforce",
  Inter_Entity_Transaction__c: "Finance, stays in Salesforce",
  Legacy_Transaction_ID__c: "Finance, stays in Salesforce",
  Auto_Create__c: "Salesforce system flag",
  Auto_Update__c: "Salesforce system flag",
};
