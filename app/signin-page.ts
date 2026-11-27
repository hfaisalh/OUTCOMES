/**
 * signin-page.ts
 *
 * What it does: the screen shown before anything else when nobody is signed in (DECISIONS 91, 250). The usual email and password form (an account made for testing, which signs in as exactly what it was made as), a note that real sign-in comes from the CRM,
 * the owner's passphrase sign-in with an example role, and a link to the demo with invented data.
 * Who calls it: app/main.ts. Depends on: the example roles (modules/00-platform/roles.ts). Pure: it takes a few values and returns HTML.
 *
 * Rule: in the real product people come from the CRM with their role (DECISIONS 24). The email accounts are for testing the staff and partner journeys (DECISIONS 250).
 * Rule: the password and the passphrase go to the server in a plain form post, never into the address.
 */

import { ROLES } from "../modules/00-platform/roles";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function signinHtml(note: string): string {
  return `<div class="signin"><div class="signin-card">
    <div class="signin-brand">OUTCOMES<small>Fulfilment and donor feedback</small></div>
    <h1>Sign in</h1>
    ${note ? `<div class="note warnnote">${esc(note)}</div>` : ""}
    <form method="post" action="/api/owner-login" class="signin-form">
      <label class="signin-field"><span>Email</span><input type="email" name="email" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus></label>
      <label class="signin-field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
      <button class="primary signin-submit" type="submit">Sign in</button>
      <p class="muted">You see only what your account allows. A partner sees only its own children and gifts.</p>
    </form>
    <section>
      <h2>From the CRM</h2>
      <p class="muted">Open OUTCOMES from the button in your CRM. You are signed in with your CRM account, and what you can see depends on your CRM role. OUTCOMES has no separate passwords.</p>
    </section>
    <details class="signin-owner">
      <summary>Owner sign-in (passphrase)</summary>
      <p class="muted">For the people building OUTCOMES, and to make the first accounts. Pick a role to see what that kind of person sees.</p>
      <form method="post" action="/api/owner-login">
        <label class="signin-field"><span>Passphrase</span><input type="password" name="passphrase" autocomplete="off" required></label>
        <label class="signin-field"><span>Sign in as</span><select name="role">${ROLES.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}</select></label>
        <ul class="signin-roles muted">${ROLES.map((r) => `<li><b>${esc(r.name)}.</b> ${esc(r.blurb)}</li>`).join("")}</ul>
        <button type="submit">Sign in as owner</button>
      </form>
    </details>
    <p class="muted"><a href="?demo=1">Look at the demo with invented data</a>. Nothing in it is saved.</p>
  </div></div>`;
}

export const checkingHtml = (): string => `<div class="signin"><div class="signin-card"><div class="signin-brand">OUTCOMES</div><p class="muted">Checking your sign-in...</p></div></div>`;
