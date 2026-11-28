/** partner-dashboard.test.ts: the partner's dashboard on its home screen, with invented gifts (decision 327). */
import { describe, expect, it } from "vitest";
import { partnerDashboardHtml } from "./partner-dashboard";
import type { PartnerSlice } from "../../modules/13-partner-portal/scope";

const asg = (key: string, at: string) => ({ key, partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto" as const, at: `${at}T00:00:00Z`, batch: 1 });
const slice = (assignments: ReturnType<typeof asg>[]): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha" }, giftProjects: [], beneficiaries: [], enrolments: [], assignments, confirmations: [], progress: [], allocations: [], itemNames: { S: "Orphan Sponsorship Monthly" },
  gifts: Object.fromEntries(assignments.map((a) => [a.key, { reference: a.key, recurring: false, units: 1, cause: "", intention: "", tribute: "", phases: [], review: true, feedback: true, answerBy: "2026-11-23", completeWithin: 30 }])),
}) as unknown as PartnerSlice;

describe("the partner dashboard", () => {
  it("is calm and invites nothing to do when no gift has been assigned", () => {
    expect(partnerDashboardHtml(slice([]), "2026-12-10")).toContain("No gift has been assigned to you yet.");
  });
  it("shows what is late in words with the days, the quality score and the chart in the partner's own words", () => {
    const html = partnerDashboardHtml(slice([asg("a", "2026-11-20")]), "2026-12-10");
    expect(html).toContain("Your work at a glance");
    expect(html).toContain("Late 17 days");
    expect(html).toContain("Accept or refuse");
    expect(html).toContain("Orphan Sponsorship Monthly");
    expect(html).toContain("Your quality score");
    expect(html).toContain("Not enough yet");
    expect(html).toContain("Your gifts: age against stage");
  });
  it("gives the chart no click through to the staff list and no days box", () => {
    const html = partnerDashboardHtml(slice([asg("a", "2026-11-20")]), "2026-12-10");
    expect(html).not.toContain("data-scatter");
    expect(html).not.toContain('id="tr-target"');
  });
});
