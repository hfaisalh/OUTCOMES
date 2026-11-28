/**
 * switch.ts
 *
 * What it does: the one on/off switch used everywhere a setting or a mark can be on or off (DECISIONS 285), first for every Priority control, so they look and behave the same: a gift, a parked outcome, a beneficiary, and a workflow's "Priority gifts first".
 * Who calls it: the gift window (gifts-page.ts), the parked outcomes list (cluster-people.ts), the beneficiary form (register-form.ts), and the workflow settings (workflows-page.ts, rules-page.ts). Depends on: nothing but the escaping. Pure: it takes the label, the state and the data attributes and returns HTML.
 * Data flow: the switch is a real checkbox with role="switch", so a click or the Space key toggles it and the page's existing change handlers read `.checked` and the data attributes, as they did for the checkboxes they replace.
 * UX: the label is always visible and says what the switch is; on and off are told apart by position and colour and by the screen reader's "on" and "off", never colour alone; keyboard focus shows a ring on the track; the track is 44px wide for touch; the slide is skipped when the person asks for less motion.
 */

import { esc } from "./pages";

export interface SwitchOptions {
  label: string; // what it is, for example "Priority"
  on: boolean;
  attrs?: string; // data attributes for the page's change handler, for example `data-gift-priority="o1"`
  id?: string;
  hint?: string; // a short explanation shown as the tooltip
  disabled?: boolean;
  compact?: boolean; // no visible label text beside it (the label is still read out): for a table cell with a column heading
}

export function switchHtml(o: SwitchOptions): string {
  return `<label class="tg${o.compact ? " tg-compact" : ""}${o.disabled ? " tg-off" : ""}"${o.hint ? ` title="${esc(o.hint)}"` : ""}><input type="checkbox" role="switch" class="tg-in"${o.id ? ` id="${esc(o.id)}"` : ""}${o.on ? " checked" : ""}${o.disabled ? " disabled" : ""}${o.compact ? ` aria-label="${esc(o.label)}"` : ""}${o.attrs ? ` ${o.attrs}` : ""}><span class="tg-track" aria-hidden="true"><i></i></span>${o.compact ? "" : `<span class="tg-text">${esc(o.label)}</span>`}</label>`;
}
