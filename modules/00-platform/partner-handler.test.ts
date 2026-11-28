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

  it("lets a partner add and complete its own beneficiaries, and the waiting list enrols them by itself (DECISIONS 260)", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    await d.store.putConfig("demo", { ...cfg, beneficiaries: emptyRegister(), giftProjects: [{ id: "g1", name: "Orphan homes", crmNames: [], partnerIds: ["p1"], itemIds: ["S"], enrolAuto: true, clusters: [{ id: "c1", name: "Home", label: "Home", parentId: "", place: "", capacity: 1, status: "active" }] }, { id: "g2", name: "Other project", crmNames: [], partnerIds: ["p2"] }] as never });
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const post = (body: unknown) => handleOutcomes(as(c, { method: "POST", body }), d);
    const full = { action: "ben-add", name: "Amina Khan", dob: "2016-04-02", guardian: "A mother", idNumber: "B-1", targetProjectId: "g1" };

    const first = await post(full);
    expect(first.status).toBe(200);
    const body = first.body as { message: string; beneficiaries: { id: string; name: string; partnerId: string; eligibility: string }[]; enrolments: { beneficiaryId: string; auto?: boolean }[] };
    expect(body.message).toBe("Added Amina Khan (PRS-0001). Enrolled in Orphan homes."); // complete, and there was room
    expect(body.beneficiaries[0]).toMatchObject({ partnerId: "p1", eligibility: "ready" });
    expect(body.enrolments).toMatchObject([{ beneficiaryId: "PRS-0001", auto: true }]);

    const waiting = await post({ ...full, name: "Bilal Ahmed", idNumber: "B-2", guardian: "" }); // incomplete, and the home is full anyway
    expect((waiting.body as { message: string }).message).toBe("Added Bilal Ahmed (PRS-0002). Add guardian before they can join the waiting list for Orphan homes.");
    const done = await post({ action: "ben-set", id: "PRS-0002", name: "Bilal Ahmed", targetProjectId: "g1", guardian: "An uncle" });
    expect((done.body as { message: string }).message).toBe("Saved Bilal Ahmed (PRS-0002). The record is complete, so they are on the waiting list for Orphan homes.");

    expect((await post({ ...full, name: "Chand", idNumber: "B-3", targetProjectId: "g2" })).status).toBe(400); // a project the partner does not deliver
    const saved = (await d.store.getConfig("demo"))!.beneficiaries!.records;
    expect(saved.map((b) => [b.id, b.partnerId])).toEqual([["PRS-0001", "p1"], ["PRS-0002", "p1"]]);
  });

  it("adds many beneficiaries from a CSV in one request, lists the rows it could not add, and runs the waiting list once (DECISIONS 271)", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    const other = cfg.beneficiaries!.records.find((b) => b.partnerId === "p2")!;
    await d.store.putConfig("demo", { ...cfg, giftProjects: [{ id: "g1", name: "Orphan homes", crmNames: [], partnerIds: ["p1"], itemIds: ["S"], enrolAuto: true, clusters: [{ id: "c1", name: "Home", label: "Home", parentId: "", place: "", capacity: 1, status: "active" }] }] as never });
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const post = (body: unknown) => handleOutcomes(as(c, { method: "POST", body }), d);
    const good = (name: string, id: string, extra: Record<string, string> = {}) => ({ name, dob: "2016-04-02", guardian: "A mother", idNumber: id, ...extra });
    const r = await post({ action: "ben-add-many", targetProjectId: "g1", allowSimilar: false, rows: [{ line: 2, values: good("Zara Malik", "B-1") }, { line: 3, values: { name: "X", dob: "bad" } }, { line: 4, values: good("Yusuf Raza", "B-2", { guardian: "" }) }, { line: 5, values: good("Chand Ali", other.idNumber || "B-SAME") }, { line: 6, values: good("Dana Shah", "B-4", { targetProjectId: "not-mine" }) }] });
    expect(r.status).toBe(200);
    const body = r.body as { message: string; upload: { added: number; addedLines: number[]; skipped: { line: number; error: string }[] }; beneficiaries: { id: string }[] };
    expect(body.upload.addedLines).toEqual([2, 4]); // the rows added, so the window can remove them from its list
    expect(body.upload.added).toBe(2);
    expect(body.upload.skipped.map((x) => x.line)).toEqual([3, 6, ...(other.idNumber ? [5] : [])].sort((a, b) => a - b).filter((l, i, all) => all.indexOf(l) === i));
    expect(body.message).toBe(`Added 2 beneficiaries: 1 enrolled, 0 on the waiting list, 1 needing details. ${body.upload.skipped.length} not added.`);
    const saved = (await d.store.getConfig("demo"))!.beneficiaries!.records.filter((b) => b.partnerId === "p1").map((b) => b.name);
    expect(saved).toEqual(expect.arrayContaining(["Zara Malik", "Yusuf Raza"]));
    expect(saved).not.toContain("Chand Ali"); // refused: another partner's person
    if (other.idNumber) expect(JSON.stringify(body.upload.skipped)).not.toContain(other.name); // never describes another partner's record
    expect((await post({ action: "ben-add-many", rows: [] })).status).toBe(400);
    expect((await post({ action: "ben-add-many", rows: [{ line: 2, values: { name: 5 } }] })).status).toBe(400); // a malformed row is not understood
  });

  it("does not let a partner touch another partner's beneficiary, or remove anyone", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    const other = cfg.beneficiaries!.records.find((b) => b.partnerId === "p2")!;
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const post = (body: unknown) => handleOutcomes(as(c, { method: "POST", body }), d);
    expect((await post({ action: "ben-set", id: other.id, name: "Hacked", targetProjectId: "g1" })).status).toBe(400);
    expect((await post({ action: "ben-remove", id: other.id })).status).toBe(400);
    expect((await d.store.getConfig("demo"))!.beneficiaries!.records.find((b) => b.id === other.id)!.name).toBe(other.name);
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

describe("place suggestions for the Area pickers (DECISIONS 274)", () => {
  const found = { features: [{ properties: { osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "city", name: "Kasur", state: "Punjab", country: "Pakistan", countrycode: "PK" }, geometry: { coordinates: [74.4, 31.1] } }] };
  const withFetch = (): Deps => ({ ...d, fetch: async () => ({ ok: true, json: async () => found }) });

  it("answers a partner and staff alike, and only when signed in", async () => {
    const pc = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const r = await handleOutcomes(as(pc, { query: { places: "Kasur Unique" } }), withFetch());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ places: [{ id: "osm:N1", name: "Kasur" }] });
    expect((await handleOutcomes(req({ query: { places: "Kasur" } }), withFetch())).status).toBe(401);
  });
});

describe("saving a beneficiary with a checked place (DECISIONS 274)", () => {
  it("keeps the place in the organisation's list once, and the id on the beneficiary", async () => {
    const c = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const place = { id: "osm:N1", name: "Kasur", district: "", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1, lon: 74.4 };
    const post = (name: string) => handleOutcomes(as(c, { method: "POST", body: { action: "ben-add", name, area: "Kasur, Punjab, Pakistan", locationId: "osm:N1", location: place, targetProjectId: "g1" } }), d);
    expect((await post("Chand Bibi")).status).toBe(200);
    expect((await post("Dawood Ali")).status).toBe(200);
    const cfg = (await d.store.getConfig("demo"))!;
    expect(cfg.locations).toEqual([place]);
    expect(cfg.beneficiaries!.records.filter((b) => b.locationId === "osm:N1")).toHaveLength(2);
  });
});

describe("staff: places in the register and the Areas page (DECISIONS 275)", () => {
  const place = { id: "osm:N1", name: "Kasur", district: "", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1, lon: 74.4 };
  it("one choice gives every beneficiary who typed the area the place, and the places come back with the reply", async () => {
    const cfg = (await d.store.getConfig("demo"))!;
    const reg = { ...cfg.beneficiaries!, records: cfg.beneficiaries!.records.map((b) => ({ ...b, area: "kasur" })) };
    await d.store.putConfig("demo", { ...cfg, beneficiaries: reg });
    const staff = cookieOf(await handleDemoLogin(req(), d));
    const r = await handleOutcomes(as(staff, { method: "POST", body: { action: "ben-area", area: "Kasur", location: place } }), d);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ warning: "2 records now have the place Kasur.", locations: [place] });
    expect((await d.store.getConfig("demo"))!.beneficiaries!.records.every((b) => b.locationId === "osm:N1")).toBe(true);
    expect((await handleOutcomes(as(staff, { method: "POST", body: { action: "ben-area", area: "Kasur", location: { id: "bad" } } }), d)).status).toBe(400);
  });
});

describe("partner costs (DECISIONS 280)", () => {
  const cost = { action: "cost-add", date: "2026-11-20", category: "Marketing", amount: "100", currency: "GBP", projectId: "g1", note: "Flyers" };
  it("lets a partner record, correct and remove its own costs, and see only those", async () => {
    const c1 = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    const c2 = cookieOf(await handleDemoLogin(req({ query: { partner: "p2" } }), d));
    const post = (c: string, body: unknown) => handleOutcomes(as(c, { method: "POST", body }), d);
    const added = await post(c1, cost);
    expect(added.body).toMatchObject({ message: "Cost recorded.", costs: [{ id: "PC-0001", partnerId: "p1", amount: 100 }] });
    expect((await post(c1, { ...cost, id: "PC-0001", action: "cost-set", amount: "250" })).body).toMatchObject({ costs: [{ amount: 250 }] });
    expect((await post(c2, { ...cost, projectId: "g2" })).body).toMatchObject({ costs: [{ id: "PC-0002", partnerId: "p2" }] }); // the other partner sees only its own
    expect(JSON.stringify((await handleOutcomes(as(c1), d)).body)).not.toContain("PC-0002");
    expect((await post(c2, { action: "cost-remove", id: "PC-0001" })).status).toBe(400); // not its own
    expect((await post(c1, { ...cost, projectId: "g2" })).status).toBe(400); // not its own project
    expect((await post(c1, { action: "cost-remove", id: "PC-0001" })).body).toMatchObject({ message: "Cost removed.", costs: [] });
  });
  it("shows staff every partner's costs", async () => {
    const c1 = cookieOf(await handleDemoLogin(req({ query: { partner: "p1" } }), d));
    await handleOutcomes(as(c1, { method: "POST", body: cost }), d);
    const staff = cookieOf(await handleDemoLogin(req(), d));
    expect((await handleOutcomes(as(staff), d)).body).toMatchObject({ partnerCosts: [{ id: "PC-0001" }] });
  });
});
