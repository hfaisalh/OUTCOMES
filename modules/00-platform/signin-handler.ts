/**
 * signin-handler.ts
 *
 * What it does: POST /api/owner-login (DECISIONS 250), the one address for the test sign-ins (the host allows only 12 functions). Three things arrive here:
 * (1) an email and password, which sign in as that account and as nothing else; (2) `action` login-add or login-remove, which manage the accounts and need the settings permission; (3) a passphrase, the owner's sign-in, handled as before (handleOwnerLogin) and the way to make the first account.
 * Who calls it: api/owner-login.ts and the tests. Depends on: logins.ts, launch-token.ts, http.ts, store.ts and the owner sign-in in handlers.ts.
 * Rules: an account signs in only to the organisation that holds it. A wrong email and a wrong password give the same answer. A plain form post gets redirects, a script gets JSON.
 */

import { PERMISSIONS as P } from "../../app/menu.js";
import { addLogin, findLogin, removeLogin, sessionPartsFor } from "./logins.js";
import { sessionCookie, sessionFrom, SESSION_SECONDS, signToken, type Claims } from "./launch-token.js";
import { defaultConfig } from "./store.js";
import { handleOwnerLogin, DEMO_ORG, OWNER_ORG } from "./handlers.js";
import { json, need, nowSeconds, text, withConflictRetry, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

const isForm = (req: HttpRequest): boolean => (req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
const back = (to: string): HttpResponse => ({ status: 302, headers: { location: to, "cache-control": "no-store" } });

// --- Manage the accounts (settings permission) ---
async function manage(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const a = need(req, d, P.settings);
  if ("response" in a) return a.response;
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
  const orgs = d.demoLogin ? [OWNER_ORG, DEMO_ORG] : [OWNER_ORG];
  for (const org of orgs) {
    const config = await d.store.getConfig(org);
    const login = findLogin(config?.logins ?? [], b["email"], b["password"]);
    if (!login) continue;
    const now = nowSeconds(d);
    const parts = sessionPartsFor(login);
    const claims: Claims = { typ: "launch", jti: d.newId(), sub: `login-${login.email}`, name: login.name, org, perms: parts.perms, ...(parts.partner ? { partner: parts.partner } : {}), iat: now, exp: now + 60 };
    const headers = { "set-cookie": sessionCookie(signToken(d.secrets.session, sessionFrom(claims, d.newId(), now)), SESSION_SECONDS), "cache-control": "no-store" };
    return isForm(req) ? { status: 302, headers: { ...headers, location: "/app/" } } : json(200, { ok: true }, headers);
  }
  return isForm(req) ? back("/app/?signin=wrong-login") : json(401, { error: "That email or password is not right." });
}

export async function handleSignIn(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "POST") return text(404, "Not found.");
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b["action"] === "string") return withConflictRetry(manage, req, d);
  if (typeof b["email"] === "string") return signInWithAccount(req, d);
  return handleOwnerLogin(req, d);
}
