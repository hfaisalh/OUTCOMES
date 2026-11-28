/**
 * setup-card.ts
 *
 * What it does: the "Getting started" card at the top of the Dashboard (DECISIONS 296): six steps from an empty organisation to gifts reaching beneficiaries, each ticked off by what is actually in the system, each a link to the page where it is done. It disappears once every step is done.
 * Who calls it: app/main.ts, above the Dashboard. Depends on: esc and View from app/shared/pages.ts. Pure: it takes a View and returns HTML, so a new person is never left wondering what to do next.
 * Data flow: nothing is stored. Each step is worked out from the View on every draw, so a step is ticked when the work is really there, and un-ticked if it is removed.
 * UX: a progress count and bar, one clear next step marked, every step a real link with a name, done steps shown with a tick and the word "Done" (never colour alone).
 */

import { esc, type View } from "../shared/pages";

export interface SetupStep { id: string; title: string; why: string; page: string; done: boolean }

// --- The steps, in the order work is done ---
export function setupSteps(v: View): SetupStep[] {
  const gps = v.giftProjects ?? [];
  return [
    { id: "gifts", title: "Bring gifts in", why: "Connect the CRM or upload its export files, so there are gifts to work on.", page: "data-feed", done: v.workOrders.length > 0 },
    { id: "workflows", title: "Say what happens to each kind of gift", why: "A workflow says how a benefit is delivered. Add the standard ones and match your items to them.", page: "workflows", done: (v.frameworks ?? []).length > 0 && v.workOrders.some((w) => (w.categoryId ?? "") !== "") },
    { id: "partners", title: "Add your delivery partners", why: "A partner is whoever delivers: an institute, a charity, a contractor.", page: "partners", done: (v.projects ?? []).length > 0 },
    { id: "projects", title: "Set up your projects", why: "A project is what a donor chooses. Say which partners deliver it and set up its clusters.", page: "projects", done: gps.some((g) => g.partnerIds.length > 0) },
    { id: "beneficiaries", title: "Add beneficiaries", why: "The people who receive. Partners can add their own, or you can.", page: "beneficiaries", done: (v.beneficiaries?.records.length ?? 0) > 0 },
    { id: "assign", title: "Assign gifts to partners", why: "Hand released gifts to the partners that deliver them. This can be automatic.", page: "assignment", done: (v.assignments?.records.length ?? 0) > 0 },
  ];
}

// --- The card ---
export function setupCard(v: View): string {
  const steps = setupSteps(v);
  const left = steps.filter((s) => !s.done);
  if (left.length === 0) return "";
  const next = left[0] as SetupStep;
  const done = steps.length - left.length;
  return `<section class="card su-card" aria-labelledby="su-h"><div class="su-head"><div><h2 id="su-h">Getting started</h2><p class="muted">${done} of ${steps.length} steps done. Each step is ticked when the work is really there.</p></div>
    <div class="su-bar" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i style="width:${Math.round((done / steps.length) * 100)}%"></i></div></div>
    <ol class="su-steps">${steps.map((s) => `<li class="su-step${s.done ? " su-done" : ""}${s.id === next.id ? " su-next" : ""}"><span class="su-mark" aria-hidden="true">${s.done ? "✓" : ""}</span><span class="su-body"><a data-page="${esc(s.page)}">${esc(s.title)}</a><span class="muted">${s.done ? "Done" : esc(s.why)}</span></span>${s.id === next.id ? `<span class="pill ready">Next</span>` : ""}</li>`).join("")}</ol></section>`;
}

// Puts the card under the page's title and introduction (the first paragraph), so the page still starts with its name.
export function withSetupCard(page: string, v: View): string {
  const card = setupCard(v);
  const i = page.indexOf("</p>");
  return card === "" || i < 0 ? page : `${page.slice(0, i + 4)}${card}${page.slice(i + 4)}`;
}
