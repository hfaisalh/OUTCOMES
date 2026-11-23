/**
 * project-form.ts
 *
 * What it does: draws the project form (a pop-up) and reads it back (DECISIONS 76). A project has a name, the CRM names it answers to (ticked from the names
 * the CRM really uses, with room for others), the partners that deliver it (ticked), and notes. The HTML builder is pure. The reader needs a page.
 * Who calls it: app/main.ts. Depends on: Module 6 (GiftProject) and esc from pages.ts.
 */

import type { GiftProject, Project } from "../modules/06-projects/projects";
import { clustersTabHtml } from "./clusters-tab";
import { esc } from "./pages";

export interface ProjectFormContext {
  crmNames: { name: string; gifts: number }[]; // the names the CRM uses on gifts
  partners: Project[];
  items?: { id: string; name: string }[]; // the benefits (gift items) a project can offer
}

export function projectFormHtml(g: Partial<GiftProject>, id: string, ctx: ProjectFormContext, error = "", tab: "details" | "clusters" = "details"): string {
  const names = new Set((g.crmNames ?? []).map((x) => x.toLowerCase()));
  const known = new Set(ctx.crmNames.map((n) => n.name.toLowerCase()));
  const extra = (g.crmNames ?? []).filter((n) => !known.has(n.toLowerCase()));
  const partners = new Set(g.partnerIds ?? []);
  const items = new Set(g.itemIds ?? []);
  // The project's own vendors first, in their priority order, then the other partners.
  const ordered = [...(g.partnerIds ?? []).map((id) => ctx.partners.find((p) => p.id === id)).filter((p): p is Project => p !== undefined), ...ctx.partners.filter((p) => !partners.has(p.id))];
  const tick = (n: string, gifts?: number) => `<label class="tick"><input type="checkbox" class="pr-name" value="${esc(n)}"${names.has(n.toLowerCase()) ? " checked" : ""} /> ${esc(n)}${gifts === undefined ? "" : ` <span class="muted">(${gifts})</span>`}</label>`;
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Project"><div class="pf-box">
    <header><h2>${id ? esc(g.name ?? "Project") : "New project"}</h2><button data-pj="cancel" aria-label="Close">Close</button></header>
    ${id ? `<nav class="pf-tabs" role="tablist"><button type="button" role="tab" class="${tab === "details" ? "on" : ""}" data-pj="tab" data-tab="details">Details</button><button type="button" role="tab" class="${tab === "clusters" ? "on" : ""}" data-pj="tab" data-tab="clusters">Clusters${(g.clusters ?? []).length ? ` <span class="muted">(${(g.clusters ?? []).length})</span>` : ""}</button></nav>` : ""}
    ${id && tab === "clusters" ? clustersTabHtml({ levels: g.levels ?? [], clusters: g.clusters ?? [] }, error) : `<div class="pf-body">
      <section><div class="pf-grid"><label class="pf-field"><span>Project name</span><input id="pr-name" value="${esc(g.name ?? "")}" placeholder="For example Aghosh" required /></label></div></section>
      <section><h3>CRM names</h3><p class="muted">The name above always counts. Tick other names the CRM uses for this project. A name can be in one project only.</p>
        <div class="pf-items">${ctx.crmNames.length ? ctx.crmNames.map((n) => tick(n.name, n.gifts)).join("") : '<span class="muted">No gifts carry a project name yet.</span>'}${extra.map((n) => tick(n)).join("")}</div>
        <div class="actions"><input id="pr-extra" placeholder="Another name, if the CRM spells it differently" /></div></section>
      <section><h3>Benefits offered</h3><p class="muted">Tick the benefits (gift items) this project offers. A gift for a benefit it does not offer waits for a person to decide. With none ticked, it offers any.</p>
        <div class="pf-items">${(ctx.items ?? []).length ? (ctx.items ?? []).map((i) => `<label class="tick"><input type="checkbox" class="pr-item" value="${esc(i.id)}"${items.has(i.id) ? " checked" : ""} /> ${esc(i.name)}</label>`).join("") : '<span class="muted">No items yet. They appear when gifts arrive from the CRM.</span>'}</div></section>
      <section><h3>Vendors</h3><p class="muted">Tick the partners that deliver this project. They take work in the order shown: the first until it is full, then the next. Use the arrows to change the order. With none ticked, its gifts wait for a person to decide.</p>
        <div class="pf-vendors" id="pr-vendors">${ordered.length ? ordered.map((p) => `<div class="pf-vendor"><label class="tick"><input type="checkbox" class="pr-partner" value="${esc(p.id)}"${partners.has(p.id) ? " checked" : ""} /> ${esc(p.name)}</label><span class="pf-vbtns"><button type="button" data-pj="vup" aria-label="Move up" title="Move up">&uarr;</button><button type="button" data-pj="vdown" aria-label="Move down" title="Move down">&darr;</button></span></div>`).join("") : '<span class="muted">No partners yet. Add them on the Partners page.</span>'}</div></section>
      <section><label class="pf-field wide"><span>Notes</span><textarea id="pr-notes" rows="2">${esc(g.notes ?? "")}</textarea></label></section>
    </div>`}
    ${id && tab === "clusters" ? '<footer><button data-pj="cancel">Close</button></footer>' : `    <footer><span id="pr-error" class="pf-error" role="alert">${esc(error)}</span>${id ? '<button data-pj="remove" title="Remove this project. Gifts that carried its CRM names then have no project">Remove project</button>' : ""}<button data-pj="cancel">Cancel</button><button class="primary" data-pj="save">Save project</button></footer>`}
  </div></div>`;
}

// Reads the form back as the profile the server expects. Needs a page.
export function readProjectForm(root: ParentNode): Record<string, unknown> {
  const val = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";
  const names = [...root.querySelectorAll(".pr-name:checked")].map((i) => (i as HTMLInputElement).value);
  const extra = val("pr-extra").trim();
  return { name: val("pr-name"), crmNames: extra !== "" ? [...names, extra] : names, partnerIds: [...root.querySelectorAll(".pr-partner:checked")].map((i) => (i as HTMLInputElement).value), itemIds: [...root.querySelectorAll(".pr-item:checked")].map((i) => (i as HTMLInputElement).value), notes: val("pr-notes") };
}
