/**
 * workflows-page.ts
 *
 * What it does: the Workflows page (DECISIONS 130). A workflow is what happens to a kind of gift from payment to donor report. The page lists the workflows, shows the chosen one as
 * a plain sentence and a flow of six stages (click a stage to edit its rules), a sample gift that draws the units the way Allocation does, and the items with their workflow,
 * icon. Items are dragged onto workflows, and an item is in one workflow only. There is no category here. One page replaces the framework cards, the outcome types card and the icons card.
 * Who calls it: app/main.ts. Depends on: modules/02-project-rules/workflows.ts, app/outcome-types-card.ts, app/icons.ts and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { CYCLE_LABELS, type Cycle, type FrameworkTemplate } from "../modules/02-project-rules/categories";
import { assignOf, confirmDaysOf, flagOf, outcomeName, totalDays, unitModeOf } from "../modules/02-project-rules/workflows";
import { typeForFramework, type OutcomeType } from "../modules/05-outcomes/outcome-types";
import { flowChart } from "./workflow-flowchart";
import { ICONS, iconHtml, itemIcon } from "./icons";
import { esc, type View } from "./pages";

const TICK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const BIN = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>`;

// Rule (DECISIONS 133): one outcome drawn as a pie of equal numbered slices, one per unit. Used by the page and redrawn on every keystroke by main.ts.
export function unitPie(slots: number): string {
  const n = Math.max(1, Math.min(100, Math.floor(slots) || 1));
  const R = 48, c = 50;
  const pt = (a: number, r: number): string => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  const shades = ["#2f6f4a", "#3f8c60"];
  const slices = Array.from({ length: n }, (_, i) => {
    const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / n, a1 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / n, mid = (a0 + a1) / 2;
    const shape = n === 1 ? `<circle cx="${c}" cy="${c}" r="${R}" fill="${shades[0]}"/>` : `<path d="M${c} ${c} L${pt(a0, R)} A${R} ${R} 0 ${n === 2 ? 1 : 0} 1 ${pt(a1, R)} Z" fill="${shades[i % 2]}" stroke="var(--card)" stroke-width="1.5"/>`;
    const label = n <= 16 ? `<text x="${(c + (n === 1 ? 0 : R * 0.62) * Math.cos(mid)).toFixed(2)}" y="${(c + (n === 1 ? 0 : R * 0.62) * Math.sin(mid)).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${n > 9 ? 7 : 9}" font-weight="600">${i + 1}</text>` : "";
    return shape + label;
  }).join("");
  return `<svg viewBox="0 0 100 100" width="150" height="150" role="img" aria-label="One outcome made of ${n} unit${n === 1 ? "" : "s"}">${slices}</svg>`;
}

function stagePanel(f: FrameworkTemplate, type: OutcomeType | undefined, stage: number, v: View): string {
  const t = `data-tplid="${esc(f.id)}"`;
  if (stage === 1) {
    const full = unitModeOf(f) === "once";
    return `<h3>Work orders: gift into units and shares</h3>
    <label class="wf-field"><span>Units in one outcome</span><input type="number" min="1" max="100" step="1" data-wf-shares="${esc(f.id)}" value="${f.unitsPerBeneficiary}"${full ? " disabled" : ""}></label>
    <label class="ot-check"><input type="checkbox" data-wf-full="${esc(f.id)}"${full ? " checked" : ""}> Release only when fully paid</label>
    <p class="muted">How units are allocated to one outcome in this workflow. With 1, a unit is a whole outcome. With more, the outcome is made of that many units. This is mostly automatic once set: a paid gift becomes work order units, and they are released to be assigned for implementation.</p>`;
  }
  const tasksTable = `<table class="wf-tasks"><thead><tr><th>Check for the partner or caseworker</th><th class="num">Due after (months)</th><th>Photo</th><th class="actcol"></th></tr></thead><tbody>
      ${(f.tasks ?? []).map((k) => `<tr><td><input data-wf-task="label" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" value="${esc(k.label)}"></td><td class="num"><input type="number" min="0" max="120" data-wf-task="after" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" value="${k.afterMonths}"></td><td class="c"><input type="checkbox" data-wf-task="photo" data-wf="${esc(f.id)}" data-task="${esc(k.id)}"${k.photo ? " checked" : ""} aria-label="Asks for a photo"></td><td class="actcol"><div class="actbox"><button class="iconact" data-wf-act="task-remove" data-wf="${esc(f.id)}" data-task="${esc(k.id)}" title="Remove this check" aria-label="Remove this check">${BIN}</button></div></td></tr>`).join("") || `<tr><td colspan="4" class="muted">No checks yet.</td></tr>`}
    </tbody></table>
    <div class="ot-add"><input id="wf-task-label" placeholder="New check, for example 3 month basic check"><input id="wf-task-after" type="number" min="0" max="120" value="3" aria-label="Due after months" style="width:90px"><label class="ot-check"><input type="checkbox" id="wf-task-photo"> photo</label><button class="iconact ok" data-wf-act="task-add" data-wf="${esc(f.id)}" title="Add the check" aria-label="Add the check">${TICK}</button></div>`;
  const flag = (k: "reassign" | "urgent" | "approve", text: string): string => `<label class="ot-check"><input type="checkbox" data-wf-flag="${k}" data-wf="${esc(f.id)}"${flagOf(f, k) ? " checked" : ""}> ${text}</label>`;
  if (stage === 2) {
    const how = assignOf(f, type);
    return `<h3>Assignment</h3>
    <h4 class="wf-h">Decision: assignment for implementation</h4>
    <label class="wf-field"><span>A released work order is assigned to a partner</span><select data-wf-assign="${esc(f.id)}"><option value="auto"${how === "auto" ? " selected" : ""}>Automatically, to a partner with capacity</option><option value="suggest"${how === "suggest" ? " selected" : ""}>By a person, dragging it to a partner</option></select></label>
    ${flag("reassign", "A person can move a work order from one partner to another")}
    ${flag("urgent", "An urgent gift jumps to high priority")}
    <p class="muted">Only partners approved for the item are considered. The work order lands in the partner's waiting list as a batch. Priority when several are waiting: urgent first, then a donor's directed project or partner, then a deadline, then the oldest first. Each partner sets its capacity on its own profile.</p>`;
  }
  if (stage === 3) return `<h3>Confirm</h3>
    <h4 class="wf-h">Decision: the partner confirms the batch</h4>
    <div class="wf-two"><label class="wf-field"><span>Days the partner has to approve or reject</span><input type="number" min="0" max="60" data-wf-confirm="days" data-wf="${esc(f.id)}" value="${confirmDaysOf(f)}"></label>
    <label class="wf-field"><span>Tell the donor, once the partner has confirmed</span><input data-wf-confirm="tell" data-wf="${esc(f.id)}" value="${esc(f.confirmTell ?? "")}" placeholder="Nothing"></label></div>
    <p class="muted">The batch waits in the partner's list. If the partner approves it, the work order moves on to allocation. If the partner rejects it, it goes back to assignment so a person or the automatic rule can pick another partner. The donor is only told that the batch was accepted, never any data.</p>`;
  if (stage === 4) {
    const stages = f.stages ?? [];
    return `<h3>Allocation: the outcome profile</h3>
    <p class="muted">Allocation is where the work order sits in a specific outcome profile. The partner completes the profile in sections, filling in data and ticking the stages of the outcome. Each section has the days allowed from the one before, so delays can be seen. Until MWF approves the report, the donor is only told that a section is done, never shown the data.</p>
    <h4 class="wf-h">Outcome profile sections
    <p class="muted">The partner works through these, in order: confirming it received the batch, giving each work order a specific outcome profile, then completing the profile's data in phases. Each stage has the days allowed from the one before, so delays can be seen. Until MWF approves the report, the donor is only told that a phase has changed, never shown the data.</p>
    <h4 class="wf-h">Sections <span class="muted">(${stages.length}, ${totalDays(f)} days in all)</span></h4>
    <div class="tablewrap"><table class="wf-tasks"><thead><tr><th>Section</th><th class="num">Days</th><th>The partner supplies (separate with commas)</th><th class="c">Photo</th><th class="c">Can pause</th><th>Tell the donor that it is done</th><th class="actcol"></th></tr></thead><tbody>
      ${stages.map((k, i) => `<tr><td><input data-wf-sub="label" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}" value="${esc(k.label)}"></td><td class="num"><input type="number" min="0" max="365" data-wf-sub="days" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}" value="${k.days}"></td><td><input data-wf-sub="needs" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}" value="${esc(k.needs.join(", "))}" placeholder="Location, Beneficiaries"></td><td class="c"><input type="checkbox" data-wf-sub="photo" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}"${k.photo ? " checked" : ""} aria-label="Asks for a photo"></td><td class="c"><input type="checkbox" data-wf-sub="pause" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}"${k.canPause ? " checked" : ""} aria-label="The clock can be paused"></td><td><input data-wf-sub="tell" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}" value="${esc(k.tell)}" placeholder="Nothing"></td><td class="actcol"><div class="actbox"><button class="iconact" data-wf-act="sub-up" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}"${i === 0 ? " disabled" : ""} title="Move up" aria-label="Move up">&uarr;</button><button class="iconact" data-wf-act="sub-down" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}"${i === stages.length - 1 ? " disabled" : ""} title="Move down" aria-label="Move down">&darr;</button><button class="iconact" data-wf-act="sub-remove" data-wf="${esc(f.id)}" data-sub="${esc(k.id)}" title="Remove this section" aria-label="Remove this section">${BIN}</button></div></td></tr>`).join("") || `<tr><td colspan="7" class="muted">No sections yet. Add the first one below.</td></tr>`}
    </tbody></table></div>
    <div class="ot-add"><input id="wf-sub-label" placeholder="New section, for example Site visit"><input id="wf-sub-days" type="number" min="0" max="365" value="14" aria-label="Days allowed" style="width:90px"><button class="iconact ok" data-wf-act="sub-add" data-wf="${esc(f.id)}" title="Add the section" aria-label="Add the section">${TICK}</button></div>`;
  }
  if (stage === 5) return `<h3>Review and approval</h3>
    <h4 class="wf-h">Decision: approval</h4>
    ${flag("approve", "MWF verifies and approves the report before the donor sees the data")}
    <p class="muted">When the partner has completed every stage, MWF reviews the data. Before that the donor only hears that a phase changed.</p>
    <h4 class="wf-h">Monitoring and evaluation (MEAL) checks</h4>
    ${tasksTable}
    <p class="muted">Checks say what will be asked and when, to keep the quality of delivery up. They are not created yet: that comes with the Updates page.</p>`;
  const living = unitModeOf(f) !== "once";
  return `<h3>Report and complete</h3>
    <h4 class="wf-h">Decision: reporting protocol</h4>
    <p class="muted">${living ? "A living order: it is not finished by one delivery. The donor hears back on the cycle below for as long as it runs, and it ends when the support ends." : "A transactional order: once it is complete the donor gets one completion report, and the order is closed."}</p>
    <div class="wf-two"><label class="wf-field"><span>The report the donor gets</span><input data-tpl="reportType" ${t} value="${esc(f.reportType)}" placeholder="Quarterly update"></label>
    <label class="wf-field"><span>How often the donor hears back</span><select data-tpl="cycle" ${t}>${(Object.keys(CYCLE_LABELS) as Cycle[]).map((y) => `<option value="${y}"${y === f.cycle ? " selected" : ""}>${esc(CYCLE_LABELS[y])}</option>`).join("")}</select></label></div>
    <p class="muted">Feedback from the donor after the order is complete comes later.</p>`;
}

// Rule (DECISIONS 135): the icon library as a popup of pictures. A click chooses, OK keeps it, Cancel leaves the icon as it was.
const iconPopup = (wfId: string, pick: string): string => `<div class="wf-modal" role="dialog" aria-modal="true" aria-label="Choose an icon"><div class="wf-modal-box"><h2>Choose an icon</h2>
  <div class="wf-igrid">${ICONS.map((x) => `<button class="wf-ichoice${x.id === pick ? " on" : ""}" data-wf-iconchoose="${x.id}" aria-pressed="${x.id === pick}" title="${esc(x.label)}">${iconHtml(x.id, x.label, "lg")}<small>${esc(x.label)}</small></button>`).join("")}</div>
  <div class="actions"><button data-wf-iconcancel="1">Cancel</button><button class="primary" data-wf-iconok="${esc(wfId)}">OK</button></div></div></div>`;

export function workflowsPage(v: View): string {
  const fws = v.frameworks ?? [];
  const types = v.outcomeTypes ?? [];
  const sel = v.workflowSel ?? { id: "", stage: 1, parts: 1, allocated: false, pick: "" };
  const items = v.flaggedItems;
  const itemFw = v.itemFramework ?? {};
  const effective = (itemId: string): string => itemFw[itemId] ?? v.categories.find((c) => c.id === v.itemCategories[itemId])?.frameworkId ?? "";
  const itemsOf = (fid: string) => items.filter((i) => effective(i.id) === fid);
  const typeIcon = (fid: string) => typeForFramework(types, fid)?.icon ?? "";
  // Rule (DECISIONS 134): a workflow has its own icon, a target until one is chosen. It no longer follows an item or an outcome type.
  const iconOfWorkflow = (fid: string): string => fws.find((x) => x.id === fid)?.icon || "bullseye";
  const f = fws.find((x) => x.id === sel.id) ?? fws[0];
  const stage = Math.min(6, Math.max(1, sel.stage));

  const list = `<div class="card"><h3 class="wf-h">Workflows <span class="muted">(${fws.length})</span></h3><div class="wlist">${fws.map((x) => `<button class="wbtn${x.id === f?.id ? " on" : ""}" data-wf-select="${esc(x.id)}">${iconHtml(iconOfWorkflow(x.id), x.name, "lg") || `<span class="ico ico-lg"></span>`}<span><b>${esc(x.name)}</b><small>${itemsOf(x.id).length} item${itemsOf(x.id).length === 1 ? "" : "s"}</small></span></button>`).join("") || `<div class="empty">No workflows yet.</div>`}</div>
    <div class="actions"><input id="newfw" placeholder="New workflow name"><button data-action="add-framework">Add</button></div>
    <div class="actions"><button data-action="add-starters" title="Adds Orphan sponsorship, Student sponsorship, Water pump, House build, Livelihood and Activity, with their outcome types and tasks. Nothing you built is replaced.">Add the standard workflows</button></div>
    <p class="hint muted">A workflow is what happens to a kind of gift, from payment to donor report.</p></div>`;

  const nameOf = (id: string) => fws.find((x) => x.id === id)?.name ?? "";
  const nSuggest = items.filter((i) => effective(i.id) === "").filter((i) => v.workflowSuggestions?.[i.id] !== undefined).length;
  // Rule (DECISIONS 133): one list of every item. A switch puts it in the open workflow. An item in another workflow shows that workflow and its switch is locked: switch it off there first.
  const iconsCard = `<section class="card"><h2>Items <span class="muted">(${items.length})</span></h2><p class="muted">Switch an item on to put it in ${f ? esc(f.name) : "a workflow"}. An item is in one workflow only. Each item also has an icon for the Gifts list, suggested from its name.</p>
    <div class="actions"><button data-action="suggest-workflows"${nSuggest ? "" : " disabled"}>Suggest ${nSuggest} workflow${nSuggest === 1 ? "" : "s"} from the item names</button>
      <button data-action="apply-frameworks" title="Gifts keep the workflow they were made under. This moves every one to the workflow that now applies to its item.">Apply to existing gifts</button></div>
    <div class="tablewrap"><table class="subtable"><thead><tr><th class="c"></th><th>Item</th><th>Workflow</th><th class="c">In ${f ? esc(f.name) : "this workflow"}</th><th>Icon</th></tr></thead><tbody>${[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => { const w = effective(i.id); const here = f !== undefined && w === f.id; const other = w !== "" && !here; return `<tr><td class="c">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}, typeIcon(w)), i.name)}</td><td>${esc(i.name)}</td><td class="muted">${here ? "This workflow" : other ? esc(nameOf(w)) : v.workflowSuggestions?.[i.id] ? `Suggested: ${esc(nameOf(v.workflowSuggestions[i.id] as string))}` : "Unassigned"}</td><td class="c"><label class="wf-switch" title="${other ? `In ${esc(nameOf(w))}. Switch it off there first.` : here ? "Take it out of this workflow" : "Put it in this workflow"}"><input type="checkbox" data-wf-toggle="${esc(i.id)}" data-wf="${f ? esc(f.id) : ""}"${here ? " checked" : ""}${other || !f ? " disabled" : ""} aria-label="${esc(i.name)} in this workflow"><i></i></label></td><td><select data-icon-item="${esc(i.id)}" aria-label="Icon of ${esc(i.name)}"><option value=""${v.itemIcons?.[i.id] ? "" : " selected"}>Suggested</option>${ICONS.map((x) => `<option value="${x.id}"${v.itemIcons?.[i.id] === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></td></tr>`; }).join("")}</tbody></table></div></section>`;
  const itemsCard = `${iconsCard}`;
  if (!f) return `<h1>Workflows</h1><p class="sub">What happens to a gift, from payment to donor report.</p>${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}<div class="wf-layout">${list}<div class="card empty">Add the standard workflows to start, or add your own.</div></div>${itemsCard}`;

  const iconModal = (w: FrameworkTemplate): string => (sel.iconPick !== undefined ? iconPopup(w.id, sel.iconPick) : "");
  const type = typeForFramework(types, f.id);
  const slots = Math.max(1, f.unitsPerBeneficiary);
  const sim = `<div class="wf-rule"><h3>One outcome</h3><div class="upies" id="wf-pie">${unitPie(slots)}</div>
    <p class="muted" id="wf-pie-note">${slots === 1 ? "1 unit: a whole outcome." : `${slots} units make one outcome.`}</p></div>`;

  return `<h1>Workflows</h1><p class="sub">What happens to a gift, from payment to donor report. Click a stage to see and change its rules.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="wf-layout">${list}
      <div class="wf-main">
        <div class="card"><div class="wf-head"><button class="wf-iconbtn" data-wf-iconopen="${esc(f.id)}" title="Choose an icon" aria-label="Choose an icon for this workflow">${iconHtml(iconOfWorkflow(f.id), f.name, "lg")}</button><input class="title" data-fwrename="${esc(f.id)}" value="${esc(f.name)}" aria-label="Workflow name"><span class="muted">${itemsOf(f.id).length} item${itemsOf(f.id).length === 1 ? "" : "s"}</span>
          <button class="iconact" data-action="dup-framework" data-id="${esc(f.id)}" title="Copy this workflow" aria-label="Copy this workflow"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/></svg></button>
          <button class="iconact" data-action="remove-framework" data-id="${esc(f.id)}" title="Remove this workflow" aria-label="Remove this workflow">${BIN}</button></div>
          <p class="wf-sentence">Items assigned to this workflow follow these set rules.</p></div>
        <section class="card"><h3 class="wf-h">The flow</h3><div class="wf-flowwrap">${flowChart(f, type, stage)}</div><p class="wf-legend muted"><svg viewBox="0 0 16 12" width="16" height="12" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2" class="fc-node"/></svg> a stage <svg viewBox="0 0 16 14" width="16" height="14" aria-hidden="true"><path d="M8 1 15 7 8 13 1 7z" class="fc-node"/></svg> a process</p>
          <div class="wf-rules${stage === 1 ? "" : " one"}"><div class="wf-rule">${stagePanel(f, type, stage, v)}</div>${stage === 1 ? sim : ""}</div></section>
      </div></div>
    ${iconsCard}${iconModal(f)}`;
}
