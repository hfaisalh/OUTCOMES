/**
 * partner-beneficiaries.ts
 *
 * What it does: the partner's list of its own beneficiaries (DECISIONS 260): each with where it stands (enrolled, on the waiting list, or what it still needs to be complete), an Edit button, and Add beneficiary at the top, which opens the form in place.
 * Who calls it: app/portal/partner-home.ts. Depends on: the partner slice type, the waiting rule's `missingFor` (modules/07-beneficiaries/waiting.ts), partner-entry-form.ts and the shared pieces in partner-outcomes.ts. Pure: it takes the slice and the screen state and returns HTML.
 * Data flow: the slice holds only this partner's beneficiaries. The clicks are handled in app/portal/partner-session.ts. A household is shown but not editable here (MWF looks after households).
 */

import type { PartnerSlice } from "../../modules/13-partner-portal/scope";
import { missingFor } from "../../modules/07-beneficiaries/waiting";
import { csvWindowHtml } from "./partner-csv";
import { entryFormHtml } from "./partner-entry-form";
import { esc, type PartnerUi } from "./partner-outcomes";

export function beneficiariesCardHtml(slice: PartnerSlice, ui: PartnerUi): string {
  const enrolled = new Map(slice.enrolments.filter((e) => e.status === "active").map((e) => [e.beneficiaryId, e.giftProjectId]));
  const projectName = (id: string): string => slice.giftProjects.find((g) => g.id === id)?.name ?? "";

  // Where one stands, in words (with a colour in the pill, never colour alone).
  const standing = (b: PartnerSlice["beneficiaries"][number]): string => {
    if (enrolled.has(b.id)) return `<span class="pill blue">Enrolled</span>`;
    if (b.kind === "household") return `<span class="pill">Not enrolled</span>`;
    if (b.eligibility === "ready") return `<span class="pill ready">On the waiting list</span>`;
    if (b.eligibility === "declined") return `<span class="pill review">Cannot be offered</span>`;
    const gaps = missingFor(b);
    return `<span class="pill unrouted">Needs details</span>${gaps.length > 0 ? `<div class="muted">Add ${esc(gaps.join(", "))}</div>` : ""}`;
  };
  const rows = slice.beneficiaries.map((b) => `<tr><td>${esc(b.id)}</td><td>${esc(b.name)}${b.kind === "household" ? ` <span class="muted">Household</span>` : ""}</td><td>${esc(projectName(enrolled.get(b.id) ?? b.targetProjectId ?? ""))}</td><td>${standing(b)}</td><td class="pb-ans">${b.kind === "person" ? `<button data-action="pt-edit" data-id="${esc(b.id)}" aria-label="Edit ${esc(b.name)}">Edit</button>` : ""}</td></tr>`).join("");
  const notes = `${ui.message && !ui.form ? `<div class="note" role="status">${esc(ui.message)}</div>` : ""}`;
  const table = rows ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Name</th><th>Project</th><th>Where they stand</th><th><span class="sr-only">Edit</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No beneficiaries yet. Add the first one.</div>`;
  const canAdd = slice.giftProjects.length > 0;
  return `<section class="card" aria-label="Your beneficiaries"><div class="pe-head"><h2>Your beneficiaries</h2>${canAdd ? `<span class="pe-btns"><button data-action="pt-csv-open">Upload CSV</button><button class="primary" data-action="pt-add">Add beneficiary</button></span>` : ""}</div>
    ${canAdd ? "" : `<p class="muted">You can add beneficiaries once MWF gives you a project to deliver.</p>`}${notes}
    ${ui.form ? entryFormHtml(ui.form, slice.giftProjects) : ""}${ui.csv ? csvWindowHtml(ui.csv, slice.giftProjects) : ""}${table}</section>`;
}
