/**
 * setup-guide.ts
 *
 * What it does: the setup guide (DECISIONS 328), the first door on the Home page: a wizard with the steps down the side and one step at a time in full, with why it matters, what to do, whether it is done, a button to the page where it is done, and Back and Next.
 * Who calls it: app/home/home-page.ts. Depends on: setup-steps.ts, esc and View from app/shared/pages.ts. Pure: it takes the View and the step shown, and returns HTML.
 * Data flow: the step shown is kept in the screen state (app/home/home-events.ts); each step's done mark comes from the data on every draw.
 * UX: the rail is a list of real buttons with the step's name and a tick with the word Done (never colour alone); the current step is marked by aria-current; one clear action per step; Back and Next never lose where you are.
 */

import { esc, type View } from "../shared/pages";
import { guideSteps } from "./setup-steps";

export function setupGuideHtml(v: View, stepId: string): string {
  const steps = guideSteps(v);
  const firstOpen = steps.findIndex((s) => !s.done);
  const at = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const i = stepId === "" ? (firstOpen < 0 ? 0 : firstOpen) : at;
  const s = steps[i] as ReturnType<typeof guideSteps>[number];
  const done = steps.filter((x) => x.done).length;
  const rail = steps.map((x, k) => `<li><button type="button" class="sg-tab${k === i ? " on" : ""}${x.done ? " done" : ""}" data-guide="${esc(x.id)}"${k === i ? ' aria-current="step"' : ""}><span class="sg-mark" aria-hidden="true">${x.done ? "✓" : k + 1}</span><span class="sg-t">${esc(x.title)}</span>${x.done ? '<span class="sr-only">Done</span>' : ""}</button></li>`).join("");
  const finish = done === steps.length ? `<div class="note" role="status">Everything is set up. Your Dashboard shows how it is going.</div>` : "";
  return `<section class="card sg" id="home-setup" aria-labelledby="sg-h"><div class="sg-top"><h2 id="sg-h">Set up OUTCOMES</h2><span class="muted">${done} of ${steps.length} steps done</span>
      <div class="su-bar" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i style="width:${Math.round((done / steps.length) * 100)}%"></i></div></div>
    ${finish}
    <div class="sg-grid"><nav aria-label="Setup steps"><ol class="sg-rail">${rail}</ol></nav>
      <div class="sg-step" role="region" aria-label="${esc(s.title)}"><div class="sg-kicker">Step ${i + 1} of ${steps.length}${s.done ? ' <span class="pill ready">Done</span>' : ' <span class="pill">Not done yet</span>'}</div>
        <h3>${esc(s.title)}</h3><p class="sg-why">${esc(s.why)}</p>
        <h4>What you do</h4><ul class="sg-todo">${s.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <p class="sg-found"><b>Now:</b> ${esc(s.found)}</p>
        <div class="sg-actions"><button type="button" class="primary" data-page="${esc(s.page)}">${esc(s.open)}</button>
          <button type="button" data-guide="${esc((steps[i - 1] ?? s).id)}"${i === 0 ? " disabled" : ""}>Back</button><button type="button" data-guide="${esc((steps[i + 1] ?? s).id)}"${i === steps.length - 1 ? " disabled" : ""}>Next step</button></div></div></div></section>`;
}
