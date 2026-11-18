/**
 * setup.ts
 *
 * What it does: a "setup" is everything staff decided for one data source: which column goes
 * to which standard field, any extra manual or calculated fields, and how raw values map to
 * master values (for example "Recurring Donation" to "Recurring"). This file defines the
 * setup, applies it to gifts, finds values still to be mapped, and saves and loads it as text.
 * Who calls it: the mapping screen (edit, save, load) and the import step (apply).
 * Depends on: csv.ts, mapping.ts, standard-fields.ts, issues.ts (pure functions, no database,
 * no screen). Saving here means turning a setup into text. Where the text is stored is for
 * the developers to decide.
 */

import type { RawRecord } from "./csv";
import type { CodeBook } from "./codebook";
import { runImport, type ImportResult, type Issue } from "./issues";
import { suggestMapping, type Mapping, type StandardGift } from "./mapping";
import { STANDARD_FIELDS } from "./standard-fields";

// Calculated fields use a small fixed set of rules instead of free code, so they can be
// ported to Salesforce and checked easily.
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

// Raw file value to master value, per field. Example: { frequency: { "Recurring Donation": "Recurring" } }
export type ValueMaps = Record<string, Record<string, string>>;

export interface Setup {
  version: 1;
  sourceName: string; // for example "UK Salesforce upload"
  mapping: Mapping;
  customFields: CustomField[];
  valueMaps: ValueMaps;
}

// A value in the data that still has no master value.
export interface UnmappedValue {
  field: string;
  value: string;
  count: number;
}

const norm = (s: string) => s.trim().toLowerCase();
const STANDARD_KEYS = new Set(STANDARD_FIELDS.map((f) => f.key));
const CLASSIFICATION_KEYS = STANDARD_FIELDS.filter((f) => f.group === "classification").map((f) => f.key);

/** A new setup for a source, starting from the suggested mapping. */
export function newSetup(sourceName: string, headers: string[]): Setup {
  return { version: 1, sourceName, mapping: suggestMapping(headers), customFields: [], valueMaps: {} };
}

/** Rule: work out one calculated value from the values already on the gift. */
export function computeRule(rule: CalculatedRule, values: StandardGift): string {
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
      const value = get(rule.from);
      return lookup.get(norm(value)) ?? rule.otherwise;
    }
  }
}

/**
 * Rule: after the mapping, replace raw values with master values (matching ignores case
 * and spaces), then add the custom fields in order. A manual field starts at its default.
 * A calculated field uses its rule, or its default when the rule gives a blank. A later
 * calculated field may use an earlier custom field.
 */
export function applySetupToGift(gift: StandardGift, setup: Setup): StandardGift {
  const result: StandardGift = { ...gift };

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
 * Rule: list the values in the 8 classification fields that are neither a master value
 * nor mapped to one yet. The mapping screen shows these for staff to drag onto a master
 * value. A value that already equals a master value counts as mapped.
 */
export function findUnmappedValues(gifts: StandardGift[], setup: Setup): UnmappedValue[] {
  const out: UnmappedValue[] = [];
  for (const field of CLASSIFICATION_KEYS) {
    const map = setup.valueMaps[field] ?? {};
    const known = new Set([...Object.keys(map), ...Object.values(map)].map(norm));
    const counts = new Map<string, number>();
    for (const g of gifts) {
      const v = (g[field] ?? "").trim();
      if (v !== "" && !known.has(norm(v))) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const [value, count] of counts) out.push({ field, value, count });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Runs the full import with a setup: mapping, lines, IDs, issues, then value maps and
 * custom fields. A required custom field that is blank is reported (code missing_required).
 */
export function runImportWithSetup(rawGifts: RawRecord[], setup: Setup, codeBook: CodeBook): ImportResult {
  const base = runImport(rawGifts, setup.mapping, codeBook);
  const gifts = base.gifts.map((g) => applySetupToGift(g, setup));
  const issues: Issue[] = [...base.issues];

  gifts.forEach((g, index) => {
    for (const c of setup.customFields) {
      if (c.required && (g[c.key] ?? "") === "") {
        issues.push({
          row: index + 2,
          giftReference: g["orderReference"] ?? "",
          code: "missing_required",
          message: `${c.label} is required and is blank`,
        });
      }
    }
  });
  return { gifts, lines: base.lines, issues };
}

/** Saving: turn a setup into text. */
export function saveSetup(setup: Setup): string {
  return JSON.stringify(setup, null, 2);
}

/**
 * Loading: read text back into a setup and check it. Rule: a setup with problems is not
 * returned (setup is null) and the problems say what to fix, so a damaged setup never
 * quietly changes how a file is read.
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

  if (s.version !== 1) problems.push("Unknown setup version");
  if (typeof s.sourceName !== "string" || s.sourceName.trim() === "") problems.push("The setup has no source name");
  if (typeof s.mapping !== "object" || s.mapping === null) problems.push("The setup has no mapping");
  if (!Array.isArray(s.customFields)) problems.push("The setup has no list of custom fields");
  if (typeof s.valueMaps !== "object" || s.valueMaps === null) problems.push("The setup has no value maps");
  if (problems.length > 0) return { setup: null, problems };

  const setup = s as Setup;
  const known = new Set(STANDARD_KEYS);

  // Section: custom fields (checked in order, because a rule may use an earlier field).
  const customKeys = new Set<string>();
  for (const c of setup.customFields) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(c.key ?? "")) problems.push(`Custom field key "${c.key}" is not allowed`);
    else if (STANDARD_KEYS.has(c.key)) problems.push(`Custom field "${c.key}" clashes with a standard field`);
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

  // Section: mapping targets are standard fields only.
  for (const [column, action] of Object.entries(setup.mapping)) {
    if (action.action === "field" && !STANDARD_KEYS.has(action.field)) {
      problems.push(`Column "${column}" is mapped to "${action.field}", which is not a standard field`);
    } else if (!["field", "drop", "unmapped"].includes(action.action)) {
      problems.push(`Column "${column}" has an unknown action`);
    }
  }

  // Section: value maps belong to known fields.
  for (const field of Object.keys(setup.valueMaps)) {
    if (!known.has(field)) problems.push(`Value map is for "${field}", which is not a known field`);
  }

  return problems.length > 0 ? { setup: null, problems } : { setup, problems: [] };
}
