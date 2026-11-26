/**
 * confirmation-page.test.ts
 *
 * What it does: tests the Confirmation page (DECISIONS 231) on invented gifts and partners: the tiles and what they count, the order (late first), the answers, the buttons a person has, and that a partner holding a parked outcome is shown as confirmed for.
 * These tests double as examples. Who calls it: vitest. Depends on: confirmation-page.ts.
 */

import { describe, expect, it } from "vitest";
import { confirmationPage } from "./confirmation-page";
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

describe("the Confirmation page", () => {
  it("counts waiting, late (past the last day to answer), confirmed and rejected, as tiles that filter the list", () => {
    const html = confirmationPage(view());
    expect(html).toContain("<h1>Confirmation</h1>");
    expect(html).toContain('data-tile="cnf:waiting" aria-pressed="false"><b>3</b><span>Waiting</span>');
    expect(html).toContain('metric tile warn" data-tile="cnf:late" aria-pressed="false"><b>1</b><span>Late</span>'); // G02 was assigned on the 20th, due the 23rd
    expect(html).toContain('data-tile="cnf:confirmed" aria-pressed="false"><b>0</b><span>Confirmed</span>');
  });
  it("lists the late one first, says how many days late, and gives a person Confirm and Reject (with a reason box) for each waiting gift", () => {
    const html = confirmationPage(view());
    expect(html.indexOf("Donor G02")).toBeLessThan(html.indexOf("Donor G01"));
    expect(html).toContain("Late 3 days");
    expect(html).toContain('data-cnf="confirm" data-key="G01"');
    expect(html).toContain('data-cnf-reason="G01"');
    expect(html).toContain('data-cnf="reject" data-key="G01"');
  });
  it("shows an answered gift as confirmed with no buttons, and a rejected one with its reason and a way to choose another partner", () => {
    const html = confirmationPage(view({ confirmations: { records: [
      { key: "G01", partnerId: "trust", answer: "confirmed", at: "2026-11-25T12:00:00Z", by: "Sam", reason: "" },
      { key: "G03", partnerId: "trust", answer: "rejected", at: "2026-11-25T12:00:00Z", by: "Sam", reason: "No room this month" },
    ] } }));
    expect(html).toContain("Confirmed");
    expect(html).not.toContain('data-cnf="confirm" data-key="G01"');
    expect(html).toContain("No room this month");
    expect(html).toContain('data-nav="assignment">Choose another partner');
  });
  it("says it was confirmed for the partner when OUTCOMES did it, and filters by the tile chosen", () => {
    const base = view({ confirmations: { records: [{ key: "G01", partnerId: "trust", answer: "confirmed", at: "2026-11-25T09:01:00Z", by: "OUTCOMES, for the partner", reason: "", onBehalf: true }] } });
    expect(confirmationPage(base)).toContain("for the partner");
    const late = confirmationPage({ ...base, cnfFilter: "late" });
    expect(late).toContain("Donor G02");
    expect(late).not.toContain("Donor G01");
  });
  it("asks for assignments when there are none, and never trusts names as HTML", () => {
    expect(confirmationPage(view({ assignments: { records: [] } }))).toContain("Nothing is assigned yet");
    expect(confirmationPage(view({ workOrders: [wo("G01", { supporterName: "<img src=x>" })], assignments: { records: [asg("G01", "2026-11-25T09:00:00Z")] } }))).not.toContain("<img");
  });
});
