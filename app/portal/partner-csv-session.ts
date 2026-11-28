/**
 * partner-csv-session.ts
 *
 * What it does: what happens in the partner's CSV window (DECISIONS 271, 272): opening and closing it, downloading the template, reading the chosen file in the browser (it is never uploaded as a file: only the rows that passed the check are sent), editing a cell of a row (the row is checked again on its own), removing rows, keeping the chosen project and the same-person box, and sending the rows. After a send the added rows leave the list and the refused ones stay with the server's reason, to be fixed, removed or sent again.
 * Who calls it: app/portal/partner-session.ts (for the buttons) and app/main.ts (for the file, project and tick, which are changes, not clicks). Depends on: partner-state.ts, partner-csv.ts, api.ts and the reading rule (modules/13-partner-portal/import.ts).
 * Data flow: the file is read as text, turned into rows by readBeneficiaryCsv, shown as a preview, and only the good rows go to the server (action ben-add-many), which checks every one again with the one-by-one rule.
 */

import { partnerAnswer } from "../shared/api";
import { NEW_CSV } from "./partner-csv";
import { partnerUi } from "./partner-state";
import { checkRows, problemRowsCsv, readBeneficiaryCsv, templateCsv } from "../../modules/13-partner-portal/import";
import type { PartnerSlice } from "../../modules/13-partner-portal/scope";

// --- Buttons ---
export async function csvAction(action: string, apply: (s: PartnerSlice) => void, el?: { dataset: Record<string, string | undefined> }, projects: { id: string; name: string }[] = []): Promise<void> {
  if (action === "pt-csv-open") partnerUi.csv = { ...NEW_CSV };
  else if (action === "pt-csv-close") partnerUi.csv = null;
  else if (action === "pt-csv-template") download(templateCsv(), "beneficiaries-template.csv");
  else if (action === "pt-csv-download-bad" && partnerUi.csv?.read) download(problemRowsCsv(partnerUi.csv.read.rows), "beneficiaries-to-fix.csv");
  else if (action === "pt-csv-send") await send(apply, projects);
  else if (action === "pt-csv-remove" && partnerUi.csv?.read) partnerUi.csv.read = { ...partnerUi.csv.read, rows: partnerUi.csv.read.rows.filter((r) => String(r.line) !== el?.dataset["line"]) };
  else if (action === "pt-csv-remove-bad" && partnerUi.csv?.read) partnerUi.csv.read = { ...partnerUi.csv.read, rows: partnerUi.csv.read.rows.filter((r) => r.error === "" && !r.serverError) };
}

// A file made here and offered for download. The template is made here so it always matches what the reader understands.
function download(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- A file, a project or the tick was changed ---
export async function csvChange(target: { id: string; value?: string; checked?: boolean; files?: FileList | null }, projects: { id: string; name: string }[]): Promise<boolean> {
  const csv = partnerUi.csv;
  if (!csv) return false;
  if (target.id === "pc-project") csv.projectId = target.value ?? "";
  else if (target.id === "pc-similar") csv.allowSimilar = target.checked === true;
  else if (target.id === "pc-file") {
    const file = target.files?.[0];
    if (!file) return false;
    csv.error = "";
    if (file.size > 2_000_000) csv.read = { rows: [], problem: "That file is too big. A list of 500 beneficiaries is far smaller than 2 MB." };
    else { csv.fileName = file.name; csv.read = readBeneficiaryCsv(await file.text(), projects); }
    csv.fresh = false;
  } else {
    // A cell of a row, id pc-r<row>-<field>: the row is checked again on its own and its old server reason is dropped, then the file's repeats are looked for again (DECISIONS 272).
    const cellOf = /^pc-r(\d+)-(\w+)$/.exec(target.id);
    if (!cellOf || !csv.read) return false;
    const [, line, field] = cellOf;
    csv.read = { ...csv.read, rows: checkRows(csv.read.rows.map((r) => (String(r.line) === line ? { ...r, raw: { ...r.raw, [field as string]: target.value ?? "" }, serverError: undefined } : r)), projects) };
  }
  return true;
}

// --- Send the good rows ---
async function send(apply: (s: PartnerSlice) => void, projects: { id: string; name: string }[]): Promise<void> {
  const csv = partnerUi.csv;
  if (!csv || !csv.read || csv.busy) return;
  const rows = csv.read.rows.filter((r) => r.error === "").map((r) => ({ line: r.line, values: r.values }));
  csv.busy = true;
  csv.error = "";
  try {
    const { message, upload, ...slice } = (await partnerAnswer({ action: "ben-add-many", targetProjectId: csv.projectId, allowSimilar: csv.allowSimilar, rows })) as PartnerSlice & { message?: string; upload?: { added: number; addedLines: number[]; skipped: { line: number; name: string; error: string }[] } };
    apply(slice as PartnerSlice);
    // The rows that were added leave the list; the refused ones stay, each with the server's reason, so they can be fixed, removed or sent again (DECISIONS 272).
    const done = new Set(upload?.addedLines ?? []), why = new Map((upload?.skipped ?? []).map((x) => [x.line, x.error]));
    csv.read = { ...csv.read, rows: checkRows(csv.read.rows.filter((r) => !done.has(r.line)).map((r) => (why.has(r.line) ? { ...r, serverError: why.get(r.line) } : r)), projects) };
    csv.result = { message: message ?? "", added: upload?.added ?? 0 };
  } catch (e) {
    csv.error = e instanceof Error ? e.message : "Could not add them.";
  } finally {
    csv.busy = false;
  }
}
