/**
 * outcome-types.ts
 *
 * What it does: outcome types as configuration (DECISIONS 101, 103). An outcome is the specific thing a gift becomes: an orphan, a water pump, a house, a set of
 * animals, furniture, an activity. Each type has its own profile fields and says how a gift gets its outcome: it picks an existing one (sponsorships) or
 * it creates a new draft one (pumps and the rest). A type is linked to the frameworks that use it.
 * Who calls it: the Outcomes endpoint (modules/00-platform/handlers.ts), the demo (app/main.ts) and the Categories and frameworks page.
 * Depends on: nothing. Pure functions: no database, no screen.
 *
 * Rules:
 * - Adding a type needs no code. A type is its name, its source rule, its frameworks and its profile fields.
 * - A framework belongs to at most one type, so a gift's framework always says which type its outcome is.
 * - A field has a kind (text, number, date, GPS, photo, video, choice), may be required, and may go in the donor report.
 * - Required fields are the minimum before a partner takes the outcome. Outcomes may be created and receive gifts with an incomplete profile.
 * - A type that outcomes already use cannot be removed.
 */

import { cleanPrefix, defaultPrefix, validPrefix } from "./refs.js";

export type FieldKind = "text" | "longtext" | "number" | "date" | "gps" | "photo" | "video" | "choice";
export const FIELD_KINDS: { id: FieldKind; label: string }[] = [
  { id: "text", label: "Short text" }, { id: "longtext", label: "Long text" }, { id: "number", label: "Number" }, { id: "date", label: "Date" },
  { id: "gps", label: "GPS location" }, { id: "photo", label: "Photo" }, { id: "video", label: "Video" }, { id: "choice", label: "Choice from a list" },
];

export interface ProfileField {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean; // needed before a partner takes the outcome
  inReport: boolean; // goes in the donor report
  options?: string[]; // for a choice
}

// pick_existing: the gift is matched to an outcome that already exists (an orphan). create_new: the gift creates its own draft outcome (a pump).
export type OutcomeSource = "pick_existing" | "create_new";
// auto: outcomes of this type are assigned to a partner by themselves when it has capacity. suggest: they are only suggested to a person (DECISIONS 101).
export type AssignMode = "auto" | "suggest";

export interface OutcomeType {
  id: string;
  name: string; // singular, in the organisation's words: Orphan, Water pump
  icon?: string; // the icon id its outcomes show by default (DECISIONS 107)
  prefix?: string; // the start of the IDs of its outcomes (ORP for ORP-0007). Changing it changes new IDs only (DECISIONS 105)
  source: OutcomeSource;
  assign: AssignMode;
  frameworkIds: string[];
  fields: ProfileField[];
}

const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const uniqueId = (base: string, taken: string[]): string => {
  const root = slug(base) || "item";
  let id = root;
  for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`;
  return id;
};
const field = (label: string, kind: FieldKind, required = false, inReport = false, options?: string[]): Omit<ProfileField, "id"> => ({ label, kind, required, inReport, ...(options ? { options } : {}) });

// The two types to start with (DECISIONS 103). Staff add the rest.
export function starterOutcomeTypes(): OutcomeType[] {
  const make = (id: string, name: string, source: OutcomeSource, assign: AssignMode, fields: Omit<ProfileField, "id">[]): OutcomeType => ({
    id, name, prefix: id === "orphan" ? "ORP" : "PMP", icon: id === "orphan" ? "orphan" : "pump", source, assign, frameworkIds: [],
    fields: fields.reduce<ProfileField[]>((all, f) => [...all, { ...f, id: uniqueId(f.label, all.map((x) => x.id)) }], []),
  });
  return [
    make("orphan", "Orphan", "pick_existing", "auto", [field("Full name", "text", true, true), field("Date of birth", "date", true, true), field("Gender", "choice", false, false, ["Girl", "Boy"]), field("School, institute or work", "text", false, true), field("Photo", "photo", false, true), field("Notes", "longtext", false, false)]),
    make("water-pump", "Water pump", "create_new", "suggest", [field("Location", "text", true, true), field("GPS location", "gps", false, true), field("Beneficiary name", "text", false, true), field("People served", "number", false, true), field("Depth in metres", "number", false, false), field("Photos", "photo", false, true), field("Video", "video", false, true), field("Notes", "longtext", false, false)]),
  ];
}

export const typeById = (types: OutcomeType[], id: string): OutcomeType | undefined => types.find((t) => t.id === id);

// Rule: the type a framework belongs to, if any. A gift's framework says its outcome type.
export const typeForFramework = (types: OutcomeType[], frameworkId: string): OutcomeType | undefined => types.find((t) => t.frameworkIds.includes(frameworkId));

type Result = { types: OutcomeType[] } | { error: string };
const edit = (types: OutcomeType[], id: string, change: (t: OutcomeType) => OutcomeType | string): Result => {
  const t = typeById(types, id);
  if (!t) return { error: "That outcome type was not found." };
  const next = change(t);
  return typeof next === "string" ? { error: next } : { types: types.map((x) => (x.id === id ? next : x)) };
};

export function addOutcomeType(types: OutcomeType[], name: string): Result {
  const n = name.trim();
  if (n.length < 2) return { error: "Give the outcome type a name." };
  if (types.some((t) => t.name.toLowerCase() === n.toLowerCase())) return { error: "There is already an outcome type with that name." };
  return { types: [...types, { id: uniqueId(n, types.map((t) => t.id)), name: n.slice(0, 60), prefix: defaultPrefix(n, types.map((t) => t.prefix ?? "")), source: "create_new", assign: "suggest", frameworkIds: [], fields: [] }] };
}

// Rule: a type that outcomes already use cannot be removed. `usedIds` are the type ids those outcomes carry.
export function removeOutcomeType(types: OutcomeType[], id: string, usedIds: string[]): Result {
  if (usedIds.includes(id)) return { error: "Outcomes already use this type, so it cannot be removed." };
  return types.some((t) => t.id === id) ? { types: types.filter((t) => t.id !== id) } : { error: "That outcome type was not found." };
}

export const renameOutcomeType = (types: OutcomeType[], id: string, name: string): Result =>
  name.trim().length < 2 ? { error: "Give the outcome type a name." } : types.some((t) => t.id !== id && t.name.toLowerCase() === name.trim().toLowerCase()) ? { error: "There is already an outcome type with that name." } : edit(types, id, (t) => ({ ...t, name: name.trim().slice(0, 60) }));

// Rule (DECISIONS 105): a prefix is 2 to 5 capital letters or digits, and no two types share one. It changes new IDs only.
export function setPrefix(types: OutcomeType[], id: string, prefix: string): Result {
  const p = cleanPrefix(prefix);
  if (!validPrefix(p)) return { error: "A prefix is 2 to 5 letters or digits, for example ORP." };
  if (types.some((t) => t.id !== id && t.prefix === p)) return { error: `Another outcome type already uses ${p}.` };
  return edit(types, id, (t) => ({ ...t, prefix: p }));
}

export const setIcon = (types: OutcomeType[], id: string, icon: string): Result => edit(types, id, (t) => { const { icon: _old, ...rest } = t; return icon === "" ? rest : { ...rest, icon: icon.slice(0, 20) }; });

export const setSource = (types: OutcomeType[], id: string, source: OutcomeSource): Result =>
  source !== "pick_existing" && source !== "create_new" ? { error: "That source rule is not known." } : edit(types, id, (t) => ({ ...t, source }));

export const setAssignMode = (types: OutcomeType[], id: string, assign: AssignMode): Result =>
  assign !== "auto" && assign !== "suggest" ? { error: "That assignment mode is not known." } : edit(types, id, (t) => ({ ...t, assign }));

// Rule: a framework belongs to at most one type, so ticking it here takes it from any other type. `known` are the frameworks that exist.
export function setTypeFramework(types: OutcomeType[], id: string, frameworkId: string, on: boolean, known: string[]): Result {
  if (!known.includes(frameworkId)) return { error: "That framework was not found." };
  const r = edit(types, id, (t) => t);
  if ("error" in r) return r;
  return { types: types.map((t) => ({ ...t, frameworkIds: t.id === id ? (on ? [...new Set([...t.frameworkIds, frameworkId])] : t.frameworkIds.filter((f) => f !== frameworkId)) : t.frameworkIds.filter((f) => f !== frameworkId) })) };
}

export function addField(types: OutcomeType[], id: string, label: string, kind: FieldKind): Result {
  const l = label.trim();
  if (l.length < 1) return { error: "Give the field a label." };
  if (!FIELD_KINDS.some((k) => k.id === kind)) return { error: "That field kind is not known." };
  return edit(types, id, (t) => (t.fields.some((f) => f.label.toLowerCase() === l.toLowerCase()) ? "This type already has a field with that label." : { ...t, fields: [...t.fields, { id: uniqueId(l, t.fields.map((f) => f.id)), label: l.slice(0, 60), kind, required: false, inReport: false, ...(kind === "choice" ? { options: [] } : {}) }] }));
}

export const updateField = (types: OutcomeType[], id: string, fieldId: string, change: Partial<Pick<ProfileField, "required" | "inReport" | "label" | "kind">> & { options?: string[] }): Result =>
  edit(types, id, (t) => {
    if (!t.fields.some((f) => f.id === fieldId)) return "That field was not found.";
    if (change.label !== undefined && change.label.trim().length < 1) return "Give the field a label.";
    if (change.kind !== undefined && !FIELD_KINDS.some((k) => k.id === change.kind)) return "That field kind is not known.";
    return { ...t, fields: t.fields.map((f) => (f.id === fieldId ? { ...f, ...(change.required !== undefined ? { required: change.required } : {}), ...(change.inReport !== undefined ? { inReport: change.inReport } : {}), ...(change.label !== undefined ? { label: change.label.trim().slice(0, 60) } : {}), ...(change.kind !== undefined ? { kind: change.kind } : {}), ...(change.options !== undefined ? { options: change.options.map((o) => o.trim()).filter(Boolean) } : {}) } : f)) };
  });

export const moveField = (types: OutcomeType[], id: string, fieldId: string, by: -1 | 1): Result =>
  edit(types, id, (t) => {
    const i = t.fields.findIndex((f) => f.id === fieldId);
    const j = i + by;
    if (i < 0) return "That field was not found.";
    if (j < 0 || j >= t.fields.length) return t;
    const fields = [...t.fields];
    [fields[i], fields[j]] = [fields[j] as ProfileField, fields[i] as ProfileField];
    return { ...t, fields };
  });

export const removeField = (types: OutcomeType[], id: string, fieldId: string): Result => edit(types, id, (t) => ({ ...t, fields: t.fields.filter((f) => f.id !== fieldId) }));

/**
 * Rule: how complete an outcome's profile is. `profile` maps field id to a value. A field counts as filled when it has any text. `ready` is true when
 * every required field is filled, which is the minimum before a partner takes the outcome.
 */
export function completeness(type: OutcomeType, profile: Record<string, string>): { filled: number; total: number; missingRequired: string[]; ready: boolean } {
  const filled = type.fields.filter((f) => (profile[f.id] ?? "").trim() !== "").length;
  const missingRequired = type.fields.filter((f) => f.required && (profile[f.id] ?? "").trim() === "").map((f) => f.label);
  return { filled, total: type.fields.length, missingRequired, ready: missingRequired.length === 0 };
}

/**
 * The requests the page and the demo make on outcome types, applied by one pure function so the server and the demo behave the same.
 * Returns null for a request that is not an outcome type request, so the caller can try another handler.
 */
export function applyOutcomeTypeAction(types: OutcomeType[], knownFrameworks: string[], usedTypeIds: string[], body: Record<string, unknown>): Result | null {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "ot-add": return addOutcomeType(types, s("name"));
    case "ot-rename": return renameOutcomeType(types, s("typeId"), s("name"));
    case "ot-remove": return removeOutcomeType(types, s("typeId"), usedTypeIds);
    case "ot-prefix": return setPrefix(types, s("typeId"), s("prefix"));
    case "ot-icon": return setIcon(types, s("typeId"), s("icon"));
    case "ot-source": return setSource(types, s("typeId"), s("source") as OutcomeSource);
    case "ot-assign": return setAssignMode(types, s("typeId"), s("assign") as AssignMode);
    case "ot-framework": return setTypeFramework(types, s("typeId"), s("frameworkId"), body["on"] === true, knownFrameworks);
    case "ot-field-add": return addField(types, s("typeId"), s("label"), s("kind") as FieldKind);
    case "ot-field-set": return updateField(types, s("typeId"), s("fieldId"), { ...(typeof body["required"] === "boolean" ? { required: body["required"] } : {}), ...(typeof body["inReport"] === "boolean" ? { inReport: body["inReport"] } : {}), ...(typeof body["label"] === "string" ? { label: body["label"] } : {}), ...(typeof body["kind"] === "string" ? { kind: body["kind"] as FieldKind } : {}), ...(typeof body["options"] === "string" ? { options: (body["options"] as string).split(",") } : {}) });
    case "ot-field-move": return moveField(types, s("typeId"), s("fieldId"), Number(body["by"]) < 0 ? -1 : 1);
    case "ot-field-remove": return removeField(types, s("typeId"), s("fieldId"));
    default: return null;
  }
}
