/**
 * partner-csv.ts
 *
 * What it does: the pop-up window where a partner adds many beneficiaries from a CSV file (DECISIONS 271, 272): how it works in three short steps, the template, the file, and the rows as an EDITABLE list: each cell can be corrected, each row says in words what is wrong with it (from the check, or from the server when it refused the row), and a row can be removed. After Add, the rows that were added leave the list and the refused ones stay, with the reason, to be fixed, removed or sent again.
 * Who calls it: app/partner-beneficiaries.ts (the Upload CSV button) and app/partner-outcomes.ts (the state type). Depends on: the CSV reading rule (modules/13-partner-portal/import.ts) and the shared escaping. Pure: it takes the state and returns HTML. The clicks and edits are handled in app/partner-csv-session.ts.
 * UX: a modal dialog like the other windows; every cell has a label for a screen reader (the column and the row); the problem of each row is words as well as colour; nothing is sent until Add; rows with a problem are never sent; the refused ones are kept, not lost; Cancel and Close are always there.
 */

import type { CsvRead, CsvRow } from "../modules/13-partner-portal/import";
import { esc, plural } from "./partner-outcomes";

export interface CsvState {
  fileName: string;
  read: CsvRead | null; // null until a file is chosen. Its rows are edited in place.
  projectId: string; // the project for rows with no project of their own
  allowSimilar: boolean;
  busy: boolean;
  error: string;
  result: { message: string; added: number } | null; // what the last Add did
  fresh?: boolean; // just opened, so the window eases in (and not again on a redraw)
}
export const NEW_CSV: CsvState = { fileName: "", read: null, projectId: "", allowSimilar: false, busy: false, error: "", result: null, fresh: true };
const SHOWN = 200; // rows drawn in the preview; all are still sent

const problemOf = (r: CsvRow): string => r.error || r.serverError || "";

export function csvWindowHtml(s: CsvState, projects: { id: string; name: string }[]): string {
  const rows = s.read?.rows ?? [];
  const sendable = rows.filter((r) => r.error === "");
  const bad = rows.filter((r) => problemOf(r) !== "").length;
  const needProject = sendable.some((r) => !r.values["targetProjectId"]);
  const canSend = sendable.length > 0 && (!needProject || s.projectId !== "") && !s.busy;
  const onlyOne = projects.length === 1 ? projects[0]?.id ?? "" : "";
  const chosen = s.projectId || onlyOne;
  const projectName = (id: string): string => projects.find((p) => p.id === id)?.name ?? "";

  const steps = `<ol class="pc-steps"><li><b>Download the template</b> and fill it in, one beneficiary on each row. Only Name is needed; the rest can be added later.</li><li><b>Save it as CSV</b> (comma delimited), then choose the file below.</li><li><b>Check the rows</b>. You can correct any cell here. Then add. Complete records join the waiting list by themselves.</li></ol>`;
  const pick = `<div class="pc-pick"><button type="button" data-action="pt-csv-template">Download the template</button>
    <label class="pe-f pc-file"><span class="pe-l">CSV file</span><input type="file" id="pc-file" accept=".csv,text/csv"></label>
    <label class="pe-f"><span class="pe-l">Meant for project${needProject ? ` <abbr title="required" aria-hidden="true">*</abbr>` : ""}</span><select id="pc-project"><option value="">Choose a project</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === chosen ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select><span class="muted pe-hint">For every row that has no project of its own.</span></label></div>`;

  // One editable cell. The label says the column and the row, for a screen reader.
  const cell = (r: CsvRow, field: string, label: string, extra = ""): string => `<td><input class="pc-in" id="pc-r${r.line}-${field}" value="${esc(r.values[field] ?? r.raw[field] ?? "")}" aria-label="${label}, row ${r.line}" autocomplete="off"${extra}></td>`;
  const gender = (r: CsvRow): string => { const v = r.values["gender"] ?? ""; const odd = v !== "" && v !== "female" && v !== "male"; return `<td><select class="pc-in" id="pc-r${r.line}-gender" aria-label="Gender, row ${r.line}">${odd ? `<option value="${esc(v)}" selected>${esc(v)} (fix)</option>` : ""}<option value=""${v === "" ? " selected" : ""}></option><option value="female"${v === "female" ? " selected" : ""}>Female</option><option value="male"${v === "male" ? " selected" : ""}>Male</option></select></td>`; };
  const project = (r: CsvRow): string => { const odd = (r.raw["project"] ?? "") !== "" && !r.values["targetProjectId"]; const cur = r.values["targetProjectId"] ?? ""; return `<td><select class="pc-in" id="pc-r${r.line}-project" aria-label="Project, row ${r.line}">${odd ? `<option value="${esc(r.raw["project"] ?? "")}" selected>${esc(r.raw["project"] ?? "")} (fix)</option>` : ""}<option value=""${cur === "" && !odd ? " selected" : ""}>${projectName(chosen) ? "As above" : "Choose above"}</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === cur ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>`; };
  const line = (r: CsvRow): string => `<tr class="${problemOf(r) ? "pc-bad" : ""}"><td class="num">${r.line}</td>${cell(r, "name", "Name")}${cell(r, "dob", "Date of birth", ' placeholder="YYYY-MM-DD"')}${gender(r)}${cell(r, "idNumber", "National ID")}${cell(r, "guardian", "Guardian")}${project(r)}<td class="pc-check">${problemOf(r) ? `<span class="pill review">Problem</span> ${esc(problemOf(r))}` : `<span class="pill ready">Ready</span>`}</td><td><button type="button" data-action="pt-csv-remove" data-line="${r.line}" aria-label="Remove row ${r.line}">Remove</button></td></tr>`;

  let list = "";
  if (s.read?.problem) list = `<div class="pe-error" role="alert">${esc(s.read.problem)}</div>`;
  else if (rows.length > 0) {
    list = `<div id="pc-count" class="pc-sum"><b>${plural(rows.length, "row", "rows")}</b>${s.fileName ? ` from ${esc(s.fileName)}` : ""}: ${sendable.length} ready${bad > 0 ? `, ${bad} with a problem` : ""}. ${bad > 0 ? `Correct a problem in its cell, or remove the row. Rows with a problem are not sent. <button type="button" class="pc-link" data-action="pt-csv-remove-bad">Remove all rows with a problem</button> <button type="button" class="pc-link" data-action="pt-csv-download-bad">Download these rows as CSV</button>` : "Press Add when you are happy."}</div>
      <div class="tablewrap pc-table"><table><thead><tr><th class="num">Row</th><th>Name</th><th>Born</th><th>Gender</th><th>National ID</th><th>Guardian</th><th>Project</th><th>Check</th><th><span class="sr-only">Remove</span></th></tr></thead><tbody>${rows.slice(0, SHOWN).map(line).join("")}</tbody></table></div>${rows.length > SHOWN ? `<p class="muted">Showing the first ${SHOWN} rows. All ${rows.length} are checked and sent.</p>` : ""}
      <label class="pe-same"><input type="checkbox" id="pc-similar"${s.allowSimilar ? " checked" : ""}> Also add rows that look like someone I already have. I have checked they are different people.</label>`;
  }
  const banner = s.result ? `<div class="note" role="status" tabindex="-1" id="pc-summary">${esc(s.result.message)}${rows.length === 0 ? " Nothing is left to add." : " The rows not added are below, with the reason. Correct, remove or send them again."}</div>` : "";
  const intro = rows.length === 0 && s.result ? "" : `${rows.length > 0 ? "" : steps}${pick}`; // once there are rows the three steps are done, so they make way for the list

  return `<div class="pf-overlay${s.fresh ? " pe-in" : ""}" role="dialog" aria-modal="true" aria-labelledby="pc-title"><div class="pf-box pc-box">
    <header role="none" class="gw-head"><div><h2 id="pc-title">Add beneficiaries from a CSV</h2><div class="gw-sub muted">Up to 500 at a time. Contact details, health records and documents are not kept here.</div></div><button type="button" data-action="pt-csv-close" aria-label="Close">Close</button></header>
    <div class="pf-body gw pe">${banner}${intro}${list}</div>
    <footer><span id="pc-error" class="pf-error" role="alert" tabindex="-1">${esc(s.error)}</span>${rows.length === 0 && s.result ? `<button type="button" class="primary" data-action="pt-csv-close">Done</button>` : `<button type="button" data-action="pt-csv-close">${s.result ? "Close" : "Cancel"}</button><button type="button" class="primary" data-action="pt-csv-send"${canSend ? "" : " disabled"}>${s.busy ? "Adding..." : sendable.length > 0 ? `Add ${plural(sendable.length, "beneficiary", "beneficiaries")}` : "Add"}</button>`}</footer>
  </div></div>`;
}
