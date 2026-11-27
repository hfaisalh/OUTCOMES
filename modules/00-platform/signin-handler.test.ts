/**
 * signin-handler.test.ts
 *
 * What it does: tests the email and password sign-in and the test accounts (DECISIONS 250): the account signs in as exactly what it was made as, a wrong email and a wrong password look the same, passwords are never kept or listed, only settings staff manage accounts, and a partner account sees only its partner.
 * Invented people. Who calls it: vitest. Depends on: signin-handler.ts and handlers.ts.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { handleConfig, handleMe, handleOutcomes, type Deps, type HttpRequest } from "./handlers";
import { handleSignIn } from "./signin-handler";
import { addBeneficiary, emptyRegister } from "../07-beneficiaries/beneficiaries";
import { defaultConfig, memoryStore } from "./store";

const SECRETS = { launch: "launch-secret", session: "session-secret", cron: "cron-secret" };
let n = 0;
const deps = (): Deps => ({ store: memoryStore(), secrets: SECRETS, nowMs: () => 1_800_000_000_000, newId: () => `id${++n}`, connector: () => null, storage: "memory", ownerPassphrase: "a-long-owner-passphrase", demoLogin: false });
const post = (body: unknown, headers: Record<string, string> = {}): HttpRequest => ({ method: "POST", query: {}, headers, body });
const as = (cookie: string, over: Partial<HttpRequest> = {}): HttpRequest => ({ method: "GET", query: {}, headers: { cookie }, ...over });
const cookieOf = (r: { headers?: Record<string, string> }): string => (r.headers?.["set-cookie"] ?? "").split(";")[0] as string;

let d: Deps;
let owner: string;
beforeEach(async () => {
  d = deps();
  let register = emptyRegister();
  for (const [name, partnerId] of [["Amina Khan", "p1"], ["Bilal Ahmed", "p2"]] as const) {
    const r = addBeneficiary(register, "person", { name, partnerId, idNumber: `B-${name}` }, false, "2026-11-01");
    if ("error" in r) throw new Error(r.error);
    register = r.value;
  }
  await d.store.putConfig("mwf", { ...defaultConfig(), beneficiaries: register, projects: [{ id: "p1", name: "Alpha Trust" }, { id: "p2", name: "Beta Trust" }] as never, giftProjects: [{ id: "g1", name: "One", crmNames: [], partnerIds: ["p1"] }] as never });
  owner = cookieOf(await handleSignIn(post({ passphrase: "a-long-owner-passphrase" }), d));
});

// A request made by a signed-in person: the cookie goes in the headers.
const by = (cookie: string, body: unknown): HttpRequest => ({ ...post(body), headers: { cookie } });
const add = (over: Record<string, unknown> = {}) => handleSignIn(by(owner, { action: "login-add", email: "Sara@Alpha.org", name: "Sara", role: "partner", partnerId: "p1", password: "correct horse battery", ...over }), d);

describe("accounts", () => {
  it("only a person who may change settings can add or remove an account", async () => {
    expect((await handleSignIn(post({ action: "login-add", email: "a@b.org" }), d)).status).toBe(401);
    const agent = cookieOf(await handleSignIn(post({ passphrase: "a-long-owner-passphrase", role: "agent" }), d));
    expect((await handleSignIn(by(agent, { action: "login-add", email: "a@b.org", name: "A", role: "admin", password: "long enough pw" }), d)).status).toBe(403);
  });

  it("checks the email, name, password length, partner and duplicates, saying what to fix", async () => {
    expect(((await add({ email: "not-an-email" })).body as { error: string }).error).toContain("valid email");
    expect(((await add({ password: "short" })).body as { error: string }).error).toContain("at least 10");
    expect(((await add({ partnerId: "nobody" })).body as { error: string }).error).toContain("partner");
    expect(((await add({ role: "king" })).body as { error: string }).error).toContain("signs in as");
    expect((await add()).status).toBe(200);
    expect(((await add({ email: "sara@alpha.org" })).body as { error: string }).error).toContain("already");
  });

  it("keeps only a hash and never lists or sends the password", async () => {
    await add();
    const saved = JSON.stringify((await d.store.getConfig("mwf"))?.logins);
    expect(saved).not.toContain("correct horse");
    expect(saved).toContain("scrypt$");
    const me = JSON.stringify((await handleMe(as(owner), d)).body);
    expect(me).toContain("sara@alpha.org");
    expect(me).not.toMatch(/hash|scrypt|correct horse/);
  });

  it("removes an account, which then cannot sign in", async () => {
    await add();
    await handleSignIn(by(owner, { action: "login-remove", email: "sara@alpha.org" }), d);
    expect((await handleSignIn(post({ email: "sara@alpha.org", password: "correct horse battery" }), d)).status).toBe(401);
  });
});

describe("signing in with an email", () => {
  it("signs a partner account in as that partner only", async () => {
    await add();
    const r = await handleSignIn(post({ email: " SARA@alpha.org ", password: "correct horse battery" }), d);
    expect(r.status).toBe(200);
    const c = cookieOf(r);
    expect((await handleMe(as(c), d)).body).toMatchObject({ name: "Sara", partner: "p1", perms: ["outcomes.access", "outcomes.partner"] });
    const body = (await handleOutcomes(as(c), d)).body as { beneficiaries: { name: string }[] };
    expect(body.beneficiaries.map((b) => b.name)).toEqual(["Amina Khan"]);
    expect((await handleConfig(as(c), d)).status).toBe(403);
  });

  it("signs a staff account in with that role's permissions and no more", async () => {
    await add({ email: "viewer@mwf.org", role: "viewer", partnerId: "" });
    const c = cookieOf(await handleSignIn(post({ email: "viewer@mwf.org", password: "correct horse battery" }), d));
    expect((await handleMe(as(c), d)).body).toMatchObject({ perms: ["outcomes.access", "outcomes.dashboards"] });
    expect((await handleConfig(as(c), d)).status).toBe(403);
  });

  it("answers a wrong password and an unknown email the same way", async () => {
    await add();
    const wrong = await handleSignIn(post({ email: "sara@alpha.org", password: "not the password" }), d);
    const unknown = await handleSignIn(post({ email: "ghost@alpha.org", password: "correct horse battery" }), d);
    expect([wrong.status, wrong.body]).toEqual([unknown.status, unknown.body]);
    expect(wrong.status).toBe(401);
  });

  it("sends a form post back to the app, or to the sign-in screen with a note when it fails", async () => {
    await add();
    const form = { "content-type": "application/x-www-form-urlencoded" };
    expect((await handleSignIn(post({ email: "sara@alpha.org", password: "correct horse battery" }, form), d)).headers?.["location"]).toBe("/app/");
    expect((await handleSignIn(post({ email: "sara@alpha.org", password: "nope" }, form), d)).headers?.["location"]).toBe("/app/?signin=wrong-login");
  });

  it("still lets the owner in with the passphrase", async () => {
    expect((await handleSignIn(post({ passphrase: "wrong" }), d)).status).toBe(401);
    expect(owner).toContain("outcomes_session=");
  });
});
