/**
 * handlers.ts
 *
 * What it does: the server's endpoints written as plain functions: a request goes in, a response
 * comes out. launch (sign-in from the CRM), me, config, work orders, and pick-up. The thin Vercel
 * files in api/ only translate to and from Node's request and response.
 * Who calls it: api/*.ts and the tests. The shared pieces (request and response shapes, sign-in check) are in http.ts, and the Outcomes endpoint, the largest, is in outcomes-handler.ts (re-exported here, so callers do not change).
 * Depends on: launch-token.ts, store.ts, pickup.ts, and menu.ts permissions in app/.
 *
 * Rules: the organisation always comes from the signed session. Each endpoint needs the right
 * permission. A launch token works once. Errors are plain English and never show secrets.
 */

import { PERMISSIONS as P } from "../../app/menu.js";
import { roleById } from "./roles.js";
import { currentFeedConfig } from "../01c-crm-connector/feed.js";
import { isCurrentCategory, isFrameworkTemplate, migrateSetup, type Category, type FrameworkTemplate } from "../02-project-rules/categories.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { EXPLAIN, sessionCookie, sessionFrom, SESSION_SECONDS, verifyToken, signToken, clearSessionCookie, type Claims } from "./launch-token.js";
import { setCovers, setLooked, setParts, setPeriods } from "../04b-commitments/catch-up.js";
import { setManual } from "../04b-commitments/parts.js";
import { excludeWorkOrder, restoreWorkOrder, type WorkOrder } from "../01c-crm-connector/work-orders.js";
import { applyDecision, buildAttention } from "../04-triage/triage.js";
import { unpackFeed } from "../01e-crm-export-adapter/compact.js";
import { backfillFrameworks, deriveParts, reapplyFrameworks, rerouteUnrouted, runPickup } from "./pickup.js";
import { defaultConfig, setupOf, type OrgConfig } from "./store.js";
import { autoCreateProjects } from "../06-projects/projects.js";
import { PARTNER_PERMISSIONS } from "../13-partner-portal/scope.js";
import { publicOf } from "./logins.js";
import { json, need, nowSeconds, sessionOf, text, type Deps, type HttpRequest, type HttpResponse } from "./http.js";
export type { Deps, HttpRequest, HttpResponse } from "./http.js";
export { handleOutcomes, MAX_OUTCOMES } from "./outcomes-handler.js";
export { handlePartner } from "./partner-handler.js";

// GET /api/launch?token=...  The CRM sends the person here. Starts a session and sends them to the app.
export async function handleLaunch(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const token = req.query["token"] ?? "";
  if (token === "") return text(400, "The sign-in link has no token. Open OUTCOMES from the CRM.");
  const now = nowSeconds(d);
  const v = verifyToken(d.secrets.launch, token, "launch", now);
  if (!v.ok) return text(401, EXPLAIN[v.reason]);
  if (!v.claims.perms.includes(P.access)) return text(403, "Your CRM role does not allow OUTCOMES.");
  // Rule (DECISIONS 249): a partner's sign-in never carries staff permissions, whatever the token lists.
  if (v.claims.partner !== undefined) v.claims.perms = v.claims.perms.filter((p) => PARTNER_PERMISSIONS.includes(p));
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
export async function handleDemoLogin(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (!d.demoLogin) return text(404, "Not found.");
  const now = nowSeconds(d);
  // Test sign-in as a partner (DECISIONS 249): /api/demo-login?partner=<partner id>. Sees only that partner's own data.
  const partner = req.query["partner"] ?? "";
  if (partner !== "") {
    const pc: Claims = { typ: "launch", jti: d.newId(), sub: `partner-${partner}`, name: "Demo partner", org: DEMO_ORG, perms: PARTNER_PERMISSIONS, partner, iat: now, exp: now + 60 };
    const ps = signToken(d.secrets.session, sessionFrom(pc, d.newId(), now));
    return { status: 302, headers: { location: "/app/", "set-cookie": sessionCookie(ps, SESSION_SECONDS), "cache-control": "no-store" } };
  }
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
  const cfg = await d.store.getConfig(c.org);
  const kind = cfg?.crm.kind;
  // Rule (DECISIONS 250): the accounts (never their passwords) are listed only for a person who may change settings.
  const logins = c.perms.includes(P.settings) && c.partner === undefined ? (cfg?.logins ?? []).map(publicOf) : undefined;
  return json(200, { ...(logins ? { logins } : {}), name: c.name, org: c.org, perms: c.perms, ...(c.partner ? { partner: c.partner } : {}), expiresAt: c.exp, storage: d.storage, demo: kind === "demo", upload: kind === "upload" });
}

// GET and PUT /api/config  Categories, framework templates, and the item maps. PUT needs permission to map items.
// Rule (DECISIONS 59): an older setup (a framework inside each category) is migrated to templates when read or saved, so both shapes are accepted.
export async function handleConfig(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method === "PUT") {
    const a = need(req, d, P.mapFrameworks);
    if ("response" in a) return a.response;
    const b = req.body as { categories?: unknown; itemMap?: unknown; frameworks?: unknown; itemFramework?: unknown; reapply?: unknown } | undefined;
    if (!b || !Array.isArray(b.categories) || !b.categories.every(isCurrentCategory) || typeof b.itemMap !== "object" || b.itemMap === null) return json(400, { error: "The setup is incomplete." });
    if (b.frameworks !== undefined && (!Array.isArray(b.frameworks) || !b.frameworks.every(isFrameworkTemplate))) return json(400, { error: "A framework in the setup is not valid." });
    if (b.itemFramework !== undefined && (typeof b.itemFramework !== "object" || b.itemFramework === null || !Object.values(b.itemFramework).every((x) => typeof x === "string"))) return json(400, { error: "The item frameworks are not valid." });
    const setup = migrateSetup({ categories: b.categories as Category[], itemMap: b.itemMap as OrgConfig["itemMap"], ...(b.frameworks ? { frameworks: b.frameworks as FrameworkTemplate[] } : {}), ...(b.itemFramework ? { itemFramework: b.itemFramework as Record<string, string> } : {}) });
    const ids = new Set(setup.frameworks.map((f) => f.id));
    if (setup.categories.some((c) => c.frameworkId !== "" && !ids.has(c.frameworkId)) || Object.values(setup.itemFramework).some((f) => !ids.has(f))) return json(400, { error: "A category or item points to a framework that does not exist." });
    // Rule: only the parts staff may change here are taken. The CRM setting and feed settings stay as they are.
    const current = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
    const next: OrgConfig = { ...current, categories: setup.categories, itemMap: setup.itemMap, frameworks: setup.frameworks, itemFramework: setup.itemFramework };
    await d.store.putConfig(a.claims.org, next);
    // Unrouted work orders are routed, then every work order still without a framework is given the one that applies to its item.
    const all = await d.store.listWorkOrders(a.claims.org);
    const rerouted = rerouteUnrouted(all, next);
    const after = all.map((w) => rerouted.find((r) => r.key === w.key) ?? w);
    const filled = backfillFrameworks(after, next);
    const changed = new Map([...rerouted, ...filled].map((w) => [w.key, w]));
    for (const w of filled) changed.set(w.key, { ...(rerouted.find((r) => r.key === w.key) ?? {}), ...w });
    // Only when asked (DECISIONS 64): move every work order to the framework that now applies to its item.
    const again = b.reapply === true ? reapplyFrameworks(after.map((w) => changed.get(w.key) ?? w), next) : [];
    for (const w of again) changed.set(w.key, w);
    // Parts from the price of one part: a price just added gives parts to the gifts that were waiting for it (DECISIONS 113).
    const current2 = after.map((w) => changed.get(w.key) ?? w);
    for (const w of deriveParts(current2, next)) changed.set(w.key, w);
    await d.store.saveWorkOrders(a.claims.org, [...changed.values()]);
    return json(200, { ok: true, routed: rerouted.length, reapplied: again.length });
  }
  const a = need(req, d, P.viewWorkOrders);
  if ("response" in a) return a.response;
  const c = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
  // The CRM setting is not sent to the page, only whether one exists.
  // Rule: a setup in a shape that is not understood at all is shown as empty. An older shape is migrated.
  const current = c.categories.every(isCurrentCategory);
  const setup = current ? setupOf(c) : { categories: [], itemMap: {}, frameworks: [], itemFramework: {} };
  return json(200, { categories: setup.categories, itemMap: setup.itemMap, frameworks: setup.frameworks, itemFramework: setup.itemFramework, feed: currentFeedConfig(c.feed), crmConnected: c.crm.kind !== "none" });
}

// GET /api/work-orders  This organisation's work orders, what is held for review, and the last pick-up.
export async function handleWorkOrders(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const a = need(req, d, P.viewWorkOrders);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const [listed, review, run] = await Promise.all([d.store.listWorkOrders(org), d.store.getReview(org), d.store.getRun(org)]);
  // Rule (DECISIONS 113, 114): parts from the price of one part are given to any work order that has none yet, so a price set earlier reaches gifts without a new upload.
  const config = await d.store.getConfig(org);
  const parted = config ? deriveParts(listed, config) : [];
  if (parted.length > 0) await d.store.saveWorkOrders(org, parted);
  // Rule (DECISIONS 155): a gift that carries a project creates that project. Done here too, so gifts that arrived before this rule get theirs.
  const made = config ? autoCreateProjects(config.giftProjects ?? [], listed) : undefined;
  if (config && made && made.added.length > 0) await d.store.putConfig(org, { ...config, giftProjects: made.projects });
  const byKey = new Map(parted.map((w) => [w.key, w]));
  const workOrders = parted.length > 0 ? listed.map((w) => byKey.get(w.key) ?? w) : listed;
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

// POST /api/owner-login  { passphrase }  The owner signs in with a passphrase held in the server's settings (OWNER_PASSPHRASE),
// until the CRM sign-in exists. Rule: it answers 404 when no passphrase is set, compares without leaking timing, and can only
// open the organisation named OWNER_ORG. Use a long passphrase (16 characters or more).
export const OWNER_ORG = "mwf";
const digest = (s: string) => createHash("sha256").update(s).digest();
export async function handleOwnerLogin(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const secret = d.ownerPassphrase ?? "";
  if (secret === "" || req.method !== "POST") return text(404, "Not found.");
  // A plain form post (the page's sign-in form) gets redirects back to the app. A script (JSON) gets JSON.
  const isForm = (req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
  const given = (req.body as { passphrase?: unknown } | undefined)?.passphrase;
  if (typeof given !== "string" || !timingSafeEqual(digest(given), digest(secret))) {
    return isForm ? { status: 302, headers: { location: "/app/?signin=wrong", "cache-control": "no-store" } } : json(401, { error: "That passphrase is not right." });
  }
  const now = nowSeconds(d);
  const config = (await d.store.getConfig(OWNER_ORG)) ?? defaultConfig();
  if (config.crm.kind === "none") await d.store.putConfig(OWNER_ORG, { ...config, crm: { kind: "upload" } });
  // Rule (DECISIONS 91): the test sign-in can be taken as any example role, so each kind of person can be tried. No role means the administrator, as before.
  const wanted = (req.body as { role?: unknown } | undefined)?.role;
  const role = typeof wanted === "string" && wanted !== "" ? roleById(wanted) : roleById("admin");
  const claims: Claims = { typ: "launch", jti: d.newId(), sub: `test-${role.id}`, name: role.id === "admin" ? "Owner" : `Test: ${role.name}`, org: OWNER_ORG, perms: role.permissions, iat: now, exp: now + 60 };
  const session = signToken(d.secrets.session, sessionFrom(claims, d.newId(), now));
  const headers = { "set-cookie": sessionCookie(session, SESSION_SECONDS), "cache-control": "no-store" };
  return isForm ? { status: 302, headers: { ...headers, location: "/app/" } } : json(200, { ok: true }, headers);
}

// POST /api/import  { columns, rows, source }  Lines from uploaded CRM export files, packed by the page (compact.ts).
// Runs the same pick-up as a scheduled read, so work orders are made and the batch audit is kept. Needs the settings permission.
// Rule: only organisations that take uploads accept one. One that reads its CRM directly refuses, so two sources never mix.
export async function handleImport(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "POST") return text(404, "Not found.");
  const a = need(req, d, P.settings);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const packed = unpackFeed(req.body);
  if ("error" in packed) return json(400, { error: packed.error });
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  if (config.crm.kind === "none") await d.store.putConfig(org, { ...config, crm: { kind: "upload" } });
  else if (config.crm.kind !== "upload") return json(409, { error: "This organisation reads its CRM directly, so uploads are not accepted." });
  const source = String((req.body as { source?: unknown }).source ?? "Uploaded files").slice(0, 200);
  // Rule: notes are plain text from the page, limited in number and length, so they cannot fill the database.
  const rawNotes = (req.body as { notes?: unknown }).notes;
  const notes = Array.isArray(rawNotes) ? rawNotes.filter((n): n is string => typeof n === "string").slice(0, 20).map((n) => n.slice(0, 300)) : [];
  const run = await runPickup(org, { store: d.store, reader: { readFeed: async () => packed.rows }, reporter: { send: async () => undefined }, nowIso: new Date(d.nowMs()).toISOString(), complete: true, source, newId: d.newId, notes });
  return json(200, { ok: run.ok, error: run.error, rows: run.rows, created: run.created, unchanged: run.unchanged, issues: run.issues.slice(0, 5) });
}

// GET /api/audits  The batch audit history for this organisation, newest first.
export async function handleAudits(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const a = need(req, d, P.viewWorkOrders);
  if ("response" in a) return a.response;
  return json(200, { audits: await d.store.listAudits(a.claims.org) });
}

// GET /api/triage   The Needs attention list for this organisation.
// POST /api/triage  { id, action: "review" | "reopen", note }  A person marks an entry reviewed, or reopens it. Needs permission to map items.
export async function handleTriage(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const write = req.method === "POST";
  const a = need(req, d, write ? P.mapFrameworks : P.viewWorkOrders);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  if (write) {
    const b = req.body as { id?: unknown; action?: unknown; note?: unknown } | undefined;
    if (typeof b?.id !== "string" || b.id === "" || b.id.length > 200 || (b.action !== "review" && b.action !== "reopen")) return json(400, { error: "That decision is not understood." });
    // Rule: an item waiting for a category is fixed by sorting it, never by marking it reviewed.
    if (b.id.startsWith("unrouted:")) return json(400, { error: "Put the item in a category to clear this one." });
    const marks = applyDecision(await d.store.getTriage(org), b.id, b.action, new Date(d.nowMs()).toISOString(), typeof b.note === "string" ? b.note : "");
    await d.store.putTriage(org, marks);
  }
  const [workOrders, review, audits, run, marks] = await Promise.all([d.store.listWorkOrders(org), d.store.getReview(org), d.store.listAudits(org), d.store.getRun(org), d.store.getTriage(org)]);
  const notes = [...(audits[0]?.notes ?? []), ...(run?.issues ?? [])];
  return json(200, { items: buildAttention({ workOrders, review, notes, marks }) });
}

// POST /api/work-orders  { key | keys, action: "exclude" | "restore" | "covers", reason, covers }  ("parts" sets the parts of a payment, "covers" says how many instalments a payment covers, DECISIONS 84)  A person takes work orders out of the active list, or puts them back, one or many at once.
// Needs permission to map items. Rule (DECISIONS 47, 49): a reason is required to exclude, only unstarted work orders can be excluded, nothing is deleted.
// Rule: in a bulk change each work order is judged on its own. The ones that cannot change are skipped and counted, the rest are saved together.
export const MAX_BULK = 1000;
export async function handleExclude(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "POST") return text(404, "Not found.");
  const a = need(req, d, P.mapFrameworks);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const b = req.body as { key?: unknown; keys?: unknown; action?: unknown; reason?: unknown; covers?: unknown; looked?: unknown; parts?: unknown; manual?: unknown; periods?: unknown } | undefined;
  const keys = Array.isArray(b?.keys) ? b.keys : typeof b?.key === "string" ? [b.key] : [];
  if (keys.length === 0 || keys.length > MAX_BULK || !keys.every((k): k is string => typeof k === "string" && k !== "" && k.length <= 200) || (b?.action !== "exclude" && b?.action !== "restore" && b?.action !== "covers" && b?.action !== "looked" && b?.action !== "parts" && b?.action !== "manual" && b?.action !== "periods")) return json(400, { error: "That request is not understood." });
  const byKey = new Map((await d.store.listWorkOrders(org)).map((w) => [w.key, w]));
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  const at = new Date(d.nowMs()).toISOString();
  const done: WorkOrder[] = [];
  let skipped = 0;
  let firstError = "";
  for (const key of new Set(keys)) {
    const w = byKey.get(key);
    const r = !w ? { error: "That work order was not found." } : b.action === "periods" ? setPeriods(w, Number(b.periods)) : b.action === "manual" ? setManual(w, b.manual === true) : b.action === "parts" ? setParts(w, Number(b.parts)) : b.action === "looked" ? setLooked(w, typeof b.looked === "string" ? b.looked : "") : b.action === "covers" ? setCovers(w, Number(b.covers)) : b.action === "exclude" ? excludeWorkOrder(w, typeof b.reason === "string" ? b.reason : "", a.claims.name, at) : restoreWorkOrder(w);
    if ("error" in r) {
      skipped++;
      firstError ||= r.error;
      continue;
    }
    // A restored work order whose item now has a category is routed straight away.
    done.push(b.action === "restore" && r.order.status === "unrouted" ? (rerouteUnrouted([r.order], config)[0] ?? r.order) : r.order);
  }
  // One key on its own keeps the plain answers: not found is 404, anything else wrong is 400.
  if (done.length === 0) return json(firstError === "That work order was not found." && keys.length === 1 ? 404 : 400, { error: firstError });
  await d.store.saveWorkOrders(org, done);
  // An excluded work order no longer needs review, so its held entry is dropped.
  if (b.action === "exclude") {
    const gone = new Set(done.map((w) => w.key));
    await d.store.putReview(org, (await d.store.getReview(org)).filter((x) => !gone.has(x.key)));
  }
  return json(200, { ok: true, workOrders: done, workOrder: done[0], skipped, ...(firstError ? { firstError } : {}) });
}

