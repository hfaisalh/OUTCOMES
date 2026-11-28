/**
 * signin-handler.ts
 *
 * What it does: POST /api/owner-login (DECISIONS 250), the one address for the test sign-ins (the host allows only 12 functions). Three things arrive here:
 * (1) an email and password, which sign in as that account and as nothing else; (2) `action` login-add or login-remove, which manage the accounts and need the settings permission; (3) a passphrase, the owner's sign-in, handled as before (handleOwnerLogin) and the way to make the first account.
 * Who calls it: api/owner-login.ts and the tests. Depends on: logins.ts, launch-token.ts, http.ts, store.ts and the owner sign-in in handlers.ts.
 * Rules: an account signs in only to the organisation that holds it. A wrong email and a wrong password give the same answer. A plain form post gets redirects, a script gets JSON.
 */

import { accountLimit, callerOf, signInLimit, tooMany } from "./guard.js";
import { PERMISSIONS as P } from "../../app/menu.js";
import { addLogin, findLogin, PLATFORM_ORG, removeLogin, sessionPartsFor } from "./logins.js";
import { sessionCookie, sessionFrom, SESSION_SECONDS, signToken, type Claims } from "./launch-token.js";
import { defaultConfig } from "./store.js";
import { handleOwnerLogin, DEMO_ORG, OWNER_ORG } from "./handlers.js";
import { PARTNER_PERMISSIONS } from "../13-partner-portal/scope.js";
import { json, need, nowSeconds, sessionOf, text, withConflictRetry, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

const isForm = (req: HttpRequest): boolean => (req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
const back = (to: string): HttpResponse => ({ status: 302, headers: { location: to, "cache-control": "no-store" } });

// --- Manage the accounts (settings permission) ---
async function manage(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const a = need(req, d, P.settings);
  if ("response" in a) {
    // Rule: a person who pressed a button on the page is sent back with a plain sentence, never shown the server's raw answer.
    if (!isForm(req)) return a.response;
    const why = a.response.status === 401 ? "Your sign-in has run out (it lasts one hour). Sign in again." : "Your account is not allowed to change sign-in accounts.";
    return back(`/app/?account=${encodeURIComponent(why)}`);
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const config = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
  const existing = config.logins ?? [];
  let next = existing;
  let error = "";
  if (b["action"] === "login-add") {
    const r = addLogin(existing, { email: b["email"], name: b["name"], role: b["role"], partnerId: b["partnerId"], password: b["password"] }, (config.projects ?? []).map((p) => p.id));
    if ("error" in r) error = r.error; else next = r.value;
  } else if (b["action"] === "login-remove") next = removeLogin(existing, b["email"]);
  else return json(400, { error: "That request is not known." });
  if (error === "") await d.store.putConfig(a.claims.org, { ...config, logins: next });
  if (isForm(req)) return back(error === "" ? "/app/#settings" : `/app/?account=${encodeURIComponent(error)}#settings`);
  return error === "" ? json(200, { ok: true }) : json(400, { error });
}

// --- Sign in with an email and password ---
async function signInWithAccount(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const b = (req.body ?? {}) as Record<string, unknown>;
  // Rule (DECISIONS 291): wrong tries are counted for the address and for the email, and too many stop sign-in for a while.
  const addr = `login|${callerOf(req)}`;
  const acct = `acct|${typeof b["email"] === "string" ? b["email"].trim().toLowerCase().slice(0, 120) : ""}`;
  const now0 = d.nowMs();
  if (signInLimit.blocked(addr, now0) || accountLimit.blocked(acct, now0)) {
    const wait = Math.max(signInLimit.retrySeconds(addr, now0), accountLimit.retrySeconds(acct, now0));
    return isForm(req) ? back("/app/?signin=wait") : tooMany(wait);
  }
  // Rule (DECISIONS 333): the platform administrators are looked for first, then every organisation, so everyone signs in on this one screen. The demo organisation is only looked at when the test sign-in is on.
  const known = (await d.store.listOrgs()).filter((o) => o !== PLATFORM_ORG && (o !== DEMO_ORG || d.demoLogin));
  const orgs = [PLATFORM_ORG, ...new Set([OWNER_ORG, ...known])];
  for (const org of orgs) {
    const config = await d.store.getConfig(org);
    const login = findLogin(config?.logins ?? [], b["email"], b["password"]);
    if (!login) continue;
    const parts0 = sessionPartsFor(login);
    if ((parts0.platform === true) !== (org === PLATFORM_ORG)) continue; // Rule: only the reserved platform place makes a platform administrator, and nothing else is kept there
    signInLimit.clear(addr);
    accountLimit.clear(acct);
    const now = nowSeconds(d);
    const parts = parts0;
    // A platform administrator opens the first organisation it may switch to: the owner's, else the first there is.
    const home = parts.platform ? (known.includes(OWNER_ORG) || known.length === 0 ? OWNER_ORG : (known[0] as string)) : org;
    const claims: Claims = { typ: "launch", jti: d.newId(), sub: `login-${login.email}`, name: login.name, org: home, perms: parts.perms, ...(parts.partner ? { partner: parts.partner } : {}), ...(parts.platform ? { platform: true } : {}), iat: now, exp: now + 60 };
    const headers = { "set-cookie": sessionCookie(signToken(d.secrets.session, sessionFrom(claims, d.newId(), now)), SESSION_SECONDS), "cache-control": "no-store" };
    return isForm(req) ? { status: 302, headers: { ...headers, location: "/app/" } } : json(200, { ok: true }, headers);
  }
  signInLimit.fail(addr, now0);
  accountLimit.fail(acct, now0);
  return isForm(req) ? back("/app/?signin=wrong-login") : json(401, { error: "That email or password is not right." });
}

// --- A platform administrator switches organisation (DECISIONS 333) ---
// Rule: only a platform session may do it, only to an organisation that exists, and it keeps the same person and expiry. Every switch is written to that organisation's change log, so its administrators can see a platform administrator was there.
async function switchOrg(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const c = sessionOf(req, d);
  if (!c) return json(401, { error: "Please sign in first." });
  if (c.platform !== true) return json(403, { error: "Your account may not switch organisation." });
  const want = typeof (req.body as { org?: unknown } | undefined)?.org === "string" ? (req.body as { org: string }).org : "";
  if (want === PLATFORM_ORG || !(await d.store.listOrgs()).includes(want)) return json(400, { error: "That organisation was not found." });
  const now = nowSeconds(d);
  const next: Claims = { ...c, jti: d.newId(), org: want, iat: now };
  try { await d.store.addChanges(want, [{ at: new Date(d.nowMs()).toISOString(), by: `${c.name} (platform)`, action: "platform-enter", section: "platform", key: "", change: "added", record: { note: "A platform administrator opened this organisation" } }]); } catch (e) { console.error("platform entry not logged", e); }
  return json(200, { ok: true }, { "set-cookie": sessionCookie(signToken(d.secrets.session, next), Math.max(1, c.exp - now)), "cache-control": "no-store" });
}

// --- Switch between staff and a partner's view, for testing (DECISIONS 255) ---
// Rule: only a staff person who may change settings can look at the app as a partner, and only as a partner that exists. The partner view carries the real person in `staff`, so one press brings them back; it keeps the same expiry, so switching never extends a sign-in.
async function viewAs(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const c = sessionOf(req, d);
  if (!c) return json(401, { error: "Please sign in first." });
  const want = typeof (req.body as { partner?: unknown } | undefined)?.partner === "string" ? ((req.body as { partner: string }).partner) : "";
  const now = nowSeconds(d);
  let next: Claims;
  if (want === "") {
    if (!c.staff) return json(400, { error: "You are already on the staff view." });
    next = { typ: "session", jti: d.newId(), sub: c.staff.sub, name: c.staff.name, org: c.org, perms: c.staff.perms, iat: now, exp: c.exp };
  } else {
    if (c.partner !== undefined || !c.perms.includes(P.settings)) return json(403, { error: "Your account may not switch views." });
    const config = (await d.store.getConfig(c.org)) ?? defaultConfig();
    if (!(config.projects ?? []).some((p) => p.id === want)) return json(400, { error: "That partner was not found." });
    next = { typ: "session", jti: d.newId(), sub: `view-${c.sub}`, name: c.name, org: c.org, perms: PARTNER_PERMISSIONS, partner: want, staff: { sub: c.sub, name: c.name, perms: c.perms }, iat: now, exp: c.exp };
  }
  return json(200, { ok: true }, { "set-cookie": sessionCookie(signToken(d.secrets.session, next), Math.max(1, c.exp - now)), "cache-control": "no-store" });
}

export async function handleSignIn(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "POST") return text(404, "Not found.");
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (b["action"] === "view-as") return viewAs(req, d);
  if (b["action"] === "switch-org") return switchOrg(req, d);
  if (typeof b["action"] === "string") return withConflictRetry(manage, req, d);
  if (typeof b["email"] === "string") return signInWithAccount(req, d);
  return handleOwnerLogin(req, d);
}
