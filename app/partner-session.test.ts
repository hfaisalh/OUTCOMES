/**
 * partner-session.test.ts
 *
 * What it does: tests what happens when a partner presses buttons on its own screen (DECISIONS 254, 260): opening and cancelling the beneficiary form, saving it (sent as add or edit, with what was typed), keeping what was typed and showing the server's error, the same-person box, and the gift details and batch toggles.
 * A fake page and server stand in for the browser and the network. Who calls it: vitest. Depends on: partner-session.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePartnerAction, partnerUi } from "./partner-session";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";

const sent: Record<string, unknown>[] = [];
let reply: { ok: boolean; body: unknown } = { ok: true, body: {} };
const typed: Record<string, string> = {};
let different = false;
const slice = { partner: { id: "p1", name: "A" }, beneficiaries: [{ id: "PRS-1", kind: "person", name: "Amina", guardian: "A mother", targetProjectId: "g1" }] } as unknown as PartnerSlice;
const el = (dataset: Record<string, string> = {}) => ({ dataset, matches: () => false }) as unknown as HTMLElement;
const run = (action: string, dataset: Record<string, string> = {}) => handlePartnerAction(action, el(dataset), slice, () => undefined, () => undefined);

beforeEach(() => {
  sent.length = 0; reply = { ok: true, body: {} }; different = false;
  for (const k of Object.keys(typed)) delete typed[k];
  Object.assign(partnerUi, { open: [], details: [], lastOpened: "", refusing: null, form: null, message: "", error: "" });
  vi.stubGlobal("document", { getElementById: (id: string) => (id === "pe-different" ? (different ? { checked: true } : null) : id.startsWith("pe-") ? { value: typed[id.slice(3)] ?? "", focus() {} } : null), querySelector: () => null });
  vi.stubGlobal("fetch", async (_p: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return { ok: reply.ok, status: reply.ok ? 200 : 400, json: async () => reply.body }; });
});

describe("the beneficiary form", () => {
  it("opens empty to add, opens with the saved values to edit, and closes on Cancel", async () => {
    await run("pt-add");
    expect(partnerUi.form).toEqual({ id: "", values: {}, error: "", similar: false });
    await run("pt-form-cancel");
    expect(partnerUi.form).toBeNull();
    await run("pt-edit", { id: "PRS-1" });
    expect(partnerUi.form).toMatchObject({ id: "PRS-1", values: { name: "Amina", guardian: "A mother", targetProjectId: "g1", dob: "" } });
  });

  it("sends an add with what was typed, closes the form and shows the server's message", async () => {
    typed["name"] = "Bilal Ahmed"; typed["targetProjectId"] = "g1"; typed["guardian"] = "An uncle";
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [], message: "Added Bilal Ahmed (PRS-2). Enrolled in Orphan homes." } };
    await run("pt-add");
    await run("pt-form-save");
    expect(sent[0]).toMatchObject({ action: "ben-add", name: "Bilal Ahmed", targetProjectId: "g1", guardian: "An uncle", allowSimilar: false });
    expect(sent[0]).not.toHaveProperty("id");
    expect(partnerUi.form).toBeNull();
    expect(partnerUi.message).toBe("Added Bilal Ahmed (PRS-2). Enrolled in Orphan homes.");
  });

  it("sends an edit with the record's id", async () => {
    typed["name"] = "Amina"; typed["targetProjectId"] = "g1";
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [] } };
    await run("pt-edit", { id: "PRS-1" });
    await run("pt-form-save");
    expect(sent[0]).toMatchObject({ action: "ben-set", id: "PRS-1" });
  });

  it("keeps what was typed when the server refuses, shows its words, and offers the same-person box only for a possible match", async () => {
    typed["name"] = "Amina Khan";
    reply = { ok: false, body: { error: "Possible match: Amina Khan (PRS-1). If this is a different person, tick that it is not the same and save again." } };
    await run("pt-add");
    await run("pt-form-save");
    expect(partnerUi.form).toMatchObject({ values: { name: "Amina Khan" }, similar: true });
    expect(partnerUi.form?.error).toContain("Possible match");
    different = true;
    await run("pt-form-save");
    expect(sent[1]).toMatchObject({ allowSimilar: true });
    reply = { ok: false, body: { error: "Give a name." } };
    await run("pt-form-save");
    expect(partnerUi.form).toMatchObject({ error: "Give a name.", similar: false });
  });
});

describe("the toggles", () => {
  it("opens and closes a batch and a gift's details, remembering which", async () => {
    await run("pt-toggle", { batch: "1" });
    expect(partnerUi).toMatchObject({ open: ["1"], lastOpened: "1" });
    await run("pt-details", { key: "sub:1" });
    expect(partnerUi.details).toEqual(["sub:1"]);
    await run("pt-toggle", { batch: "1" });
    await run("pt-details", { key: "sub:1" });
    expect(partnerUi).toMatchObject({ open: [], details: [] });
  });
});
