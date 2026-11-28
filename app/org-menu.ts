/**
 * org-menu.ts
 *
 * What it does: the "Organisation" part of the user menu for a platform administrator (DECISIONS 333): one button for each organisation, the one you are in marked, so you switch between them in one press without signing out and in again, as in the account menus of Microsoft and Google.
 * Who calls it: app/main.ts, inside the user menu, only for a person the server says is a platform administrator (it sends `platform` and `orgs`). Depends on: nothing. Pure: it takes the list and returns HTML.
 * Data flow: a button carries the organisation in data-org. main.ts calls switchOrg (app/shared/api.ts), the server answers with a session for that organisation, and the page reloads into it. A test organisation shows its red badge once you are in it.
 */

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function orgMenu(orgs: string[] | undefined, current: string): string {
  if (!orgs || orgs.length === 0) return "";
  return `<div class="popnote muted">Platform administrator: switch organisation</div>${orgs.map((o) => `<button class="item${o === current ? " on" : ""}" data-action="switch-org" data-org="${esc(o)}"${o === current ? ' aria-current="true"' : ""}>${esc(o)}${o === current ? " (you are here)" : ""}${/test/i.test(o) ? " · test" : ""}</button>`).join("")}`;
}
