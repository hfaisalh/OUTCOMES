/**
 * main.ts
 *
 * What it does: runs the Module 1 page. Reads the chosen CSV file or Google Sheet in the browser,
 * keeps the page state, handles drag, tap and click, and redraws the page using views.ts.
 * Who calls it: index.html (npm run dev).
 * Depends on: the pure Module 1 logic one folder up, views.ts and sheet-source.ts.
 *
 * Rule: the setup (including the lookup lists) is configuration. It is saved in this browser, so
 * each run only needs the upload file. Nothing is sent to a server.
 */

import { parseCsv, toRecords, type Table } from "../csv";
import { readLookups } from "../lookups";
import { suggestMapping } from "../mapping";
import { runImport } from "../pipeline";
import { getPreset, PRESETS } from "../presets";
import { findUnmappedValues, loadSetup, newSetup, saveSetup, type Setup } from "../setup";
import { templateCsv } from "../template";
import { initSheetSource } from "./sheet-source";
import { guideView, mappingView, resultsView, valuesView, type Model } from "./views";

const STORAGE_KEY = "outcomes.module1.setup.v2";
const STUB_NAME = "Data source"; // name of a setup made before any file was chosen

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const app = byId("app");

function restore(): Setup {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    const loaded = text ? loadSetup(text).setup : null;
    if (loaded) return loaded;
  } catch { /* ignore */ }
  return newSetup(STUB_NAME, []);
}

const model: Model = { headers: [], rows: [], setup: restore(), result: null, unmapped: [], sel: null, valueField: "frequency", issueFilter: "all" };

function status(text: string, bad = false) {
  const el = byId("status");
  el.textContent = text;
  el.className = "status" + (bad ? " bad" : "");
}

// Rule: a setup may not know every column of this file, so add suggestions for the new ones.
function ensureHeaders() {
  const preset = getPreset(model.setup.presetId);
  for (const h of model.headers) if (!(h in model.setup.mapping)) model.setup.mapping[h] = suggestMapping([h], preset)[h] ?? { action: "unmapped" };
}

// Works out the result for the current setup, then redraws the page.
function refresh() {
  if (model.headers.length > 0) {
    model.result = runImport(model.rows, model.setup);
    model.unmapped = findUnmappedValues(model.result.transactions, model.setup);
  } else {
    model.result = null;
    model.unmapped = [];
  }
  app.innerHTML = [guideView(model), model.headers.length > 0 ? mappingView(model) : "", model.result ? valuesView(model) + resultsView(model) : ""].join("");
  try { localStorage.setItem(STORAGE_KEY, saveSetup(model.setup)); } catch { /* storage may be blocked, the page still works */ }
  showConfig();
}

// Section: the Configuration controls show the current setup.
function showConfig() {
  const s = model.setup;
  byId<HTMLSelectElement>("preset").value = s.presetId ?? "";
  byId<HTMLSelectElement>("layout").value = s.layout;
  byId<HTMLInputElement>("feedbackonly").checked = s.feedbackItemsOnly;
  const funds = Object.keys(s.lookups.funds).length;
  const outcomes = Object.keys(s.lookups.outcomes).length;
  byId("cfgstatus").textContent = funds + outcomes > 0
    ? `Lookup lists saved in this browser: ${funds} fund names, ${outcomes} outcome names. Only replace them when they change.`
    : "No lookup lists yet. They are optional: a file that carries names directly does not need them.";
}

// Takes a table (from a file or a Google Sheet) and starts the mapping.
function useTable(table: Table, name: string, from: string) {
  const { headers, records } = toRecords(table);
  model.headers = headers;
  model.rows = records;
  if (model.setup.sourceName === STUB_NAME) model.setup.sourceName = name;
  ensureHeaders();
  status(`Loaded ${records.length} rows and ${headers.length} columns from ${from}.`);
  refresh();
}

// Section: moving columns and values. Each change updates the setup, then redraws.
function setColumn(column: string, target: string) {
  const mapping = model.setup.mapping;
  if (target === "pool") mapping[column] = { action: "unmapped" };
  else if (target === "drop") mapping[column] = { action: "drop", reason: "Dropped by you" };
  else {
    // Rule: one column per field. A column already on this field goes back to "to decide".
    for (const [c, a] of Object.entries(mapping)) if (c !== column && a.action === "field" && a.field === target) mapping[c] = { action: "unmapped" };
    mapping[column] = { action: "field", field: target };
  }
}

function setValue(raw: string, master: string | null) {
  const map = (model.setup.valueMaps[model.valueField] ??= {});
  for (const k of Object.keys(map)) if (k.trim().toLowerCase() === raw.trim().toLowerCase()) delete map[k];
  if (master !== null) map[raw] = master;
}

// Drops a chip on whatever is under it. Returns false when it was not dropped on a target.
function dropOn(el: Element, area: string, value: string): boolean {
  const slot = el.closest<HTMLElement>("[data-slot]");
  const zone = el.closest<HTMLElement>("[data-zone]");
  const master = el.closest<HTMLElement>("[data-vm]");
  const valuePool = el.closest<HTMLElement>("[data-vpool]");
  if (area === "col") {
    if (slot) setColumn(value, slot.dataset["slot"]!);
    else if (zone) setColumn(value, zone.dataset["zone"]!);
    else return false;
  } else if (master) setValue(value, master.dataset["vm"]!);
  else if (valuePool) setValue(value, null);
  else return false;
  model.sel = null;
  refresh();
  return true;
}

function download(name: string, text: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function addMaster() {
  const text = byId<HTMLInputElement>("newmaster").value.trim();
  if (text === "") return status("Type a master value first.", true);
  const list = (model.setup.masterValues[model.valueField] ??= []);
  if (!list.some((v) => v.toLowerCase() === text.toLowerCase())) list.push(text);
  refresh();
}

// Section: events. One set of listeners on the page, so redrawing never loses them.
app.addEventListener("dragstart", (e) => {
  const c = (e.target as Element).closest<HTMLElement>(".chip");
  if (c) e.dataTransfer?.setData("text/plain", `${c.dataset["a"]}|${c.dataset["c"]}`);
});
app.addEventListener("dragover", (e) => {
  const z = (e.target as Element).closest(".slot,.zone");
  if (z) { e.preventDefault(); z.classList.add("over"); }
});
app.addEventListener("dragleave", (e) => (e.target as Element).closest(".slot,.zone")?.classList.remove("over"));
app.addEventListener("drop", (e) => {
  e.preventDefault();
  app.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
  const text = e.dataTransfer?.getData("text/plain") ?? "";
  const at = text.indexOf("|");
  if (at > 0) dropOn(e.target as Element, text.slice(0, at), text.slice(at + 1));
});
app.addEventListener("click", (e) => {
  const target = e.target as Element;
  const x = target.closest<HTMLElement>("[data-x]");
  if (x) {
    if (x.dataset["xa"] === "col") setColumn(x.dataset["x"]!, "pool");
    else setValue(x.dataset["x"]!, null);
    model.sel = null;
    return refresh();
  }
  const filter = target.closest<HTMLElement>("[data-filter]");
  if (filter) { model.issueFilter = filter.dataset["filter"]!; return refresh(); }
  const act = target.closest<HTMLElement>("[data-act]")?.dataset["act"];
  if (act === "save") return download(`${model.setup.sourceName.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "setup"}.setup.json`, saveSetup(model.setup), "application/json");
  if (act === "addmaster") return addMaster();
  const chip = target.closest<HTMLElement>(".chip");
  if (chip) {
    const area = chip.dataset["a"] as "col" | "raw";
    const value = chip.dataset["c"]!;
    model.sel = model.sel?.area === area && model.sel.value === value ? null : { area, value };
    return refresh();
  }
  if (model.sel) dropOn(target, model.sel.area, model.sel.value); // tap a chip, then tap where it goes
});
app.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === "srcname") model.setup.sourceName = t.value;
  if (t.id === "valuefield") { model.valueField = t.value; refresh(); }
});

// Section: Configuration controls.
const presetSelect = byId<HTMLSelectElement>("preset");
presetSelect.innerHTML = `<option value="">Generic file (map your own columns)</option>` + PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join("");
presetSelect.addEventListener("change", () => {
  // Choosing another source type starts the mapping again from that source's suggestions. Lookup lists are kept.
  const fresh = newSetup(model.setup.sourceName, model.headers, presetSelect.value || null);
  fresh.lookups = model.setup.lookups;
  model.setup = fresh;
  refresh();
});
byId<HTMLSelectElement>("layout").addEventListener("change", (e) => { model.setup.layout = (e.target as HTMLSelectElement).value as Setup["layout"]; refresh(); });
byId<HTMLInputElement>("feedbackonly").addEventListener("change", (e) => { model.setup.feedbackItemsOnly = (e.target as HTMLInputElement).checked; refresh(); });
byId("template").addEventListener("click", () => {
  const s = model.setup;
  download("upload-template.csv", templateCsv({ preset: getPreset(s.presetId), layout: s.layout, labels: s.labels, required: s.requiredFields }), "text/csv");
});
byId("forget").addEventListener("click", () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  Object.assign(model, { headers: [], rows: [], setup: newSetup(STUB_NAME, []), result: null, unmapped: [], sel: null });
  status("Saved setup forgotten.");
  refresh();
});

// Section: choosing files.
const wire = (id: string, handler: (file: File) => Promise<void>) =>
  byId(id).addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handler(file).catch((err: unknown) => status(`Could not read that file: ${String(err)}`, true));
  });
wire("gifts", async (file) => useTable(parseCsv(await file.text()), file.name.replace(/\.csv$/i, ""), "the file"));
wire("meta", async (file) => {
  const { lookups, problems } = readLookups(await file.text(), getPreset(model.setup.presetId));
  if (Object.keys(lookups.funds).length + Object.keys(lookups.outcomes).length === 0) return status(`That lookup list can't be used: ${problems.join("; ")}`, true);
  model.setup.lookups = lookups;
  status(problems.length > 0 ? `Lookup lists loaded with problems: ${problems.join("; ")}` : "Lookup lists loaded and saved in this browser.", problems.length > 0);
  refresh();
});
wire("setupfile", async (file) => {
  const { setup, problems } = loadSetup(await file.text());
  if (!setup) return status(`That setup can't be used: ${problems.join("; ")}`, true);
  model.setup = setup;
  ensureHeaders();
  status(`Setup "${setup.sourceName}" loaded.`);
  refresh();
});

initSheetSource({
  status,
  openConfig: () => { byId<HTMLDetailsElement>("cfg").open = true; },
  onTable: (table, tabTitle) => useTable(table, tabTitle, `the Google Sheet tab "${tabTitle}"`),
});
status("Pick the upload file (CSV), or load it from a Google Sheet. Open Configuration to choose the source type.");
refresh();
