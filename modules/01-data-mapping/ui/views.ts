/**
 * views.ts
 *
 * What it does: turns the page state (Model) into HTML text for each part of the page: the
 * expected-format guide, column mapping, value mapping and results. It has no events and no
 * logic of its own; main.ts handles clicks and drags.
 * Who calls it: main.ts.
 * Depends on: the Module 1 logic one folder up (types and field lists only).
 *
 * Wording: field labels come from the organisation's setup, so each organisation sees its own words.
 */

import type { RawRecord } from "../csv";
import { CLASSIFICATION_KEYS, FIELDS, GROUP_ORDER, GROUP_TITLES, labelFor, type FieldGroup } from "../fields";
import type { Mapping } from "../mapping";
import type { ImportResult } from "../pipeline";
import { getPreset } from "../presets";
import type { Setup, UnmappedValue } from "../setup";
import { expectedColumns } from "../template";

export interface Selection {
  area: "col" | "raw"; // a source column, or a raw value in the value mapping
  value: string;
}

export interface Model {
  headers: string[];
  rows: RawRecord[];
  setup: Setup; // always present: a new setup is made at start, or the saved one is restored
  result: ImportResult | null;
  unmapped: UnmappedValue[];
  sel: Selection | null;
  valueField: string; // which classification field the value mapping shows
  issueFilter: string; // "all" or an issue code
}

// Turns text into safe HTML text.
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Rule: only the fields that fit how this source carries lines are shown.
const fits = (group: FieldGroup, layout: Setup["layout"]) => (layout === "lines-column" ? group !== "line" : group !== "lines");

const isSel = (m: Model, area: Selection["area"], value: string) => m.sel?.area === area && m.sel.value === value;

function chip(m: Model, area: Selection["area"], value: string, opts: { x?: boolean; note?: string; title?: string } = {}): string {
  const cls = "chip" + (isSel(m, area, value) ? " sel" : "");
  const title = opts.title ? ` title="${esc(opts.title)}"` : "";
  const note = opts.note ? ` <span class="n">${esc(opts.note)}</span>` : "";
  const x = opts.x ? `<span class="x" data-x="${esc(value)}" data-xa="${area}" title="Put back">&times;</span>` : "";
  return `<span class="${cls}" draggable="true" data-c="${esc(value)}" data-a="${area}"${title}>${esc(value)}${note}${x}</span>`;
}

// Rule: a column matched by name (not exactly) is marked so staff can check it.
const likelyNote = (a: Mapping[string] | undefined) => (a?.action === "field" && a.confidence === "likely" ? "by name" : undefined);

// The expected format of the source, as a table. Open until a file has been loaded.
export function guideView(m: Model): string {
  const { setup } = m;
  const rows = expectedColumns({ preset: getPreset(setup.presetId), layout: setup.layout, labels: setup.labels, required: setup.requiredFields })
    .map((c) => `<tr><td><code>${esc(c.column)}</code></td><td>${esc(c.label)}</td><td>${c.required ? "Required" : "Optional"}</td><td>${esc(c.example.length > 40 ? c.example.slice(0, 37) + "..." : c.example)}</td><td>${esc(c.note)}</td></tr>`)
    .join("");
  return `<details class="card"${m.headers.length > 0 ? "" : " open"}><summary><b>Expected format of the upload file</b></summary>
    <p class="empty">Use these column names and every column matches automatically. Other names are matched as far as possible and you fix the rest. Contact details are not needed. Use Download template for a ready file.</p>
    <table><thead><tr><th>Column</th><th>Field</th><th></th><th>Example</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

export function mappingView(m: Model): string {
  const { setup, headers } = m;
  const mapping = setup.mapping;
  const actionOf = (h: string) => mapping[h]?.action ?? "unmapped";
  const pool = headers.filter((h) => actionOf(h) === "unmapped");
  const dropped = headers.filter((h) => actionOf(h) === "drop");
  const mappedCount = headers.filter((h) => actionOf(h) === "field").length;
  const byName = headers.filter((h) => likelyNote(mapping[h]) !== undefined).length;
  const required = new Set(setup.requiredFields);

  const slotsFor = (group: FieldGroup) =>
    FIELDS.filter((f) => f.group === group)
      .map((f) => {
        const cols = headers.filter((h) => { const a = mapping[h]; return a?.action === "field" && a.field === f.key; });
        const body = cols.map((c) => chip(m, "col", c, { x: true, note: likelyNote(mapping[c]) })).join("") || `<span class="empty">blank</span>`;
        return `<div class="slot" data-slot="${f.key}"><span class="lbl">${esc(labelFor(f.key, setup.labels))}${required.has(f.key) ? " *" : ""}</span>${body}</div>`;
      })
      .join("");

  const groups = GROUP_ORDER.filter((g) => fits(g, setup.layout)).map((g) => `<h3>${esc(GROUP_TITLES[g])}</h3>${slotsFor(g)}`).join("");
  const dropBody = dropped.map((c) => chip(m, "col", c, { title: (mapping[c] as { reason?: string }).reason })).join("") || `<span class="empty">Nothing dropped</span>`;
  const poolBody = pool.map((c) => chip(m, "col", c)).join("") || `<span class="empty">All decided</span>`;

  return `<section class="card"><h2>Match the columns</h2>
    <div class="row"><label>Source name <input type="text" id="srcname" value="${esc(setup.sourceName)}" /></label>
    <span class="empty">Matched ${mappedCount + dropped.length} of ${headers.length} columns automatically (${mappedCount} mapped${byName > 0 ? `, ${byName} by name, please check` : ""}, ${dropped.length} dropped). ${pool.length} to decide. * means required. Drag a column onto a field, or tap a column then tap a field.</span></div>
    <div class="cols"><div class="stack">
      <div class="zone" data-zone="pool"><h3 class="zh">To decide</h3>${poolBody}</div>
      <div class="zone drop" data-zone="drop"><h3 class="zh">Drop (never stored)</h3>${dropBody}</div>
    </div><div>${groups}</div></div></section>`;
}

export function valuesView(m: Model): string {
  const { setup } = m;
  const field = m.valueField;
  const options = CLASSIFICATION_KEYS.map((k) => `<option value="${k}"${k === field ? " selected" : ""}>${esc(labelFor(k, setup.labels))}</option>`).join("");

  const map = setup.valueMaps[field] ?? {};
  const masters = setup.masterValues[field] ?? [];
  const rows = masters
    .map((master) => {
      const raws = Object.keys(map).filter((r) => map[r] === master);
      const body = raws.map((r) => chip(m, "raw", r, { x: true })).join("") || `<span class="empty">drop a value here</span>`;
      return `<div class="slot" data-vm="${esc(master)}"><span class="lbl" style="color:var(--text)">${esc(master)}</span>${body}</div>`;
    })
    .join("");
  const pool = m.unmapped.filter((u) => u.field === field);
  const poolBody = pool.map((u) => chip(m, "raw", u.value, { note: `${u.count}` })).join("") || `<span class="empty">All values mapped</span>`;

  return `<section class="card"><h2>Match the values</h2>
    <div class="row"><label>Field <select id="valuefield">${options}</select></label>
    <span class="empty">Drag each value in the file onto the master value it means.</span></div>
    <div class="cols"><div class="zone" data-vpool="1"><h3 class="zh">Still to map</h3>${poolBody}</div>
    <div>${rows || `<span class="empty">No master values yet for this field. Add one below.</span>`}
      <div class="row"><input type="text" id="newmaster" placeholder="New master value" /><button data-act="addmaster">Add</button></div></div></div></section>`;
}

export function resultsView(m: Model): string {
  const r = m.result!;
  const { labels } = m.setup;
  const counts = new Map<string, number>();
  for (const i of r.issues) counts.set(i.code, (counts.get(i.code) ?? 0) + 1);
  const filters = [["all", `All (${r.issues.length})`] as const, ...[...counts].map(([c, n]) => [c, `${c.replace(/_/g, " ")} (${n})`] as const)]
    .map(([code, label]) => `<button data-ifilter="${code}" class="${m.issueFilter === code ? "on" : ""}">${esc(label)}</button>`)
    .join(" ");
  const shown = r.issues.filter((i) => m.issueFilter === "all" || i.code === m.issueFilter);
  const issueRows = shown.slice(0, 200)
    .map((i) => `<tr><td>${i.row}</td><td>${esc(i.reference) || "<span class='empty'>none</span>"}</td><td><span class="tag">${esc(i.code.replace(/_/g, " "))}</span></td><td>${esc(i.message)}</td></tr>`)
    .join("");
  const lineRows = r.lines.slice(0, 50)
    .map((l) => `<tr><td>${esc(l.reference)}</td><td>${l.lineNumber}</td><td>${esc(l.fundName)}</td><td>${esc(l.outcomeName)}</td><td>${l.amount}</td><td>${esc(l.intention)}</td></tr>`)
    .join("");

  return `<section class="card"><h2>Check the result</h2>
    <div class="metrics"><div class="metric"><b>${r.transactions.length}</b><span>transactions</span></div><div class="metric"><b>${r.lines.length}</b><span>lines</span></div><div class="metric"><b>${r.issues.length}</b><span>issues (never block)</span></div></div>
    <div class="row"><button data-act="save">Save setup</button><span class="empty">Downloads the setup as a file to keep or share.</span></div>
    <h3>Issues</h3><div class="row">${filters}</div>
    <table><thead><tr><th>Row</th><th>Reference</th><th>Type</th><th>What to check</th></tr></thead><tbody>${issueRows || `<tr><td colspan="4" class="empty">No issues</td></tr>`}</tbody></table>
    ${shown.length > 200 ? `<p class="empty">Showing the first 200 of ${shown.length}.</p>` : ""}
    <h3>Lines (first 50)</h3>
    <table><thead><tr><th>Reference</th><th>Line</th><th>${esc(labelFor("lineFund", labels))}</th><th>${esc(labelFor("lineOutcome", labels))}</th><th>Amount</th><th>${esc(labelFor("lineIntention", labels))}</th></tr></thead><tbody>${lineRows}</tbody></table></section>`;
}
