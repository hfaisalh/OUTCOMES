/**
 * setup.ts
 *
 * What it does: a "setup" is everything an organisation decided for one data source: which preset
 * and lines layout it uses, which column goes to which field, extra manual or calculated fields,
 * how raw values map to master values, its own wording, and its lookup lists. This file defines
 * the setup, applies it to a transaction, finds values still to be mapped, and saves and loads it.
 * Who calls it: pipeline.ts, the mapping page.
 * Depends on: csv.ts, fields.ts, lines.ts, mapping.ts, presets (pure functions, no database, no
 * screen). Saving here means turning a setup into text. Where the text is stored is for the
 * developers to decide.
 */

import { DEFAULT_REQUIRED } from "./field-hints";
import { CLASSIFICATION_KEYS, FIELD_KEYS } from "./fields";
import { emptyLookups, type LinesLayout, type Lookups } from "./lines";
import { suggestMapping, type Mapping, type StandardTransaction } from "./mapping";
import { getPreset } from "./presets";

// Calculated fields use a small fixed set of rules instead of free code, so they can be ported
// to another stack and checked easily.
export type CalculatedRule =
  | { type: "copy"; from: string } // same value as another field
  | { type: "concat"; from: string[]; separator: string } // join several fields, skipping blanks
  | { type: "starts_with"; from: string; prefix: string; yes: string; no: string } // e.g. reference starts with EVO-
  | { type: "value_map"; from: string; map: Record<string, string>; otherwise: string }; // swap listed values

export interface CustomField {
  key: string; // stable name, letters and digits, starts with a lower case letter
  label: string; // plain English label shown on screen
  kind: "manual" | "calculated"; // manual: staff fill it in. calculated: a rule fills it
  type: "text" | "number" | "date";
  required: boolean; // required but blank is reported as an issue, never blocks
  defaultValue: string; // used for manual fields, and when a rule gives a blank
  privacy: "normal" | "sensitive"; // sensitive fields get stricter access later
  rule?: CalculatedRule; // only for calculated fields
}

// Raw source value to master value, per field. Example: { frequency: { "Recurring Donation": "Recurring" } }
export type ValueMaps = Record<string, Record<string, string>>;

// The master values staff can choose for each field. A master value can exist before any raw value is mapped to it.
export type MasterValues = Record<string, string[]>;

export interface Setup {
  version: 2;
  organisationId?: string; // which organisation owns this setup (DECISIONS 23), set by the server
  sourceName: string; // for example "UK Salesforce upload"
  presetId: string | null; // the source preset, or null for a generic source
  layout: LinesLayout; // how this source carries lines
  requiredFields: string[]; // fields the source must supply, set per organisation
  feedbackItemsOnly: boolean; // the upload holds only some lines of each transaction, so totals are not checked
  mapping: Mapping;
  customFields: CustomField[];
  valueMaps: ValueMaps;
  masterValues: MasterValues;
  labels: Record<string, string>; // the organisation's own wording for fields
  lookups: Lookups; // names for fund and outcome IDs, configuration loaded once
}

// A value in the data that still has no master value.
export interface UnmappedValue {
  field: string;
  value: string;
  count: number;
}

const norm = (s: string) => s.trim().toLowerCase();
const LAYOUTS: LinesLayout[] = ["lines-column", "one-row-per-line", "one-line-per-transaction"];

/** A new setup for a source. A preset pre-fills the mapping, layout, required fields and wording. */
export function newSetup(sourceName: string, headers: string[], presetId: string | null = null): Setup {
  const preset = getPreset(presetId);
  return {
    version: 2,
    sourceName,
    presetId: preset?.id ?? null,
    layout: preset?.layout ?? "one-line-per-transaction",
    requiredFields: preset ? [...preset.requiredFields] : [...DEFAULT_REQUIRED],
    feedbackItemsOnly: false,
    mapping: suggestMapping(headers, preset),
    customFields: [],
    valueMaps: {},
    // Rule: Frequency starts with the three master values from the transaction model (DECISIONS 16).
    masterValues: { frequency: ["One-off", "Recurring", "Instalment"] },
    labels: preset ? { ...preset.labels } : {},
    lookups: emptyLookups(),
  };
}

/** Rule: work out one calculated value from the values already on the transaction. */
export function computeRule(rule: CalculatedRule, values: StandardTransaction): string {
  const get = (key: string) => values[key] ?? "";
  switch (rule.type) {
    case "copy":
      return get(rule.from);
    case "concat":
      return rule.from.map(get).filter((v) => v !== "").join(rule.separator);
    case "starts_with":
      return norm(get(rule.from)).startsWith(norm(rule.prefix)) ? rule.yes : rule.no;
    case "value_map": {
      const lookup = new Map(Object.entries(rule.map).map(([k, v]) => [norm(k), v]));
      return lookup.get(norm(get(rule.from))) ?? rule.otherwise;
    }
  }
}

/**
 * Rule: after the mapping, replace raw values with master values (matching ignores case and
 * spaces), then add the custom fields in order. A manual field starts at its default. A calculated
 * field uses its rule, or its default when the rule gives a blank. A later calculated field may use
 * an earlier custom field.
 */
export function applySetupToTransaction(tx: StandardTransaction, setup: Setup): StandardTransaction {
  const result: StandardTransaction = { ...tx };

  for (const [field, map] of Object.entries(setup.valueMaps)) {
    const lookup = new Map(Object.entries(map).map(([k, v]) => [norm(k), v]));
    const current = result[field] ?? "";
    const master = current === "" ? undefined : lookup.get(norm(current));
    if (master !== undefined) result[field] = master;
  }

  for (const custom of setup.customFields) {
    const value = custom.kind === "calculated" && custom.rule ? computeRule(custom.rule, result) : "";
    result[custom.key] = value !== "" ? value : custom.defaultValue;
  }
  return result;
}

/**
 * Rule: list the values in the 8 classification fields that are neither a master value nor mapped to
 * one yet. The mapping page shows these for staff to drag onto a master value. A value that already
 * equals a master value counts as mapped.
 */
export function findUnmappedValues(transactions: StandardTransaction[], setup: Setup): UnmappedValue[] {
  const out: UnmappedValue[] = [];
  for (const field of CLASSIFICATION_KEYS) {
    const map = setup.valueMaps[field] ?? {};
    const known = new Set([...Object.keys(map), ...Object.values(map), ...(setup.masterValues[field] ?? [])].map(norm));
    const counts = new Map<string, number>();
    for (const t of transactions) {
      const v = (t[field] ?? "").trim();
      if (v !== "" && !known.has(norm(v))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const [value, count] of counts) out.push({ field, value, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** Saving: turn a setup into text. */
export function saveSetup(setup: Setup): string {
  return JSON.stringify(setup, null, 2);
}

/**
 * Loading: read text back into a setup and check it. Rule: a setup with problems is not returned
 * (setup is null) and the problems say what to fix, so a damaged setup never quietly changes how a
 * source is read.
 */
export function loadSetup(text: string): { setup: Setup | null; problems: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { setup: null, problems: ["The setup is not valid JSON"] };
  }
  const s = data as Partial<Setup>;
  const problems: string[] = [];
  const isObject = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);

  if (s.version !== 2) problems.push("Unknown setup version");
  if (typeof s.sourceName !== "string" || s.sourceName.trim() === "") problems.push("The setup has no source name");
  if (!isObject(s.mapping)) problems.push("The setup has no mapping");
  if (!Array.isArray(s.customFields)) problems.push("The setup has no list of custom fields");
  if (!isObject(s.valueMaps)) problems.push("The setup has no value maps");
  if (!isObject(s.masterValues)) problems.push("The setup has no master values");
  if (!isObject(s.labels)) problems.push("The setup has no labels");
  if (!isObject(s.lookups)) problems.push("The setup has no lookup lists");
  if (!Array.isArray(s.requiredFields)) problems.push("The setup has no list of required fields");
  if (!LAYOUTS.includes(s.layout as LinesLayout)) problems.push("The setup has an unknown lines layout");
  if (s.presetId !== null && getPreset(s.presetId) === null) problems.push("The setup uses a source preset that is not known");
  if (typeof s.feedbackItemsOnly !== "boolean") problems.push("The setup does not say whether it holds feedback items only");
  if (problems.length > 0) return { setup: null, problems };

  const setup = s as Setup;
  const known = new Set(FIELD_KEYS);

  // Section: custom fields (checked in order, because a rule may use an earlier field).
  const customKeys = new Set<string>();
  for (const c of setup.customFields) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(c.key ?? "")) problems.push(`Custom field key "${c.key}" is not allowed`);
    else if (FIELD_KEYS.has(c.key)) problems.push(`Custom field "${c.key}" clashes with a standard field`);
    else if (customKeys.has(c.key)) problems.push(`Custom field "${c.key}" is listed twice`);
    if (c.kind !== "manual" && c.kind !== "calculated") problems.push(`Custom field "${c.key}" has an unknown kind`);
    if (c.kind === "calculated" && !c.rule) problems.push(`Calculated field "${c.key}" has no rule`);
    if (c.kind === "manual" && c.rule) problems.push(`Manual field "${c.key}" must not have a rule`);
    if (c.rule) {
      const inputs = c.rule.type === "concat" ? c.rule.from : [c.rule.from];
      for (const input of inputs) {
        if (!known.has(input)) problems.push(`Field "${c.key}" uses "${input}", which is not a standard field or an earlier custom field`);
      }
    }
    customKeys.add(c.key);
    known.add(c.key);
  }

  // Section: mapping targets, required fields and labels are standard fields only.
  for (const [column, action] of Object.entries(setup.mapping)) {
    if (action.action === "field" && !FIELD_KEYS.has(action.field)) {
      problems.push(`Column "${column}" is mapped to "${action.field}", which is not a standard field`);
    } else if (!["field", "drop", "unmapped"].includes(action.action)) {
      problems.push(`Column "${column}" has an unknown action`);
    }
  }
  for (const key of setup.requiredFields) if (!FIELD_KEYS.has(key)) problems.push(`Required field "${key}" is not a standard field`);
  for (const [key, label] of Object.entries(setup.labels)) {
    if (!FIELD_KEYS.has(key)) problems.push(`A label is set for "${key}", which is not a standard field`);
    else if (typeof label !== "string") problems.push(`The label for "${key}" must be text`);
  }

  // Section: value maps and master values belong to known fields.
  for (const field of Object.keys(setup.valueMaps)) {
    if (!known.has(field)) problems.push(`Value map is for "${field}", which is not a known field`);
  }
  for (const [field, list] of Object.entries(setup.masterValues)) {
    if (!known.has(field)) problems.push(`Master values are for "${field}", which is not a known field`);
    else if (!Array.isArray(list) || list.some((v) => typeof v !== "string")) problems.push(`Master values for "${field}" must be a list of text`);
  }

  // Section: lookup lists must be two lists of text.
  for (const key of ["funds", "outcomes"] as const) {
    const list = setup.lookups[key];
    if (!isObject(list) || Object.values(list).some((v) => typeof v !== "string")) problems.push(`The lookup list "${key}" is not valid`);
  }

  return problems.length > 0 ? { setup: null, problems } : { setup, problems: [] };
}
