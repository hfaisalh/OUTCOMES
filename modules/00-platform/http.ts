/**
 * http.ts
 *
 * What it does: the small shared pieces every endpoint uses (DECISIONS 233): the request and response shapes, the dependencies an endpoint is given, the JSON and text answers, who is signed in, and the check that a person has a permission.
 * Who calls it: handlers.ts and outcomes-handler.ts (and, through them, api/*.ts and the tests). Depends on: launch-token.ts (the session), store.ts (the types), the CRM reader types, and menu.ts permissions in app/.
 * Rule: no session is 401, a session without the permission is 403.
 */

import { PERMISSIONS as P } from "../../app/menu.js";
import type { CrmReader, CrmReporter } from "../01c-crm-connector/reader.js";
import { PARTNER_PERMISSION } from "../13-partner-portal/scope.js";
import { readCookie, SESSION_COOKIE, verifyToken, type Claims } from "./launch-token.js";
import { ConflictError, type OrgConfig, type Store } from "./store.js";

export interface HttpRequest {
  method: string;
  query: Record<string, string>;
  headers: Record<string, string | undefined>; // lower case names
  body?: unknown;
}
export interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown; // objects are sent as JSON, strings as text
}

export interface Deps {
  store: Store;
  secrets: { launch: string; session: string; cron: string };
  nowMs: () => number;
  newId: () => string;
  // The reader and reporter for an organisation's CRM, or null when it has none set up.
  connector: (config: OrgConfig) => { reader: CrmReader; reporter: CrmReporter } | null;
  storage: "database" | "memory"; // shown to staff, so nobody trusts the memory version with real work
  testPassphrase?: string; // the sign-in passphrase of the TEST organisation (OWNER_TEST_PASSPHRASE): a separate organisation with its own setup and records, for trying things (DECISIONS 331). Empty or missing switches it off
  ownerPassphrase?: string; // the owner's sign-in passphrase (OWNER_PASSPHRASE). Empty or missing switches the owner sign-in off
  fetch?: (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>; // the place search reaches the internet through this; tests pass a fake
  demoLogin: boolean; // true only where the test sign-in is switched on (DEMO_LOGIN=1). Never for a live organisation
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, body, headers });
export const text = (status: number, body: string): HttpResponse => ({ status, body, headers: { "content-type": "text/plain; charset=utf-8" } });
export const nowSeconds = (d: Deps) => Math.floor(d.nowMs() / 1000);

// The signed-in person, from the session cookie, or null.
export function sessionOf(req: HttpRequest, d: Deps): Claims | null {
  const v = verifyToken(d.secrets.session, readCookie(req.headers["cookie"], SESSION_COOKIE), "session", nowSeconds(d));
  return v.ok ? v.claims : null;
}

// Rule: no session is 401, a session without the permission is 403.
export function need(req: HttpRequest, d: Deps, perm: string): { claims: Claims } | { response: HttpResponse } {
  const claims = sessionOf(req, d);
  if (!claims) return { response: json(401, { error: "Please open OUTCOMES from the CRM to sign in." }) };
  if (!claims.perms.includes(P.access) || !claims.perms.includes(perm)) return { response: json(403, { error: "Your CRM role does not allow this." }) };
  // Rule (DECISIONS 249): a partner's sign-in reaches the partner's own endpoint only, whatever permissions its token lists. Staff never hold the partner permission.
  if (claims.partner !== undefined && perm !== PARTNER_PERMISSION) return { response: json(403, { error: "This is not open to a partner sign-in." }) };
  if (perm === PARTNER_PERMISSION && claims.partner === undefined) return { response: json(403, { error: "This is for a partner's sign-in." }) };
  return { claims };
}

// Rule (DECISIONS 235): if someone saved the setup between this request reading it and writing it, the whole request is run again on the fresh setup (up to 3 times), so the person never sees it. Only after that is it refused with 409.
export async function withConflictRetry(handler: (req: HttpRequest, d: Deps) => Promise<HttpResponse>, req: HttpRequest, d: Deps): Promise<HttpResponse> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await handler(req, d);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      if (attempt >= 3) return json(409, { error: e.message });
    }
  }
}
