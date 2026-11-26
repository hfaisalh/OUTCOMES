/**
 * project-form.ts
 *
 * What it does: draws the project form (a pop-up) and reads it back (DECISIONS 76, 154, 159). A project has a Display Name, its Original Name (the CRM's own project name, fixed once set), the benefits it
 * offers, the partners (vendors) that deliver it in order, and notes. The HTML builder is pure. The reader needs a page.
 * Who calls it: app/main.ts. Depends on: Module 6 (GiftProject) and esc from pages.ts.
 */

import type { GiftProject, Project } from "../modules/06-projects/projects";
import { clustersTabHtml } from "./clusters-tab";
import { clusterStateOf } from "../modules/06-projects/clusters";
import type { Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import type { Enrolment } from "../modules/07-beneficiaries/enrolments";
import type { StockItem } from "../modules/09-placement/stock";
import type { Placement } from "../modules/09-placement/placement";
import { esc } from "./pages";

export interface ProjectFormContext {
  crmNames: { name: string; gifts: number }[]; // the names the CRM uses on gifts
  partners: Project[];
  items?: { id: string; name: string }[]; // the benefits (gift items) a project can offer
  people?: { beneficiaries: Beneficiary[]; enrolments: Enrolment[]; placements?: Placement[]; stock?: StockItem[]; stockItemIds?: string[]; receivers?: Record<string, string> }; // the register and the enrolments, for the Beneficiaries tab of a cluster (DECISIONS 167)
}

export function projectFormHtml(g: Partial<GiftProject>, id: string, ctx: ProjectFormContext, error = "", tab: "details" | "clusters" = "details"): string {
  // Rule (DECISIONS 159): the CRM name is shown fixed once the project has one. An older project has its own name as its CRM name.
  const crmLocked = id ? (g.crmName === undefined ? (g.name ?? "") : g.crmName) : "";
  const partners = new Set(g.partnerIds ?? []);
  const items = new Set(g.itemIds ?? []);
  // The project's own vendors first, in their priority order, then the other partners.
  const ordered = [...(g.partnerIds ?? []).map((id) => ctx.partners.find((p) => p.id === id)).filter((p): p is Project => p !== undefined), ...ctx.partners.filter((p) => !partners.has(p.id))];
  return `<div class="pf-overlay" role="dialog" aria-modal="true" aria-label="Project"><div class="pf-box">
    <header class="gw-head"><div><h2>${id ? esc(g.name ?? "Project") : "New project"}</h2>${id && crmLocked ? `<div class="gw-sub muted">CRM project ${esc(crmLocked)}</div>` : ""}</div><button data-pj="cancel" aria-label="Close">Close</button></header>
    ${id ? `<nav class="pf-tabs" role="tablist"><button type="button" role="tab" class="${tab === "details" ? "on" : ""}" data-pj="tab" data-tab="details">Details</button><button type="button" role="tab" class="${tab === "clusters" ? "on" : ""}" data-pj="tab" data-tab="clusters">Clusters${(g.clusters ?? []).length ? ` <span class="muted">(${(g.clusters ?? []).length})</span>` : ""}</button></nav>` : ""}
    ${id && tab === "clusters" ? clustersTabHtml(clusterStateOf(g.levels, g.clusters), error, ctx.people ? { projectId: id, items: (g.itemIds ?? []).length > 0 ? (ctx.items ?? []).filter((i) => (g.itemIds ?? []).includes(i.id)) : ctx.items ?? [], beneficiaries: ctx.people.beneficiaries, enrolments: ctx.people.enrolments, ...(ctx.people.placements ? { placements: ctx.people.placements } : {}), itemNames: Object.fromEntries((ctx.items ?? []).map((i) => [i.id, i.name])), ...(ctx.people.receivers ? { receivers: ctx.people.receivers } : {}), enrolItemIds: (ctx.items ?? []).filter((i) => !(ctx.people?.stockItemIds ?? []).includes(i.id)).map((i) => i.id), stock: (ctx.people.stock ?? []).filter((s) => s.giftProjectId === id), stockItems: ((g.itemIds ?? []).length > 0 ? (ctx.items ?? []).filter((i) => (g.itemIds ?? []).includes(i.id)) : ctx.items ?? []).filter((i) => (ctx.people?.stockItemIds ?? []).includes(i.id)), partners: (g.partnerIds ?? []).map((pid) => ({ id: pid, name: ctx.partners.find((p) => p.id === pid)?.name ?? pid })) } : undefined) : `<div class="pf-body">
      <section><div class="pf-grid"><label class="pf-field"><span>Display Name</span><input id="pr-name" value="${esc(g.name ?? "")}" placeholder="For example Aghosh" required /></label>
        ${crmLocked ? `<label class="pf-field"><span>Original Name (fixed)</span><input id="pr-crm-locked" value="${esc(crmLocked)}" readonly aria-readonly="true" title="The CRM's own project name. It cannot be changed, so this project stays tied to it." /></label>`
          : `<label class="pf-field"><span>Original Name</span><select id="pr-crm" aria-label="Original Name"><option value="">Not linked to a CRM project</option>${ctx.crmNames.map((n) => `<option value="${esc(n.name)}">${esc(n.name)} (${n.gifts})</option>`).join("")}</select></label>`}</div>
        <p class="muted">${crmLocked ? "The Original Name is the CRM's own project name. It is the project's hard link to the CRM and cannot be changed. Give the project any Display Name you like to see in OUTCOMES." : "Choose the CRM project name it answers to: its Original Name. Once saved, it is fixed. Leave it unlinked for a project made only in OUTCOMES."}</p></section>
      <section><h3>Benefits offered</h3><p class="muted">Tick the benefits (gift items) this project offers. A gift for a benefit it does not offer waits for a person to decide. With none ticked, it offers any.</p>
        <div class="pf-items">${(ctx.items ?? []).length ? (ctx.items ?? []).map((i) => `<label class="tick"><input type="checkbox" class="pr-item" value="${esc(i.id)}"${items.has(i.id) ? " checked" : ""} /> ${esc(i.name)}</label>`).join("") : '<span class="muted">No items yet. They appear when gifts arrive from the CRM.</span>'}</div></section>
      <section><h3>Partners / vendors</h3><p class="muted">Tick the partners (vendors) that deliver this project. They take work in the order shown: the first until it is full, then the next. Use the arrows to change the order. With none ticked, its gifts wait for a person to decide.</p>
        <div class="pf-vendors" id="pr-vendors">${ordered.length ? ordered.map((p) => `<div class="pf-vendor"><label class="tick"><input type="checkbox" class="pr-partner" value="${esc(p.id)}"${partners.has(p.id) ? " checked" : ""} /> ${esc(p.name)}</label><span class="pf-vbtns"><button type="button" data-pj="vup" aria-label="Move up" title="Move up">&uarr;</button><button type="button" data-pj="vdown" aria-label="Move down" title="Move down">&darr;</button></span></div>`).join("") : '<span class="muted">No partners yet. Add them on the Partners page.</span>'}</div></section>
      <section><label class="pf-field wide"><span>Notes</span><textarea id="pr-notes" rows="2">${esc(g.notes ?? "")}</textarea></label></section>
    </div>`}
    ${id && tab === "clusters" ? '<footer><button data-pj="cancel">Close</button></footer>' : `    <footer><span id="pr-error" class="pf-error" role="alert">${esc(error)}</span>${id ? '<button data-pj="remove" title="Remove this project. Gifts that carried its CRM project name then have no project">Remove project</button>' : ""}<button data-pj="cancel">Cancel</button><button class="primary" data-pj="save">Save project</button></footer>`}
  </div></div>`;
}

// Reads the form back as the profile the server expects. Needs a page.
export function readProjectForm(root: ParentNode): Record<string, unknown> {
  const val = (id: string) => (root.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";
  return { name: val("pr-name"), crmName: val("pr-crm"), partnerIds: [...root.querySelectorAll(".pr-partner:checked")].map((i) => (i as HTMLInputElement).value), itemIds: [...root.querySelectorAll(".pr-item:checked")].map((i) => (i as HTMLInputElement).value), notes: val("pr-notes") };
}
