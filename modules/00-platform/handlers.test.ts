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
import { handleAudits, handleConfig, handleOutcomes, handleDemoLogin, handleExclude, handleImport, handleOwnerLogin, handleTriage, handleLaunch, handleMe, handlePickup, handleWorkOrders, type Deps, type HttpRequest } from "./handlers";
import { signToken, verifyToken, type Claims } from "./launch-token";
import { defaultConfig, memoryStore } from "./store";
import { packFeed } from "../01e-crm-export-adapter/compact";

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
    expect((await handleConfig(as(cookie, { method: "PUT", body: { categories: [], itemMap: {} } }), d)).status).toBe(403);
    expect((await handlePickup(as(cookie, { method: "POST" }), d)).status).toBe(403);
  });
  it("refuses everything without a session", async () => {
    for (const h of [handleConfig, handleWorkOrders]) expect((await h(req(), d)).status).toBe(401);
  });
});

describe("setup and organisations", () => {
  it("saves categories and the item map, and rejects an incomplete setup", async () => {
    const cookie = await signIn(d);
    const bad = await handleConfig(as(cookie, { method: "PUT", body: { categories: [] } }), d);
    expect(bad.status).toBe(400);
    const ok = await handleConfig(as(cookie, { method: "PUT", body: { categories: [{ id: "water", name: "Water", keywords: ["water"], framework: { unit: "", cycle: "on_delivery", reportType: "" } }], itemMap: { I11: "water" } } }), d);
    expect(ok.status).toBe(200);
    expect((await handleConfig(as(cookie), d)).body).toMatchObject({ itemMap: { I11: "water" } });
  });

  it("routes unrouted work orders as soon as an item is sorted", async () => {
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    const cookie = await signIn(d);
    await handlePickup(as(cookie, { method: "POST" }), d); // nothing is mapped, so all four are unrouted
    const put = await handleConfig(as(cookie, { method: "PUT", body: { categories: [{ id: "water", name: "Water", keywords: ["water"], framework: { unit: "", cycle: "on_delivery", reportType: "" } }], itemMap: { I11: "water" } } }), d);
    expect(put.body).toEqual({ ok: true, routed: 1, reapplied: 0 });
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

describe("owner sign-in", () => {
  const t = (): Deps => ({ ...d, ownerPassphrase: "a-long-owner-passphrase" });
  const post = (passphrase: unknown) => req({ method: "POST", body: { passphrase } });

  it("does not exist unless a passphrase is set", async () => {
    expect((await handleOwnerLogin(post("x"), d)).status).toBe(404);
  });
  it("refuses a wrong passphrase and signs the owner in with the right one", async () => {
    expect((await handleOwnerLogin(post("nope"), t())).status).toBe(401);
    expect((await handleOwnerLogin(post(123), t())).status).toBe(401);
    const r = await handleOwnerLogin(post("a-long-owner-passphrase"), t());
    expect(r.status).toBe(200);
    const cookie = (r.headers?.["set-cookie"] ?? "").split(";")[0] as string;
    expect((await handleMe(as(cookie), t())).body).toMatchObject({ org: "mwf", upload: true });
  });
  it("answers a plain form post with redirects: back to the app signed in, or with a wrong-passphrase flag", async () => {
    const form = (passphrase: string) => req({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: { passphrase } });
    const ok = await handleOwnerLogin(form("a-long-owner-passphrase"), t());
    expect([ok.status, ok.headers?.["location"]]).toEqual([302, "/app/"]);
    expect(ok.headers?.["set-cookie"]).toMatch(/HttpOnly/);
    const bad = await handleOwnerLogin(form("nope"), t());
    expect([bad.status, bad.headers?.["location"], bad.headers?.["set-cookie"]]).toEqual([302, "/app/?signin=wrong", undefined]);
  });
  it("signs in as the chosen example role, with only that role's permissions, and treats an unknown role as no permissions (DECISIONS 91)", async () => {
    const as_ = async (role: string) => {
      const r = await handleOwnerLogin(req({ method: "POST", body: { passphrase: "a-long-owner-passphrase", role } }), t());
      return (await handleMe(as((r.headers?.["set-cookie"] ?? "").split(";")[0] as string), t())).body as { name: string; perms: string[] };
    };
    const viewer = await as_("viewer");
    expect(viewer.perms).toEqual(["outcomes.access", "outcomes.dashboards"]);
    expect(viewer.name).toBe("Test: Dashboard viewer");
    expect((await as_("manager")).perms).toContain("outcomes.approve_release");
    expect((await as_("gifts")).perms).not.toContain("outcomes.settings");
    expect((await as_("nonsense")).perms).toEqual([]); // never the administrator by accident
    expect((await as_("admin")).perms.length).toBeGreaterThan(5);
  });
  it("answers 404 to anything but POST", async () => {
    expect((await handleOwnerLogin(req(), t())).status).toBe(404);
  });
});

describe("import and batch audit", () => {
  const feedOf = (rows: Record<string, string>[]) => ({ ...packFeed(rows), source: "export files" });
  const row = (id: string, over: Record<string, string> = {}) => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: "2026-06-10 10:00:00", supporter_id: "D1", supporter_name: "Sample Supporter", item_id: "I1", item_name: "Water Pump", item_feedback: "2", amount: "100", quantity: "1", ...over });

  it("makes work orders from an upload and keeps an audit for it", async () => {
    const cookie = await signIn(d);
    const r = await handleImport(as(cookie, { method: "POST", body: feedOf([row("1"), row("2"), row("3", { item_feedback: "1" })]) }), d);
    expect(r.body).toMatchObject({ ok: true, rows: 3, created: 2 });
    const orders = (await handleWorkOrders(as(cookie), d)).body as { workOrders: unknown[] };
    expect(orders.workOrders).toHaveLength(2);
    const audits = (await handleAudits(as(cookie), d)).body as { audits: { source: string; counts: { added: number } }[] };
    expect(audits.audits[0]).toMatchObject({ source: "export files", counts: { added: 2 } });
  });

  it("on a second upload reports changed and removed lines and keeps the work orders", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: feedOf([row("1"), row("2")]) }), d);
    await handleImport(as(cookie, { method: "POST", body: feedOf([row("1", { amount: "90" }), row("9", { paid_at: "2026-06-30 10:00:00" })]) }), d);
    const audits = ((await handleAudits(as(cookie), d)).body as { audits: { counts: Record<string, number> }[] }).audits;
    expect(audits).toHaveLength(2);
    // Line 2 is dated inside the dates the second upload covers, and is missing from it, so it is reported removed.
    expect(audits[0]?.counts).toMatchObject({ changed: 1, added: 1, removed: 1 });
    expect(((await handleWorkOrders(as(cookie), d)).body as { workOrders: unknown[] }).workOrders).toHaveLength(3);
  });

  it("refuses a bad table, a missing permission and an organisation that reads its CRM directly", async () => {
    const cookie = await signIn(d);
    expect((await handleImport(as(cookie, { method: "POST", body: { columns: ["email"], rows: [["a"]] } }), d)).status).toBe(400);
    expect((await handleImport(as(await signIn(d, { perms: [P.access, P.viewWorkOrders] }), { method: "POST", body: feedOf([row("1")]) }), d)).status).toBe(403);
    expect((await handleImport(req({ method: "POST", body: feedOf([row("1")]) }), d)).status).toBe(401);
    await d.store.putConfig("mwf", { ...defaultConfig(), crm: { kind: "api", baseUrl: "x", tokenEnv: "X" } });
    expect((await handleImport(as(cookie, { method: "POST", body: feedOf([row("1")]) }), d)).status).toBe(409);
  });

  it("keeps organisations apart", async () => {
    const mine = await signIn(d);
    const other = await signIn(d, { org: "other" });
    await handleImport(as(mine, { method: "POST", body: feedOf([row("1")]) }), d);
    expect(((await handleAudits(as(other), d)).body as { audits: unknown[] }).audits).toHaveLength(0);
    expect(((await handleWorkOrders(as(other), d)).body as { workOrders: unknown[] }).workOrders).toHaveLength(0);
  });
});

describe("needs attention", () => {
  const row = (id: string, over: Record<string, string> = {}) => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: "2026-06-10 10:00:00", supporter_id: "D1", supporter_name: "Sample Supporter", item_id: "I1", item_name: "Water Pump", item_feedback: "2", amount: "100", quantity: "1", ...over });
  const up = (rows: Record<string, string>[], notes: string[] = []) => ({ ...packFeed(rows), source: "files", notes });
  const items = async (cookie: string) => ((await handleTriage(as(cookie), d)).body as { items: { id: string; kind: string; status: string }[] }).items;

  it("lists unrouted items, import problems and held changes, and lets a person mark one reviewed", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1"), row("2")], ["1 line has an unknown instalment count."]) }), d);
    // Import problems describe the latest import, so the second one repeats the note.
    await handleImport(as(cookie, { method: "POST", body: up([row("1", { amount: "90" }), row("2")], ["1 line has an unknown instalment count."]) }), d);
    const list = await items(cookie);
    expect(list.map((i) => i.kind).sort()).toEqual(["changed", "import", "unrouted"]);
    const changed = list.find((i) => i.kind === "changed")!;
    const after = (await handleTriage(as(cookie, { method: "POST", body: { id: changed.id, action: "review", note: "Checked" } }), d)).body as { items: { id: string; status: string }[] };
    expect(after.items.find((i) => i.id === changed.id)?.status).toBe("reviewed");
    expect(after.items.at(-1)?.id).toBe(changed.id); // reviewed entries go last
    const reopened = (await handleTriage(as(cookie, { method: "POST", body: { id: changed.id, action: "reopen" } }), d)).body as { items: { id: string; status: string }[] };
    expect(reopened.items.find((i) => i.id === changed.id)?.status).toBe("open");
  });

  it("refuses to mark an unrouted item reviewed, bad decisions, and a person without permission", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1")]) }), d);
    expect((await handleTriage(as(cookie, { method: "POST", body: { id: "unrouted:I1", action: "review" } }), d)).status).toBe(400);
    expect((await handleTriage(as(cookie, { method: "POST", body: { id: "x", action: "delete" } }), d)).status).toBe(400);
    const viewer = await signIn(d, { perms: [P.access, P.viewWorkOrders] });
    expect((await handleTriage(as(viewer), d)).status).toBe(200);
    expect((await handleTriage(as(viewer, { method: "POST", body: { id: "x", action: "review" } }), d)).status).toBe(403);
    expect((await handleTriage(req(), d)).status).toBe(401);
  });

  it("keeps organisations apart", async () => {
    const mine = await signIn(d);
    await handleImport(as(mine, { method: "POST", body: up([row("1")], ["a problem"]) }), d);
    expect(await items(await signIn(d, { org: "other" }))).toEqual([]);
  });
});

describe("excluding a work order", () => {
  const row = (id: string) => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: "2026-06-10 10:00:00", supporter_id: "D1", supporter_name: "Sample Supporter", item_id: "I1", item_name: "Water Pump", item_feedback: "2", amount: "100", quantity: "1" });
  const up = (rows: Record<string, string>[]) => ({ ...packFeed(rows), source: "files", notes: [] });
  const post = (cookie: string, body: unknown) => handleExclude(as(cookie, { method: "POST", body }), d);
  const orders = async (cookie: string) => ((await handleWorkOrders(as(cookie), d)).body as { workOrders: { key: string; status: string }[] }).workOrders;

  it("needs a reason, keeps the work order, survives a re-import, and can be restored", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1"), row("2")]) }), d);
    expect((await post(cookie, { key: "1", action: "exclude", reason: "" })).status).toBe(400);
    expect((await post(cookie, { key: "1", action: "exclude", reason: "Made during bug fixing" })).status).toBe(200);
    expect((await orders(cookie)).find((w) => w.key === "1")?.status).toBe("excluded");
    const again = await handleImport(as(cookie, { method: "POST", body: up([row("1"), row("2")]) }), d);
    expect((again.body as { created: number }).created).toBe(0);
    expect((await orders(cookie)).filter((w) => w.status === "excluded")).toHaveLength(1);
    expect((await post(cookie, { key: "1", action: "restore" })).status).toBe(200);
    expect((await orders(cookie)).find((w) => w.key === "1")?.status).toBe("unrouted");
  });

  it("refuses a missing work order, a signed-out caller, a viewer, and another organisation", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1")]) }), d);
    expect((await post(cookie, { key: "nope", action: "exclude", reason: "test" })).status).toBe(404);
    expect((await handleExclude(req({ method: "POST", body: {} }), d)).status).toBe(401);
    const viewer = await signIn(d, { perms: [P.access, P.viewWorkOrders] });
    expect((await post(viewer, { key: "1", action: "exclude", reason: "test" })).status).toBe(403);
    expect((await post(await signIn(d, { org: "other" }), { key: "1", action: "exclude", reason: "test" })).status).toBe(404);
  });
});

describe("excluding and restoring many at once", () => {
  const row = (id: string) => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: "2026-06-10 10:00:00", supporter_id: "D1", supporter_name: "Sample Supporter", item_id: "I1", item_name: "Water Pump", item_feedback: "2", amount: "100", quantity: "1" });
  const up = (rows: Record<string, string>[]) => ({ ...packFeed(rows), source: "files", notes: [] });
  const status = async (cookie: string) => Object.fromEntries(((await handleWorkOrders(as(cookie), d)).body as { workOrders: { key: string; status: string }[] }).workOrders.map((w) => [w.key, w.status]));

  it("changes all it can, skips the rest and says how many", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1"), row("2"), row("3")]) }), d);
    expect((await handleExclude(as(cookie, { method: "POST", body: { keys: ["1", "2", "nope"], action: "exclude", reason: "Bug fixing" } }), d)).body).toMatchObject({ ok: true, skipped: 1 });
    expect(await status(cookie)).toEqual({ "1": "excluded", "2": "excluded", "3": "unrouted" });
    expect((await handleExclude(as(cookie, { method: "POST", body: { keys: ["1", "2", "3"], action: "restore" } }), d)).body).toMatchObject({ ok: true, skipped: 1 });
    expect(await status(cookie)).toEqual({ "1": "unrouted", "2": "unrouted", "3": "unrouted" });
  });

  it("needs a reason, refuses an empty or oversized list, and refuses a viewer", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1")]) }), d);
    expect((await handleExclude(as(cookie, { method: "POST", body: { keys: ["1"], action: "exclude", reason: "" } }), d)).status).toBe(400);
    expect((await handleExclude(as(cookie, { method: "POST", body: { keys: [], action: "exclude", reason: "x" } }), d)).status).toBe(400);
    expect((await handleExclude(as(cookie, { method: "POST", body: { keys: Array.from({ length: 1001 }, (_, i) => String(i)), action: "restore" } }), d)).status).toBe(400);
    const viewer = await signIn(d, { perms: [P.access, P.viewWorkOrders] });
    expect((await handleExclude(as(viewer, { method: "POST", body: { keys: ["1"], action: "exclude", reason: "x" } }), d)).status).toBe(403);
  });
});

describe("framework templates (DECISIONS 59)", () => {
  const tpl = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3, ...over });
  const row = (id: string, item: string) => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: "2026-06-10 10:00:00", supporter_id: "D1", supporter_name: "Sample", item_id: item, item_name: item, item_feedback: "2", amount: "100", quantity: "1" });
  const up = (rows: Record<string, string>[]) => ({ ...packFeed(rows), source: "files", notes: [] });
  const orders = async (cookie: string) => ((await handleWorkOrders(as(cookie), d)).body as { workOrders: { key: string; frameworkId?: string }[] }).workOrders;
  const put = (cookie: string, body: unknown) => handleConfig(as(cookie, { method: "PUT", body }), d);
  const cats = [{ id: "spons", name: "Sponsorship", keywords: [], frameworkId: "shared" }];

  it("saves templates, and reads an older setup (a framework inside each category) as templates", async () => {
    const cookie = await signIn(d);
    expect((await put(cookie, { categories: cats, itemMap: { A: "spons" }, frameworks: [tpl("shared")], itemFramework: {} })).status).toBe(200);
    expect((await handleConfig(as(cookie), d)).body).toMatchObject({ frameworks: [{ id: "shared", unitsPerBeneficiary: 3 }] });
    const other = await signIn(d, { org: "old" });
    await put(other, { categories: [{ id: "w", name: "Water", keywords: [], framework: { unit: "pump", cycle: "on_delivery", reportType: "" } }], itemMap: {} });
    expect((await handleConfig(as(other), d)).body).toMatchObject({ categories: [{ id: "w", frameworkId: "water" }], frameworks: [{ id: "water", name: "Water", unit: "pump" }] });
  });

  it("refuses a category or item that points to a framework that does not exist, and an invalid template", async () => {
    const cookie = await signIn(d);
    expect((await put(cookie, { categories: [{ ...cats[0], frameworkId: "ghost" }], itemMap: {}, frameworks: [tpl("shared")] })).status).toBe(400);
    expect((await put(cookie, { categories: cats, itemMap: {}, frameworks: [tpl("shared")], itemFramework: { A: "ghost" } })).status).toBe(400);
    expect((await put(cookie, { categories: cats, itemMap: {}, frameworks: [tpl("shared", { unitsPerBeneficiary: 0 })] })).status).toBe(400);
  });

  it("gives work orders the framework that applies to their item, and an item's own framework wins", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([row("1", "ORP"), row("2", "HIFZ")]) }), d);
    await put(cookie, { categories: cats, itemMap: { ORP: "spons", HIFZ: "spons" }, frameworks: [tpl("shared"), tpl("whole", { unitsPerBeneficiary: 1 })], itemFramework: { HIFZ: "whole" } });
    const o = await orders(cookie);
    expect(o.find((x) => x.key === "1")?.frameworkId).toBe("shared");
    expect(o.find((x) => x.key === "2")?.frameworkId).toBe("whole");
  });

  it("does not move a work order when an item's framework changes later, but a new one follows the change", async () => {
    const cookie = await signIn(d);
    const frameworks = [tpl("shared"), tpl("whole", { unitsPerBeneficiary: 1 })];
    await handleImport(as(cookie, { method: "POST", body: up([row("1", "HIFZ")]) }), d);
    await put(cookie, { categories: cats, itemMap: { HIFZ: "spons" }, frameworks, itemFramework: {} });
    expect((await orders(cookie))[0]?.frameworkId).toBe("shared");
    await put(cookie, { categories: cats, itemMap: { HIFZ: "spons" }, frameworks, itemFramework: { HIFZ: "whole" } });
    expect((await orders(cookie))[0]?.frameworkId).toBe("shared"); // work already made keeps its framework
    await handleImport(as(cookie, { method: "POST", body: up([row("1", "HIFZ"), row("2", "HIFZ")]) }), d);
    expect((await orders(cookie)).find((x) => x.key === "2")?.frameworkId).toBe("whole"); // new work follows the change
  });
});

describe("outcomes (DECISIONS 61)", () => {
  const post = (cookie: string, body: unknown) => handleOutcomes(as(cookie, { method: "POST", body }), d);
  const fwSetup = { categories: [{ id: "spons", name: "Sponsorship", keywords: [], frameworkId: "shared" }], itemMap: { ORP: "spons" }, frameworks: [{ id: "shared", name: "Shared", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 }], itemFramework: {} };
  const line = (id: string, sub: string, n: string, qty = "1") => ({ line_id: id, transaction_ref: `T${id}`, status: "Paid", paid_at: `2026-0${id}-10 10:00:00`, supporter_id: `D${sub}`, supporter_name: "Sample", item_id: "ORP", item_name: "Orphan", item_feedback: "2", amount: "40", quantity: qty, is_recurring: "1", subscription_id: sub, instalment_number: n, instalment_count: "12" });
  const up = (rows: Record<string, string>[]) => ({ ...packFeed(rows), source: "files", notes: [] });

  it("adds outcomes, allocates commitments automatically, and shows the result", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([line("1", "501", "1"), line("2", "502", "1")]) }), d);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    expect((await post(cookie, { action: "add", name: "Orphan", count: 2, type: "child", cohort: "A", frameworkId: "shared" })).status).toBe(200);
    const r = (await post(cookie, { action: "auto" })).body as { placed: number; allocations: { commitmentKey: string; outcomeId: string }[] };
    expect(r.placed).toBe(2);
    expect(r.allocations.map((a) => a.outcomeId)).toEqual(["orphan-1", "orphan-1"]); // two single parts share the first orphan
    expect(((await handleOutcomes(as(cookie), d)).body as { outcomes: unknown[] }).outcomes).toHaveLength(2);
  });

  it("moves, releases, switches off and refuses removal while allocated", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([line("1", "501", "1")]) }), d);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    await post(cookie, { action: "add", name: "Orphan", count: 2, type: "child", cohort: "", frameworkId: "shared" });
    await post(cookie, { action: "auto" });
    expect((await post(cookie, { action: "move", commitmentKey: "501", outcomeId: "orphan-2" })).status).toBe(200);
    expect((await post(cookie, { action: "remove", id: "orphan-2" })).status).toBe(400);
    expect((await post(cookie, { action: "active", id: "orphan-2", active: false })).status).toBe(200);
    const again = (await post(cookie, { action: "auto" })).body as { released: number; allocations: { outcomeId: string }[] };
    expect([again.released, again.allocations[0]?.outcomeId]).toEqual([1, "orphan-1"]); // released from the inactive one, placed in the active one
    expect((await post(cookie, { action: "release", commitmentKey: "501" })).body).toMatchObject({ allocations: [] });
  });

  it("keeps outcome types as configuration: starter types first, then added types, fields and frameworks (DECISIONS 103)", async () => {
    const cookie = await signIn(d);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    const first = (await handleOutcomes(as(cookie), d)).body as { outcomeTypes: { id: string; source: string }[] };
    expect(first.outcomeTypes.map((t) => t.id)).toEqual(["orphan", "water-pump"]);
    expect(first.outcomeTypes[1]?.source).toBe("create_new");
    const added = (await post(cookie, { action: "ot-add", name: "House build" })).body as { outcomeTypes: { id: string; fields: unknown[]; frameworkIds: string[] }[] };
    expect(added.outcomeTypes.map((t) => t.id)).toEqual(["orphan", "water-pump", "house-build"]);
    const withField = (await post(cookie, { action: "ot-field-add", typeId: "house-build", label: "Plot size", kind: "number" })).body as typeof added;
    expect(withField.outcomeTypes[2]?.fields).toHaveLength(1);
    const linked = (await post(cookie, { action: "ot-framework", typeId: "house-build", frameworkId: "shared", on: true })).body as typeof added;
    expect(linked.outcomeTypes[2]?.frameworkIds).toEqual(["shared"]);
    expect((await post(cookie, { action: "ot-framework", typeId: "house-build", frameworkId: "nope", on: true })).status).toBe(400); // an unknown framework
    expect((await post(cookie, { action: "ot-add", name: "house build" })).status).toBe(400); // the same name again
    // it is kept: a fresh read returns it
    expect(((await handleOutcomes(as(cookie), d)).body as typeof added).outcomeTypes).toHaveLength(3);
  });

  it("gives every outcome and allocation an ID with its type's prefix, and keeps the count going (DECISIONS 105)", async () => {
    const cookie = await signIn(d);
    await handleImport(as(cookie, { method: "POST", body: up([line("1", "501", "1"), line("2", "502", "1")]) }), d);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    const added = (await post(cookie, { action: "add", name: "Orphan", count: 2, type: "child", cohort: "", frameworkId: "shared" })).body as { outcomes: { ref?: string; outcomeTypeId?: string }[] };
    expect(added.outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "ORP-0002"]);
    expect(added.outcomes[0]?.outcomeTypeId).toBe("orphan");
    const placed = (await post(cookie, { action: "auto" })).body as { allocations: { ref?: string }[] };
    expect(placed.allocations.map((a) => a.ref)).toEqual(["AL-0001", "AL-0002"]);
    // a new outcome continues the count, and a changed prefix is for new IDs only
    await post(cookie, { action: "ot-prefix", typeId: "orphan", prefix: "kid" });
    const more = (await post(cookie, { action: "add", name: "Orphan B", count: 1, type: "child", cohort: "", frameworkId: "shared" })).body as { outcomes: { ref?: string }[] };
    expect(more.outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "ORP-0002", "KID-0001"]);
    expect((await post(cookie, { action: "ot-prefix", typeId: "orphan", prefix: "PMP" })).status).toBe(400); // another type uses it
    // a read is steady: the same IDs, nothing given twice
    expect(((await handleOutcomes(as(cookie), d)).body as typeof more).outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "ORP-0002", "KID-0001"]);
  });

  it("keeps the icon chosen for an item, and takes the choice back (DECISIONS 107)", async () => {
    const cookie = await signIn(d);
    const set = (await post(cookie, { action: "item-icon", itemId: "I9", icon: "tanker" })).body as { itemIcons: Record<string, string> };
    expect(set.itemIcons).toEqual({ I9: "tanker" });
    expect((await post(cookie, { action: "item-icon", itemId: "I9", icon: "not-an-icon" })).status).toBe(400);
    expect(((await handleOutcomes(as(cookie), d)).body as typeof set).itemIcons).toEqual({ I9: "tanker" }); // kept
    expect(((await post(cookie, { action: "item-icon", itemId: "I9", icon: "" })).body as typeof set).itemIcons).toEqual({}); // taken back
    // an outcome type has an icon too
    const t = (await post(cookie, { action: "ot-icon", typeId: "water-pump", icon: "pump-lg" })).body as { outcomeTypes: { id: string; icon?: string }[] };
    expect(t.outcomeTypes.find((x) => x.id === "water-pump")?.icon).toBe("pump-lg");
  });

  it("refuses a missing framework, a bad action, a viewer and a signed-out caller, and keeps organisations apart", async () => {
    const cookie = await signIn(d);
    expect((await post(cookie, { action: "add", name: "Orphan", count: 1, type: "", cohort: "", frameworkId: "ghost" })).status).toBe(400);
    expect((await post(cookie, { action: "explode" })).status).toBe(400);
    const viewer = await signIn(d, { perms: [P.access, P.viewWorkOrders] });
    expect((await handleOutcomes(as(viewer), d)).status).toBe(200);
    expect((await post(viewer, { action: "auto" })).status).toBe(403);
    expect((await handleOutcomes(req(), d)).status).toBe(401);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    await post(cookie, { action: "add", name: "Orphan", count: 1, type: "", cohort: "", frameworkId: "shared" });
    expect(((await handleOutcomes(as(await signIn(d, { org: "other" })), d)).body as { outcomes: unknown[] }).outcomes).toEqual([]);
  });
});

describe("projects (DECISIONS 65)", () => {
  const post = (cookie: string, body: unknown) => handleOutcomes(as(cookie, { method: "POST", body }), d);
  const fwSetup = { categories: [], itemMap: {}, frameworks: [{ id: "shared", name: "Shared", unit: "child", cycle: "quarterly", reportType: "Q", instalment: "per_period", unitsPerBeneficiary: 3 }], itemFramework: {} };

  it("builds a project, its levels and places, and adds beneficiaries, then shows it", async () => {
    const cookie = await signIn(d);
    await handleConfig(as(cookie, { method: "PUT", body: fwSetup }), d);
    expect((await post(cookie, { action: "save-partner", profile: { name: "Aghosh Orphan Homes", type: "Institute" } })).status).toBe(200);
    expect((await post(cookie, { action: "add-level", projectId: "aghosh-orphan-homes", name: "Branch", parentId: "" })).status).toBe(200);
    expect((await post(cookie, { action: "add-type", projectId: "aghosh-orphan-homes", name: "Child", levelId: "branch", frameworkId: "shared" })).status).toBe(200);
    expect((await post(cookie, { action: "add-node", projectId: "aghosh-orphan-homes", levelId: "branch", parentId: "", name: "Branch 1", field: "Location", fieldValue: "Lahore" })).status).toBe(200);
    const r = await post(cookie, { action: "add-beneficiaries", projectId: "aghosh-orphan-homes", nodeId: "aghosh-orphan-homes-branch-1", typeId: "child", name: "Orphan", count: 3 });
    expect(r.status).toBe(200);
    const body = (await handleOutcomes(as(cookie), d)).body as { outcomes: { projectId: string }[]; projects: { levels: unknown[] }[]; nodes: { fields: Record<string, string> }[] };
    expect(body.outcomes).toHaveLength(3);
    expect(body.outcomes[0]?.projectId).toBe("aghosh-orphan-homes");
    expect(body.projects[0]?.levels).toHaveLength(1);
    expect(body.nodes[0]?.fields).toEqual({ Location: "Lahore" });
  });
  it("answers a plain error for something that does not fit, and keeps other organisations apart", async () => {
    const cookie = await signIn(d);
    const bad = await post(cookie, { action: "add-level", projectId: "nope", name: "Branch", parentId: "" });
    expect(bad.status).toBe(400);
    const other = (await handleOutcomes(as(await signIn(d, { org: "other" })), d)).body as { projects: unknown[]; nodes: unknown[] };
    expect(other.projects).toEqual([]);
    expect(other.nodes).toEqual([]);
  });
});

describe("placing gifts and the payment buffer (DECISIONS 66)", () => {
  const post = (cookie: string, body: unknown) => handleOutcomes(as(cookie, { method: "POST", body }), d);
  it("sets the grace days, refuses a bad number, and reports it", async () => {
    const cookie = await signIn(d);
    expect((await post(cookie, { action: "set-grace", days: 20 })).status).toBe(200);
    expect((await post(cookie, { action: "set-grace", days: 400 })).status).toBe(400);
    expect(((await handleOutcomes(as(cookie), d)).body as { graceDays: number }).graceDays).toBe(20);
  });
  it("answers a plain error when a gift is placed in a place that does not exist", async () => {
    const cookie = await signIn(d);
    expect((await post(cookie, { action: "place-in-node", commitmentKey: "nope", nodeId: "nope" })).status).toBe(400);
  });
});

describe("manager approval of a release (DECISIONS 74)", () => {
  const post = (cookie: string, body: unknown) => handleOutcomes(as(cookie, { method: "POST", body }), d);
  it("refuses someone without the manager permission, and refuses a place that is not due", async () => {
    const worker = await signIn(d, { perms: [P.access, P.viewWorkOrders, P.mapFrameworks] });
    expect((await post(worker, { action: "approve-release", commitmentKey: "x" })).status).toBe(403);
    const manager = await signIn(d);
    const r = await post(manager, { action: "approve-release", commitmentKey: "x" });
    expect(r.status).toBe(400);
    expect((r.body as { error: string }).error).toContain("not due");
  });
});

