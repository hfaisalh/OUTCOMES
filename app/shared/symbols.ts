/**
 * symbols.ts
 *
 * What it does: the one set of small icons the lists use for what a gift is and what state it is in (DECISIONS 216). Each is an inline SVG drawn on a 24 by 24 grid with the same round stroke, so they match each other,
 * take the colour of their text, scale with it, and look the same on every computer. The earlier set was Unicode characters, and some of them (the hand, the no-entry sign, the alarm clock) are drawn as coloured emoji on a
 * Mac and so did not match the rest.
 * Who calls it: app/gifts/gifts-page.ts (which hands the set to the Beneficiaries and Outcomes lists too). Depends on: nothing. Pure: it returns text.
 * Rule: an icon that stands alone carries its meaning in words for a screen reader (the caller adds the label and role), and an icon next to words is only decoration.
 */

const svg = (paths: string): string => `<svg class="sym" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

export const SYM = {
  legacy: svg('<path d="M12 3.5v11M8 10.5l4 4 4-4"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>'), // carried over from the old site (DECISIONS 267): an arrow into a tray, the same idea as the skills' tray-arrow-down icon, drawn in this set's own stroke
  recurring: svg('<path d="M20 11a8 8 0 0 0-14.6-3.2M4.5 4.5v3.8h3.8"/><path d="M4 13a8 8 0 0 0 14.6 3.2M19.5 19.5v-3.8h-3.8"/>'),
  one: svg('<circle cx="12" cy="12" r="8.5"/><path d="M10.2 9.8 12.6 8v8"/>'),
  manual: svg('<path d="M6 3.5 18.5 10l-5.2 1.6L11.6 17z"/><path d="m13.6 12.8 4 4"/>'),
  waiting: svg('<path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5v3.7L12 12l-4.5 4.8v3.7M16.5 3.5v3.7L12 12l4.5 4.8v3.7"/>'),
  ok: svg('<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.4 2.5 2.5 4.8-5.2"/>'),
  look: svg('<path d="M12 3.8 3 19.5h18z"/><path d="M12 10v4.2M12 17v.1"/>'),
  review: svg('<path d="M5.5 21V4M5.5 4.5h12l-2.6 4 2.6 4h-12"/>'),
  unrouted: svg('<path d="M12 20.5v-7M12 13.5 6 6.5M12 13.5l6-7"/><path d="M6 10.5v-4h4M18 10.5v-4h-4"/>'),
  excluded: svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>'),
  paused: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  cancelled: svg('<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>'),
  pastDue: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>'),
  pending: svg('<circle cx="6" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18" cy="12" r="1.1"/>'),
  completed: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="m8.6 12.3 2.4 2.4 4.6-5"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.9v.1"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'),
  columns: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.2 4.5v15M14.8 4.5v15"/>'),
  funnel: svg('<path d="M4 5.5h16l-6.2 7.2v5.6l-3.6 1.7v-7.3z"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  sortUp: svg('<path d="M6.5 14.5 12 9l5.5 5.5"/>'),
  sortDown: svg('<path d="M6.5 9.5 12 15l5.5-5.5"/>'),
};
