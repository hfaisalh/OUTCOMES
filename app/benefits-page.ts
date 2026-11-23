/**
 * benefits-page.ts
 *
 * What it does: the Benefits page (DECISIONS 143), in Settings beside Workflows. A benefit is what a gift item delivers, so every item has one, and each has a kind: Person(s), Activity,
 * Build, Distribution, Programme or Waqf. The page lists every item with its kind (a suggestion from its name until a person chooses), its workflow and its icon, and describes each kind.
 * The kind is set once here and flows through the work order. The partners active for a benefit, and the fields of each kind's beneficiary profile, come later.
 * Who calls it: app/main.ts. Depends on: modules/02-project-rules/benefits.ts, app/icons.ts and the helpers in pages.ts. Pure: it takes a View and returns HTML.
 */

import { KINDS, kindOf } from "../modules/02-project-rules/benefits";
import { resolveFrameworkId } from "../modules/02-project-rules/categories";
import { iconHtml, itemIcon } from "./icons";
import { esc, type View } from "./pages";

export function benefitsPage(v: View): string {
  const items = [...v.flaggedItems].sort((a, b) => a.name.localeCompare(b.name));
  const kinds = v.itemKinds ?? {};
  const fws = v.frameworks ?? [];
  const setup = { categories: v.categories, itemMap: v.itemCategories, frameworks: fws, itemFramework: v.itemFramework ?? {} };
  const workflowOf = (id: string): string => fws.find((f) => f.id === resolveFrameworkId(setup, id))?.name ?? "";
  const rows = items.map((i) => {
    const k = kindOf(kinds, i.id, i.name);
    const options = `<option value=""${k.chosen ? "" : " selected"}>${k.kind ? `Suggested: ${esc(KINDS.find((x) => x.id === k.kind)?.label ?? "")}` : "Choose a kind"}</option>${KINDS.map((x) => `<option value="${x.id}"${k.chosen && k.kind === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}`;
    return `<tr><td class="c">${iconHtml(itemIcon(i.id, i.name, v.itemIcons ?? {}), i.name)}</td><td>${esc(i.name)}</td><td><select data-kind-item="${esc(i.id)}" aria-label="Kind of ${esc(i.name)}">${options}</select>${k.chosen || !k.kind ? "" : ` <span class="muted" title="Suggested from the name. Choose it to keep it.">suggested</span>`}</td><td class="muted">${esc(workflowOf(i.id)) || "No workflow"}</td></tr>`;
  });
  const chosen = items.filter((i) => kindOf(kinds, i.id, i.name).chosen).length;
  const none = items.filter((i) => kindOf(kinds, i.id, i.name).kind === "").length;
  return `<h1>Benefits</h1><p class="sub">What each gift item delivers. A benefit is the item itself, and its kind says what the beneficiary is, which decides the fields and evidence of its profile.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <section class="card"><h2>Items <span class="muted">(${items.length})</span></h2>
      <p class="muted">${chosen} chosen, ${items.length - chosen - none} suggested, ${none} to choose. The kind is set once and flows through the work order. Change it here if a suggestion is wrong.</p>
      <div class="tablewrap"><table class="subtable"><thead><tr><th class="c"></th><th>Item (benefit)</th><th>Kind</th><th>Workflow</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="4" class="muted">No items yet. They appear when gifts arrive from the CRM.</td></tr>`}</tbody></table></div></section>
    <section class="card"><h2>The kinds</h2>
      <div class="tablewrap"><table class="subtable"><thead><tr><th>Kind</th><th>The beneficiary is</th><th>Counted by</th><th>Proof of delivery</th><th>Examples</th></tr></thead><tbody>${KINDS.map((k) => `<tr><td><b>${esc(k.label)}</b></td><td>${esc(k.what)}</td><td>${esc(k.counted)}</td><td>${esc(k.proof)}</td><td class="muted">${esc(k.examples)}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">Micro finance is dealt with separately. On behalf of, needing a location, sensitive data and who receives (a person, a group or an institution) are properties of a kind, not kinds.</p></section>`;
}
