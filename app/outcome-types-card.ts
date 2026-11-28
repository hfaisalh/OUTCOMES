/**
 * outcome-types-card.ts
 *
 * What it does: the Outcome types card on the Categories and frameworks page (DECISIONS 103). For each type: its name, how a gift gets its outcome
 * (picks an existing one or creates a new draft), whether it is assigned to a partner automatically or only suggested, the frameworks that use it, and
 * its profile fields (kind, required, in the donor report). Staff add types and fields here, with no code.
 * Who calls it: app/pages.ts (categoriesPage). Depends on: modules/05-outcomes/outcome-types.ts. Pure: it takes types and returns HTML.
 */

import { switchHtml } from "./switch";
import { FIELD_KINDS, type OutcomeType } from "../modules/05-outcomes/outcome-types";
import { ICONS, iconHtml } from "./icons";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function outcomeTypeEditor(t: OutcomeType, frameworks: FrameworkTemplate[], used: Record<string, number>, show: { assign?: boolean; frameworks?: boolean; remove?: boolean; rules?: boolean } = {}): string {
  const kindName = (id: string) => FIELD_KINDS.find((k) => k.id === id)?.label ?? id;
  const o = { assign: true, frameworks: true, remove: true, rules: true, ...show };
  return `<div class="ot" data-ot-type="${esc(t.id)}">
    <div class="ot-head">${iconHtml(t.icon ?? "", t.name, "lg")}<input class="ot-name" data-ot="rename" data-type-id="${esc(t.id)}" value="${esc(t.name)}" aria-label="Type name">
      <label class="ot-prefix">Icon <select data-ot="icon" data-type-id="${esc(t.id)}" aria-label="Icon"><option value=""${!t.icon ? " selected" : ""}>None</option>${ICONS.map((x) => `<option value="${x.id}"${t.icon === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label> <label class="ot-prefix">ID prefix <input data-ot="prefix" data-type-id="${esc(t.id)}" value="${esc(t.prefix ?? "")}" maxlength="5" size="6" aria-label="ID prefix"></label><span class="muted">${esc(t.prefix ?? "")}-0001, ${esc(t.prefix ?? "")}-0002 ...</span>
      <span class="muted">${used[t.id] ?? 0} outcome${(used[t.id] ?? 0) === 1 ? "" : "s"} use it</span>
      ${o.remove ? `<button data-ot-act="remove" data-type-id="${esc(t.id)}"${(used[t.id] ?? 0) > 0 ? " disabled" : ""} title="${(used[t.id] ?? 0) > 0 ? "Outcomes use this type" : "Remove this type"}">Remove</button>` : ""}</div>
    <div class="ot-rules">
      ${o.rules ? `<label>A gift gets its outcome by <select data-ot="source" data-type-id="${esc(t.id)}"><option value="pick_existing"${t.source === "pick_existing" ? " selected" : ""}>Picking one that exists (for example an orphan)</option><option value="create_new"${t.source === "create_new" ? " selected" : ""}>Creating a new draft (for example a pump)</option></select></label>` : ""}
      ${o.assign ? `<label>Assigned to a partner <select data-ot="assign" data-type-id="${esc(t.id)}"><option value="auto"${t.assign === "auto" ? " selected" : ""}>Automatically, when it has capacity</option><option value="suggest"${t.assign === "suggest" ? " selected" : ""}>Only suggested to a person</option></select></label>` : ""}
    </div>
    ${o.frameworks ? `<div class="ot-fw"><span class="muted">Frameworks that use this type:</span> ${frameworks.length ? frameworks.map((f) => `<label class="ot-check"><input type="checkbox" data-ot="framework" data-type-id="${esc(t.id)}" data-framework-id="${esc(f.id)}"${t.frameworkIds.includes(f.id) ? " checked" : ""}> ${esc(f.name)}</label>`).join(" ") : `<span class="muted">Add a framework first.</span>`}</div>` : ""}
    <table class="ot-fields"><thead><tr><th>Profile field</th><th>Kind</th><th>Needed first</th><th>In the report</th><th></th></tr></thead><tbody>
      ${t.fields.map((f, i) => `<tr><td>${esc(f.label)}</td><td>${esc(kindName(f.kind))}${f.kind === "choice" ? ` <input data-ot="options" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}" value="${esc((f.options ?? []).join(", "))}" placeholder="Options, separated by commas">` : ""}</td>
        <td>${switchHtml({ label: `Needed before a partner takes it: ${f.label}`, on: f.required === true, attrs: `data-ot="required" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}"`, compact: true })}</td>
        <td>${switchHtml({ label: `In the donor report: ${f.label}`, on: f.inReport === true, attrs: `data-ot="inreport" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}"`, compact: true })}</td>
        <td class="ot-actions"><button data-ot-act="up" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}"${i === 0 ? " disabled" : ""} aria-label="Move up">\u2191</button><button data-ot-act="down" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}"${i === t.fields.length - 1 ? " disabled" : ""} aria-label="Move down">\u2193</button><button data-ot-act="field-remove" data-type-id="${esc(t.id)}" data-field-id="${esc(f.id)}" aria-label="Remove the field">\u00D7</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">No fields yet.</td></tr>`}
    </tbody></table>
    <div class="ot-add"><input id="otf-label-${esc(t.id)}" placeholder="New field, for example GPS location"><select id="otf-kind-${esc(t.id)}">${FIELD_KINDS.map((k) => `<option value="${k.id}">${esc(k.label)}</option>`).join("")}</select><button data-ot-act="field-add" data-type-id="${esc(t.id)}">Add field</button></div>
  </div>`;
}

export function outcomeTypesCard(types: OutcomeType[], frameworks: FrameworkTemplate[], used: Record<string, number>): string {
  return `<div class="card"><h2>Outcome types <span class="muted">(${types.length})</span></h2>
    <p class="muted">An outcome is the specific thing a gift becomes: an orphan, a pump, a house, animals, furniture, an activity. Each outcome gets an ID from its type's prefix (such as ORP-0007), and so does every allocation (AL-0012). Changing a prefix changes new IDs only. Each type has its own profile and report. "Needed first" fields are the minimum before a partner takes it. An outcome can be created and receive gifts with the profile still incomplete. A framework belongs to one type.</p>
    ${types.map((t) => outcomeTypeEditor(t, frameworks, used)).join("")}
    <div class="actions"><input id="newot" placeholder="New outcome type, for example House build"><button data-ot-act="add">Add outcome type</button></div></div>`;
}
