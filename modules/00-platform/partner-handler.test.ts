/**
 * partner-handler.test.ts
 *
 * What it does: tests the partner's sign-in and what it can reach (DECISIONS 249): the test sign-in as a partner, the partner's own slice from /api/outcomes, and that a partner sign-in is refused everywhere staff endpoints are, even when its token lists staff permissions.
 * Invented partners and children. Who calls it: vitest. Depends on: handlers.ts and the portal scope.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS as P } from "../../app/menu";
import { addBeneficiary, emptyRegister } from "../07-beneficiaries/beneficiaries";
import { handleConfig, handleDemoLogin, handleLaunch, handleMe, handleOutcomes, handleWorkOrders, type Deps, type HttpRequest } from "./handlers";
import { signToken, type Claims } from "./launch-token";
import { defaultConfig, memoryStore } from "./store";

const SECRETS = { launch: "launch-secret", session: "session-secret", cron: "cron-secret" };
const NOW_MS = 1_800_000_000_000;
const now = NOW_MS / 1000;
let n = 0;
const deps = (): Deps => ({ store: memoryStore(), secrets: SECRETS, nowMs: () => NOW_MS, newId: () => `id${++n}`, connector: () => null, storage: "memory", demoLogin: true });
const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({ method: "GET", query: {}, headers: {}, ...over });
const as = (cookie: string, over: Partial<HttpRequest> = {}): HttpRequest => req({ headers: { cookie }, ...over });
const cookieOf = (r: { headers?: Record<string, string> }): string => (r.headers?.["set-cookie"] ?? "").split(";")[0] as string;

let d: Deps;
beforeEach(async () => {
  d = deps();
  let register = emptyRegister();
  for (const [name, partnerId] of [["Amina Khan", "p1"], ["Bilal Ahmed", "p2"]] as const) {
    const r = addBeneficiary(register, "person", { name, partnerId, idNumber: `B-${name}` }, false, "2026-11-01");
    if ("error" in r) throw new Error(r.error);
    register = r.value;
  }
  await d.store.putConfig("demo", {
    ...defaultConfig(), beneficiaries: register,
    projects: [{ id: "p1", name: "Alpha Trust", fundingNote: "private" }, { id: "p2", name: "Beta Trust" }] as never,
    giftProjects: [{ id: "g1", name: "Project one", crmNames: [], partnerIds: ["p1"] }, { id: "g2", name: "Project two", crmNames: [], partnerIds: ["p2"] }] as never,
  });
});

describe("test sign-in as a partner", () => {
  it("signs in as that partner and says so", async () => {
    const r = await handleDemoLogin(req({ query: { partner: "p1" } }), d);
    expect(r.status).toBe(302);
    expect((await handleMe(as(cookieOf(r)), d)).body).toMatchObject({ partner: "p1", perms: ["outcomes.access", "outcomes.partner"] });
  });

  it("does not exist where the test sign-in is off", async () => {
    expect((await handleDemoLogin(req({ query: { partner: "p1" } }), { ...d, demoLogin: false })).status).toBe(404);
  });
});

describe("what a partner can reach", () => {
  it("gets only its own slice from /api/outcomes", async () => {
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const r = await handleOutcomes(as(c), d);
    expect(r.status).toBe(200);
    const body = r.body as { partner: { id: string }; beneficiaries: { name: string }[]; giftProjects: { id: string }[] };
    expect(body.partner.id).toBe("p1");
    expect(body.beneficiaries.map((b) => b.name)).toEqual(["Amina Khan"]);
    expect(body.giftProjects.map((g) => g.id)).toEqual(["g1"]);
    expect(JSON.stringify(r.body)).not.toMatch(/Bilal|private/);
  });

  it("cannot change anything, nor reach staff endpoints", async () => {
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    expect((await handleOutcomes(as(c, { method: "POST", body: { action: "auto" } }), d)).status).toBe(400); // only accepting or refusing its own gifts is open
    expect((await handleConfig(as(c), d)).status).toBe(403);
    expect((await handleWorkOrders(as(c), d)).status).toBe(403);
  });

  it("is still a partner when its token lists staff permissions: they are removed at sign-in", async () => {
    const claims: Claims = { typ: "launch", jti: "L1", sub: "u9", name: "A partner user", org: "demo", perms: Object.values(P), partner: "p1", iat: now, exp: now + 60 };
    const r = await handleLaunch(req({ query: { token: signToken(SECRETS.launch, claims) } }), d);
    const c = cookieOf(r);
    expect((await handleMe(as(c), d)).body).toMatchObject({ partner: "p1", perms: ["outcomes.access"] });
    expect((await handleConfig(as(c), d)).status).toBe(403);
    expect((await handleWorkOrders(as(c), d)).status).toBe(403);
  });

  it("lets a partner accept or refuse its own gifts, saved with its name, and nothing else", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    const gift = (key: string, partnerId: string) => ({ key, partnerId, giftProjectId: "g1", itemId: "S", parts: 1, how: "auto" as const, at: "2026-11-01T00:00:00Z", batch: 1 });
    await d.store.putConfig("demo", { ...cfg, assignments: { records: [gift("sub:1", "p1"), gift("sub:2", "p1"), gift("sub:3", "p2")] } });
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const post = (body: unknown) => handleOutcomes(as(c, { method: "POST", body }), d);
    const yes = await post({ action: "cnf-confirm", key: "sub:1" });
    expect(yes.status).toBe(200);
    expect(yes.body).toMatchObject({ message: "Accepted.", confirmations: [{ key: "sub:1", answer: "confirmed", by: "Demo partner" }] });
    expect((await post({ action: "cnf-reject", key: "sub:2" })).status).toBe(400); // a refusal needs a reason
    const no = await post({ action: "cnf-reject", key: "sub:2", reason: "No capacity" });
    expect(no.body).toMatchObject({ confirmations: [{ key: "sub:1" }, { key: "sub:2", answer: "rejected", reason: "No capacity" }] });
    expect((await post({ action: "cnf-confirm", key: "sub:3" })).status).toBe(400); // another partner's gift
    expect((await post({ action: "cnf-reset" })).status).toBe(400);
    expect((await post({ action: "ben-add", name: "Someone" })).status).toBe(400);
    const saved = (await d.store.getConfig("demo"))!.confirmations!.records;
    expect(saved.map((r) => r.key)).toEqual(["sub:1", "sub:2"]);
  });

  it("gives a partner the details of its own gifts, with the tribute, and never a donor or any money (DECISIONS 259)", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    const gift = (key: string, partnerId: string) => ({ key, partnerId, giftProjectId: "g1", itemId: "S", parts: 2, how: "auto" as const, at: "2026-11-01T00:00:00Z", batch: 1 });
    await d.store.putConfig("demo", { ...cfg, assignments: { records: [gift("L1", "p1"), gift("L2", "p2")] } });
    const order = (key: string, tribute: string) => ({ key, lineId: key, transactionRef: "T-SECRET", paidDate: "2026-10-05", supporterId: "DONOR-1", supporterName: "Private Donor", group: "Secret Group", itemId: "S", itemName: "Small Pump", amount: 30, quantity: 1, intention: "Memory", cause: "Water", tribute, subscriptionId: "", instalmentNumber: "", instalmentCount: "", categoryId: "water", status: "ready" });
    await d.store.saveWorkOrders("demo", [order("L1", "For Aisha") as never, order("L2", "Someone else's tribute") as never]);
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const r = await handleOutcomes(as(c), d);
    const body = r.body as { gifts: Record<string, { tribute: string; units: number }> };
    expect(Object.keys(body.gifts)).toEqual(["L1"]);
    expect(body.gifts["L1"]).toMatchObject({ tribute: "For Aisha", units: 2 });
    const all = JSON.stringify(r.body);
    for (const secret of ["Private Donor", "DONOR-1", "Secret Group", "T-SECRET", "Someone else"]) expect(all).not.toContain(secret);
  });

  it("gives 404 for a partner that no longer exists", async () => {
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "gone" } }), d));
    expect((await handleOutcomes(as(c), d)).status).toBe(404);
  });

  it("keeps staff out of the partner view: a staff sign-in gets the whole picture from the same address", async () => {
    const staff = cookieOf(await handleDemoLogin(req(), d));
    const body = (await handleOutcomes(as(staff), d)).body as { beneficiaries: { records: unknown[] } };
    expect(body.beneficiaries.records).toHaveLength(2);
  });
});
