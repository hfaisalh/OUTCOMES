/**
 * main-live-answers.test.ts
 *
 * What it does: guards against a bug found on 27/11/26 (DECISIONS 258): when the staff page loaded, it took the assignments from the server but not the answers (confirmations) or the steps taken (progress), so a partner's answer never showed on the Confirmation list until a staff person pressed something. A fake server answers the page's calls; the test opens Confirmation and checks the partner's saved answer is there.
 * Invented gifts. Who calls it: vitest only. Depends on: main.ts in live mode.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PERMISSIONS as P } from "./menu";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };

const wo = (key: string) => ({ key, lineId: key, transactionRef: `T-${key}`, paidDate: "2026-10-05", supporterId: "S1", supporterName: `Donor ${key}`, group: "", itemId: "I11", itemName: "Small Pump", amount: 30, quantity: 1, intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "water", status: "ready" });
const partner = { id: "trust", name: "Sample Trust", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2099-01-01", itemIds: ["I11"], capacities: { I11: 50 } };
const asg = (key: string) => ({ key, partnerId: "trust", giftProjectId: "", itemId: "I11", parts: 1, how: "auto", at: "2026-11-25T09:00:00Z", batch: 1 });

beforeAll(async () => {
  vi.stubGlobal("document", { getElementById: (id: string) => (id === "shell" ? shell : null), addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)) });
  vi.stubGlobal("fetch", async (path: string) => {
    const ok = (b: unknown) => ({ ok: true, status: 200, json: async () => b });
    if (path === "/api/me") return ok({ name: "Staff Person", org: "mwf", perms: Object.values(P), expiresAt: 0, storage: "database" });
    if (path === "/api/config") return ok({ categories: [{ id: "water", name: "Water", keywords: ["water"], framework: { unit: "", cycle: "on_delivery", reportType: "" } }], itemMap: {}, frameworks: [{ id: "wf", name: "Pump", unitsPerBeneficiary: 1, unit: "pump", cycle: "one_off", reportType: "r", assign: "auto", confirmDays: 3 }], itemFramework: {}, feed: {}, crmConnected: true });
    if (path === "/api/work-orders") return ok({ workOrders: [wo("G01"), wo("G02")], review: [], run: null });
    if (path === "/api/outcomes") {
      // The partner has already answered G01 (saved on the server). G02 is still waiting.
      return ok({ outcomes: [], outcomeAllocations: [], projects: [partner], giftProjects: [], nodes: [], assignments: { records: [asg("G01"), asg("G02")] }, confirmations: { records: [{ key: "G01", partnerId: "trust", answer: "confirmed", at: "2026-11-26T09:00:00Z", by: "Partner user", reason: "" }] }, progress: { records: [] } });
    }
    return ok({ items: [], audits: [] }); // attention items and audits, empty
  });
  await import("./main");
  await new Promise((r) => setTimeout(r, 30));
});

const el = (attrs: Record<string, string>) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (sel.includes("[data-page]") ? el(attrs) : null) });
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));

describe("the staff page after loading", () => {
  it("shows a partner's saved answer on the Confirmation list without anyone pressing anything first", async () => {
    fire("click", { target: el({ page: "confirmation" }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(shell.innerHTML).toContain("<h1>Confirmation</h1>");
    expect(shell.innerHTML).toContain("1 of 2 answered");
  });
});
