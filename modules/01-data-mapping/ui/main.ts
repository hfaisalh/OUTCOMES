/**
 * main.ts
 *
 * What it does: runs the Module 1 page. Reads the chosen CSV files in the browser, keeps the
 * page state, handles drag, tap and click, and redraws the page using views.ts.
 * Rule: the code book is configuration. It is loaded once and saved with the setup in this
 * browser, so each run only needs the Upload file.
 * Who calls it: index.html (npm run dev).
 * Depends on: the pure Module 1 logic one folder up, and views.ts. Nothing is uploaded or stored.
 */

import { buildCodeBook } from "../codebook";
import { readGiftExport } from "../gifts";
import { suggestMapping } from "../mapping";
import { codeBookFromData, codeBookToData, findUnmappedValues, loadSetup, newSetup, runImportWithSetup, saveSetup, type Setup } from "../setup";
import { templateCsv } from "../template";
import { guideView, mappingView, resultsView, valuesView, type Model } from "./views";

const STORAGE_KEY = "outcomes.module1.setup";

const model: Model = { headers: [], rawGifts: [], codeBook: null, setup: null, result: null, unmapped: [], sel: null, valueField: "frequency", issueFilter: "all" };
let pendingSetup: Setup | null = null; // a loaded setup waiting for its gift file
let sourceGuess = "Data source";
const STUB_NAME = "Data source"; // name of a setup made before any Upload file was chosen

const app = document.getElementById("app") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

function status(text: string, bad = false) {
  statusEl.textContent = text;
  statusEl.className = "status" + (bad ? " bad" : "");
}

// Rule: a setup from a file may not know every column of this file, so add suggestions for the new ones.
function ensureHeaders(setup: Setup) {
  for (const h of model.headers) {
    if (!(h in setup.mapping)) setup.mapping[h] = suggestMapping([h])[h] ?? { action: "unmapped" };
  }
}

// Works out the result for the current setup, then redraws the page.
function refresh() {
  const { setup, codeBook, rawGifts } = model;
  if (setup && codeBook && rawGifts.length > 0) {
    model.result = runImportWithSetup(rawGifts, setup, codeBook);
    model.unmapped = findUnmappedValues(model.result.gifts, setup);
  } else {
    model.result = null;
    model.unmapped = [];
  }
  const parts = [guideView(model), model.setup ? mappingView(model) : "", model.result ? valuesView(model) + resultsView(model) : ""];
  app.innerHTML = parts.join("");
  persist();
  showConfig();
}

// Section: configuration kept in this browser (setup plus code book). Failure is not fatal.
function persist() {
  const setup = model.setup ?? pendingSetup;
  if (!setup) return;
  if (model.codeBook) setup.codeBook = codeBookToData(model.codeBook);
  try { localStorage.setItem(STORAGE_KEY, saveSetup(setup)); } catch { /* storage may be blocked, the page still works */ }
}

function showConfig() {
  const cb = model.codeBook;
  (document.getElementById("cfgstatus") as HTMLElement).textContent = cb
    ? `Code book saved in this browser: ${cb.designations.size} designations, ${cb.outcomeActivities.size} outcome activities. Only replace it when it changes in Salesforce.`
    : "No code book yet. Pick the code book (CSV) once. It is kept in this browser.";
  (document.getElementById("cfg") as HTMLDetailsElement).open = !cb;
}

function restore() {
  let text: string | null = null;
  try { text = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  if (!text) return;
  const { setup } = loadSetup(text);
  if (!setup) return;
  pendingSetup = setup;
  if (setup.codeBook) model.codeBook = codeBookFromData(setup.codeBook);
}

// Section: moving columns and values. Each change updates the setup, then redraws.
function setColumn(column: string, target: string) {
  const mapping = model.setup!.mapping;
  if (target === "pool") mapping[column] = { action: "unmapped" };
  else if (target === "drop") mapping[column] = { action: "drop", reason: "Dropped by you" };
  else {
    // Rule: one column per field. A column already on this field goes back to "to decide".
    for (const [c, a] of Object.entries(mapping)) {
      if (c !== column && a.action === "field" && a.field === target) mapping[c] = { action: "unmapped" };
    }
    mapping[column] = { action: "field", field: target };
  }
}

function setValue(raw: string, master: string | null) {
  const maps = model.setup!.valueMaps;
  const map = (maps[model.valueField] ??= {});
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

function saveFile() {
  const setup = model.setup!;
  const name = setup.sourceName.trim().replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() || "setup";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([saveSetup(setup)], { type: "application/json" }));
  link.download = `${name}.setup.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  status(`Saved ${link.download} to your downloads.`);
}

function addMaster() {
  const input = document.getElementById("newmaster") as HTMLInputElement;
  const text = input.value.trim();
  if (text === "") return status("Type a master value first.", true);
  const list = (model.setup!.masterValues[model.valueField] ??= []);
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
  if (act === "save") return saveFile();
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
  if (t.id === "srcname") model.setup!.sourceName = t.value;
  if (t.id === "valuefield") { model.valueField = t.value; refresh(); }
});

// Section: choosing files.
async function onGiftFile(file: File) {
  const { headers, gifts } = readGiftExport(await file.text());
  model.headers = headers;
  model.rawGifts = gifts;
  sourceGuess = file.name.replace(/\.csv$/i, "");
  model.setup = pendingSetup ?? newSetup(sourceGuess, headers);
  if (model.setup.sourceName === STUB_NAME) model.setup.sourceName = sourceGuess;
  pendingSetup = null;
  ensureHeaders(model.setup);
  status(`Loaded ${gifts.length} gifts and ${headers.length} columns.` + (model.codeBook ? "" : " Open Configuration and pick the code book once to see values and results."));
  refresh();
}

async function onMetaFile(file: File) {
  const { codeBook, problems } = buildCodeBook(await file.text());
  model.codeBook = codeBook;
  if (!model.setup && !pendingSetup) pendingSetup = newSetup(STUB_NAME, []); // keeps the code book until a file is chosen
  status(problems.length > 0 ? `Code book problems: ${problems.join("; ")}` : `Code book loaded: ${codeBook.designations.size} designations, ${codeBook.outcomeActivities.size} outcome activities.`, problems.length > 0);
  refresh();
}

async function onSetupFile(file: File) {
  const { setup, problems } = loadSetup(await file.text());
  if (!setup) return status(`That setup can't be used: ${problems.join("; ")}`, true);
  if (model.headers.length > 0) { ensureHeaders(setup); model.setup = setup; } else pendingSetup = setup;
  status(`Setup "${setup.sourceName}" loaded.` + (model.headers.length > 0 ? "" : " Now pick the Upload file."));
  refresh();
}

const wire = (id: string, handler: (file: File) => Promise<void>) =>
  document.getElementById(id)?.addEventListener("change", (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handler(file).catch((err: unknown) => status(`Could not read that file: ${String(err)}`, true));
  });
wire("gifts", onGiftFile);
wire("meta", onMetaFile);
wire("setupfile", onSetupFile);
document.getElementById("template")?.addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv" }));
  link.download = "outcomes-upload-template.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});
document.getElementById("forget")?.addEventListener("click", () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  Object.assign(model, { headers: [], rawGifts: [], codeBook: null, setup: null, result: null, unmapped: [], sel: null });
  pendingSetup = null;
  status("Saved setup forgotten. Pick the code book again, then the Upload file.");
  refresh();
});

restore();
status(model.codeBook ? "Pick the Upload file (CSV) to start. The saved code book and setup are ready." : "Open Configuration to pick the code book once, then pick the Upload file (CSV).");
refresh();
