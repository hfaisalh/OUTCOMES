/**
 * benefits-page.ts
 *
 * What it does: the Benefits page (DECISIONS 143, 146), in Settings beside Workflows. A benefit is what a gift item delivers, so every item has one, and it is only a tag: the item points at
 * a kind. The page has two parts. The kinds (a list to add to, and the chosen one to configure: its name, icon, ID prefix, description, properties and profile fields), and the items, each
 * with its kind (a suggestion from its name until a person chooses), its workflow and its icon. The six standard kinds can be added with one button. Micro finance is a fund and is
 * dealt with separately (DECISIONS 145). A kind is an outcome type, so its editor is the outcome type editor.
 * Who calls it: app/main.ts. Depends on: modules/02-project-rules/benefits.ts, modules/05-outcomes/outcome-types.ts, app/outcome-types-card.ts, app/icons.ts and the helpers in pages.ts. Pure.
 */

import { kindOf } from "../modules/02-project-rules/benefits";
import { resolveFrameworkId } from "../modules/02-project-rules/categories";
import { starterKinds } from "../modules/05-outcomes/outcome-types";
import { iconHtml, itemIcon } from "./icons";
import { outcomeTypeEditor } from "./outcome-types-card";
import { esc, type View } from "./pages";

export function benefitsPage(v: View): string {
  const items = [...v.flaggedItems].sort((a, b) => a.name.localeCompare(b.name));
  const kinds = v.outcomeTypes ?? [];
  const known = kinds.map((k) => k.id);
  const chosenKinds = v.itemKinds ?? {};
  const fws = v.frameworks ?? [];
  const setup = { categories: v.categories, itemMap: v.itemCategories, frameworks: fws, itemFramework: v.itemFramework ?? {} };
  const workflowOf = (id: string): string => fws.find((f) => f.id === resolveFrameworkId(setup, id))?.name ?? "";
  const kindName = (id: string): string => kinds.find((k) => k.id === id)?.name ?? "";
  const tag = (i: { id: string; name: string }) => kindOf(chosenKinds, i.id, i.name, known);
  const itemsOfKind = (id: string): number => items.filter((i) => tag(i).kind === id).length;
  const missing = starterKinds().filter((k) => !kinds.some((t) => t.id === k.id || t.name.toLowerCase() === k.name.toLowerCase()));
  const sel = kinds.find((k) => k.id === v.kindSel) ?? kinds[0];
  const used = Object.fromEntries(kinds.map((k) => [k.id, (v.outcomes ?? []).filter((o) => o.outcomeTypeId === k.id).length]));

  const list = `<div class="card"><h3 class="wf-h">Kinds <span class="muted">(${kinds.length})</span></h3><div class="wlist">${kinds.map((k) => `<button class="wbtn${k.id === sel?.id ? " on" : ""}" data-kind-select="${esc(k.id)}">${iconHtml(k.icon ?? "", k.name, "lg") || `<span class="ico ico-lg"></span>`}<span><b>${esc(k.name)}</b><small>${itemsOfKind(k.id)} item${itemsOfKind(k.id) === 1 ? "" : "s"}</small></span></button>`).join("") || `<div class="empty">No kinds yet.</div>`}</div>
    <div class="actions"><input id="newot" placeholder="New kind name"><button data-ot-act="add">Add</button></div>
    ${missing.length ? `<div class="actions"><button data-ot-act="kinds-starters" title="Adds ${esc(missing.map((k) => k.name).join(", "))}, each with its properties and profile fields. Nothing you built is replaced.">Add the standard kinds</button></div>` : ""}
    <p class="hint muted">A kind says what the beneficiary is, which decides the fields and evidence of its profile.</p></div>`;
  const detail = sel
    ? `<div class="card"><h2>${esc(sel.name)}</h2>${outcomeTypeEditor(sel, [], used, { assign: false, frameworks: false, kind: true })}</div>`
    : `<div class="card empty">Add the standard kinds to start, or add your own.</div>`;

  const rows = items.map((i) => {
    const k = tag(i);
    const options = `<option value=""${k.chosen ? "" : " selected"}>${k.kind ? `Suggested: ${esc(kindName(k.kind))}` : "Choose a kind"}</option>${kinds.map((x) => `<option value="${esc(x.id)}"${k.chosen && k.kind === x.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}`;
    return `<tr><td class="c">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}), i.name)}</td><td>${esc(i.name)}</td><td><select data-kind-item="${esc(i.id)}" aria-label="Kind of ${esc(i.name)}">${options}</select>${k.chosen || !k.kind ? "" : ` <span class="muted" title="Suggested from the name. Choose it to keep it.">suggested</span>`}</td><td class="muted">${esc(workflowOf(i.id)) || "No workflow"}</td></tr>`;
  });
  const chosen = items.filter((i) => tag(i).chosen).length;
  const none = items.filter((i) => tag(i).kind === "").length;
  return `<h1>Benefits</h1><p class="sub">What each gift item delivers. A benefit is the item itself, only a tag that points at a kind. The kind says what the beneficiary is.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="wf-layout">${list}${detail}</div>
    <section class="card"><h2>Items <span class="muted">(${items.length})</span></h2>
      <p class="muted">${chosen} chosen, ${items.length - chosen - none} suggested, ${none} to choose. Items and their names come from the CRM. The kind is set once and flows through the work order. Change it here if a suggestion is wrong.</p>
      <div class="tablewrap"><table class="subtable"><thead><tr><th class="c"></th><th>Item (benefit)</th><th>Kind</th><th>Workflow</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="4" class="muted">No items yet. They appear when gifts arrive from the CRM.</td></tr>`}</tbody></table></div>
      <p class="muted">Micro finance is a fund and is dealt with separately.</p></section>`;
}
