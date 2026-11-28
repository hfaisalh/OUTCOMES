/**
 * view-as-menu.ts
 *
 * What it does: the "Look at the app as" part of the staff user menu (DECISIONS 255): one button for each partner, so a person testing can see the partner's own screen in one press, without signing out and in again.
 * Who calls it: app/main.ts, inside the user menu, only for a person the server says may switch (it sends `partners` to a person who may change settings). Depends on: nothing. Pure: it takes the list and returns HTML.
 * Data flow: a button carries the partner's id in data-partner. main.ts calls switchView (app/portal/partner-session.ts), the server answers with a session for that view, and the page reloads into it. The partner screen has a Back to staff button.
 */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function viewAsMenu(partners: { id: string; name: string }[] | undefined): string {
  if (!partners || partners.length === 0) return "";
  return `<div class="popnote muted">Look at the app as a partner (for testing)</div>${partners.map((p) => `<button class="item" data-action="view-as" data-partner="${esc(p.id)}">${esc(p.name)}</button>`).join("")}`;
}
