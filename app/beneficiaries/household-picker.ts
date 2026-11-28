/**
 * household-picker.ts
 *
 * What it does: the way persons are put into a household in the beneficiary window (DECISIONS 242). Instead of a tick list of every person in the register, the household's members are chips, with a search box that finds a person by name, ID, guardian or area, a short list of the best matches (people who share a guardian or area with the members come first), and a drag or a click to add. When a person with a guardian is added, one button offers to add the others with the same guardian.
 * Who calls it: app/beneficiaries/register-form.ts draws it (pickerHtml); app/main.ts installs its clicks, typing and drag once (installHouseholdPicker). Depends on: the Beneficiary type and esc.
 * Data flow: the chips hold a hidden ticked box of class rg-member, which is what the window reads back when it saves, so the request is the same as before.
 * Rule: the matching and the ranking are pure functions (matchText, rankPersons), so they can be tested and ported.
 */
import type { Beneficiary } from "../../modules/07-beneficiaries/beneficiaries";
import { esc } from "../shared/pages";

// --- Pure rules ---
export const SHOWN = 8; // how many matches are listed at once. The rest are found by typing

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

// Rule: a person matches what was typed if every word is in their name, ID, guardian or area.
export function matchText(p: Beneficiary, text: string): boolean {
  const hay = norm(`${p.name} ${p.id} ${p.guardian} ${p.area}`);
  return norm(text).split(" ").filter((w) => w !== "").every((w) => hay.includes(w));
}

// Rule: persons who share a guardian (or, failing that, an area) with someone already in the household come first, then the rest by name. Those already in another household come last.
export function rankPersons(persons: Beneficiary[], members: Beneficiary[], inOther: Set<string> = new Set()): Beneficiary[] {
  const guardians = new Set(members.map((m) => norm(m.guardian)).filter((g) => g !== ""));
  const areas = new Set(members.map((m) => norm(m.area)).filter((a) => a !== ""));
  const score = (p: Beneficiary): number => (guardians.has(norm(p.guardian)) ? 2 : areas.has(norm(p.area)) ? 1 : 0);
  // A person already in another household comes after those who are free (DECISIONS 244).
  return [...persons].sort((a, b) => Number(inOther.has(a.id)) - Number(inOther.has(b.id)) || score(b) - score(a) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

// --- Drawing ---
const chip = (p: { id: string; name: string; from?: string }): string => `<span class="hh-chip${p.from ? " moves" : ""}" data-id="${esc(p.id)}"${p.from ? ` title="Moves from ${esc(p.from)} when saved"` : ""}><input type="checkbox" class="rg-member" value="${esc(p.id)}" checked hidden><b>${esc(p.name)}</b><span class="muted">${p.from ? `from ${esc(p.from)}` : esc(p.id)}</span><button type="button" data-hh-remove="${esc(p.id)}" aria-label="Take ${esc(p.name)} out">×</button></span>`;

export function pickerHtml(persons: Beneficiary[], memberIds: string[], households: Beneficiary[] = [], selfId = ""): string {
  const ids = new Set(memberIds);
  const members = persons.filter((p) => ids.has(p.id));
  // Rule (DECISIONS 244): a person in another household is shown with it, and the button says Move here. Saving takes them out of the other one.
  const homeOf = (p: Beneficiary): Beneficiary | undefined => households.find((h) => h.id !== selfId && h.memberIds.includes(p.id));
  const rest = rankPersons(persons.filter((p) => !ids.has(p.id)), members, new Set(persons.filter((p) => homeOf(p)).map((p) => p.id)));
  const item = (p: Beneficiary, n: number): string => {
    const home = homeOf(p);
    return `<li class="hh-item${home ? " moves" : ""}" draggable="true" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-guardian="${esc(p.guardian)}" data-home="${esc(home?.name ?? "")}" data-text="${esc(norm(`${p.name} ${p.id} ${p.guardian} ${p.area} ${home?.name ?? ""}`))}"${n >= SHOWN ? " hidden" : ""}><span><b>${esc(p.name)}</b> <span class="muted">${esc(p.id)}${p.guardian ? ` · ${esc(p.guardian)}` : ""}${p.area ? ` · ${esc(p.area)}` : ""}</span>${home ? ` <span class="hh-home" title="Saving this household takes them out of ${esc(home.name)}">in ${esc(home.name)} (${esc(home.id)})</span>` : ""}</span><button type="button" data-hh-add="${esc(p.id)}">${home ? "Move here" : "Add"}</button></li>`;
  };
  if (persons.length === 0) return `<span class="muted">No persons in the register yet.</span>`;
  return `<div class="hh-picker">
    <div class="hh-members" id="hh-members" aria-label="Persons in this household"><span class="hh-empty muted"${members.length ? " hidden" : ""}>Drag people here, or press Add.</span>${members.map(chip).join("")}</div>
    <div class="hh-same" id="hh-same" hidden></div>
    <label class="hh-search">Find a person<input id="hh-search" type="search" placeholder="Name, ID, guardian or area" autocomplete="off"></label>
    <ul class="hh-list" id="hh-list">${rest.map(item).join("")}</ul>
    <p class="muted hh-none" id="hh-none" hidden>No one matches.</p>
  </div>`;
}

// --- Behaviour (the page's own parts, not redrawn, so what is typed is kept) ---
const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const items = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>("#hh-list .hh-item"));

// Shows the first SHOWN of those that match the typed text and are not in the household.
function refresh(): void {
  const text = norm($<HTMLInputElement>("hh-search")?.value ?? "");
  let shown = 0;
  for (const li of items()) {
    const ok = !li.dataset["taken"] && text.split(" ").filter((w) => w !== "").every((w) => (li.dataset["text"] ?? "").includes(w));
    li.hidden = !ok || shown >= SHOWN;
    if (ok && shown < SHOWN) shown++;
  }
  const none = $("hh-none");
  if (none) none.hidden = shown > 0 || items().every((li) => li.dataset["taken"]);
  const empty = document.querySelector<HTMLElement>("#hh-members .hh-empty");
  if (empty) empty.hidden = document.querySelectorAll("#hh-members .hh-chip").length > 0;
}

// Rule: after adding a person with a guardian, one button offers the others with the same guardian.
function offerSameGuardian(guardian: string): void {
  const box = $("hh-same");
  if (!box) return;
  const others = items().filter((li) => !li.dataset["taken"] && guardian !== "" && norm(li.dataset["guardian"] ?? "") === norm(guardian));
  box.hidden = others.length === 0;
  box.innerHTML = others.length ? `<button type="button" data-hh-sameall="${esc(guardian)}">Add the ${others.length} other${others.length === 1 ? "" : "s"} with guardian ${esc(guardian)}</button>` : "";
}

function add(id: string): void {
  const li = items().find((x) => x.dataset["id"] === id);
  const zone = $("hh-members");
  if (!li || !zone || li.dataset["taken"]) return;
  li.dataset["taken"] = "1";
  zone.insertAdjacentHTML("beforeend", chip({ id, name: li.dataset["name"] ?? id, from: li.dataset["home"] ?? "" }));
  refresh();
  offerSameGuardian(li.dataset["guardian"] ?? "");
}

function remove(id: string): void {
  document.querySelector(`#hh-members .hh-chip[data-id="${CSS.escape(id)}"]`)?.remove();
  const li = items().find((x) => x.dataset["id"] === id);
  if (li) delete li.dataset["taken"];
  $("hh-same") && (($("hh-same") as HTMLElement).hidden = true);
  refresh();
}

export function installHouseholdPicker(): void {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest?.("[data-hh-add]") as HTMLElement | null;
    if (a) return add(a.dataset["hhAdd"] ?? "");
    const r = t.closest?.("[data-hh-remove]") as HTMLElement | null;
    if (r) return remove(r.dataset["hhRemove"] ?? "");
    const all = t.closest?.("[data-hh-sameall]") as HTMLElement | null;
    if (all) for (const li of items().filter((x) => !x.dataset["taken"] && norm(x.dataset["guardian"] ?? "") === norm(all.dataset["hhSameall"] ?? ""))) add(li.dataset["id"] ?? "");
    if (all) { const box = $("hh-same"); if (box) box.hidden = true; }
  });
  document.addEventListener("input", (e) => { if ((e.target as HTMLElement).id === "hh-search") refresh(); });
  // Drag a person from the list into the household. A click on Add does the same, for those who do not drag.
  document.addEventListener("dragstart", (e) => {
    const li = (e.target as HTMLElement).closest?.(".hh-item") as HTMLElement | null;
    if (li && e.dataTransfer) { e.dataTransfer.setData("text/plain", li.dataset["id"] ?? ""); e.dataTransfer.effectAllowed = "copy"; }
  });
  document.addEventListener("dragover", (e) => { if ((e.target as HTMLElement).closest?.("#hh-members")) { e.preventDefault(); $("hh-members")?.classList.add("over"); } });
  document.addEventListener("dragleave", (e) => { if ((e.target as HTMLElement).closest?.("#hh-members")) $("hh-members")?.classList.remove("over"); });
  document.addEventListener("drop", (e) => {
    if (!(e.target as HTMLElement).closest?.("#hh-members")) return;
    e.preventDefault();
    $("hh-members")?.classList.remove("over");
    add(e.dataTransfer?.getData("text/plain") ?? "");
  });
}
