/**
 * kind-features.ts
 *
 * What it does: the features of each kind of benefit (DECISIONS 146). The six kinds (Person(s), Activity, Build, Distribution, Programme, Waqf) are fixed and always present (benefits.ts).
 * Each has features that are managed here: a description, a few properties (needs a location, holds sensitive data, eligibility check, on behalf of, who receives) and the profile
 * fields a beneficiary of that kind holds (each with a type, whether it is needed first, and whether it goes in the donor report). Each kind starts with sensible defaults, and only a
 * kind a person has changed is saved. This module holds the defaults and the changes, as pure functions.
 * Who calls it: the Benefits page (app/benefits-page.ts), the demo (app/main.ts) and the server (modules/00-platform/handlers.ts). Depends on: benefits.ts and outcome-types.ts (the list of field types only). Pure.
 *
 * Rules:
 * - Features belong to the kind, never to the item or to a workflow. An item is only a tag that points at a kind.
 * - A kind's features are the saved ones if a person changed them, else the defaults. Resetting a kind drops its saved changes.
 * - A field has a type (text, number, date, GPS, photo and so on), may be needed first, and may go in the donor report.
 */

import { FIELD_KINDS, type FieldKind } from "../05-outcomes/outcome-types.js";
import { KINDS, type BenefitKind } from "./benefits.js";

export type Receiver = "" | "person" | "group" | "institution";
export interface KindProps { location: boolean; sensitive: boolean; eligibility: boolean; onBehalf: boolean; receiver: Receiver }
export interface KindField { id: string; label: string; type: FieldKind; required: boolean; inReport: boolean; options?: string[] }
export interface KindFeatures { what: string; props: KindProps; fields: KindField[] }

export const PROP_LABELS: { id: Exclude<keyof KindProps, "receiver">; label: string; hint: string }[] = [
  { id: "location", label: "Needs a location", hint: "A place and GPS are part of the proof" },
  { id: "sensitive", label: "Holds sensitive data", hint: "Role-based access, and donor contacts are never shown to a partner" },
  { id: "eligibility", label: "Eligibility check", hint: "For example Zakat: the recipient must be eligible" },
  { id: "onBehalf", label: "On behalf of", hint: "Done in the name of someone, with a tribute or a certificate" },
];
export const RECEIVERS: { id: Receiver; label: string }[] = [{ id: "", label: "Not set" }, { id: "person", label: "A person or a list of people" }, { id: "group", label: "A group or household" }, { id: "institution", label: "An institution" }];

const slug = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "field";
const uniqueId = (base: string, taken: string[]): string => { const root = slug(base); let id = root; for (let n = 2; taken.includes(id); n++) id = `${root}-${n}`; return id; };
const f = (label: string, type: FieldKind, required = false, inReport = false): Omit<KindField, "id"> => ({ label, type, required, inReport });
const withIds = (fields: Omit<KindField, "id">[]): KindField[] => fields.reduce<KindField[]>((all, x) => [...all, { ...x, id: uniqueId(x.label, all.map((y) => y.id)) }], []);
const props = (over: Partial<KindProps>): KindProps => ({ location: false, sensitive: false, eligibility: false, onBehalf: false, receiver: "", ...over });

// The starting features of each kind. Staff change them on the Benefits page.
const DEFAULTS: Record<BenefitKind, { props: KindProps; fields: Omit<KindField, "id">[] }> = {
  person: { props: props({ sensitive: true, receiver: "person" }), fields: [f("Full name", "text", true, true), f("Date of birth", "date", true, true), f("Guardian or family", "text"), f("Photo", "photo", false, true), f("Progress notes", "longtext", false, true)] },
  activity: { props: props({ location: true, receiver: "group" }), fields: [f("Place", "text", true, true), f("Date", "date", true, true), f("People attending", "number", false, true), f("Photos", "photo", false, true), f("Report", "longtext", false, true)] },
  build: { props: props({ location: true, receiver: "group" }), fields: [f("Location", "text", true, true), f("GPS location", "gps", false, true), f("People served", "number", false, true), f("Progress photos", "photo", false, true), f("Handover date", "date", false, true)] },
  distribution: { props: props({ receiver: "group" }), fields: [f("Place", "text", true, true), f("Date", "date", true, true), f("Quantity delivered", "number", true, true), f("Recipients", "number", false, true), f("Photos", "photo", false, true)] },
  programme: { props: props({ receiver: "group" }), fields: [f("Place", "text", true, true), f("People served this month", "number", true, true), f("Notes", "longtext", false, true)] },
  waqf: { props: props({ location: true, receiver: "institution" }), fields: [f("Asset", "text", true, true), f("Location", "text", false, true)] },
};

export function defaultFeatures(kind: BenefitKind): KindFeatures {
  const d = DEFAULTS[kind];
  const info = KINDS.find((k) => k.id === kind);
  const what = info ? `${info.what}. Counted by: ${info.counted.toLowerCase()}. Proof: ${info.proof.toLowerCase()}. Examples: ${info.examples.toLowerCase()}.` : "";
  return { what, props: { ...d.props }, fields: withIds(d.fields) };
}

// Rule: a kind's features are the saved ones if a person changed them, else the defaults.
export type SavedFeatures = Record<string, KindFeatures>;
export const featuresOf = (saved: SavedFeatures, kind: BenefitKind): KindFeatures => saved[kind] ?? defaultFeatures(kind);
export const isCustomised = (saved: SavedFeatures, kind: string): boolean => saved[kind] !== undefined;

type Result = { value: SavedFeatures } | { error: string };
const isKindId = (x: string): x is BenefitKind => KINDS.some((k) => k.id === x);
const change = (saved: SavedFeatures, kind: string, edit: (cur: KindFeatures) => KindFeatures | string): Result => {
  if (!isKindId(kind)) return { error: "That kind was not found." };
  const next = edit(featuresOf(saved, kind));
  return typeof next === "string" ? { error: next } : { value: { ...saved, [kind]: next } };
};

export const setWhat = (saved: SavedFeatures, kind: string, what: string): Result => change(saved, kind, (c) => ({ ...c, what: what.slice(0, 500) }));

// Rule: a property is a yes or no, or who receives. An unknown property or value is refused.
export function setProp(saved: SavedFeatures, kind: string, prop: string, value: unknown): Result {
  if (prop === "receiver") return RECEIVERS.some((r) => r.id === value) ? change(saved, kind, (c) => ({ ...c, props: { ...c.props, receiver: value as Receiver } })) : { error: "That is not known." };
  if (!PROP_LABELS.some((p) => p.id === prop) || typeof value !== "boolean") return { error: "That property is not known." };
  return change(saved, kind, (c) => ({ ...c, props: { ...c.props, [prop]: value } }));
}

export function addField(saved: SavedFeatures, kind: string, label: string, type: string): Result {
  const l = label.trim();
  if (l.length < 2) return { error: "Give the field a name." };
  if (!FIELD_KINDS.some((k) => k.id === type)) return { error: "That field type is not known." };
  return change(saved, kind, (c) => c.fields.length >= 40 ? "A kind has at most 40 fields." : { ...c, fields: [...c.fields, { id: uniqueId(l, c.fields.map((x) => x.id)), label: l.slice(0, 60), type: type as FieldKind, required: false, inReport: false }] });
}

export const setField = (saved: SavedFeatures, kind: string, fieldId: string, patch: { label?: string; type?: string; required?: boolean; inReport?: boolean; options?: string }): Result =>
  change(saved, kind, (c) => {
    if (!c.fields.some((x) => x.id === fieldId)) return "That field was not found.";
    if (patch.label !== undefined && patch.label.trim().length < 2) return "Give the field a name.";
    if (patch.type !== undefined && !FIELD_KINDS.some((k) => k.id === patch.type)) return "That field type is not known.";
    return { ...c, fields: c.fields.map((x) => x.id !== fieldId ? x : { ...x, ...(patch.label !== undefined ? { label: patch.label.trim().slice(0, 60) } : {}), ...(patch.type !== undefined ? { type: patch.type as FieldKind } : {}), ...(patch.required !== undefined ? { required: patch.required } : {}), ...(patch.inReport !== undefined ? { inReport: patch.inReport } : {}), ...(patch.options !== undefined ? { options: patch.options.split(",").map((o) => o.trim()).filter((o) => o !== "").slice(0, 30) } : {}) }) };
  });

export const moveField = (saved: SavedFeatures, kind: string, fieldId: string, by: -1 | 1): Result =>
  change(saved, kind, (c) => {
    const list = [...c.fields];
    const i = list.findIndex((x) => x.id === fieldId);
    if (i < 0) return "That field was not found.";
    const j = i + by;
    if (j < 0 || j >= list.length) return c;
    [list[i], list[j]] = [list[j] as KindField, list[i] as KindField];
    return { ...c, fields: list };
  });

export const removeField = (saved: SavedFeatures, kind: string, fieldId: string): Result => change(saved, kind, (c) => ({ ...c, fields: c.fields.filter((x) => x.id !== fieldId) }));

// Rule: resetting a kind drops what a person changed, so its defaults show again.
export function resetKind(saved: SavedFeatures, kind: string): Result {
  if (!isKindId(kind)) return { error: "That kind was not found." };
  const { [kind]: _gone, ...rest } = saved;
  return { value: rest };
}

/**
 * The requests the page makes on kind features, applied by one pure function so the server and the demo behave the same. Returns null for a request that is not about kind features.
 */
export function applyKindAction(saved: SavedFeatures, body: Record<string, unknown>): Result | null {
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  switch (body["action"]) {
    case "kf-what": return setWhat(saved, s("kind"), s("what"));
    case "kf-prop": return setProp(saved, s("kind"), s("prop"), s("prop") === "receiver" ? s("value") : body["value"]);
    case "kf-field-add": return addField(saved, s("kind"), s("label"), s("type"));
    case "kf-field-set": return setField(saved, s("kind"), s("fieldId"), {
      ...(typeof body["label"] === "string" ? { label: s("label") } : {}), ...(typeof body["type"] === "string" ? { type: s("type") } : {}),
      ...(typeof body["required"] === "boolean" ? { required: body["required"] } : {}), ...(typeof body["inReport"] === "boolean" ? { inReport: body["inReport"] } : {}), ...(typeof body["options"] === "string" ? { options: s("options") } : {}) });
    case "kf-field-move": return moveField(saved, s("kind"), s("fieldId"), Number(body["by"]) < 0 ? -1 : 1);
    case "kf-field-remove": return removeField(saved, s("kind"), s("fieldId"));
    case "kf-reset": return resetKind(saved, s("kind"));
    default: return null;
  }
}
