/**
 * workflows-page.ts
 *
 * What it does: the Workflows page (DECISIONS 130). A workflow is what happens to a kind of gift from payment to donor report. The page lists the workflows, shows the chosen one as
 * a plain sentence and a flow of six stages (click a stage to edit its rules), a sample gift that draws the units the way Allocation does, and the items with their workflow,
 * icon. Items are dragged onto workflows, and an item is in one workflow only. There is no category here. One page replaces the framework cards, the outcome types card and the icons card.
 * Who calls it: app/main.ts. Depends on: modules/02-project-rules/workflows.ts, app/outcome-types-card.ts, app/icons.ts and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { CYCLE_LABELS, type Cycle, type FrameworkTemplate } from "../modules/02-project-rules/categories";
import { outcomeName, STAGES, stageChips, unitModeLabels, unitModeOf, workflowSentence, type UnitMode } from "../modules/02-project-rules/workflows";
import { typeForFramework, type OutcomeType } from "../modules/05-outcomes/outcome-types";
import { ICONS, iconHtml, itemIcon } from "./icons";
import { outcomeTypeEditor } from "./outcome-types-card";
import { esc, type View } from "./pages";

const ARROW = `<div class="wf-arrow" aria-hidden="true">&rarr;</div>`;
const TICK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const BIN = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>`;

// The slices of one orphan, drawn as the Allocation view does: green if allocated, orange if expected, grey for what is not this gift's.
function pies(parts: number, slots: number, allocated: boolean): string {
  const total = Math.max(1, parts);
  const n = Math.min(8, Math.ceil(total / slots));
  const colour = allocated ? "#1f8a4c" : "#e08a1e";
  const one = (held: number): string => {
    const R = 14, C = 2 * Math.PI * R, len = C / slots;
    const arcs = Array.from({ length: slots }, (_, i) => `<circle cx="18" cy="18" r="${R}" fill="none" stroke="${i < held ? colour : "var(--line)"}" stroke-width="9" stroke-dasharray="${slots === 1 ? C : Math.max(len - 2, 0.5)} ${C}" stroke-dashoffset="${-i * len}" transform="rotate(-90 18 18)"/>`).join("");
    return `<svg viewBox="0 0 36 36" width="44" height="44" role="img" aria-label="${held} of ${slots} units">${arcs}</svg>`;
  };
  return Array.from({ length: n }, (_, i) => one(Math.min(slots, total - i * slots))).join("");
}

function stagePanel(f: FrameworkTemplate, type: OutcomeType | undefined, stage: number, v: View): string {
  const t = `data-tplid="${esc(f.id)}"`;
  const used = Object.fromEntries((v.outcomeTypes ?? []).map((x) => [x.id, (v.outcomes ?? []).filter((o) => o.outcomeTypeId === x.id).length]));
  const needType = `<p class="muted">Choose an outcome type for this workflow in stage 2 first.</p>`;
  if (stage === 1) {
    const name = outcomeName(f, type);
    const mode = unitModeOf(f);
    const labels = unitModeLabels(name);
    return `<h3>A unit supports</h3>
    <label class="wf-field"><span>A unit supports</span><select data-wf-mode="${esc(f.id)}">${mode === undefined ? `<option value="" selected>Choose...</option>` : ""}${(Object.keys(labels) as UnitMode[]).map((k) => `<option value="${k}"${mode === k ? " selected" : ""}>${esc(labels[k])}</option>`).join("")}</select></label>
    ${mode === "share" ? `<label class="wf-field"><span>Units that make one ${esc(name)}</span><input type="number" min="2" max="100" step="1" data-wf-shares="${esc(f.id)}" value="${f.unitsPerBeneficiary}"></label>` : ""}
    <p class="muted">${mode === "share" ? `Several units together support one ${esc(name)}, so several donors can share one.` : mode === "whole" ? `One unit supports one whole ${esc(name)}, month by month.` : mode === "once" ? `One unit funds one whole ${esc(name)}. The gift waits until it is fully paid, then it is released.` : `Say how a unit supports an outcome.`} What a unit is, and whether it is paid monthly or at once, is already settled in Gifts.</p>`;
  }
  if (stage === 2) return `<h3>What the gift becomes</h3>
    <label class="wf-field"><span>Outcome type</span><select data-wf-type="${esc(f.id)}"><option value="">No outcome type yet</option>${(v.outcomeTypes ?? []).map((x) => `<option value="${esc(x.id)}"${type?.id === x.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
    ${type ? outcomeTypeEditor(type, [], used, { assign: false, frameworks: false, remove: false }) : `<p class="muted">An outcome is the specific thing a gift becomes: an orphan, a pump, a house. Choose a type, or add a new one below.</p>`}
    <div class="ot-add"><input id="newot" placeholder="A new outcome type, for example Rickshaw"><button data-ot-act="add">Add type</button></div>`;
  if (stage === 3) return `<h3>When it is released</h3>${f.instalment === "share_of_whole"
    ? `<p>The unit funds one whole ${esc(outcomeName(f, type))}. The gift <b>waits as Funding</b> until it is fully paid, and only then can it go to a partner. A one-off payment in full is released at once.</p>`
    : `<p>The unit supports month by month, so the gift is <b>released each month</b> as it is paid. Nothing waits.</p>`}
    <p class="muted">If payments stop before the end, the gift stays parked as Paused or Cancelled. Nothing is cancelled or released by the system itself.</p>`;
  if (stage === 4) return `<h3>Assigned to a partner</h3>${type ? `<label class="wf-field"><span>Assigned</span><select data-ot="assign" data-type-id="${esc(type.id)}"><option value="auto"${type.assign === "auto" ? " selected" : ""}>Automatically, when a partner has capacity</option><option value="suggest"${type.assign === "suggest" ? " selected" : ""}>Only suggested to a person</option></select></label>` : needType}
    <p class="muted">Priority when several are waiting: a donor's directed project or partner, then a deadline, then an urgent flag, then the oldest paid first. A partner only gets what it delivers and is approved for. Each partner sets its capacity on its own profile.</p>`;
  if (stage === 5) return `<h3>The partner does the work</h3>${type ? `<p>Needed before a partner takes it: <b>${type.fields.filter((x) => x.required).map((x) => esc(x.label)).join(", ") || "nothing"}</b>.</p><p class="muted">The partner fills in the rest (${esc(type.fields.filter((x) => !x.required).map((x) => x.label).slice(0, 5).join(", "))}) as the work happens. Change which fields are needed first in stage 2.</p>` : needType}`;
  return `<h3>Updates and the donor report</h3>
    <div class="wf-two"><label class="wf-field"><span>The report the donor gets</span><input data-tpl="reportType" ${t} value="${esc(f.reportType)}" placeholder="Quarterly update"></label>
    <label class="wf-field"><span>How often the donor hears back</span><select data-tpl="cycle" ${t}>${(Object.keys(CYCLE_LABELS) as Cycle[]).map((y) => `<option value="${y}"${y === f.cycle ? " selected" : ""}>${esc(CYCLE_LABELS[y])}</option>`).join("")}</select></label></div>
    <table class="wf-tasks"><thead><tr><th>Task for the partner or caseworker</th><th class="num">Due after (months)</th><th>Photo</th><th class="actcol"></th></tr></thead><tbody>
      ${(f.tasks ?? []).map((k) => `<tr><td><input data-wf-task="label" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" value="${esc(k.label)}"></td><td class="num"><input type="number" min="0" max="120" data-wf-task="after" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" value="${k.afterMonths}"></td><td class="c"><input type="checkbox" data-wf-task="photo" data-wf="${esc(f.id)}" data-task="${esc(k.id)}"${k.photo ? " checked" : ""} aria-label="Asks for a photo"></td><td class="actcol"><div class="actbox"><button class="iconact" data-wf-act="task-remove" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" title="Remove this task" aria-label="Remove this task">${BIN}</button></div></td></tr>`).join("") || `<tr><td colspan="4" class="muted">No tasks yet.</td></tr>`}
    </tbody></table>
    <div class="ot-add"><input id="wf-task-label" placeholder="New task, for example 3 month basic check"><input id="wf-task-after" type="number" min="0" max="120" value="3" aria-label="Due after months" style="width:90px"><label class="ot-check"><input type="checkbox" id="wf-task-photo"> photo</label><button class="iconact ok" data-wf-act="task-add" data-wf="${esc(f.id)}" title="Add the task" aria-label="Add the task">${TICK}</button></div>
    <p class="muted">Tasks say what will be asked and when. They are not created yet: that comes with the Updates page.</p>`;
}

export function workflowsPage(v: View): string {
  const fws = v.frameworks ?? [];
  const types = v.outcomeTypes ?? [];
  const sel = v.workflowSel ?? { id: "", stage: 1, parts: 1, allocated: false, pick: "" };
  const items = v.flaggedItems;
  const itemFw = v.itemFramework ?? {};
  const effective = (itemId: string): string => itemFw[itemId] ?? v.categories.find((c) => c.id === v.itemCategories[itemId])?.frameworkId ?? "";
  const itemsOf = (fid: string) => items.filter((i) => effective(i.id) === fid);
  const typeIcon = (fid: string) => typeForFramework(types, fid)?.icon ?? "";
  const iconOfWorkflow = (fid: string): string => typeIcon(fid) || itemIcon(itemsOf(fid)[0]?.id ?? "", itemsOf(fid)[0]?.name ?? "", v.itemIcons ?? {});
  const f = fws.find((x) => x.id === sel.id) ?? fws[0];
  const stage = Math.min(6, Math.max(1, sel.stage));

  const list = `<div class="card"><h3 class="wf-h">Workflows <span class="muted">(${fws.length})</span></h3><div class="wlist">${fws.map((x) => `<button class="wbtn${x.id === f?.id ? " on" : ""}" data-wf-select="${esc(x.id)}" data-wf-drop="${esc(x.id)}">${iconHtml(iconOfWorkflow(x.id), x.name, "lg") || `<span class="ico ico-lg"></span>`}<span><b>${esc(x.name)}</b><small>${itemsOf(x.id).length} item${itemsOf(x.id).length === 1 ? "" : "s"}</small></span></button>`).join("") || `<div class="empty">No workflows yet.</div>`}</div>
    <div class="actions"><input id="newfw" placeholder="New workflow name"><button data-action="add-framework">Add</button></div>
    <div class="actions"><button data-action="add-starters" title="Adds Orphan sponsorship, Student sponsorship, Water pump, House build, Livelihood and Activity, with their outcome types and tasks. Nothing you built is replaced.">Add the standard workflows</button></div>
    <p class="hint muted">A workflow is what happens to a kind of gift, from payment to donor report.</p></div>`;

  const nameOf = (id: string) => fws.find((x) => x.id === id)?.name ?? "";
  const unassigned = items.filter((i) => effective(i.id) === "");
  const pick = sel.pick ?? "";
  const chip = (i: { id: string; name: string }, suggested = ""): string => `<span class="chip wf-chip${pick === i.id ? " sel" : ""}" draggable="true" data-wf-item="${esc(i.id)}" title="Drag onto a workflow, or tap it and then tap a workflow">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}, typeIcon(effective(i.id))), i.name)} ${esc(i.name)}${suggested ? ` <small class="muted">${esc(nameOf(suggested))}?</small>` : ""}</span>`;
  const nSuggest = unassigned.filter((i) => v.workflowSuggestions?.[i.id] !== undefined).length;
  const poolCard = `<section class="card"><h2>Unassigned items <span class="muted">(${unassigned.length})</span></h2>
    <p class="muted">Drag an item onto a workflow, or tap an item and then a workflow. An item is in one workflow only: once it is placed it is no longer here.</p>
    <div class="actions"><button data-action="suggest-workflows"${nSuggest ? "" : " disabled"}>Suggest ${nSuggest} workflow${nSuggest === 1 ? "" : "s"} from the item names</button>
      <button data-action="apply-frameworks" title="Gifts keep the workflow they were made under. This moves every one to the workflow that now applies to its item.">Apply to existing gifts</button></div>
    <div class="zone wf-pool" data-wf-drop="">${unassigned.map((i) => chip(i, v.workflowSuggestions?.[i.id] ?? "")).join("") || `<span class="muted">Every item is in a workflow.</span>`}</div></section>`;
  const iconsCard = `<details class="card"><summary><b>Item icons</b> <span class="muted">(${items.length})</span></summary><p class="muted">Each item has an icon in the Gifts list. One is suggested from its name. Choose another if it does not fit.</p>
    <div class="tablewrap"><table class="subtable"><tbody>${[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => `<tr><td class="c">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}, typeIcon(effective(i.id))), i.name)}</td><td>${esc(i.name)}</td><td><select data-icon-item="${esc(i.id)}" aria-label="Icon of ${esc(i.name)}"><option value=""${v.itemIcons?.[i.id] ? "" : " selected"}>Suggested</option>${ICONS.map((x) => `<option value="${x.id}"${v.itemIcons?.[i.id] === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div></details>`;
  const itemsCard = `${poolCard}${iconsCard}`;

  if (!f) return `<h1>Workflows</h1><p class="sub">What happens to a gift, from payment to donor report.</p>${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}<div class="wf-layout">${list}<div class="card empty">Add the standard workflows to start, or add your own.</div></div>${itemsCard}`;

  const type = typeForFramework(types, f.id);
  const chips = stageChips(f, type);
  const sentence = workflowSentence(f, type, itemsOf(f.id).map((i) => i.name));
  const slots = Math.max(1, f.unitsPerBeneficiary);
  const parts = Math.max(1, Math.min(9, sel.parts));
  const flow = STAGES.map((s, i) => `${i ? ARROW : ""}<button class="wf-node${s.n === stage ? " on" : ""}" data-wf-stage="${s.n}"><span class="n">Stage ${s.n}</span><b>${esc(s.title)}</b>${(chips[s.n] ?? []).map((c) => `<span class="chip ${c.tone}">${esc(c.text)}</span>`).join("")}</button>`).join("");
  const sim = `<div class="wf-rule"><h3>Try a sample gift</h3><div class="wf-sim"><label class="wf-field"><span>Units in the gift</span><select id="wf-sim-parts">${[1, 2, 3, 4, 6, 9].map((n) => `<option value="${n}"${n === parts ? " selected" : ""}>${n}</option>`).join("")}</select></label><label class="ot-check"><input type="checkbox" id="wf-sim-alloc"${sel.allocated ? " checked" : ""}> allocated</label></div>
    <div class="upies">${pies(parts, slots, sel.allocated)}</div>
    <div class="ukey muted"><i class="p"></i>allocated <i class="e"></i>expected, not allocated <i class="f"></i>not this gift's units</div>
    <p class="muted">${unitModeOf(f) === "once" ? `${parts} unit${parts === 1 ? "" : "s"} fund${parts === 1 ? "s" : ""} ${parts} ${esc(outcomeName(f, type))}${parts === 1 ? "" : "s"}, each released when fully paid.` : `${parts} unit${parts === 1 ? "" : "s"} support${parts === 1 ? "s" : ""} ${Math.ceil(parts / slots)} ${esc(outcomeName(f, type))}${Math.ceil(parts / slots) === 1 ? "" : "s"}${slots > 1 ? `, ${slots} units to each` : ""}.`}</p></div>`;

  return `<h1>Workflows</h1><p class="sub">What happens to a gift, from payment to donor report. Click a stage to see and change its rules.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="wf-layout">${list}
      <div class="wf-main">
        <div class="card"><div class="wf-head">${iconHtml(iconOfWorkflow(f.id), f.name, "lg")}<input class="title" data-fwrename="${esc(f.id)}" value="${esc(f.name)}" aria-label="Workflow name"><span class="muted">${itemsOf(f.id).length} item${itemsOf(f.id).length === 1 ? "" : "s"}</span>
          <button class="iconact" data-action="dup-framework" data-id="${esc(f.id)}" title="Copy this workflow" aria-label="Copy this workflow"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg></button>
          <button class="iconact" data-action="remove-framework" data-id="${esc(f.id)}" title="Remove this workflow" aria-label="Remove this workflow">${BIN}</button></div>
          <p class="wf-sentence">${esc(sentence)}</p>
          <h3 class="wf-h" style="margin-top:12px">Items in this workflow</h3><div class="zone wf-pool" data-wf-drop="${esc(f.id)}">${itemsOf(f.id).map((i) => chip(i)).join("") || `<span class="muted">Drop items here.</span>`}</div></div>
        <section class="card"><h3 class="wf-h">The flow</h3><div class="wf-flow">${flow}</div>
          <div class="wf-rules"><div class="wf-rule">${stagePanel(f, type, stage, v)}</div>${sim}</div></section>
      </div></div>
    ${itemsCard}`;
}
