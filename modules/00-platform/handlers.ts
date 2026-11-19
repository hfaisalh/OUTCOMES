/**
 * handlers.ts
 *
 * What it does: the server's endpoints written as plain functions: a request goes in, a response
 * comes out. launch (sign-in from the CRM), me, config, work orders, and pick-up. The thin Vercel
 * files in api/ only translate to and from Node's request and response.
 * Who calls it: api/*.ts and the tests.
 * Depends on: launch-token.ts, store.ts, pickup.ts, and menu.ts permissions in app/.
 *
 * Rules: the organisation always comes from the signed session. Each endpoint needs the right
 * permission. A launch token works once. Errors are plain English and never show secrets.
 */

import { PERMISSIONS as P } from "../../app/menu.js";
import { currentFeedConfig } from "../01c-crm-connector/feed.js";
import type { CrmReader, CrmReporter } from "../01c-crm-connector/reader.js";
import { isCurrentCategory } from "../02-project-rules/categories.js";
import { EXPLAIN, readCookie, sessionCookie, sessionFrom, SESSION_COOKIE, SESSION_SECONDS, verifyToken, signToken, clearSessionCookie, type Claims } from "./launch-token.js";
import { rerouteUnrouted, runPickup } from "./pickup.js";
import { defaultConfig, type OrgConfig, type Store } from "./store.js";

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
  demoLogin: boolean; // true only where the test sign-in is switched on (DEMO_LOGIN=1). Never for a live organisation
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse => ({ status, body, headers });
const text = (status: number, body: string): HttpResponse => ({ status, body, headers: { "content-type": "text/plain; charset=utf-8" } });
const nowSeconds = (d: Deps) => Math.floor(d.nowMs() / 1000);

// The signed-in person, from the session cookie, or null.
function sessionOf(req: HttpRequest, d: Deps): Claims | null {
  const v = verifyToken(d.secrets.session, readCookie(req.headers["cookie"], SESSION_COOKIE), "session", nowSeconds(d));
  return v.ok ? v.claims : null;
}

// Rule: no session is 401, a session without the permission is 403.
function need(req: HttpRequest, d: Deps, perm: string): { claims: Claims } | { response: HttpResponse } {
  const claims = sessionOf(req, d);
  if (!claims) return { response: json(401, { error: "Please open OUTCOMES from the CRM to sign in." }) };
  if (!claims.perms.includes(P.access) || !claims.perms.includes(perm)) return { response: json(403, { error: "Your CRM role does not allow this." }) };
  return { claims };
}

// GET /api/launch?token=...  The CRM sends the person here. Starts a session and sends them to the app.
export async function handleLaunch(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const token = req.query["token"] ?? "";
  if (token === "") return text(400, "The sign-in link has no token. Open OUTCOMES from the CRM.");
  const now = nowSeconds(d);
  const v = verifyToken(d.secrets.launch, token, "launch", now);
  if (!v.ok) return text(401, EXPLAIN[v.reason]);
  if (!v.claims.perms.includes(P.access)) return text(403, "Your CRM role does not allow OUTCOMES.");
  // Rule: each launch token works once, so a copied link is useless.
  if (!(await d.store.useLaunchId(v.claims.jti, v.claims.exp, now))) return text(401, "The sign-in link was already used. Open OUTCOMES from the CRM again.");
  const session = signToken(d.secrets.session, sessionFrom(v.claims, d.newId(), now));
  // The token is not kept in the address: the person lands on the app with a clean link.
  return { status: 302, headers: { location: "/app/", "set-cookie": sessionCookie(session, SESSION_SECONDS), "cache-control": "no-store" } };
}

// GET /api/demo-login  TEST ONLY. Signs in as an administrator of the "demo" organisation, whose CRM is the
// pretend one (Module 1d). Rule: it answers 404 unless the server was set up for testing (DEMO_LOGIN=1),
// and it can only ever open the "demo" organisation, never a real one.
export const DEMO_ORG = "demo";
export async function handleDemoLogin(_req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (!d.demoLogin) return text(404, "Not found.");
  const now = nowSeconds(d);
  const config = (await d.store.getConfig(DEMO_ORG)) ?? defaultConfig();
  if (config.crm.kind === "none") await d.store.putConfig(DEMO_ORG, { ...config, crm: { kind: "demo" } });
  const claims: Claims = { typ: "launch", jti: d.newId(), sub: "demo-user", name: "Demo administrator", org: DEMO_ORG, perms: Object.values(P), iat: now, exp: now + 60 };
  const session = signToken(d.secrets.session, sessionFrom(claims, d.newId(), now));
  return { status: 302, headers: { location: "/app/", "set-cookie": sessionCookie(session, SESSION_SECONDS), "cache-control": "no-store" } };
}

// POST /api/logout
export const handleLogout = async (): Promise<HttpResponse> => json(200, { ok: true }, { "set-cookie": clearSessionCookie() });

// GET /api/me  Who is signed in. 401 when nobody, which the page takes to mean demo mode.
export async function handleMe(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const c = sessionOf(req, d);
  if (!c) return json(401, { error: "Not signed in." });
  // `demo` tells the page it is talking to the pretend CRM, so it can refresh by itself.
  const demo = (await d.store.getConfig(c.org))?.crm.kind === "demo";
  return json(200, { name: c.name, org: c.org, perms: c.perms, expiresAt: c.exp, storage: d.storage, demo });
}

// GET and PUT /api/config  Categories (each with its framework) and the item map. PUT needs permission to map items.
export async function handleConfig(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method === "PUT") {
    const a = need(req, d, P.mapFrameworks);
    if ("response" in a) return a.response;
    const b = req.body as Partial<OrgConfig> | undefined;
    if (!b || !Array.isArray(b.categories) || !b.categories.every(isCurrentCategory) || typeof b.itemMap !== "object" || b.itemMap === null) return json(400, { error: "The setup is incomplete." });
    // Rule: only the parts staff may change here are taken. The CRM setting and feed settings stay as they are.
    const current = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
    const next = { ...current, categories: b.categories, itemMap: b.itemMap as OrgConfig["itemMap"] };
    await d.store.putConfig(a.claims.org, next);
    const routed = rerouteUnrouted(await d.store.listWorkOrders(a.claims.org), next);
    await d.store.saveWorkOrders(a.claims.org, routed);
    return json(200, { ok: true, routed: routed.length });
  }
  const a = need(req, d, P.viewWorkOrders);
  if ("response" in a) return a.response;
  const c = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
  // The CRM setting is not sent to the page, only whether one exists.
  // Rule: a setup saved by an earlier version (before categories held the framework) is shown as empty.
  const current = c.categories.every(isCurrentCategory);
  return json(200, { categories: current ? c.categories : [], itemMap: current ? c.itemMap : {}, feed: currentFeedConfig(c.feed), crmConnected: c.crm.kind !== "none" });
}

// GET /api/work-orders  This organisation's work orders, what is held for review, and the last pick-up.
export async function handleWorkOrders(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const a = need(req, d, P.viewWorkOrders);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const [workOrders, review, run] = await Promise.all([d.store.listWorkOrders(org), d.store.getReview(org), d.store.getRun(org)]);
  return json(200, { workOrders, review, run });
}

async function pickupOne(org: string, d: Deps) {
  const config = await d.store.getConfig(org);
  const link = config ? d.connector(config) : null;
  if (!link) return { org, skipped: "No CRM is connected for this organisation." };
  const run = await runPickup(org, { store: d.store, reader: link.reader, reporter: link.reporter, nowIso: new Date(d.nowMs()).toISOString() });
  return { org, ok: run.ok, error: run.error, created: run.created, rerouted: run.rerouted };
}

// POST /api/pickup  A person runs a pick-up for their own organisation now.
// GET  /api/pickup  The scheduled job (Vercel cron) runs one for every organisation, with the cron secret.
export async function handlePickup(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method === "POST") {
    const a = need(req, d, P.settings);
    if ("response" in a) return a.response;
    return json(200, await pickupOne(a.claims.org, d));
  }
  if (d.secrets.cron === "" || req.headers["authorization"] !== `Bearer ${d.secrets.cron}`) return json(401, { error: "Not allowed." });
  const results = [];
  for (const org of await d.store.listOrgs()) results.push(await pickupOne(org, d));
  return json(200, { results });
}
