/**
 * handlers.test.ts
 *
 * What it does: tests handlers.ts end to end without a network: sign-in from the CRM, who may do
 * what, organisations kept apart, saving the setup, and the pick-up. The tests double as examples.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS as P } from "../../app/menu";
import { rowsReader } from "../01c-crm-connector/reader";
import { sampleRows } from "../01c-crm-connector/sample";
import { handleConfig, handleDemoLogin, handleLaunch, handleMe, handlePickup, handleWorkOrders, type Deps, type HttpRequest } from "./handlers";
import { signToken, verifyToken, type Claims } from "./launch-token";
import { defaultConfig, memoryStore } from "./store";

const SECRETS = { launch: "launch-secret", session: "session-secret", cron: "cron-secret" };
const NOW_MS = 1_800_000_000_000;
const now = NOW_MS / 1000;
let n = 0;

function deps(): Deps {
  return {
    store: memoryStore(),
    secrets: SECRETS,
    nowMs: () => NOW_MS,
    newId: () => `id${++n}`,
    connector: (c) => (c.crm.kind === "api" || c.crm.kind === "demo" ? { reader: rowsReader(sampleRows()), reporter: { send: async () => {} } } : null),
    storage: "memory",
    demoLogin: false,
  };
}
const claims = (over: Partial<Claims> = {}): Claims => ({ typ: "launch", jti: `L${++n}`, sub: "u1", name: "Sample User", org: "mwf", perms: Object.values(P), iat: now, exp: now + 60, ...over });
const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({ method: "GET", query: {}, headers: {}, ...over });

// Sign in through the launch endpoint and return the cookie header a browser would send back.
async function signIn(d: Deps, over: Partial<Claims> = {}): Promise<string> {
  const r = await handleLaunch(req({ query: { token: signToken(SECRETS.launch, claims(over)) } }), d);
  expect(r.status).toBe(302);
  return (r.headers?.["set-cookie"] ?? "").split(";")[0] as string;
}
const as = (cookie: string, over: Partial<HttpRequest> = {}): HttpRequest => req({ headers: { cookie }, ...over });

let d: Deps;
beforeEach(() => { d = deps(); });

describe("launch", () => {
  it("signs a person in, sets a safe cookie and sends them to the app with a clean link", async () => {
    const r = await handleLaunch(req({ query: { token: signToken(SECRETS.launch, claims()) } }), d);
    expect([r.status, r.headers?.["location"]]).toEqual([302, "/app/"]);
    expect(r.headers?.["set-cookie"]).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(r.headers?.["location"]).not.toContain("token");
  });

  it("refuses a link used twice", async () => {
    const t = signToken(SECRETS.launch, claims());
    expect((await handleLaunch(req({ query: { token: t } }), d)).status).toBe(302);
    const again = await handleLaunch(req({ query: { token: t } }), d);
    expect([again.status, again.body]).toEqual([401, "The sign-in link was already used. Open OUTCOMES from the CRM again."]);
  });

  it("refuses no token, a forged token, an expired token and a role without OUTCOMES access", async () => {
    expect((await handleLaunch(req(), d)).status).toBe(400);
    expect((await handleLaunch(req({ query: { token: signToken("wrong", claims()) } }), d)).status).toBe(401);
    expect((await handleLaunch(req({ query: { token: signToken(SECRETS.launch, claims({ iat: now - 200, exp: now - 100 })) } }), d)).body).toContain("expired");
    expect((await handleLaunch(req({ query: { token: signToken(SECRETS.launch, claims({ perms: [P.settings] })) } }), d)).status).toBe(403);
  });

  it("does not accept a session as a launch token", async () => {
    const cookie = (await signIn(d)).split("=")[1] as string;
    expect((await handleLaunch(req({ query: { token: cookie } }), d)).status).toBe(401);
  });
});

describe("me", () => {
  it("answers 401 with no session, and the person's details with one", async () => {
    expect((await handleMe(req(), d)).status).toBe(401);
    const r = await handleMe(as(await signIn(d)), d);
    expect(r.body).toMatchObject({ name: "Sample User", org: "mwf", storage: "memory" });
  });
  it("rejects a tampered cookie", async () => {
    expect((await handleMe(as("outcomes_session=abc.def"), d)).status).toBe(401);
  });
});

describe("permissions", () => {
  it("lets a viewer read but not change the setup", async () => {
    const cookie = await signIn(d, { perms: [P.access, P.viewWorkOrders] });
    expect((await handleConfig(as(cookie), d)).status).toBe(200);
    expect((await handleConfig(as(cookie, { method: "PUT", body: { frameworks: [], categories: [], itemMap: {} } }), d)).status).toBe(403);
    expect((await handlePickup(as(cookie, { method: "POST" }), d)).status).toBe(403);
  });
  it("refuses everything without a session", async () => {
    for (const h of [handleConfig, handleWorkOrders]) expect((await h(req(), d)).status).toBe(401);
  });
});

describe("setup and organisations", () => {
  it("saves frameworks and the item map, and rejects an incomplete setup", async () => {
    const cookie = await signIn(d);
    const bad = await handleConfig(as(cookie, { method: "PUT", body: { frameworks: [] } }), d);
    expect(bad.status).toBe(400);
    const ok = await handleConfig(as(cookie, { method: "PUT", body: { frameworks: [{ id: "water", name: "Water" }], categories: [], itemMap: { I11: "water" } } }), d);
    expect(ok.status).toBe(200);
    expect((await handleConfig(as(cookie), d)).body).toMatchObject({ itemMap: { I11: "water" } });
  });

  it("routes unrouted work orders as soon as an item is sorted", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    const cookie = await signIn(d);
    await handlePickup(as(cookie, { method: "POST" }), d); // nothing is mapped, so all four are unrouted
    const put = await handleConfig(as(cookie, { method: "PUT", body: { frameworks: [{ id: "water", name: "Water" }], categories: [], itemMap: { I11: "water" } } }), d);
    expect(put.body).toEqual({ ok: true, routed: 1 });
    const orders = ((await handleWorkOrders(as(cookie), d)).body as { workOrders: { itemId: string; status: string }[] }).workOrders;
    expect(orders.find((o) => o.itemId === "I11")?.status).toBe("ready");
    expect(orders.filter((o) => o.status === "unrouted")).toHaveLength(3);
  });

  it("keeps the CRM setting out of what the page receives", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "https://crm.example.org", tokenEnv: "SECRET_NAME" } });
    const r = await handleConfig(as(await signIn(d)), d);
    expect(JSON.stringify(r.body)).not.toContain("SECRET_NAME");
    expect(r.body).toMatchObject({ crmConnected: true });
  });

  it("never lets one organisation see another's work orders", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), itemMap: { I11: "water" }, crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    const mwf = await signIn(d);
    await handlePickup(as(mwf, { method: "POST" }), d);
    expect(((await handleWorkOrders(as(mwf), d)).body as { workOrders: unknown[] }).workOrders.length).toBeGreaterThan(0);
    const other = await signIn(d, { org: "other-charity" });
    expect(((await handleWorkOrders(as(other), d)).body as { workOrders: unknown[] }).workOrders).toEqual([]);
  });
});

describe("pick-up", () => {
  it("runs for the person's own organisation and shows the result in the work orders", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    const cookie = await signIn(d);
    const r = await handlePickup(as(cookie, { method: "POST" }), d);
    expect(r.body).toMatchObject({ org: "mwf", ok: true, created: 4 });
    const wo = (await handleWorkOrders(as(cookie), d)).body as { workOrders: unknown[]; run: { ok: boolean } };
    expect([wo.workOrders.length, wo.run.ok]).toEqual([4, true]);
  });

  it("says plainly when no CRM is connected", async () => {
    await d.store.putConfig("mwf", defaultConfig());
    expect((await handlePickup(as(await signIn(d), { method: "POST" }), d)).body).toEqual({ org: "mwf", skipped: "No CRM is connected for this organisation." });
  });

  it("lets the scheduled job run every organisation, only with the cron secret", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    expect((await handlePickup(req(), d)).status).toBe(401);
    expect((await handlePickup(req({ headers: { authorization: "Bearer nope" } }), d)).status).toBe(401);
    const r = await handlePickup(req({ headers: { authorization: "Bearer cron-secret" } }), d);
    expect([r.status, (r.body as { results: unknown[] }).results.length]).toEqual([200, 1]);
  });

  it("refuses the scheduled job when no cron secret is set", async () => {
    d.secrets.cron = "";
    expect((await handlePickup(req({ headers: { authorization: "Bearer " } }), d)).status).toBe(401);
  });
});

describe("a session is checked, not trusted", () => {
  it("rejects an expired session", async () => {
    const cookie = await signIn(d);
    const later: Deps = { ...d, nowMs: () => NOW_MS + 2 * 3600 * 1000 };
    expect((await handleMe(as(cookie), later)).status).toBe(401);
    expect(verifyToken(SECRETS.session, cookie.split("=")[1] as string, "session", now).ok).toBe(true);
  });
});

describe("test sign-in for the pretend CRM", () => {
  it("does not exist unless the server was set up for testing", async () => {
    expect((await handleDemoLogin(req(), d)).status).toBe(404);
  });

  it("signs in as the demo organisation, connects the pretend CRM, and can pick up", async () => {
    const t: Deps = { ...d, demoLogin: true };
    const r = await handleDemoLogin(req(), t);
    expect([r.status, r.headers?.["location"]]).toEqual([302, "/app/"]);
    const cookie = (r.headers?.["set-cookie"] ?? "").split(";")[0] as string;
    expect((await handleMe(as(cookie), t)).body).toMatchObject({ org: "demo", demo: true });
    // Rule: it can only ever open the "demo" organisation, never a real one.
    expect(await d.store.getConfig("mwf")).toBeNull();
    expect((await handlePickup(as(cookie, { method: "POST" }), t)).body).toMatchObject({ org: "demo", ok: true });
  });

  it("keeps a CRM setting that is already there", async () => {
    const t: Deps = { ...d, demoLogin: true };
    await t.store.putConfig("demo", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    await handleDemoLogin(req(), t);
    expect((await t.store.getConfig("demo"))?.crm.kind).toBe("api");
  });
});
