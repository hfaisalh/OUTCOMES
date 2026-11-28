/**
 * workflow-events.ts
 *
 * What it does: what happens when a person changes something on the Benefits page and the Workflows page (DECISIONS 103, 107, 130, 131, 137 to 146): outcome types and their profile fields, the icon of an item, moving an item into a workflow, a workflow's stages, tasks, decisions and flags. Each button or field is one change.
 * Who calls it: loaded by app/main.ts; its handlers register themselves on the page when it is loaded. Depends on: the shared state (state.ts), the shell's calls (shell.ts) and the workflow and outcome type rules in the modules.
 * Data flow: a click or a change builds the new setup with the pure rules, or sends a request through the shell, then asks the shell to save and draw again.
 */

import { shell } from "../shell";
import { state } from "../state";
import { updateTemplate, type FrameworkTemplate } from "../../modules/02-project-rules/categories";
import { addTask, assignToWorkflow, removeTask, setTask, setUnitRule, setFlag, setConfirm, addStage, setStage, removeStage, moveStage, setAssign, setFulfilled, unassignItem } from "../../modules/02-project-rules/workflows";
import { csvChange } from "../portal/partner-csv-session";

// ---- Outcome types on the Categories and frameworks page (DECISIONS 103) ----
// Buttons carry data-ot-act, fields and drop-downs carry data-ot. Each becomes one request, applied on the server when live and in the browser in the demo.
document.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest?.("[data-ot-act]") as HTMLElement | null;
  if (!b) return;
  const typeId = b.dataset.typeId ?? "";
  const fieldId = b.dataset.fieldId ?? "";
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? "";
  switch (b.dataset.otAct) {
    case "add": return void shell.outcomeChange({ action: "ot-add", name: val("newot") });
    case "remove": return void shell.outcomeChange({ action: "ot-remove", typeId });
    case "up": return void shell.outcomeChange({ action: "ot-field-move", typeId, fieldId, by: -1 });
    case "down": return void shell.outcomeChange({ action: "ot-field-move", typeId, fieldId, by: 1 });
    case "field-remove": return void shell.outcomeChange({ action: "ot-field-remove", typeId, fieldId });
    case "field-add": return void shell.outcomeChange({ action: "ot-field-add", typeId, label: val(`otf-label-${typeId}`), kind: val(`otf-kind-${typeId}`) });
  }
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  // The partner's CSV window (DECISIONS 271): a file, the project or the tick was changed. The file is read in the browser.
  // A cell of a row can be edited with Tab, so the redraw puts focus back on whatever the person moved to.
  if (state.gate === "partner" && t.id.startsWith("pc-")) { setTimeout(() => { const next = (document.activeElement as HTMLElement | null)?.id ?? ""; void csvChange({ id: t.id, value: t.value, checked: (t as HTMLInputElement).checked, files: (t as HTMLInputElement).files }, state.partnerSlice?.giftProjects ?? []).then((changed) => { if (!changed) return; shell.draw(); if (t.id === "pc-file") document.getElementById("pc-summary")?.focus(); else if (next !== "") document.getElementById(next)?.focus(); }); }, 0); return; }
  const what = t.dataset?.ot;
  if (what === undefined) return;
  const typeId = t.dataset["typeId"] ?? "";
  const fieldId = t.dataset["fieldId"] ?? "";
  if (what === "icon") void shell.outcomeChange({ action: "ot-icon", typeId, icon: t.value });
  else if (what === "rename") void shell.outcomeChange({ action: "ot-rename", typeId, name: t.value });
  else if (what === "prefix") void shell.outcomeChange({ action: "ot-prefix", typeId, prefix: t.value });
  else if (what === "source") void shell.outcomeChange({ action: "ot-source", typeId, source: t.value });
  else if (what === "assign") void shell.outcomeChange({ action: "ot-assign", typeId, assign: t.value });
  else if (what === "framework") void shell.outcomeChange({ action: "ot-framework", typeId, frameworkId: t.dataset["frameworkId"] ?? "", on: (t as HTMLInputElement).checked });
  else if (what === "required") void shell.outcomeChange({ action: "ot-field-set", typeId, fieldId, required: (t as HTMLInputElement).checked });
  else if (what === "inreport") void shell.outcomeChange({ action: "ot-field-set", typeId, fieldId, inReport: (t as HTMLInputElement).checked });
  else if (what === "options") void shell.outcomeChange({ action: "ot-field-set", typeId, fieldId, options: t.value });
});

// The icon of an item, chosen on the Categories and frameworks page (DECISIONS 107).
document.addEventListener("change", (e) => {
  const t = e.target as HTMLSelectElement;
  if (t.dataset?.iconItem !== undefined) void shell.outcomeChange({ action: "item-icon", itemId: t.dataset.iconItem, icon: t.value });
  if (t.dataset?.kf !== undefined) {
    const kind = t.dataset.kind ?? "", fieldId = t.dataset.fieldId ?? "", what = t.dataset.kf;
    const checked = (t as unknown as HTMLInputElement).checked;
    if (what === "what") void shell.outcomeChange({ action: "kf-what", kind, what: t.value });
    else if (what === "prefix") void shell.outcomeChange({ action: "kf-prefix", kind, prefix: t.value });
    else if (what === "dup") void shell.outcomeChange({ action: "kf-dup", kind, fieldId, on: checked });
    else if (what === "onend") void shell.outcomeChange({ action: "kf-onend", kind, value: t.value });
    else if (what === "prop") void shell.outcomeChange({ action: "kf-prop", kind, prop: t.dataset.prop ?? "", value: t.dataset.prop === "receiver" ? t.value : checked });
    else if (what === "label") void shell.outcomeChange({ action: "kf-field-set", kind, fieldId, label: t.value });
    else if (what === "type") void shell.outcomeChange({ action: "kf-field-set", kind, fieldId, type: t.value });
    else if (what === "required") void shell.outcomeChange({ action: "kf-field-set", kind, fieldId, required: checked });
    else if (what === "inreport") void shell.outcomeChange({ action: "kf-field-set", kind, fieldId, inReport: checked });
    else if (what === "options") void shell.outcomeChange({ action: "kf-field-set", kind, fieldId, options: t.value });
  }
  if (t.dataset?.kindItem !== undefined) void shell.outcomeChange({ action: "item-kind", itemId: t.dataset.kindItem, kind: t.value });
});

// ---- The Workflows page (DECISIONS 130, 131) ----
// Puts an item in a workflow (or takes it out, when the workflow is empty). An item is in one workflow only, so this replaces any earlier one.
function moveItem(itemId: string, workflowId: string): void {
  const setup = shell.setupNow();
  const r = workflowId === "" ? { value: unassignItem(setup, itemId), error: undefined as string | undefined } : assignToWorkflow(setup, itemId, workflowId);
  if (r.error) { state.message = r.error; return shell.draw(); }
  state.categories = r.value.categories; state.itemCategories = r.value.itemMap; state.itemFramework = r.value.itemFramework;
  state.message = "";
  shell.afterConfig(); // in the demo the sample feed is read again, so gifts of the item are routed
  shell.draw();
}
document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  // Items are put in a workflow with the switch on the Items list (DECISIONS 133), handled on change.
  // The icon library popup (DECISIONS 135): open, choose, OK keeps it, Cancel leaves it.
  const iconOpen = t.closest?.("[data-wf-iconopen]") as HTMLElement | null;
  if (iconOpen) { const w = state.frameworks.find((x) => x.id === iconOpen.dataset.wfIconopen); state.workflowSel = { ...state.workflowSel, iconPick: w?.icon || "bullseye" }; return shell.draw(); }
  const iconChoose = t.closest?.("[data-wf-iconchoose]") as HTMLElement | null;
  if (iconChoose) { state.workflowSel = { ...state.workflowSel, iconPick: iconChoose.dataset.wfIconchoose ?? "" }; return shell.draw(); }
  if (t.closest?.("[data-wf-iconcancel]")) { const { iconPick: _i, ...rest } = state.workflowSel; state.workflowSel = rest; return shell.draw(); }
  const iconOk = t.closest?.("[data-wf-iconok]") as HTMLElement | null;
  if (iconOk) {
    const { iconPick, ...rest } = state.workflowSel;
    state.frameworks = updateTemplate(state.frameworks, iconOk.dataset.wfIconok ?? "", { icon: iconPick || undefined });
    state.workflowSel = rest;
    shell.afterConfig(false);
    return shell.draw();
  }
  const kindPick = t.closest?.("[data-kind-select]") as HTMLElement | null;
  if (kindPick) { state.kindSel = kindPick.dataset.kindSelect ?? ""; return shell.draw(); }
  const kfAct = t.closest?.("[data-kf-act]") as HTMLElement | null;
  if (kfAct) {
    const kind = kfAct.dataset.kind ?? "", fieldId = kfAct.dataset.fieldId ?? "";
    const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null)?.value ?? "";
    switch (kfAct.dataset.kfAct) {
      case "field-add": return void shell.outcomeChange({ action: "kf-field-add", kind, label: val(`kf-label-${kind}`), type: val(`kf-type-${kind}`) });
      case "field-remove": return void shell.outcomeChange({ action: "kf-field-remove", kind, fieldId });
      case "up": return void shell.outcomeChange({ action: "kf-field-move", kind, fieldId, by: -1 });
      case "down": return void shell.outcomeChange({ action: "kf-field-move", kind, fieldId, by: 1 });
      case "reset": return void shell.outcomeChange({ action: "kf-reset", kind });
    }
    return;
  }
  const pick = t.closest?.("[data-wf-select]") as HTMLElement | null;
  if (pick) { state.workflowSel = { ...state.workflowSel, id: pick.dataset.wfSelect ?? "", stage: 1 }; return shell.draw(); }
  const stage = t.closest?.("[data-wf-stage]") as HTMLElement | null;
  if (stage) { state.workflowSel = { ...state.workflowSel, stage: Number(stage.dataset.wfStage) }; return shell.draw(); }
  const act = t.closest?.("[data-wf-act]") as HTMLElement | null;
  if (!act) return;
  const id = act.dataset.wf ?? "";
  const set = (r: { frameworks: FrameworkTemplate[] } | { error: string }) => { if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; state.message = ""; shell.afterConfig(false); shell.draw(); } };
  if (act.dataset.wfAct === "task-add") {
    const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null);
    set(addTask(state.frameworks, id, val("wf-task-label")?.value ?? "", Number(val("wf-task-after")?.value ?? "0"), val("wf-task-photo")?.checked === true));
  } else if (act.dataset.wfAct === "task-remove") set(removeTask(state.frameworks, id, act.dataset.task ?? ""));
  else if (act.dataset.wfAct === "sub-add") {
    const val = (i: string) => (document.getElementById(i) as HTMLInputElement | null);
    set(addStage(state.frameworks, id, val("wf-sub-label")?.value ?? "", Number(val("wf-sub-days")?.value ?? "14")));
  } else if (act.dataset.wfAct === "sub-remove") set(removeStage(state.frameworks, id, act.dataset.sub ?? ""));
  else if (act.dataset.wfAct === "sub-up") set(moveStage(state.frameworks, id, act.dataset.sub ?? "", -1));
  else if (act.dataset.wfAct === "sub-down") set(moveStage(state.frameworks, id, act.dataset.sub ?? "", 1));
});
document.addEventListener("change", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.id === "wf-sim-parts") { state.workflowSel = { ...state.workflowSel, parts: Number(t.value) }; return shell.draw(); }
  if (t.id === "wf-sim-alloc") { state.workflowSel = { ...state.workflowSel, allocated: (t as HTMLInputElement).checked }; return shell.draw(); }
  // An unrouted gift: choose a workflow for its item, and the item moves into it (DECISIONS 131).
  if (t.dataset?.assignWf !== undefined) { if (t.value !== "") moveItem(t.dataset.assignWf, t.value); return; }
  // How a unit supports an outcome (DECISIONS 131).
  if (t.dataset?.itemUnits !== undefined) { void shell.outcomeChange({ action: "item-units", itemId: t.dataset.itemUnits, units: (t as HTMLInputElement).value }); return; }
  if (t.dataset?.wfFulfilled !== undefined) {
    const r = setFulfilled(state.frameworks, t.dataset.wfFulfilled, t.value);
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  if (t.dataset?.itemTl !== undefined) { const [id, part] = t.dataset.itemTl.split("|"); void shell.outcomeChange({ action: "item-timeline", itemId: id, part, value: (t as HTMLSelectElement).value }); return; }
  if (t.dataset?.wfToggle !== undefined) { moveItem(t.dataset.wfToggle, (t as HTMLInputElement).checked ? (t.dataset.wf ?? "") : ""); return; }
  if (t.dataset?.wfShares !== undefined || t.dataset?.wfFull !== undefined) {
    const id = (t.dataset.wfShares ?? t.dataset.wfFull) as string;
    const f = state.frameworks.find((x) => x.id === id);
    const full = t.dataset.wfFull !== undefined ? (t as HTMLInputElement).checked : f?.instalment === "share_of_whole";
    const units = t.dataset.wfShares !== undefined ? Number(t.value) : Math.max(1, f?.unitsPerBeneficiary ?? 1);
    const r = setUnitRule(state.frameworks, id, units, full);
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  // The outcome type of a workflow: a type belongs to at most one workflow, so choosing it takes it from the other (DECISIONS 103, 130).
  if (t.dataset?.wfType !== undefined) {
    const fid = t.dataset.wfType;
    const current = state.outcomeTypes.find((x) => x.frameworkIds.includes(fid));
    if (t.value === "" && current) void shell.outcomeChange({ action: "ot-framework", typeId: current.id, frameworkId: fid, on: false });
    else if (t.value !== "") void shell.outcomeChange({ action: "ot-framework", typeId: t.value, frameworkId: fid, on: true });
    return;
  }
  // Assigned for implementation (DECISIONS 137): how the handoff happens, and the partner's stages.
  if (t.dataset?.wfAssign !== undefined) {
    const r = setAssign(state.frameworks, t.dataset.wfAssign, t.value === "auto" ? "auto" : "suggest");
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  if (t.dataset?.wfFlag !== undefined) {
    const r = setFlag(state.frameworks, t.dataset.wf ?? "", t.dataset.wfFlag as "reassign" | "urgent" | "approve" | "feedback", (t as HTMLInputElement).checked);
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  if (t.dataset?.wfConfirm !== undefined) {
    const r = setConfirm(state.frameworks, t.dataset.wf ?? "", t.dataset.wfConfirm === "days" ? { days: Number(t.value) } : { tell: t.value });
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  const sub = t.dataset?.wfSub;
  if (sub !== undefined) {
    const fid = t.dataset.wf ?? "", sid = t.dataset.sub ?? "";
    const checked = (t as HTMLInputElement).checked;
    const r = setStage(state.frameworks, fid, sid, sub === "label" ? { label: t.value } : sub === "days" ? { days: Number(t.value) } : sub === "needs" ? { needs: t.value } : sub === "tell" ? { tell: t.value } : sub === "photo" ? { photo: checked } : { canPause: checked });
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); shell.draw(); }
    return;
  }
  const task = t.dataset?.wfTask;
  if (task !== undefined) {
    const fid = t.dataset.wf ?? "", tid = t.dataset.task ?? "";
    const r = setTask(state.frameworks, fid, tid, task === "label" ? { label: t.value } : task === "after" ? { afterMonths: Number(t.value) } : { photo: (t as HTMLInputElement).checked });
    if ("error" in r) { state.message = r.error; shell.draw(); } else { state.frameworks = r.frameworks; shell.afterConfig(false); }
    return;
  }
});

