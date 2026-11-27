/**
 * confirmation-page.test.ts
 *
 * What it does: tests the Confirmation page (DECISIONS 231) on invented gifts and partners: the lines (one for each batch), the tiles and what they count, and in the window of a batch the gifts, the answers, the buttons a person has, and that a partner holding a parked outcome is shown as confirmed for.
 * These tests double as examples. Who calls it: vitest. Depends on: confirmation-page.ts.
 */

import { describe, expect, it } from "vitest";
import { confirmationPage } from "./confirmation-page";
import { confirmationWindowHtml } from "./confirmation-window";
import type { View } from "./pages";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { Project } from "../modules/06-projects/projects";

const wo = (key: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T-${key}`, paidDate: "2026-10-05", supporterId: "S1", supporterName: `Donor ${key}`, group: "", itemId: "I11", itemName: "Small Pump", amount: 30, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "water", status: "ready", ...over,
}) as WorkOrder;
const partner: Project = { id: "trust", name: "Sample Trust", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2099-01-01", itemIds: ["I11"], capacities: { I11: 50 } } as unknown as Project;
const asg = (key: string, at: string) => ({ key, partnerId: "trust", giftProjectId: "", itemId: "I11", parts: 1, how: "auto" as const, at });
const view = (over: Partial<View> = {}): View => ({
  workOrders: [wo("G01"), wo("G02"), wo("G03")], projects: [partner], giftProjects: [], today: "2026-11-26",
  frameworks: [{ id: "wf", name: "Pump", unitsPerBeneficiary: 1, unit: "pump", cycle: "one_off", reportType: "r", assign: "auto", confirmDays: 3 }] as unknown as View["frameworks"],
  assignments: { records: [asg("G01", "2026-11-25T09:00:00Z"), asg("G02", "2026-11-20T09:00:00Z"), asg("G03", "2026-11-24T09:00:00Z")] },
  confirmations: { records: [] }, ...over,
}) as View;

describe("the Confirmation page, by batch (DECISIONS 243)", () => {
  it("has one line for each batch, and tiles that count batches and show the gifts in them", () => {
    const html = confirmationPage(view());
    expect(html).toContain("<h1>Confirmation</h1>");
    expect(html).toContain('data-tile="cnf:waiting" aria-pressed="false"><b>1</b><span>Batches waiting</span><div class="smrow"><span class="sm"><b>3</b> gifts</span>');
    expect(html).toContain('metric tile warn" data-tile="cnf:late" aria-pressed="false"><b>1</b><span>Late</span>'); // G02 was assigned on the 20th, due the 23rd
    expect(html).toContain("<h2>Batches");
    expect((html.match(/<tr class="rowlink" data-cnfwin=/g) ?? []).length).toBe(1); // the three gifts are one partner's batch 0
    expect(html).toContain('data-cnfwin="trust|0"');
    expect(html).toContain(">No batch<");
    expect(html).toContain("0 of 3 answered");
    expect(html).toContain("Late 1"); // the gifts themselves are in the window
    expect(html).not.toContain('data-cnf="confirm"'); // the answers are made in the window
  });
  it("groups by partner and batch number, the late and waiting ones first", () => {
    const html = confirmationPage(view({ assignments: { records: [{ ...asg("G01", "2026-11-25T09:00:00Z"), batch: 2 }, { ...asg("G02", "2026-11-20T09:00:00Z"), batch: 1 }, { ...asg("G03", "2026-11-24T09:00:00Z"), batch: 2 }] } }));
    expect(html.indexOf("Batch 1")).toBeLessThan(html.indexOf("Batch 2")); // batch 1 holds the late gift
    expect(html).toContain('data-cnfwin="trust|2"');
  });
  it("counts a fully confirmed batch as confirmed, and a batch with a rejection as rejected", () => {
    const answers = (a: string): View["confirmations"] => ({ records: ["G01", "G02", "G03"].map((key) => ({ key, partnerId: "trust", answer: a as "confirmed", at: "2026-11-25T12:00:00Z", by: "Sam", reason: a === "rejected" ? "No room" : "" })) });
    expect(confirmationPage(view({ confirmations: answers("confirmed") }))).toContain('data-tile="cnf:confirmed" aria-pressed="false"><b>1</b>');
    const rej = confirmationPage(view({ confirmations: answers("rejected") }));
    expect(rej).toContain("3 rejected");
    expect(confirmationPage({ ...view({ confirmations: answers("rejected") }), cnfFilter: "waiting" })).toContain("Nothing matches this tile");
  });
  it("asks for assignments when there are none, and never trusts names as HTML", () => {
    expect(confirmationPage(view({ assignments: { records: [] } }))).toContain("Nothing is assigned yet");
    expect(confirmationPage(view({ workOrders: [wo("G01", { supporterName: "<img src=x>" })], assignments: { records: [asg("G01", "2026-11-25T09:00:00Z")] } }))).not.toContain("<img");
  });
});

describe("the Confirmation window of one batch", () => {
  it("shows the gifts with the late one first, how late, and Confirm and Reject for each waiting gift, and the whole-batch buttons", () => {
    const html = confirmationWindowHtml(view(), "trust|0");
    expect(html).toContain("Sample Trust");
    expect(html).toContain("3 gifts");
    expect(html.indexOf("Donor G01")).toBeLessThan(html.indexOf("Donor G02")); // in the order they were assigned to it, the late one is marked
    expect(html).toContain("Late 3 days");
    expect(html).toContain('data-cnf="confirm" data-key="G01"');
    expect(html).toContain('data-cnf-reason="G01"');
    expect(html).toContain('data-cnf="confirm-batch" data-keys="G01 G02 G03"');
    expect(html).toContain("Confirm all 3 waiting");
    expect(html).toContain("data-cnf-batchreason");
  });
  it("answers only the gifts still waiting, shows answers, a rejection's reason and a way to choose another partner", () => {
    const html = confirmationWindowHtml(view({ confirmations: { records: [
      { key: "G01", partnerId: "trust", answer: "confirmed", at: "2026-11-25T12:00:00Z", by: "Sam", reason: "" },
      { key: "G03", partnerId: "trust", answer: "rejected", at: "2026-11-25T12:00:00Z", by: "Sam", reason: "No room this month" },
    ] } }), "trust|0");
    expect(html).toContain('data-keys="G02"'); // only G02 still waits
    expect(html).toContain("Confirm all 1 waiting");
    expect(html).not.toContain('data-cnf="confirm" data-key="G01"');
    expect(html).toContain("No room this month");
    expect(html).toContain('data-nav="assignment">Choose another partner');
  });
  it("says a gift was confirmed for the partner when OUTCOMES did it, says every gift is answered when so, and is empty for a batch that is gone", () => {
    const done = view({ confirmations: { records: ["G01", "G02", "G03"].map((key) => ({ key, partnerId: "trust", answer: "confirmed" as const, at: "2026-11-25T09:01:00Z", by: "OUTCOMES, for the partner", reason: "", onBehalf: true })) } });
    const html = confirmationWindowHtml(done, "trust|0");
    expect(html).toContain("for the partner");
    expect(html).toContain("Every gift in this batch has an answer");
    expect(html).not.toContain("confirm-batch");
    expect(confirmationWindowHtml(view(), "trust|9")).toBe("");
  });

  it("shows the country code of each gift in a batch's window, and nothing for a gift with no site (DECISIONS 261)", () => {
    const v = view({ workOrders: [wo("G01", { site: "US", currency: "USD" }), wo("G02", { site: "NO", currency: "NOK" }), wo("G03")] });
    const html = confirmationWindowHtml(v, "trust|0");
    expect(html).toContain('<span class="site" title="United States, paid in USD">US</span> Donor G01');
    expect(html).toContain('<span class="site" title="Norway, paid in NOK">NO</span> Donor G02');
    expect(html).toContain('<td class="clip" title="Donor G03 · Small Pump">Donor G03'); // no site, no chip
  });
});
