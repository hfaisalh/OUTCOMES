/**
 * home-page.ts
 *
 * What it does: the Home page (DECISIONS 328): the front doors of OUTCOMES. A person chooses what they came to do: set up, do the work of today, or see how it is going. The Set up door is built; the others are marked as coming next. Choosing a door opens it below.
 * Who calls it: app/main.ts. Depends on: the setup guide and steps in this folder, esc and View from app/shared/pages.ts. Pure: it takes the View and which door and step are open, and returns HTML.
 * Data flow: a door button sets the open door (app/home/home-events.ts); the progress on the Set up door comes from the data on every draw.
 * UX: three cards in a row with a name, a promise in one line and one action; the recommended door says Start here until setup is done; the doors not built yet are shown but disabled and say so in words.
 */

import { esc, type View } from "../shared/pages";
import { setupGuideHtml } from "./setup-guide";
import { guideSteps } from "./setup-steps";

export interface HomeUi { door: string; step: string }
export const noHomeUi = (): HomeUi => ({ door: "", step: "" });

const ICONS: Record<string, string> = {
  setup: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  today: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  health: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
};
const door = (id: string, title: string, promise: string, action: string, opts: { on: boolean; badge?: string; progress?: string; open: boolean }): string =>
  `<${opts.on ? "button type=\"button\"" : "div"} class="dr${opts.open ? " open" : ""}${opts.on ? "" : " off"}"${opts.on ? ` data-door="${id}" aria-expanded="${opts.open}" aria-controls="home-${id}"` : ""}>
    <span class="dr-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] ?? ""}</svg></span>
    <span class="dr-t">${esc(title)}${opts.badge ? ` <span class="pill ${opts.badge === "Start here" ? "ready" : ""}">${esc(opts.badge)}</span>` : ""}</span>
    <span class="dr-p">${esc(promise)}</span>${opts.progress ? `<span class="dr-prog">${esc(opts.progress)}</span>` : ""}
    <span class="dr-a">${esc(action)}</span></${opts.on ? "button" : "div"}>`;

export function homePage(v: View, ui: HomeUi): string {
  const steps = guideSteps(v);
  const done = steps.filter((s) => s.done).length;
  const complete = done === steps.length;
  const setupOpen = ui.door === "setup";
  return `<h1>Home</h1>
    <p class="sub">Choose where you want to start. Each door takes you through what you came to do, one step at a time.</p>
    ${v.message ? `<div class="note" role="status">${esc(v.message)}</div>` : ""}
    <div class="doors">
      ${door("setup", "Set up", "Get OUTCOMES ready: gifts, workflows, partners, projects and beneficiaries.", setupOpen ? "Close" : complete ? "Review the setup" : "Open the guide", { on: true, open: setupOpen, badge: complete ? "Done" : "Start here", progress: `${done} of ${steps.length} steps done` })}
      ${door("today", "Work today", "See what needs a person today: late answers, work to review, gifts to assign.", "Coming next", { on: false, open: false, badge: "Coming next" })}
      ${door("health", "See how it is going", "Is delivery improving? Scores, trends, partners and what to change.", "Coming next", { on: false, open: false, badge: "Coming next" })}
    </div>
    ${setupOpen ? setupGuideHtml(v, ui.step) : ""}`;
}
