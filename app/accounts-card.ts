/**
 * accounts-card.ts
 *
 * What it does: the "Sign-in accounts" card on the Settings page (DECISIONS 250): the test accounts, how to remove one, and a form to add one (email, name, what it signs in as, password).
 * Who calls it: app/pages.ts (settingsPage). Depends on: the example roles (modules/00-platform/roles.ts) and the page View type. Pure: it takes a View and returns HTML.
 * Data flow: the list comes from /api/me (only for a person who may change settings). The forms are plain posts to /api/owner-login, which answers with a redirect back to Settings, so no script is needed.
 */

import { ROLES } from "../modules/00-platform/roles";
import type { View } from "./pages";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The test sign-in accounts (DECISIONS 250), for a person who may change settings. Plain form posts, so no script is needed. A password is never shown or kept, only its hash on the server.
export function accountsCard(v: View): string {
  if (!v.live || !v.logins) return "";
  const partners = v.projects ?? [];
  const what = (l: { role: string; partnerId?: string }): string => (l.role === "partner" ? `Partner: ${partners.find((p) => p.id === l.partnerId)?.name ?? l.partnerId ?? ""}` : (ROLES.find((r) => r.id === l.role)?.name ?? l.role));
  const rows = v.logins.map((l) => `<tr><td>${esc(l.email)}</td><td>${esc(l.name)}</td><td>${esc(what(l))}</td><td><form method="post" action="/api/owner-login"><input type="hidden" name="action" value="login-remove"><input type="hidden" name="email" value="${esc(l.email)}"><button type="submit">Remove</button></form></td></tr>`);
  return `<div class="card"><h2>Sign-in accounts</h2>
    <p class="muted">For testing the staff and partner journeys. A person signs in with an email and password and sees only what the account was made as. In the live product people come from the CRM.</p>
    ${v.ownerNote ? `<div class="note warnnote">${esc(v.ownerNote)}</div>` : ""}
    ${rows.length === 0 ? `<div class="empty">No accounts yet.</div>` : `<table><thead><tr><th>Email</th><th>Name</th><th>Signs in as</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>`}
    <form method="post" action="/api/owner-login" class="account-form">
      <input type="hidden" name="action" value="login-add">
      <label class="signin-field"><span>Email</span><input type="email" name="email" required autocomplete="off"></label>
      <label class="signin-field"><span>Name</span><input type="text" name="name" required autocomplete="off"></label>
      <label class="signin-field"><span>Signs in as</span><select name="role">${ROLES.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join("")}<option value="partner">Partner (choose below)</option></select></label>
      <label class="signin-field"><span>Partner, when signing in as a partner</span><select name="partnerId"><option value="">None</option>${partners.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="signin-field"><span>Password (at least 10 characters)</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <div class="actions"><button class="primary" type="submit">Add account</button></div>
    </form></div>`;
}
