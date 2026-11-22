/**
 * mapping-page.ts
 *
 * What it does: the page for Other sources (DECISIONS 93), in the look of the rest of OUTCOMES. It is a short guided flow of four steps: Source, Columns,
 * Values and Check. Step 1 chooses the source type and the file (or a Google Sheet or a demo). Steps 2 to 4 reuse the Module 1 views for matching columns,
 * matching values and checking the result.
 * Who calls it: app/mapping-controller.ts. Depends on: the Module 1 views and logic. Pure: it takes a state and returns HTML.
 *
 * Rule: nothing is sent to a server. Files are read in this browser and the setup is kept in this browser (DECISIONS 22).
 */

import { getPreset, PRESETS } from "../modules/01-data-mapping/presets";
import { guideView, mappingView, resultsView, valuesView, esc, type Model } from "../modules/01-data-mapping/ui/views";

export type MappingStep = 1 | 2 | 3 | 4;

export interface MappingState {
  model: Model;
  step: MappingStep;
  note: string; // what the page last said, in plain words
  bad: boolean; // the note is a problem
  demo: boolean; // the invented demo is on: nothing is saved
  fileName: string;
  googleSignedIn: boolean;
  sheetLink: string;
  sheetTab: string;
  googleClient: string;
}

const STEPS: [MappingStep, string, string][] = [[1, "Source", "Choose the file"], [2, "Columns", "Match the columns"], [3, "Values", "Match the values"], [4, "Check", "Check the result"]];

function stepper(ms: MappingState): string {
  const loaded = ms.model.headers.length > 0;
  return `<ol class="mp-steps">${STEPS.map(([n, label, hint]) => {
    const locked = n > 1 && !loaded;
    const done = loaded && n < ms.step;
    return `<li><button data-mp="step" data-n="${n}" class="${n === ms.step ? "on" : ""}${done ? " done" : ""}"${locked ? " disabled" : ""}><span class="mp-num">${done ? "✓" : n}</span><span><b>${label}</b><small>${hint}</small></span></button></li>`;
  }).join("")}</ol>`;
}

function sourceStep(ms: MappingState): string {
  const s = ms.model.setup;
  const loaded = ms.model.headers.length > 0;
  const funds = Object.keys(s.lookups.funds).length, outcomes = Object.keys(s.lookups.outcomes).length;
  return `<div class="mp-grid">
    <div class="card"><h2>About this source</h2>
      <label class="mp-field"><span>Source type</span><select id="mp-preset"><option value="">Generic file (match your own columns)</option>${PRESETS.map((p) => `<option value="${esc(p.id)}"${s.presetId === p.id ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label class="mp-field"><span>How lines are laid out</span><select id="mp-layout">
        <option value="lines-column"${s.layout === "lines-column" ? " selected" : ""}>One row per transaction, lines in one column</option>
        <option value="one-row-per-line"${s.layout === "one-row-per-line" ? " selected" : ""}>One row per line, rows with the same reference are one transaction</option>
        <option value="one-line-per-transaction"${s.layout === "one-line-per-transaction" ? " selected" : ""}>One row per transaction, one line</option></select></label>
      <label class="mp-check"><input type="checkbox" id="mp-feedback"${s.feedbackItemsOnly ? " checked" : ""}> The file holds only some lines of each transaction</label>
      <details class="mp-more"><summary>Lookup lists and saved setup</summary>
        <p class="muted">${funds + outcomes > 0 ? `Saved in this browser: ${funds} fund names and ${outcomes} outcome names. Replace them only when they change.` : "No lookup lists yet. They are optional: a file that carries names directly does not need them."}</p>
        <label class="mp-field"><span>Lookup lists (CSV, names for fund and outcome IDs)</span><input type="file" id="mp-meta" accept=".csv"></label>
        <label class="mp-field"><span>Saved setup (.json)</span><input type="file" id="mp-setupfile" accept=".json"></label>
        <div class="actions"><button data-mp="forget">Forget the saved setup</button></div>
      </details>
    </div>
    <div class="card"><h2>Get the file</h2>
      <label class="mp-drop"><input type="file" id="mp-file" accept=".csv"><b>Choose a CSV file</b><span class="muted">${ms.fileName ? `Loaded: ${esc(ms.fileName)}` : "It is read in this browser. Nothing is uploaded."}</span></label>
      <div class="actions"><button data-mp="template">Download the template</button><button data-mp="demo" data-kind="salesforce">Demo: Salesforce sample</button><button data-mp="demo" data-kind="generic">Demo: another organisation</button></div>
      <details class="mp-more"><summary>Or read a Google Sheet</summary>
        <label class="mp-field"><span>Sheet link</span><input type="text" id="mp-sheetlink" value="${esc(ms.sheetLink)}" placeholder="https://docs.google.com/spreadsheets/d/..."></label>
        <label class="mp-field"><span>Tab name (first tab if empty)</span><input type="text" id="mp-sheettab" value="${esc(ms.sheetTab)}"></label>
        <label class="mp-field"><span>Google client ID (once, see docs/GOOGLE-SETUP.md)</span><input type="text" id="mp-gclient" value="${esc(ms.googleClient)}"></label>
        <div class="actions"><button data-mp="gload">Load from Google Sheet</button><button data-mp="gsign">${ms.googleSignedIn ? "Sign out of Google" : "Sign in with Google"}</button></div>
        <p class="muted">Read only. You see only the sheets shared with your own Google account.</p>
      </details>
    </div></div>
    ${guideView({ ...ms.model, headers: loaded ? ms.model.headers : [] })}`;
}

export function mappingPageHtml(ms: MappingState): string {
  const m = ms.model;
  const loaded = m.headers.length > 0;
  const body = ms.step === 1 || !loaded ? sourceStep(ms) : ms.step === 2 ? mappingView(m) : ms.step === 3 ? valuesView(m) : m.result ? resultsView(m) : "";
  const back = ms.step > 1 && loaded ? `<button data-mp="step" data-n="${ms.step - 1}">Back</button>` : "";
  const next = loaded && ms.step < 4 ? `<button class="primary" data-mp="step" data-n="${ms.step + 1}">${ms.step === 1 ? "Match the columns" : ms.step === 2 ? "Match the values" : "Check the result"}</button>` : "";
  const save = loaded && ms.step === 4 ? `<button class="primary" data-mp="save">Save the setup</button>` : "";
  return `<div class="mp">
    <h1>Other sources</h1>
    <p class="sub">For organisations with no CRM, and for testing. Load a file, match its columns to OUTCOMES' own fields, and check the result. Files are read in this browser and nothing is uploaded.</p>
    ${stepper(ms)}
    ${ms.note ? `<div class="note${ms.bad ? " warnnote" : ""}">${esc(ms.note)}</div>` : ""}
    ${loaded ? `<div class="mp-source"><b>${esc(m.setup.sourceName)}</b><span class="muted">${esc(getPreset(m.setup.presetId)?.name ?? "Generic file")} · ${m.rows.length} rows · ${m.headers.length} columns${ms.demo ? " · demo, nothing is saved" : ""}</span></div>` : ""}
    ${body}
    ${back || next || save ? `<div class="mp-nav">${back}<span class="grow"></span>${save}${next}</div>` : ""}
  </div>`;
}
