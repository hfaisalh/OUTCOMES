/**
 * presets/salesforce.ts
 *
 * What it does: the Salesforce preset for MWF's upload sheet. It holds everything that is
 * specific to that source: Salesforce column names, the designation JSON that packs the lines,
 * the SF META code book layout, and MWF's own wording.
 * Who calls it: presets/index.ts. Nothing else in the core knows these names.
 * Depends on: csv.ts and lines.ts types (pure functions, no database, no screen).
 *
 * Terms here follow Salesforce: Designation (a fund), Outcome Activity (an outcome), Gift
 * Commitment, Donor, Community Centre.
 */

import type { Table } from "../csv";
import { toNumber, emptyLookups, type LinesParseResult, type PartialLine } from "../lines";
import type { Preset } from "./types";

// Section: how a Salesforce column maps to a generic field.
const columns: Record<string, string[]> = {
  reference: ["Legacy_Reference_No__c"],
  externalOrderId: ["Website_Order_Id__c"],
  batch: ["GiftBatch.Name"],
  receivedDate: ["GiftReceivedDate"],
  transactionDate: ["Donation_Date__c"],
  totalAmount: ["GiftAmount"],
  currency: ["CurrencyIsoCode"],
  legalEntity: ["Legal_Entity__r.Name"],
  division: ["Forum__c"],
  campaign: ["Campaign.Name"],
  representative: ["Legacy_Rep__c"],
  supporterId: ["DonorId"],
  supporterAltId: ["Legacy_Donor_ID__c"],
  supporterName: ["Legacy_Donor_Name__c"],
  supporterType: ["Type__c"],
  group: ["Affiliation__c"],
  commitmentAmount: ["Recurring_Amount__c"],
  commitmentStart: ["EffectiveStartDate"],
  commitmentEnd: ["ExpectedEndDate"],
  scheduleType: ["Schedule_Type__c"],
  period: ["TransactionPeriod"],
  interval: ["TransactionInterval"],
  dayOfPeriod: ["TransactionDay"],
  commitmentType: ["Commitment_Type__c"],
  commitmentForm: ["Formal_Commitment_Type__c"],
  supporterMessage: ["Donor_Message__c"],
  description: ["Description__c"],
  linesData: ["GiftTranxDesignationInfo__c"],
  lineCount: ["Designation Count"],
  channel: ["Channel__c"],
  method: ["PaymentMethod"],
  frequency: ["Donation_Type__c"],
  settlement: ["Bank_Account__r.Name"],
};

// Rule: contact details and bank or card numbers are never stored (CLAUDE.md, Privacy).
const drops: Record<string, string> = {
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

// MWF's own wording for the generic fields.
const labels: Record<string, string> = {
  reference: "Order reference",
  batch: "Gift batch",
  transactionDate: "Donation date",
  totalAmount: "Gift amount (reference only)",
  division: "Forum",
  representative: "Rep",
  supporterId: "Donor ID (Salesforce)",
  supporterAltId: "Old donor ID",
  supporterName: "Donor display name",
  supporterType: "Donor or Community Centre",
  group: "Centre the gift came through",
  commitmentAmount: "Recurring amount",
  commitmentForm: "Formal commitment type",
  supporterMessage: "Donor message",
  linesData: "Designation lines (JSON)",
  lineCount: "Designation count",
  lineFund: "Designation",
  lineOutcome: "Outcome Activity",
};

/**
 * Rule: the Salesforce gift carries its lines in GiftTranxDesignationInfo__c as JSON:
 * {"allTrnxDesignations":[{ Amount, Unit_Price__c, Quantity__c, Gift_Designation__c,
 * Outcome_Activity__c, Intention__c, GiftPlateName__c, Description__c }, ...]}.
 * Each entry is one line. Empty text, broken JSON or a missing list gives no lines and one
 * problem, never an error, so the rest of the file still loads.
 */
function parseLinesColumn(text: string): LinesParseResult {
  const raw = text.trim();
  if (raw === "") return { lines: [], problems: ["No designation lines in this gift"] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { lines: [], problems: ["Designation lines are not valid JSON"] };
  }

  const list = (parsed as { allTrnxDesignations?: unknown }).allTrnxDesignations;
  if (!Array.isArray(list)) return { lines: [], problems: ["Designation JSON has no allTrnxDesignations list"] };

  const text_ = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const lines: PartialLine[] = list.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    return {
      amount: toNumber(e["Amount"]),
      unitPrice: toNumber(e["Unit_Price__c"]),
      quantity: toNumber(e["Quantity__c"]),
      fundId: text_(e["Gift_Designation__c"]),
      outcomeId: text_(e["Outcome_Activity__c"]),
      intention: text_(e["Intention__c"]),
      label: text_(e["GiftPlateName__c"]),
      note: text_(e["Description__c"]),
    };
  });
  return { lines, problems: [] };
}

/**
 * Rule: in the SF META code book, every column headed "Id" sits directly to the right of its name
 * column. So the name column is found by its header and the ID is the cell one place to the
 * right. If the same ID has two names, the first is kept and a problem is reported.
 */
function readLookups(table: Table) {
  const headerRow = (table[0] ?? []).map((h) => h.trim());
  const problems: string[] = [];
  const lookups = emptyLookups();

  const read = (header: string, target: Record<string, string>, label: string) => {
    const nameCol = headerRow.indexOf(header);
    if (nameCol === -1) {
      problems.push(`Code book has no "${header}" column`);
      return;
    }
    for (const row of table.slice(1)) {
      const name = (row[nameCol] ?? "").trim();
      const id = (row[nameCol + 1] ?? "").trim();
      if (name === "" || id === "") continue;
      const existing = Object.prototype.hasOwnProperty.call(target, id) ? target[id] : undefined;
      if (existing !== undefined && existing !== name) {
        problems.push(`${label} ID ${id} has two names: "${existing}" and "${name}"`);
        continue;
      }
      target[id] = name;
    }
  };
  read("Unique Gift Designation", lookups.funds, "Designation");
  read("Unique Outcome Activity Name", lookups.outcomes, "Outcome Activity");
  return { lookups, problems };
}

export const salesforcePreset: Preset = {
  id: "salesforce",
  name: "Salesforce (MWF upload sheet)",
  columns,
  drops,
  layout: "lines-column",
  requiredFields: ["reference", "receivedDate", "supporterId", "lineFund", "lineOutcome"],
  labels,
  examples: {
    linesData:
      '{"allTrnxDesignations":[{"Amount":120,"Unit_Price__c":120,"Quantity__c":1,"Gift_Designation__c":"6gdTw000000DemoSPO","Outcome_Activity__c":"9OATw000002DemoOSP","Intention__c":"Sadqah"}]}',
    reference: "EVO-707-001",
    supporterId: "001Tw00000DemoC01",
    group: "001Tw00000DemoC01",
    supporterType: "Community Centre",
    scheduleType: "Recurring",
    frequency: "Donation",
    channel: "Card Machine",
    method: "EVO",
    settlement: "CVB Nelson",
  },
  parseLinesColumn,
  readLookups,
};
