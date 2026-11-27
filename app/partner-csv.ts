/**
 * partner-csv.ts
 *
 * What it does: the pop-up window where a partner adds many beneficiaries from a CSV file (DECISIONS 271): how it works in three short steps, the template to download, the file to choose, a preview of every row with what is wrong with it, and, once sent, what was added and which rows were not and why.
 * Who calls it: app/partner-beneficiaries.ts (the Upload CSV button) and app/partner-outcomes.ts (the state type). Depends on: the CSV reading rule (modules/13-partner-portal/import.ts) and the shared escaping. Pure: it takes the state and returns HTML. The clicks and the file are handled in app/partner-csv-session.ts.
 * UX: a modal dialog like the other windows; the three steps are named; nothing is sent until the person presses Add, after a preview; the preview says each row's problem in words (never colour alone); rows with a problem are never sent; the result lists every row not added with its reason; Cancel and Close are always there.
 */

import type { CsvRead } from "../modules/13-partner-portal/import";
import { esc, plural } from "./partner-outcomes";

export interface CsvState {
  fileName: string;
  read: CsvRead | null; // null until a file is chosen
  projectId: string; // the project for rows with no Project column
  allowSimilar: boolean;
  busy: boolean;
  error: string;
  result: { message: string; added: number; skipped: { line: number; name: string; error: string }[] } | null;
  fresh?: boolean; // just opened, so the window eases in (and not again on a redraw)
}
export const NEW_CSV: CsvState = { fileName: "", read: null, projectId: "", allowSimilar: false, busy: false, error: "", result: null, fresh: true };
const SHOWN = 200; // rows drawn in the preview; all are still sent

export function csvWindowHtml(s: CsvState, projects: { id: string; name: string }[]): string {
  const rows = s.read?.rows ?? [];
  const good = rows.filter((r) => r.error === "");
  const bad = rows.length - good.length;
  const needProject = good.some((r) => !r.values["targetProjectId"]);
  const canSend = good.length > 0 && (!needProject || s.projectId !== "") && !s.busy;
  const projectName = (id: string): string => projects.find((p) => p.id === id)?.name ?? "";
  const onlyOne = projects.length === 1 ? projects[0]?.id ?? "" : "";
  const chosen = s.projectId || onlyOne;

  const steps = `<ol class="pc-steps"><li><b>Download the template</b> and fill it in, one beneficiary on each row. Only Name is needed; the rest can be added later.</li><li><b>Save it as CSV</b> (comma delimited), then choose the file below.</li><li><b>Check the preview</b>, then add. Complete records join the waiting list by themselves.</li></ol>`;
  const pick = `<div class="pc-pick"><button type="button" data-action="pt-csv-template">Download the template</button>
    <label class="pe-f pc-file"><span class="pe-l">CSV file</span><input type="file" id="pc-file" accept=".csv,text/csv"></label>
    <label class="pe-f"><span class="pe-l">Meant for project${needProject ? ` <abbr title="required" aria-hidden="true">*</abbr>` : ""}</span><select id="pc-project"><option value="">Choose a project</option>${projects.map((p) => `<option value="${esc(p.id)}"${p.id === chosen ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select><span class="muted pe-hint">For every row that has no Project column of its own.</span></label></div>`;

  let preview = "";
  if (s.read?.problem) preview = `<div class="pe-error" role="alert">${esc(s.read.problem)}</div>`;
  else if (s.read) {
    const line = (r: (typeof rows)[number]): string => `<tr class="${r.error ? "pc-bad" : ""}"><td class="num">${r.line}</td><td>${esc(r.values["name"] ?? "")}</td><td>${esc(r.values["dob"] ?? "")}</td><td>${esc(projectName(r.values["targetProjectId"] ?? "") || (r.error ? "" : projectName(chosen)))}</td><td>${r.error ? `<span class="pill review">Problem</span> ${esc(r.error)}` : `<span class="pill ready">Ready</span>`}</td></tr>`;
    preview = `<div id="pc-summary" class="pc-sum" role="status" tabindex="-1"><b>${plural(rows.length, "row", "rows")}</b> in ${esc(s.fileName)}: ${good.length} ready${bad > 0 ? `, ${bad} with a problem` : ""}.${bad > 0 ? " Rows with a problem are not sent. Fix them in the file and upload again, or add them one by one." : ""}</div>
      <div class="tablewrap pc-table"><table><thead><tr><th class="num">Row</th><th>Name</th><th>Born</th><th>Project</th><th>Check</th></tr></thead><tbody>${rows.slice(0, SHOWN).map(line).join("")}</tbody></table></div>${rows.length > SHOWN ? `<p class="muted">Showing the first ${SHOWN} rows. All ${rows.length} are checked and sent.</p>` : ""}
      <label class="pe-same"><input type="checkbox" id="pc-similar"${s.allowSimilar ? " checked" : ""}> Also add rows that look like someone I already have. I have checked they are different people.</label>`;
  }

  const result = s.result ? `<div class="note" role="status" tabindex="-1" id="pc-summary">${esc(s.result.message)}</div>${s.result.skipped.length > 0 ? `<h3 class="pc-h">Not added (${s.result.skipped.length})</h3><div class="tablewrap pc-table"><table><thead><tr><th class="num">Row</th><th>Name</th><th>Why</th></tr></thead><tbody>${s.result.skipped.map((x) => `<tr class="pc-bad"><td class="num">${x.line}</td><td>${esc(x.name)}</td><td>${esc(x.error)}</td></tr>`).join("")}</tbody></table></div><p class="muted">Fix these in your file and upload only them again, or add them one by one.</p>` : ""}` : "";

  return `<div class="pf-overlay${s.fresh ? " pe-in" : ""}" role="dialog" aria-modal="true" aria-labelledby="pc-title"><div class="pf-box">
    <header class="gw-head"><div><h2 id="pc-title">Add beneficiaries from a CSV</h2><div class="gw-sub muted">Up to 500 at a time. Contact details, health records and documents are not kept here.</div></div><button type="button" data-action="pt-csv-close" aria-label="Close">Close</button></header>
    <div class="pf-body gw pe">${s.result ? result : `${steps}${pick}${preview}`}</div>
    <footer><span id="pc-error" class="pf-error" role="alert" tabindex="-1">${esc(s.error)}</span>${s.result ? `<button type="button" class="primary" data-action="pt-csv-close">Done</button>` : `<button type="button" data-action="pt-csv-close">Cancel</button><button type="button" class="primary" data-action="pt-csv-send"${canSend ? "" : " disabled"}>${s.busy ? "Adding..." : good.length > 0 ? `Add ${plural(good.length, "beneficiary", "beneficiaries")}` : "Add"}</button>`}</footer>
  </div></div>`;
}
