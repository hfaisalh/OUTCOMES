/**
 * sample-scenario.test.ts
 *
 * What it does: tests the sample world end to end on the server (DECISIONS 329): the world's gifts are picked up, the standard workflows are set, the sample setup is loaded, then the sample scenario. It checks that every part of the journey and every new feature has something to show, and that Remove clears it.
 * Who calls it: vitest. Depends on: the handlers, the pick-up, the export adapter and the sample files in samples/world. Invented data throughout.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsv, toRecords } from "../01-data-mapping/csv";
import { adaptFiles } from "../01e-crm-export-adapter/export-adapter";
import { rowsReader, type CrmReporter } from "../01c-crm-connector/reader";
import { addStarterWorkflows, linkStarterTypes } from "../02-project-rules/workflows";
import { starterOutcomeTypes } from "../05-outcomes/outcome-types";
import { handleDemoLogin, handleOutcomes, type Deps, type HttpRequest } from "./handlers";
import { runPickup } from "./pickup";
import { defaultConfig, memoryStore } from "./store";
import { partnerDash } from "../13-partner-portal/dashboard";
import { partnerSlice } from "../13-partner-portal/scope";

const SECRETS = { launch: "l", session: "s", cron: "c" };
const NOW_MS = Date.parse("2026-11-28T09:00:00Z");
const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({ method: "GET", query: {}, headers: {}, ...over });
const load = (n: string) => toRecords(parseCsv(readFileSync(new URL(`../../samples/world/${n}`, import.meta.url), "utf8"))).records;
const WORKFLOW_OF: Record<string, string> = { "MWF-ORP-001": "orphan-sponsorship", "MWF-HIF-001": "student-sponsorship", "MWF-ALM-001": "student-sponsorship", "MWF-WAT-001": "water-pump", "MWF-WAT-002": "water-pump", "MWF-BLD-001": "house-build", "MWF-FAM-001": "livelihood-start", "MWF-MED-001": "activity" };

async function world() {
  const d: Deps = { store: memoryStore(), secrets: SECRETS, nowMs: () => NOW_MS, newId: (() => { let n = 0; return () => `id${++n}`; })(), connector: () => null, storage: "memory", demoLogin: true };
  const a = adaptFiles([load("export-donation-lines.csv"), load("export-catalogue.csv"), load("export-recurring-plans.csv")]);
  if (!("rows" in a)) throw new Error("the world was not read");
  const added = addStarterWorkflows([], starterOutcomeTypes());
  const itemFramework = Object.fromEntries(Object.entries(WORKFLOW_OF));
  await d.store.putConfig("demo", { ...defaultConfig(), frameworks: added.frameworks, outcomeTypes: linkStarterTypes(added.types, added.frameworks.map((f) => f.id)), itemFramework, itemMap: Object.fromEntries(Object.keys(WORKFLOW_OF).map((k) => [k, "default"])) } as never);
  const reporter: CrmReporter = { send: async () => undefined };
  await runPickup("demo", { store: d.store, reader: rowsReader(a.rows), reporter, nowIso: "2026-11-28T03:00:00Z" });
  const owner = (await handleDemoLogin(req({ query: {} }), d)).headers?.["set-cookie"]?.split(";")[0] as string;
  const post = (body: unknown) => handleOutcomes(req({ method: "POST", headers: { cookie: owner }, body }), d);
  return { d, post };
}

describe("the sample scenario on the sample world", () => {
  it("asks for the sample setup and the workflows first", async () => {
    const { post } = await world();
    const early = await post({ action: "sample-scenario-load" });
    expect(early.status).toBe(400);
    expect(JSON.stringify(early.body)).toContain("Load the sample setup first.");
  });

  it("makes a working organisation: answers on time, late, refused and missing, work late, waiting for review and sent back, messages, loop and settings", async () => {
    const { d, post } = await world();
    expect((await post({ action: "sample-load" })).status).toBe(200);
    const run = await post({ action: "sample-scenario-load" });
    expect(run.status).toBe(200);
    const c = (await d.store.getConfig("demo"))!;
    expect(c.assignments!.records.length).toBeGreaterThanOrEqual(10);
    const kinds = new Set(c.confirmations!.records.map((x) => x.answer));
    expect(kinds.has("confirmed") && kinds.has("rejected")).toBe(true);
    expect(c.assignments!.records.some((a) => !c.confirmations!.records.some((x) => x.key === a.key))).toBe(true); // gifts with no answer yet
    expect(c.allocations!.records.length).toBeGreaterThan(0);
    expect(c.progress!.records.some((r) => r.kind === "reject")).toBe(true); // work sent back
    expect(c.progress!.records.some((r) => r.kind === "stage" && r.id === "complete")).toBe(true);
    expect(c.partnerMessages!.length).toBeGreaterThanOrEqual(4);
    expect(c.priorityGifts!.length).toBe(1);
  });

  it("gives a partner a dashboard with late work, work sent back and messages", async () => {
    const { d, post } = await world();
    await post({ action: "sample-load" });
    await post({ action: "sample-scenario-load" });
    const c = (await d.store.getConfig("demo"))!;
    const partnerId = c.partnerMessages![0]!.partnerId; // the partner whose inbox the scenario filled
    const mine = c.assignments!.records.filter((a) => a.partnerId === partnerId);
    expect(mine.length).toBeGreaterThan(0);
    // the same slice the partner's own sign-in would get
    const wos = await d.store.listWorkOrders("demo");
    const itemNames: Record<string, string> = {}; for (const w of wos) itemNames[w.itemId] = w.itemName;
    const slice = partnerSlice({ itemNames, partners: c.projects as never, giftProjects: c.giftProjects as never, register: c.beneficiaries as never, enrolments: c.enrolments as never, assignments: c.assignments as never, confirmations: c.confirmations as never, progress: c.progress as never, allocations: c.allocations as never, messages: c.partnerMessages as never, giftDetails: {} }, partnerId)!;
    expect(slice.messages!.length).toBeGreaterThanOrEqual(4);
    const dash = partnerDash(slice, "2026-11-28");
    expect(dash.counts.toAnswer + dash.counts.inDelivery + dash.counts.complete + dash.counts.sentBack).toBeGreaterThan(0);
  });

  it("is removed in one step", async () => {
    const { d, post } = await world();
    await post({ action: "sample-load" });
    await post({ action: "sample-scenario-load" });
    expect((await post({ action: "sample-scenario-remove" })).status).toBe(200);
    const c = (await d.store.getConfig("demo"))!;
    expect([c.assignments!.records.length, c.confirmations!.records.length, c.progress!.records.length, c.partnerMessages!.length]).toEqual([0, 0, 0, 0]);
  });

  it("never touches a real gift, the workflows, the benefit connections, the days to fulfil or the automatic settings, and Remove clears only its own records (decision 330)", async () => {
    const { d, post } = await world();
    const real = { key: "REAL1", lineId: "REAL1", status: "ready", itemId: "MWF-ORP-001", itemName: "Orphan Sponsorship Monthly", supporterName: "Real Person", subscriptionId: "", instalmentCount: "", instalmentNumber: "", paidDate: "2026-11-10", frameworkId: "orphan-sponsorship", quantity: 1, amount: 30 } as never;
    await d.store.saveWorkOrders("demo", [...(await d.store.listWorkOrders("demo")), real]);
    const before = (await d.store.getConfig("demo"))!;
    const realAssignment = { key: "REAL1", partnerId: "real-partner", giftProjectId: "g", itemId: "MWF-ORP-001", parts: 1, how: "auto" as const, at: "2026-11-11T00:00:00Z", batch: 1 };
    const myFw = before.frameworks!.map((f) => (f.id === "orphan-sponsorship" ? { ...f, moveAfterDays: 9, cycle: "monthly" as const } : f));
    await d.store.putConfig("demo", { ...before, frameworks: myFw, assignments: { records: [realAssignment] }, autoRules: { remindBefore: 5 }, itemTimelines: { "MWF-ORP-001": { days: 77 } }, itemKinds: { "MWF-ORP-001": "person" }, partnerMessages: [{ id: "real-msg", partnerId: "real-partner", at: "2026-11-12T00:00:00Z", kind: "reminder", title: "t", text: "x", read: false }] } as never);
    await post({ action: "sample-load" });
    await post({ action: "sample-scenario-load" });
    const c = (await d.store.getConfig("demo"))!;
    expect(c.assignments!.records.find((x) => x.key === "REAL1")).toEqual(realAssignment); // the real gift keeps its own record
    expect(c.assignments!.records.some((x) => x.key !== "REAL1")).toBe(true); // and the sample gifts got theirs
    expect(c.frameworks!.find((f) => f.id === "orphan-sponsorship")).toMatchObject({ moveAfterDays: 9, cycle: "monthly" }); // your workflow settings
    expect(c.autoRules).toEqual({ remindBefore: 5 });
    expect(c.itemTimelines).toEqual({ "MWF-ORP-001": { days: 77 } });
    expect(c.itemKinds).toEqual({ "MWF-ORP-001": "person" });
    expect(c.partnerMessages!.some((m) => m.id === "real-msg")).toBe(true);
    await post({ action: "sample-scenario-remove" });
    const after = (await d.store.getConfig("demo"))!;
    expect(after.assignments!.records.map((x) => x.key)).toEqual(["REAL1"]); // only the sample gifts' records went
    expect(after.partnerMessages!.map((m) => m.id)).toEqual(["real-msg"]);
  });
});
