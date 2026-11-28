/**
 * progress-page.test.ts
 *
 * What it does: tests the Progress page (DECISIONS 232) on invented gifts: only allocated gifts are listed, the next step and its button, a late phase is flagged, and the tiles filter. These tests double as examples.
 * Who calls it: vitest. Depends on: progress-page.ts.
 */
import { describe, expect, it } from "vitest";
import { progressPage } from "./progress-page";
import type { View } from "../shared/pages";
import type { WorkOrder } from "../../modules/01c-crm-connector/work-orders";
import type { Project } from "../../modules/06-projects/projects";

const wo = (key: string): WorkOrder => ({
  key, lineId: key, transactionRef: `T-${key}`, paidDate: "2026-10-05", supporterId: "S1", supporterName: `Donor ${key}`, group: "", itemId: "I11", itemName: "Small Pump", amount: 30, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "water", status: "ready",
}) as WorkOrder;
const partner = { id: "trust", name: "Sample Trust", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved", ddReview: "2099-01-01", itemIds: ["I11"], capacities: { I11: 50 } } as unknown as Project;
const asg = (key: string) => ({ key, partnerId: "trust", giftProjectId: "", itemId: "I11", parts: 1, how: "auto" as const, at: "2026-10-06T09:00:00Z" });
const place = (key: string) => ({ key, kind: "outcome" as const, enrolmentId: "", outcomeRef: `OUT-${key}`, giftProjectId: "", itemId: "I11", parts: 1, how: "auto" as const, at: "2026-11-01T09:00:00Z" });
const fw = { id: "wf", name: "Pump", unitsPerBeneficiary: 1, unit: "pump", cycle: "one_off", reportType: "r", stages: [{ id: "check", label: "Basic check", days: 14, needs: [], photo: false, canPause: true, tell: "" }] };
const view = (over: Partial<View> = {}): View => ({
  workOrders: [wo("G01"), wo("G02"), wo("G03")], projects: [partner], giftProjects: [], today: "2026-11-26", frameworks: [fw] as unknown as View["frameworks"],
  assignments: { records: [asg("G01"), asg("G02"), asg("G03")] }, allocations: { records: [place("G01"), place("G02")], counter: 2 }, progress: { records: [] }, ...over,
}) as View;

describe("the Progress page", () => {
  it("lists only placed gifts, with the next step as a button, and flags a phase past its due day as late advice", () => {
    const html = progressPage(view());
    expect(html).toContain("<h1>Progress</h1>");
    expect(html).toContain("Donor G01");
    expect(html).not.toContain("Donor G03"); // assigned but not allocated yet
    expect(html).toContain('data-prg="next" data-key="G01">Done: Basic check');
    expect(html).toContain("Late 11 days"); // allocated 01/11, the check was due in 14 days, which was 15/11
    expect(html).toContain('metric tile warn" data-tile="prg:late" aria-pressed="false"><b>2</b><span>Late</span>');
  });
  it("shows a gift whose steps are all taken as complete, and filters by the tile chosen", () => {
    const steps = ["check", "review", "report", "complete", "feedback"].map((id, i) => ({ key: "G01", kind: (id === "check" ? "phase" : "stage") as "phase" | "stage", id, at: `2026-11-1${i}T00:00:00Z`, by: "Sam" }));
    const html = progressPage(view({ progress: { records: steps } }));
    expect(html).toContain("All steps taken");
    expect(html).toContain('data-tile="prg:complete" aria-pressed="false"><b>1</b><span>Complete</span>');
    const only = progressPage(view({ progress: { records: steps }, prgFilter: "complete" }));
    expect(only).toContain("Donor G01");
    expect(only).not.toContain("Donor G02");
  });
  it("asks for a placed gift when there is none", () => {
    expect(progressPage(view({ allocations: { records: [], counter: 0 } }))).toContain("No gift is allocated yet");
  });
});

describe("a living gift on the Progress page (decision 319)", () => {
  it("is shown as ongoing with its round once its loop is running", async () => {
    const { progressOf } = await import("../../modules/12-progress/progress");
    const steps = { phases: [], review: false, feedback: false, loop: { everyDays: 30 } };
    const recs = [{ key: "k", kind: "stage" as const, id: "report", at: "2026-11-02T00:00:00Z", by: "T" }, { key: "k", kind: "stage" as const, id: "complete", at: "2026-11-03T00:00:00Z", by: "T" }];
    const p = progressOf("k", "2026-11-01T00:00:00Z", recs, steps, "2026-11-20");
    expect(p.ongoing).toBe(true);
    expect(p.round).toBe(2);
  });
});

describe("rejecting at review on the Progress page (decision 320)", () => {
  const phase = { key: "G01", kind: "phase" as const, id: "check", at: "2026-11-10T00:00:00Z", by: "Sam" };
  it("offers a reason box and a Reject button when a gift waits for review, and shows why a rejected one was sent back", () => {
    const html = progressPage(view({ progress: { records: [phase] } }));
    expect(html).toContain('data-rj="G01"');
    expect(html).toContain('data-prg="reject" data-key="G01"');
    expect(html).not.toContain('data-rj="G02"'); // G02 has not done its phase yet
    const back = progressPage(view({ progress: { records: [phase, { key: "G01", kind: "reject" as const, id: "review", at: "2026-11-12T00:00:00Z", by: "MWF", reason: "Photo is blurred" }] } }));
    expect(back).toContain("Sent back to the partner (Basic check): Photo is blurred");
    expect(back).not.toContain('data-prg="reject" data-key="G01"');
  });
});
