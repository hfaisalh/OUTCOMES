/**
 * reader.test.ts
 *
 * What it does: tests reader.ts with a fake network call, so no real CRM is contacted.
 */

import { describe, expect, it } from "vitest";
import { apiReader, apiReporter, ConnectorError, rowsReader, type FetchLike } from "./reader";

const config = { baseUrl: "https://crm.example.org/api/outcomes/", token: "secret-token" };
const ok = (body: unknown): FetchLike => async () => ({ ok: true, status: 200, json: async () => body });
const status = (s: number): FetchLike => async () => ({ ok: false, status: s, json: async () => ({}) });

describe("apiReader", () => {
  it("reads rows and turns every value into text", async () => {
    const rows = await apiReader(config, ok({ rows: [{ line_id: 7, needs_feedback: 1, superseded_by: null }] })).readFeed();
    expect(rows).toEqual([{ line_id: "7", needs_feedback: "1", superseded_by: "" }]);
  });

  it("asks for changes since a time and sends the token as a header, not in the address", async () => {
    let seen = { url: "", auth: "" };
    const spy: FetchLike = async (url, init) => {
      seen = { url, auth: init?.headers?.Authorization ?? "" };
      return { ok: true, status: 200, json: async () => ({ rows: [] }) };
    };
    await apiReader(config, spy).readFeed("2026-11-18T00:00:00Z");
    expect(seen.url).toBe("https://crm.example.org/api/outcomes/feed?since=2026-11-18T00%3A00%3A00Z");
    expect(seen.auth).toBe("Bearer secret-token");
    expect(seen.url).not.toContain("secret-token");
  });

  it("explains failures in plain English without the token", async () => {
    const e1 = await apiReader(config, status(401)).readFeed().catch((e) => e);
    expect(e1).toBeInstanceOf(ConnectorError);
    expect(e1.message).toContain("refused");
    const e2 = await apiReader(config, async () => Promise.reject(new Error("net"))).readFeed().catch((e) => e);
    expect(e2.message).toContain("Could not reach the CRM");
    expect(`${e1.message}${e2.message}`).not.toContain("secret-token");
    const e3 = await apiReader(config, ok({})).readFeed().catch((e) => e);
    expect(e3.message).toContain("list of rows");
  });
});

describe("apiReporter", () => {
  it("posts the items, and does nothing when there are none", async () => {
    let calls = 0;
    const spy: FetchLike = async () => {
      calls++;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await apiReporter(config, spy).send([]);
    expect(calls).toBe(0);
    await apiReporter(config, spy).send([{ workOrderKey: "T1:L1", transactionRef: "T1", lineId: "L1", supporterId: "D1", status: "delivered", reportUrl: "", updatedAt: "x" }]);
    expect(calls).toBe(1);
  });

  it("reports a refusal in plain English", async () => {
    const e = await apiReporter(config, status(403)).send([{ workOrderKey: "a", transactionRef: "a", lineId: "a", supporterId: "a", status: "delivered", reportUrl: "", updatedAt: "x" }]).catch((x) => x);
    expect(e.message).toContain("refused");
  });
});

describe("rowsReader", () => {
  it("returns the rows it was given", async () => {
    expect(await rowsReader([{ a: "1" }]).readFeed()).toEqual([{ a: "1" }]);
  });
});
