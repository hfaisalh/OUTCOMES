/**
 * beneficiary-window.ts
 *
 * What it does: the pop-up window that adds or changes one beneficiary on the staff Beneficiaries page (DECISIONS 163): opening it (from a row or from New person or New household), reading what was typed (including the place chosen in the place picker, DECISIONS 274), saving and removing. Erasing and exporting one person's data are in app/main.ts for now.
 * Who calls it: loaded by app/main.ts, which gets `renderBenWindow` and `placeOfWindow`; the button handlers register themselves on the page when this file is loaded. Depends on: the shared state (state.ts), the shell's calls (shell.ts), the window helpers (shared/windows.ts) and the beneficiary form (register-form.ts).
 * Data flow: a click sets state.benWin and draws the window; Save reads the fields, sends a request through the shell, and on a refusal draws the window again with what was typed and the reason.
 */

import { shell } from "../shell";
import { state } from "../state";
import { dropWindow, putWindow } from "../shared/windows";
import { registerFormHtml } from "../beneficiaries/register-form";
import { standingOf } from "../../modules/07-beneficiaries/waiting";
import { type Beneficiary } from "../../modules/07-beneficiaries/beneficiaries";

// ---- The Beneficiaries page and its window (DECISIONS 163) ----
// The window that adds or changes one beneficiary, drawn outside the page that is redrawn. `draft` keeps what was typed when a save is refused.
// The place chosen in a place picker on screen (DECISIONS 274), as the fields a request carries: its id, and the place itself so the server can keep it once.
export function placeOfWindow(): Record<string, unknown> {
  const get = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
  let location: unknown;
  try { location = get("pe-location") === "" ? undefined : JSON.parse(get("pe-location")); } catch { location = undefined; }
  return { locationId: get("pe-locationId"), ...(location ? { location } : {}) };
}
export function renderBenWindow(error = "", draft?: Partial<Beneficiary>): void {
  const w = state.benWin;
  let root = document.getElementById("ben-root");
  if (!w.open) { dropWindow(root); return; }
  if (!root) { root = document.createElement("div"); root.id = "ben-root"; document.body.appendChild(root); }
  const existing = state.beneficiaries.records.find((r) => r.id === w.id);
  const persons = state.beneficiaries.records.filter((r) => r.kind === "person");
  putWindow(root, registerFormHtml(draft ?? existing ?? {}, w.id, existing?.kind ?? w.kind, persons, error, state.projects.map((p) => ({ id: p.id, name: p.name })), state.beneficiaries.records.filter((r) => r.kind === "household"), state.giftProjects.map((p) => ({ id: p.id, name: p.name })), existing ? standingOf(state.beneficiaries, state.enrolments, state.giftProjects, existing) : ""));
}
// What the window holds, as the fields of a request.
function readBenWindow(): Record<string, unknown> {
  const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null)?.value ?? "";
  let location: unknown; // the place chosen from the list, if any (DECISIONS 274)
  try { const raw = val("pe-location"); location = raw === "" ? undefined : JSON.parse(raw); } catch { location = undefined; }
  return {
    locationId: val("pe-locationId"), ...(location ? { location } : {}),
    name: val("rg-name"), dob: val("rg-dob"), gender: val("rg-gender"), guardian: val("rg-guardian"), guardianRelation: val("rg-guardianrel"), placeOfBirth: val("rg-pob"), idNumber: val("rg-idnumber"), fatherStatus: val("rg-father"), motherStatus: val("rg-mother"), eligibility: val("rg-eligibility"), eligibilityNote: val("rg-eligibilitynote"), partnerId: val("rg-partner"), partnerRef: val("rg-partnerref"), targetProjectId: val("rg-target"), priority: (document.getElementById("rg-priority") as HTMLInputElement | null)?.checked === true, priorityNote: val("rg-prioritynote"), area: val("rg-area"), notes: val("rg-notes"), size: val("rg-size"),
    memberIds: [...document.querySelectorAll<HTMLInputElement>(".rg-member:checked")].map((c) => c.value),
    allowSimilar: (document.getElementById("rg-different") as HTMLInputElement | null)?.checked === true,
  };
}
document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest?.("[data-bn]") as HTMLElement | null;
  if (!el) return;
  const what = el.dataset.bn;
  if (what === "new") { state.benWin = { open: true, id: "", kind: el.dataset.kind === "household" ? "household" : "person" }; return renderBenWindow(); }
  if (what === "open") { state.benWin = { open: true, id: el.dataset.id ?? "", kind: "person" }; return renderBenWindow(); }
  if (!state.benWin.open) return;
  if (what === "cancel") { state.benWin = { ...state.benWin, open: false }; return renderBenWindow(); }
  if (what === "save") {
    const f = readBenWindow();
    const isNew = state.benWin.id === "";
    const status = (document.getElementById("rg-status") as HTMLSelectElement | null)?.value ?? "";
    const draft: Partial<Beneficiary> = { name: String(f["name"]), dob: String(f["dob"]), gender: f["gender"] as Beneficiary["gender"], guardian: String(f["guardian"]), guardianRelation: String(f["guardianRelation"]), placeOfBirth: String(f["placeOfBirth"]), idNumber: String(f["idNumber"]), fatherStatus: f["fatherStatus"] as Beneficiary["fatherStatus"], motherStatus: f["motherStatus"] as Beneficiary["motherStatus"], eligibility: f["eligibility"] as Beneficiary["eligibility"], eligibilityNote: String(f["eligibilityNote"]), partnerId: String(f["partnerId"]), partnerRef: String(f["partnerRef"]), area: String(f["area"]), locationId: String(f["locationId"]), notes: String(f["notes"]), memberIds: f["memberIds"] as string[], ...(String(f["size"]) !== "" ? { size: Number(f["size"]) } : {}), ...(status !== "" ? { status: status as Beneficiary["status"] } : {}) };
    const body = isNew ? { action: "ben-add", kind: state.benWin.kind, ...f } : { action: "ben-set", id: state.benWin.id, status, ...f };
    void shell.outcomeChange(body).then(() => {
      if (shell.lastError() !== "") return renderBenWindow(shell.lastError(), draft);
      state.benWin = { ...state.benWin, open: false };
      renderBenWindow();
    });
  }
  if (what === "remove") {
    void shell.outcomeChange({ action: "ben-remove", id: state.benWin.id }).then(() => {
      if (shell.lastError() !== "") return renderBenWindow(shell.lastError());
      state.benWin = { ...state.benWin, open: false };
      renderBenWindow();
    });
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.benWin.open) { state.benWin = { ...state.benWin, open: false }; renderBenWindow(); }
  const row = (e.target as HTMLElement).closest?.(".rowlink[data-bn]") as HTMLElement | null;
  if (row && e.key === "Enter") { state.benWin = { open: true, id: row.dataset.id ?? "", kind: "person" }; renderBenWindow(); }
});

