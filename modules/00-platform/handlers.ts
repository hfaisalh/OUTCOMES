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
import { isCurrentCategory, isFrameworkTemplate, migrateSetup, type Category, type FrameworkTemplate } from "../02-project-rules/categories.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { EXPLAIN, readCookie, sessionCookie, sessionFrom, SESSION_COOKIE, SESSION_SECONDS, verifyToken, signToken, clearSessionCookie, type Claims } from "./launch-token.js";
import { excludeWorkOrder, restoreWorkOrder, type WorkOrder } from "../01c-crm-connector/work-orders.js";
import { allocatable } from "../04b-commitments/commitments.js";
import { adoptLegacy, allocOptions, applyProjectAction, clearLegacy, placeInNode, placeInPartner } from "../06-projects/projects.js";
import { addOutcomes, autoAllocate, DEFAULT_GRACE_DAYS, releaseApprovals, perPeriodRule, moveAllocation, releaseAllocation, removeOutcome, removeUnused, setActive } from "../05-outcomes/outcomes.js";
import { applyDecision, buildAttention } from "../04-triage/triage.js";
import { unpackFeed } from "../01e-crm-export-adapter/compact.js";
import { backfillFrameworks, reapplyFrameworks, rerouteUnrouted, runPickup } from "./pickup.js";
import { defaultConfig, setupOf, type OrgConfig, type Store } from "./store.js";

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
  ownerPassphrase?: string; // the owner's sign-in passphrase (OWNER_PASSPHRASE). Empty or missing switches the owner sign-in off
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
  const kind = (await d.store.getConfig(c.org))?.crm.kind;
  return json(200, { name: c.name, org: c.org, perms: c.perms, expiresAt: c.exp, storage: d.storage, demo: kind === "demo", upload: kind === "upload" });
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
  const claims: Claims = { typ: "launch", jti: d.newId(), sub: "owner", name: "Owner", org: OWNER_ORG, perms: Object.values(P), iat: now, exp: now + 60 };
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

// POST /api/work-orders  { key | keys, action: "exclude" | "restore", reason }  A person takes work orders out of the active list, or puts them back, one or many at once.
// Needs permission to map items. Rule (DECISIONS 47, 49): a reason is required to exclude, only unstarted work orders can be excluded, nothing is deleted.
// Rule: in a bulk change each work order is judged on its own. The ones that cannot change are skipped and counted, the rest are saved together.
export const MAX_BULK = 1000;
export async function handleExclude(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "POST") return text(404, "Not found.");
  const a = need(req, d, P.mapFrameworks);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const b = req.body as { key?: unknown; keys?: unknown; action?: unknown; reason?: unknown } | undefined;
  const keys = Array.isArray(b?.keys) ? b.keys : typeof b?.key === "string" ? [b.key] : [];
  if (keys.length === 0 || keys.length > MAX_BULK || !keys.every((k): k is string => typeof k === "string" && k !== "" && k.length <= 200) || (b?.action !== "exclude" && b?.action !== "restore")) return json(400, { error: "That request is not understood." });
  const byKey = new Map((await d.store.listWorkOrders(org)).map((w) => [w.key, w]));
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  const at = new Date(d.nowMs()).toISOString();
  const done: WorkOrder[] = [];
  let skipped = 0;
  let firstError = "";
  for (const key of new Set(keys)) {
    const w = byKey.get(key);
    const r = !w ? { error: "That work order was not found." } : b.action === "exclude" ? excludeWorkOrder(w, typeof b.reason === "string" ? b.reason : "", a.claims.name, at) : restoreWorkOrder(w);
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

// GET /api/outcomes   The outcomes and what is allocated to them.
// POST /api/outcomes  { action, ... }  add (name, count, type, cohort, frameworkId), active (id, active), remove (id), auto, move (commitmentKey, outcomeId), release (commitmentKey).
// Needs permission to map items to change anything. Rule (DECISIONS 61): the server works out the commitments itself from the saved work orders, so a request cannot invent one.
export const MAX_OUTCOMES = 5000;
export async function handleOutcomes(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const write = req.method === "POST";
  if (req.method !== "GET" && !write) return text(404, "Not found.");
  const a = need(req, d, write ? P.mapFrameworks : P.viewWorkOrders);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  let outcomes = config.outcomes ?? [];
  let allocations = config.allocations ?? [];
  let projects = config.projects ?? [];
  let nodes = config.nodes ?? [];
  let graceDays = config.graceDays ?? DEFAULT_GRACE_DAYS;
  let releaseLog = config.releaseLog ?? [];
  let requireRef = config.requireRef === true;
  let partnerTypes = config.partnerTypes ?? [];
  let partnerFields = config.partnerFields ?? [];
  let extra: Record<string, unknown> = {};

  if (write) {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
    const fw = setupOf(config).frameworks;
    const commitments = () => d.store.listWorkOrders(org).then((w) => allocatable(w, perPeriodRule(fw), new Date(d.nowMs()).toISOString().slice(0, 10)));
    const at = new Date(d.nowMs()).toISOString();
    const fail = (error: string) => json(400, { error });

    switch (b["action"]) {
      case "add": {
        if (!fw.some((f) => f.id === str("frameworkId"))) return fail("Choose a framework for the outcome.");
        const r = addOutcomes(outcomes, { name: str("name").slice(0, 100), count: Number(b["count"] ?? 1), type: str("type").slice(0, 60), cohort: str("cohort").slice(0, 100), frameworkId: str("frameworkId") });
        if (r.error) return fail(r.error);
        if (r.value.length > MAX_OUTCOMES) return fail(`There can be at most ${MAX_OUTCOMES} outcomes.`);
        outcomes = r.value;
        break;
      }
      case "active":
        if (!outcomes.some((o) => o.id === str("id")) || typeof b["active"] !== "boolean") return fail("That outcome was not found.");
        outcomes = setActive(outcomes, str("id"), b["active"]);
        break;
      case "remove-many": {
        const ids = Array.isArray(b["ids"]) ? (b["ids"] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_OUTCOMES) : [];
        if (ids.length === 0) return fail("Nothing to remove.");
        const r = removeUnused(outcomes, allocations, ids);
        outcomes = r.value;
        extra = { removed: r.removed, kept: r.kept };
        break;
      }
      case "remove": {
        const r = removeOutcome(outcomes, allocations, str("id"));
        if (r.error) return fail(r.error);
        outcomes = r.value;
        break;
      }
      case "auto": {
        const r = autoAllocate(await commitments(), outcomes, fw, allocations, at, allocOptions(projects, graceDays, at.slice(0, 10), requireRef));
        allocations = r.allocations;
        extra = { placed: r.placed, released: r.released, unplaced: r.unplaced };
        break;
      }
      case "move": {
        const r = moveAllocation(allocations, await commitments(), outcomes, fw, str("commitmentKey"), str("outcomeId"), at, allocOptions(projects, graceDays, at.slice(0, 10)).policy);
        if (r.error) return fail(r.error);
        allocations = r.value;
        break;
      }
      case "place-in-node": {
        const r = placeInNode(allocations, await commitments(), outcomes, nodes, fw, str("commitmentKey"), str("nodeId"), at, allocOptions(projects, graceDays, at.slice(0, 10)).policy);
        if (r.error) return fail(r.error);
        allocations = r.value;
        break;
      }
      case "place-in-partner": {
        const r = placeInPartner(allocations, await commitments(), outcomes, projects, fw, str("commitmentKey"), str("projectId"), at, allocOptions(projects, graceDays, at.slice(0, 10)).policy);
        if (r.error) return fail(r.error);
        allocations = r.value;
        break;
      }
      case "adopt-legacy": {
        const r = adoptLegacy(outcomes, projects, str("projectId"));
        if (r.error) return fail(r.error);
        outcomes = r.value;
        extra = { moved: r.moved };
        break;
      }
      case "clear-legacy": {
        const r = clearLegacy(outcomes, allocations);
        outcomes = r.outcomes;
        allocations = r.allocations;
        extra = { removed: r.removed, released: r.released };
        break;
      }
      case "set-require-ref":
        requireRef = b["on"] === true;
        break;
      case "set-grace": {
        const n = Number(b["days"]);
        if (!Number.isInteger(n) || n < 0 || n > 90) return fail("The grace period is a whole number of days, from 0 to 90.");
        graceDays = n;
        break;
      }
      // Rule (DECISIONS 74): a place is released only when a manager approves it, and only if it is really due. The server checks, and keeps a record of who approved.
      case "approve-release": {
        if (!a.claims.perms.includes(P.approveRelease)) return json(403, { error: "Only a manager can approve releasing a place." });
        const policy = allocOptions(projects, graceDays, at.slice(0, 10)).policy;
        const due = releaseApprovals(allocations, await commitments(), fw, policy).find((x) => x.commitmentKey === str("commitmentKey"));
        if (!due) return fail("That place is not due for release.");
        allocations = releaseAllocation(allocations, due.commitmentKey);
        releaseLog = [...releaseLog, { commitmentKey: due.commitmentKey, outcomeId: due.outcomeId, by: a.claims.name, at, daysOverdue: due.daysOverdue }].slice(-2000);
        break;
      }
      case "release":
        allocations = releaseAllocation(allocations, str("commitmentKey"));
        break;
      default: {
        // Projects (DECISIONS 65): the structure each project defines, and the beneficiaries in it.
        const r = applyProjectAction({ projects, nodes, outcomes, partnerTypes, partnerFields }, fw, b, at.slice(0, 10));
        if (!r) return fail("That request is not understood.");
        if (r.error) return fail(r.error);
        ({ projects, nodes, outcomes, partnerTypes, partnerFields } = r.state);
        if (r.warning) extra = { warning: r.warning };
      }
    }
    await d.store.putConfig(org, { ...config, outcomes, allocations, projects, nodes, graceDays, releaseLog, requireRef, partnerTypes, partnerFields });
  }
  return json(200, { outcomes, allocations, projects, nodes, graceDays, requireRef, partnerTypes, partnerFields, ...extra });
}
