/**
 * benefits-page.ts
 *
 * What it does: the Benefits page (DECISIONS 143), in Settings beside Workflows. A benefit is what a gift item delivers, so every item has one, and each has a kind: Person(s), Activity,
 * Build, Distribution, Programme or Waqf. The page lists every item with its kind (a suggestion from its name until a person chooses), its workflow and its icon, and describes each kind.
 * The type is set once here and flows through the work order. The partners active for a benefit, and the fields of each kind's beneficiary profile, come later.
 * Who calls it: app/main.ts. Depends on: modules/02-project-rules/benefits.ts, app/icons.ts and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { KINDS, kindOf } from "../modules/02-project-rules/benefits";
import { itemReadiness, readySummary } from "../modules/06-projects/readiness";
import { featuresOf, FIRSTS, isCustomised, ON_END, PROP_LABELS, RECEIVERS, type SavedFeatures } from "../modules/02-project-rules/kind-features";
import { FIELD_KINDS } from "../modules/05-outcomes/outcome-types";
import { resolveFrameworkId } from "../modules/02-project-rules/categories";
import { iconHtml, itemIcon } from "./icons";
import { esc, type View } from "./pages";

export function benefitsPage(v: View): string {
  const items = [...v.flaggedItems].sort((a, b) => a.name.localeCompare(b.name));
  const kinds = v.itemKinds ?? {};
  const fws = v.frameworks ?? [];
  const setup = { categories: v.categories, itemMap: v.itemCategories, frameworks: fws, itemFramework: v.itemFramework ?? {} };
  const workflowOf = (id: string): string => fws.find((f) => f.id === resolveFrameworkId(setup, id))?.name ?? "";
  // Rule (DECISIONS 188): the units that make one whole beneficiary belong to the benefit. Shown for a type where the beneficiary comes first (Person(s)), with the workflow's number as the default.
  const unitsCell = (id: string, kind: string): string => {
    if (kind !== "person") return '<span class="muted">\u2013</span>';
    const own = v.itemUnits?.[id];
    const dflt = fws.find((f) => f.id === resolveFrameworkId(setup, id))?.unitsPerBeneficiary;
    return `<input class="num-in" type="number" min="1" max="20" step="1" data-item-units="${esc(id)}" value="${own ?? ""}" placeholder="${dflt ?? ""}" aria-label="Units that make one beneficiary" title="Units that make one whole beneficiary: 3 for an orphan shared by donors, 1 for a scholarship. Empty uses the workflow's${dflt !== undefined ? ` (${dflt})` : ""}."> ${own === undefined && dflt !== undefined ? `<span class="muted" title="From the workflow">workflow</span>` : ""}`;
  };
  // Rule (DECISIONS 156): each item is checked to be connected end to end. Custom Amount items are left for later.
  const customIds = new Set((v.workOrders ?? []).filter((w) => w.customAmount === true).map((w) => w.itemId));
  const ready = itemReadiness({ items, workflowOf: (id) => resolveFrameworkId(setup, id), typeOf: (id, name) => kindOf(kinds, id, name).kind, customItemIds: customIds, partners: v.projects ?? [], giftProjects: v.giftProjects ?? [], today: v.today ?? "2026-01-01" });
  const sum = readySummary(ready);
  const rows = items.map((i, n) => {
    const r = ready[n]!;
    const k = kindOf(kinds, i.id, i.name);
    const options = `<option value=""${k.chosen ? "" : " selected"}>${k.kind ? `Suggested: ${esc(KINDS.find((x) => x.id === k.kind)?.label ?? "")}` : "Choose a type"}</option>${KINDS.map((x) => `<option value="${x.id}"${k.chosen && k.kind === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}`;
    return `<tr><td class="c">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}), i.name)}</td><td>${esc(i.name)}</td><td><select data-kind-item="${esc(i.id)}" aria-label="Type of ${esc(i.name)}">${options}</select>${k.chosen || !k.kind ? "" : ` <span class="muted" title="Suggested from the name. Choose it to keep it.">suggested</span>`}</td><td class="muted">${esc(workflowOf(i.id)) || "No workflow"}</td>
      <td>${unitsCell(i.id, k.kind)}</td>
      <td title="${esc(r.projects.join(", "))}">${r.projects.length ? `${r.projects.length} project${r.projects.length === 1 ? "" : "s"}` : r.openProjects ? `<span class="muted">${r.openProjects} open</span>` : "\u2013"}</td>
      <td title="${esc(r.partners.join(", "))}">${r.partners.length ? `${r.partners.length} partner${r.partners.length === 1 ? "" : "s"}` : "\u2013"}</td>
      <td>${r.custom ? `<span class="muted" title="Custom amounts are dealt with separately, later">custom, later</span>` : r.ready ? `<span class="pill ok" title="Connected: workflow, type and a partner">Ready</span>` : `<span class="pill review" title="${esc(r.missing.join(", "))}">${esc(r.missing.join(", "))}</span>`}</td></tr>`;
  });
  const saved = (v.kindFeatures ?? {}) as SavedFeatures;
  const sel = KINDS.find((k) => k.id === v.kindSel) ?? KINDS[0]!;
  const counts = (id: string): number => items.filter((i) => kindOf(kinds, i.id, i.name).kind === id).length;
  const kindList = `<div class="card"><h3 class="wf-h">Types <span class="muted">(${KINDS.length})</span></h3><div class="wlist">${KINDS.map((k) => `<button class="wbtn${k.id === sel.id ? " on" : ""}" data-kind-select="${k.id}"><span class="ico ico-lg"></span><span><b>${esc(k.label)}</b><small>${counts(k.id)} item${counts(k.id) === 1 ? "" : "s"}${isCustomised(saved, k.id) ? ", changed" : ""}</small></span></button>`).join("")}</div>
    <p class="hint muted">Choose a type to see and change its features. Micro finance is a fund and is dealt with separately.</p></div>`;
  const ft = featuresOf(saved, sel.id);
  const fieldRows = ft.fields.map((x, i) => `<tr><td><input data-kf="label" data-kind="${sel.id}" data-field-id="${esc(x.id)}" value="${esc(x.label)}" aria-label="Field name"></td><td><select data-kf="type" data-kind="${sel.id}" data-field-id="${esc(x.id)}" aria-label="Field format">${FIELD_KINDS.map((k) => `<option value="${k.id}"${k.id === x.type ? " selected" : ""}>${esc(k.label)}</option>`).join("")}</select>${x.type === "choice" ? ` <input data-kf="options" data-kind="${sel.id}" data-field-id="${esc(x.id)}" value="${esc((x.options ?? []).join(", "))}" placeholder="Choices, separated by commas" aria-label="Choices">` : ""}</td>
      <td class="c"><input type="checkbox" data-kf="required" data-kind="${sel.id}" data-field-id="${esc(x.id)}"${x.required ? " checked" : ""} aria-label="Needed first"></td><td class="c"><input type="checkbox" data-kf="inreport" data-kind="${sel.id}" data-field-id="${esc(x.id)}"${x.inReport ? " checked" : ""} aria-label="In the donor report"></td>
      <td class="actcol"><div class="actbox"><button class="iconact" data-kf-act="up" data-kind="${sel.id}" data-field-id="${esc(x.id)}"${i === 0 ? " disabled" : ""} title="Move up" aria-label="Move up">&uarr;</button><button class="iconact" data-kf-act="down" data-kind="${sel.id}" data-field-id="${esc(x.id)}"${i === ft.fields.length - 1 ? " disabled" : ""} title="Move down" aria-label="Move down">&darr;</button><button class="iconact" data-kf-act="field-remove" data-kind="${sel.id}" data-field-id="${esc(x.id)}" title="Remove this field" aria-label="Remove this field">&times;</button></div></td></tr>`).join("");
  const kindDetail = `<div class="card"><h2>${esc(sel.label)}</h2>
    <label class="wf-field"><span>What this type is</span><textarea data-kf="what" data-kind="${sel.id}" rows="3" aria-label="What this type is">${esc(ft.what)}</textarea></label>
    <h4 class="wf-h">Properties</h4>
    <div class="ot-props">${PROP_LABELS.map((p) => `<label class="ot-check" title="${esc(p.hint)}"><input type="checkbox" data-kf="prop" data-prop="${p.id}" data-kind="${sel.id}"${ft.props[p.id] ? " checked" : ""}> ${esc(p.label)}</label>`).join("")}
      <label class="ot-check">Who receives <select data-kf="prop" data-prop="receiver" data-kind="${sel.id}" aria-label="Who receives">${RECEIVERS.map((r) => `<option value="${r.id}"${ft.props.receiver === r.id ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
      <label class="ot-check">Who comes first <select data-kf="prop" data-prop="first" data-kind="${sel.id}" aria-label="Who comes first">${FIRSTS.map((r) => `<option value="${r.id}"${ft.props.first === r.id ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label></div>
    <h4 class="wf-h">Rules for every beneficiary of this type</h4>
    <div class="wf-two"><label class="wf-field"><span>ID prefix</span><input data-kf="prefix" data-kind="${sel.id}" value="${esc(ft.prefix)}" maxlength="5" aria-label="ID prefix"></label>
      <label class="wf-field"><span>When a beneficiary ends</span><select data-kf="onend" data-kind="${sel.id}" aria-label="When a beneficiary ends">${ON_END.map((o) => `<option value="${o.id}"${ft.onEnd === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label></div>
    <p class="muted">Each beneficiary gets an ID such as <b>${esc(ft.prefix)}-0001</b>. The number is permanent and never used twice, even if the sponsor, partner or institute changes.</p>
    <div class="ot-props"><span class="muted">A beneficiary is a duplicate when these fields all match one that exists. It is then blocked, with a message saying the beneficiary already exists.</span>${ft.fields.map((x) => `<label class="ot-check"><input type="checkbox" data-kf="dup" data-kind="${sel.id}" data-field-id="${esc(x.id)}"${ft.duplicateOn.includes(x.id) ? " checked" : ""}> ${esc(x.label)}</label>`).join("")}</div>
    <h4 class="wf-h">Profile fields <span class="muted">(${ft.fields.length})</span></h4>
    <p class="muted">The data a beneficiary of this type holds. Needed first is the minimum before a partner takes it. In the report means it goes in the donor report.</p>
    <div class="tablewrap"><table class="wf-tasks"><thead><tr><th>Field</th><th>Format</th><th class="c">Needed first</th><th class="c">In the report</th><th class="actcol"></th></tr></thead><tbody>${fieldRows || `<tr><td colspan="5" class="muted">No fields yet.</td></tr>`}</tbody></table></div>
    <div class="ot-add"><input id="kf-label-${sel.id}" placeholder="New field, for example GPS location"><select id="kf-type-${sel.id}" aria-label="Format of the new field">${FIELD_KINDS.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join("")}</select><button class="iconact ok" data-kf-act="field-add" data-kind="${sel.id}" title="Add the field" aria-label="Add the field">+</button>${isCustomised(saved, sel.id) ? `<button data-kf-act="reset" data-kind="${sel.id}" title="Go back to the starting features of this type">Reset to the starting features</button>` : ""}</div></div>`;
  const chosen = items.filter((i) => kindOf(kinds, i.id, i.name).chosen).length;
  const none = items.filter((i) => kindOf(kinds, i.id, i.name).kind === "").length;
  return `<h1>Benefits</h1><p class="sub">What each gift item delivers. A benefit is the item itself, and its type says what the beneficiary is, which decides the fields and evidence of its profile.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <section class="card"><h2>Items <span class="muted">(${items.length})</span></h2>
      <p class="muted">${chosen} chosen, ${items.length - chosen - none} suggested, ${none} to choose. <b>${sum.ready} of ${sum.checked}</b> items are connected end to end (workflow, type and a partner that can take them)${sum.custom ? `, and ${sum.custom} custom amount item${sum.custom === 1 ? "" : "s"} left for later` : ""}. The type is set once and flows through the work order. Change it here if a suggestion is wrong.</p>
      <div class="tablewrap"><table class="subtable"><thead><tr><th class="c"></th><th>Item (benefit)</th><th>Type</th><th>Workflow</th><th>Units per beneficiary</th><th>Projects</th><th>Partners</th><th>Connected</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="8" class="muted">No items yet. They appear when gifts arrive from the CRM.</td></tr>`}</tbody></table></div></section>
    <div class="wf-layout">${kindList}${kindDetail}</div>`;
}
