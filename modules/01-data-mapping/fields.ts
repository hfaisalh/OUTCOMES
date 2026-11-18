/**
 * fields.ts
 *
 * What it does: the generic fields every transaction can be mapped onto. Names say what a thing
 * means, not what a source calls it, so any organisation can map its own columns to them.
 * Who calls it: mapping.ts, setup.ts, pipeline.ts, template.ts and the page.
 * Depends on: nothing (plain data).
 *
 * Rule (DECISIONS 26): nothing here is specific to Salesforce or MWF. Source column names live
 * in presets (presets/), and an organisation's own wording lives in its setup labels.
 * Rule (DECISIONS 16): the 8 classification fields are always present, blank if nothing fits.
 */

// Shown as the number of instalments when a commitment has none (DECISIONS 18).
export const INDEFINITELY = "Indefinitely";

export type FieldGroup = "transaction" | "supporter" | "group" | "commitment" | "lines" | "line" | "notes" | "classification";

export interface Field {
  key: string; // stable name used in code and saved setups
  label: string; // generic plain English label, an organisation can relabel it
  group: FieldGroup;
}

export const FIELDS: Field[] = [
  // The transaction itself
  { key: "reference", label: "Reference", group: "transaction" },
  { key: "externalOrderId", label: "External order number", group: "transaction" },
  { key: "batch", label: "Batch", group: "transaction" },
  { key: "receivedDate", label: "Received date", group: "transaction" },
  { key: "transactionDate", label: "Transaction date", group: "transaction" },
  { key: "totalAmount", label: "Total amount", group: "transaction" },
  { key: "currency", label: "Currency", group: "transaction" },
  { key: "legalEntity", label: "Legal entity", group: "transaction" },
  { key: "division", label: "Division", group: "transaction" },
  { key: "campaign", label: "Campaign", group: "transaction" },
  { key: "representative", label: "Representative", group: "transaction" },

  // The supporter (ID and display name only, contact details are never stored)
  { key: "supporterId", label: "Supporter ID", group: "supporter" },
  { key: "supporterAltId", label: "Other supporter ID", group: "supporter" },
  { key: "supporterName", label: "Supporter name", group: "supporter" },
  { key: "supporterType", label: "Supporter type", group: "supporter" },

  // The group a transaction came through: a centre, branch or region (DECISIONS 8)
  { key: "group", label: "Group", group: "group" },

  // Recurring and instalment commitments
  { key: "commitmentAmount", label: "Commitment amount", group: "commitment" },
  { key: "commitmentStart", label: "Commitment start", group: "commitment" },
  { key: "commitmentEnd", label: "Commitment end", group: "commitment" },
  { key: "scheduleType", label: "Schedule type", group: "commitment" },
  { key: "period", label: "Period", group: "commitment" },
  { key: "interval", label: "Interval", group: "commitment" },
  { key: "dayOfPeriod", label: "Day of period", group: "commitment" },
  { key: "commitmentType", label: "Commitment type", group: "commitment" },
  { key: "commitmentForm", label: "Commitment form", group: "commitment" },
  { key: "instalmentCount", label: "Number of instalments", group: "commitment" },

  // Staff notes
  { key: "supporterMessage", label: "Supporter message", group: "notes" },
  { key: "description", label: "Description", group: "notes" },

  // Lines held in one column (for sources that pack the lines into a structured value)
  { key: "linesData", label: "Lines column", group: "lines" },
  { key: "lineCount", label: "Line count", group: "lines" },

  // Lines held one per row (for sources with a row per line)
  { key: "lineFund", label: "Fund name", group: "line" },
  { key: "lineFundId", label: "Fund ID", group: "line" },
  { key: "lineOutcome", label: "Outcome name", group: "line" },
  { key: "lineOutcomeId", label: "Outcome ID", group: "line" },
  { key: "lineAmount", label: "Line amount", group: "line" },
  { key: "lineQuantity", label: "Quantity", group: "line" },
  { key: "lineUnitPrice", label: "Unit price", group: "line" },
  { key: "lineIntention", label: "Intention", group: "line" },
  { key: "lineLabel", label: "Line label", group: "line" },
  { key: "lineNote", label: "Line note", group: "line" },

  // The 8 classification fields (DECISIONS 16). Always present, blank if no fit.
  { key: "channel", label: "Channel", group: "classification" },
  { key: "platform", label: "Platform", group: "classification" },
  { key: "merchant", label: "Merchant", group: "classification" },
  { key: "type", label: "Type", group: "classification" },
  { key: "method", label: "Method", group: "classification" },
  { key: "mode", label: "Mode", group: "classification" },
  { key: "frequency", label: "Frequency", group: "classification" },
  { key: "settlement", label: "Settlement", group: "classification" },
];

export const FIELD_KEYS = new Set(FIELDS.map((f) => f.key));
export const CLASSIFICATION_KEYS = FIELDS.filter((f) => f.group === "classification").map((f) => f.key);

// Order the groups are shown in.
export const GROUP_ORDER: FieldGroup[] = ["classification", "transaction", "supporter", "group", "commitment", "line", "lines", "notes"];
export const GROUP_TITLES: Record<FieldGroup, string> = {
  classification: "Transaction classification (always present, blank if no fit)",
  transaction: "Transaction",
  supporter: "Supporter (ID and display name only)",
  group: "Group",
  commitment: "Recurring and instalments",
  line: "Lines, one per row",
  lines: "Lines, in one column",
  notes: "Staff notes",
};

/** The label to show for a field: the organisation's own wording if it set one, else the generic one. */
export function labelFor(key: string, labels: Record<string, string> = {}): string {
  return labels[key] ?? FIELDS.find((f) => f.key === key)?.label ?? key;
}
