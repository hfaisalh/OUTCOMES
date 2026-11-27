/**
 * import.ts
 *
 * What it does: lets a partner add many beneficiaries at once from a CSV file (DECISIONS 271). It has two halves: reading the file into rows with a problem noted for each (used in the browser to show a preview before anything is sent), and adding the rows one by one with the same rule as adding a single beneficiary (used by the server, which decides for itself and never trusts the preview).
 * Who calls it: app/partner-csv.ts (the preview) and the server (modules/00-platform/partner-handler.ts). Depends on: entry.ts (the one-by-one rule) and modules/01-data-mapping/csv.ts. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: the file's first row names the columns, in any order and spelling close to the template ("Date of birth", "DOB", "National ID"...). Name is required. A column it does not know is ignored.
 * - Rule: a date is written YYYY-MM-DD or DD/MM/YYYY (day first, as most spreadsheets of the partners write it) and becomes YYYY-MM-DD. Anything else is a problem on that row, never guessed.
 * - Rule: the project comes from the file's Project column (a project the partner delivers, by name) or, when a row has none, the one chosen for the whole upload.
 * - Rule: at most 500 rows an upload. A row that repeats another row of the same file (the same ID number, or the same name and date of birth) is a problem on its second line.
 * - Rule (DECISIONS 272): the rows can be edited, and each edited row is checked again on its own (checkRow), then the file's repeats are looked for again (checkRows). Rows the server refuses stay, with its reason, to be fixed, removed or sent again.
 * - Rule: every row is added with the one-by-one rule (entry.ts), in order, so a row that repeats an earlier one, or a record the partner already has, is refused with the reason; a row that fails does not stop the others. Another partner's records are never described (DECISIONS 271).
 */

import { parseCsv, toRecords } from "../01-data-mapping/csv.js";
import type { Register } from "../07-beneficiaries/beneficiaries.js";
import { partnerEntry } from "./entry.js";

// --- The template and its column names ---
export const MAX_ROWS = 500;
export const TEMPLATE_HEADER = ["Name", "Date of birth", "Gender", "National ID or B-form number", "Place of birth", "Father", "Mother", "Parent or guardian", "Guardian's relation", "Area", "Your reference", "Project"];
export const TEMPLATE_EXAMPLE = ["Amina Khan", "2016-04-02", "female", "B-0000", "Lahore", "living", "deceased", "Fatima Khan", "mother", "Chak 5", "A-001", ""]; // invented

const FIELD_OF: Record<string, string> = {
  name: "name", fullname: "name", beneficiary: "name", beneficiaryname: "name",
  dateofbirth: "dob", dob: "dob", birthdate: "dob", born: "dob",
  gender: "gender", sex: "gender",
  placeofbirth: "placeOfBirth", birthplace: "placeOfBirth",
  nationalid: "idNumber", idnumber: "idNumber", nationalidorbformnumber: "idNumber", bform: "idNumber", cnic: "idNumber", id: "idNumber",
  father: "fatherStatus", fatherstatus: "fatherStatus", mother: "motherStatus", motherstatus: "motherStatus",
  parentorguardian: "guardian", guardian: "guardian", parent: "guardian", guardiansrelation: "guardianRelation", guardianrelation: "guardianRelation", relation: "guardianRelation",
  area: "area", village: "area", district: "area",
  yourreference: "partnerRef", reference: "partnerRef", yourownreference: "partnerRef", ref: "partnerRef", partnerreference: "partnerRef",
  project: "project", meantforproject: "project",
};
const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// --- Reading the file ---
// A row of the file. `raw` is what is written in it (and what a person edits in the preview), `values` the same with dates, gender and the like made tidy, and `project` resolved. line is the row number, counting the header as row 1 and not counting blank rows. error is "" when the row looks fine. serverError is what the server said when it refused the row (DECISIONS 271).
export interface CsvRow { line: number; raw: Record<string, string>; values: Record<string, string>; error: string; serverError?: string }
export interface CsvRead { rows: CsvRow[]; problem: string } // problem is a fault of the whole file

const pad = (n: number): string => String(n).padStart(2, "0");
function isoDate(text: string): string | null {
  const t = text.trim();
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const [y, mo, d] = ymd ? [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] : dmy ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])] : [0, 0, 0];
  if (y === 0) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}
const GENDER: Record<string, string> = { female: "female", f: "female", woman: "female", girl: "female", male: "male", m: "male", man: "male", boy: "male" };
const PARENT: Record<string, string> = { living: "living", alive: "living", yes: "living", deceased: "deceased", dead: "deceased", died: "deceased", late: "deceased", passed: "deceased" };

// Checks ONE row on its own: tidies its values and says what is wrong, in words. Used when the file is read and again whenever a person edits a cell in the preview.
export function checkRow(raw: Record<string, string>, projects: { id: string; name: string }[]): { values: Record<string, string>; error: string } {
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) values[k] = v.trim();
  const fail = (error: string) => ({ values, error });
  if ((values["name"] ?? "").length < 2) return fail("Give a name.");
  if (values["dob"]) { const d = isoDate(values["dob"]); if (d === null) return fail("Write the date of birth as YYYY-MM-DD or DD/MM/YYYY."); values["dob"] = d; }
  if (values["gender"]) { const g = GENDER[values["gender"].toLowerCase()]; if (!g) return fail("Gender is female or male."); values["gender"] = g; }
  for (const [f, label] of [["fatherStatus", "Father"], ["motherStatus", "Mother"]] as const) if (values[f]) { const p = PARENT[values[f].toLowerCase()]; if (!p) return fail(`${label} is living or deceased.`); values[f] = p; }
  delete values["targetProjectId"];
  if (values["project"]) {
    const p = projects.find((x) => x.id === values["project"] || x.name.toLowerCase() === (values["project"] ?? "").toLowerCase());
    if (!p) return fail(`"${values["project"]}" is not a project you deliver.`);
    values["targetProjectId"] = p.id;
  }
  return { values, error: "" };
}

// Checks every row, in order: each on its own, then a row that repeats an earlier good row of the same file (the same ID number, or the same name and date of birth) is flagged on its second line. Rows keep what the server said until they are edited.
export function checkRows(rows: CsvRow[], projects: { id: string; name: string }[]): CsvRow[] {
  const seenId = new Map<string, number>(), seenNameDob = new Map<string, number>();
  return rows.map((row) => {
    const own = checkRow(row.raw, projects);
    if (own.error !== "") return { ...row, values: own.values, error: own.error };
    const id = (own.values["idNumber"] ?? "").replace(/\s+/g, "").toLowerCase();
    const nd = `${(own.values["name"] ?? "").toLowerCase().replace(/\s+/g, " ")}|${own.values["dob"] ?? ""}`;
    const sameId = id !== "" ? seenId.get(id) : undefined, sameNd = own.values["dob"] ? seenNameDob.get(nd) : undefined;
    if (id !== "" && sameId === undefined) seenId.set(id, row.line);
    if (own.values["dob"] && sameNd === undefined) seenNameDob.set(nd, row.line);
    return { ...row, values: own.values, error: sameId !== undefined || sameNd !== undefined ? `The same person as row ${sameId ?? sameNd}.` : "" };
  });
}

export function readBeneficiaryCsv(text: string, projects: { id: string; name: string }[]): CsvRead {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  if ((firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length) return { rows: [], problem: "This file is separated by semicolons. In your spreadsheet choose Save as CSV (comma delimited) and try again." };
  const { headers, records } = toRecords(parseCsv(text));
  const fields = headers.map((h) => FIELD_OF[key(h)] ?? "");
  if (!fields.includes("name")) return { rows: [], problem: "The first row must name the columns, and one must be Name. Download the template to see them." };
  const body = records.map((r, i) => ({ r, line: i + 2 })).filter(({ r }) => headers.some((h) => (r[h] ?? "").trim() !== ""));
  if (body.length === 0) return { rows: [], problem: "The file has no rows under the column names." };
  if (body.length > MAX_ROWS) return { rows: [], problem: `Upload at most ${MAX_ROWS} beneficiaries at a time. This file has ${body.length}.` };
  const rows = body.map(({ r, line }): CsvRow => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { const f = fields[i]; if (f && raw[f] === undefined) raw[f] = (r[h] ?? "").trim(); });
    return { line, raw, values: {}, error: "" };
  });
  return { rows: checkRows(rows, projects), problem: "" };
}

// --- The template, as CSV text ---
const cell = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const templateCsv = (): string => `${TEMPLATE_HEADER.map(cell).join(",")}\r\n${TEMPLATE_EXAMPLE.map(cell).join(",")}\r\n`;

// --- Adding the rows (the server) ---
export interface ManyResult { register: Register; added: { line: number; id: string; name: string }[]; skipped: { line: number; name: string; error: string }[] }

export function addMany(reg: Register, partnerId: string, projectIds: string[], rows: { line: number; values: Record<string, string> }[], defaultProject: string, allowSimilar: boolean, today: string): ManyResult {
  let register = reg;
  const added: ManyResult["added"] = [], skipped: ManyResult["skipped"] = [];
  for (const row of rows.slice(0, MAX_ROWS)) {
    const v = row.values;
    const r = partnerEntry(register, partnerId, projectIds, { ...v, action: "ben-add", targetProjectId: v["targetProjectId"] || defaultProject, allowSimilar }, today);
    if (!r || "error" in r) skipped.push({ line: row.line, name: v["name"] ?? "", error: r ? r.error : "That request is not open to a partner." });
    else { register = r.register; added.push({ line: row.line, id: r.id, name: v["name"] ?? "" }); }
  }
  return { register, added, skipped };
}
