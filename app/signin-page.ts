/**
 * signin-page.ts
 *
 * What it does: the screen shown before anything else when nobody is signed in (DECISIONS 91). It explains that sign-in comes from the CRM, offers the
 * test sign-in (a passphrase and an example role, for testing only) and a link to the demo with invented data.
 * Who calls it: app/main.ts. Depends on: the example roles (modules/00-platform/roles.ts). Pure: it takes a few values and returns HTML.
 *
 * Rule: OUTCOMES has no user accounts or passwords of its own. People come from the CRM with their role (DECISIONS 24). The test sign-in is only for the
 * people building and testing it, and is switched off on the server when no passphrase is set.
 * Rule: the passphrase goes to the server in a plain form post, never into the address.
 */

import { ROLES } from "../modules/00-platform/roles";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function signinHtml(note: string): string {
  return `<div class="signin"><div class="signin-card">
    <div class="signin-brand">OUTCOMES<small>Fulfilment and donor feedback</small></div>
    <h1>Sign in</h1>
    ${note ? `<div class="note warnnote">${esc(note)}</div>` : ""}
    <section>
      <h2>From the CRM</h2>
      <p class="muted">Open OUTCOMES from the button in your CRM. You are signed in with your CRM account, and what you can see depends on your CRM role. OUTCOMES has no separate passwords.</p>
    </section>
    <section>
      <h2>Test sign-in</h2>
      <p class="muted">For the people building and testing OUTCOMES. Pick a role to see what that kind of person sees.</p>
      <form method="post" action="/api/owner-login">
        <label class="signin-field"><span>Passphrase</span><input type="password" name="passphrase" autocomplete="current-password" required></label>
        <label class="signin-field"><span>Sign in as</span><select name="role">${ROLES.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select></label>
        <ul class="signin-roles muted">${ROLES.map((r) => `<li><b>${esc(r.name)}.</b> ${esc(r.blurb)}</li>`).join("")}</ul>
        <button class="primary" type="submit">Sign in</button>
      </form>
    </section>
    <p class="muted"><a href="?demo=1">Look at the demo with invented data</a>. Nothing in it is saved.</p>
  </div></div>`;
}

export const checkingHtml = (): string => `<div class="signin"><div class="signin-card"><div class="signin-brand">OUTCOMES</div><p class="muted">Checking your sign-in...</p></div></div>`;
