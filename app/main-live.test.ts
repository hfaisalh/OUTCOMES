/**
 * main-live.test.ts
 *
 * What it does: a smoke test of live mode (signed in from the CRM) without a browser or a network. A
 * fake server answers the page's calls. It checks that the page switches from demo to live, shows the
 * server's work orders, saves the setup when an item is sorted, and runs a pick-up.
 * Who calls it: Vitest only.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS as P } from "./menu";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const calls: { path: string; method: string; body: unknown }[] = [];

const order = (key: string, itemId: string, itemName: string, status: string, frameworkId: string) => ({ key, lineId: key, transactionRef: "T", paidDate: "2026-11-02", supporterId: "D1", supporterName: "Sample Supporter", group: "", itemId, itemName, amount: 10, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId, status });

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : null),
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  vi.stubGlobal("fetch", async (path: string, init?: { method?: string; body?: string }) => {
    calls.push({ path, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (path === "/api/me") return ok({ name: "Real Person", org: "mwf", perms: Object.values(P), expiresAt: 0, storage: "database" });
    if (path === "/api/config" && !init?.method) return ok({ frameworks: [{ id: "water", name: "Water", categoryId: "", keywords: ["water"], rules: { unit: "", cycle: "on_delivery", reportType: "" } }], categories: [], itemMap: {}, crmConnected: true });
    if (path === "/api/config") return ok({ ok: true, routed: 1 });
    if (path === "/api/work-orders") return ok({ workOrders: [order("T:L1", "I11", "Water Pump", "unrouted", "")], review: [], run: { at: "2026-11-19T09:00:00Z", ok: true, rows: 8, created: 1, rerouted: 0, skipped: 3, issues: [] } });
    if (path === "/api/pickup") return ok({ org: "mwf", ok: true, created: 2, rerouted: 0 });
    return { ok: false, status: 404, json: async () => ({}) };
  });
  await import("./main");
  await new Promise((r) => setTimeout(r, 20)); // let the sign-in check and loads finish
});

const el = (attrs: Record<string, string>, matches: string[]) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (matches.some((m) => sel.includes(m)) ? el(attrs, matches) : null) });
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));
const click = (attrs: Record<string, string>, match: string) => fire("click", { target: el(attrs, [match]) });
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("live mode", () => {
  it("switches from demo to live and shows the server's work orders and last pick-up", () => {
    expect(shell.innerHTML).toContain("Real Person");
    expect(shell.innerHTML).toContain("Signed in from the CRM");
    expect(shell.innerHTML).toContain("Water Pump");
    expect(shell.innerHTML).toContain("Last pick-up");
    expect(shell.innerHTML).not.toContain("Demo: a new paid line");
  });

  it("saves the setup when an item is sorted, and says how many work orders were routed", async () => {
    calls.length = 0;
    fire("change", { target: { id: "", dataset: { assign: "I11" }, value: "water" } });
    await settle();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ itemMap: { I11: "water" } });
    expect(shell.innerHTML).toContain("Saved. 1 work order routed.");
  });

  it("runs a pick-up on request", async () => {
    click({ action: "pickup-now" }, "data-action");
    await settle();
    expect(calls.some((c) => c.path === "/api/pickup" && c.method === "POST")).toBe(true);
    expect(shell.innerHTML).toContain("Pick-up finished: 2 new");
  });
});
