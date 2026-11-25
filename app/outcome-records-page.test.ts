/**
 * outcome-records-page.test.ts
 *
 * What it does: tests the Outcomes list page (DECISIONS 197) on invented gifts: one line for each outcome, the columns, the month pies, funded, the filters, the sort, the empty states, and that names are
 * never trusted as HTML. These tests double as examples. Who calls it: vitest. Depends on: outcome-records-page.ts.
 */

import { describe, expect, it } from "vitest";
import { NO_OUTCOME_FILTER, outcomeRecordsPage } from "./outcome-records-page";
import type { View } from "./pages";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import type { Placement } from "../modules/09-placement/placement";

const wo = (n: number, paid: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key: `L${n}`, lineId: `L${n}`, transactionRef: `T${n}`, paidDate: paid, supporterId: "S1", supporterName: "Invented Donor", group: "", itemId: "I20", itemName: "Small Pump", amount: 300, quantity: 1,
  intention: "", subscriptionId: "", instalmentNumber: "", instalmentCount: "", frameworkId: "wf", categoryId: "water", status: "ready", projectName: "Villages", ...over,
}) as WorkOrder;
const out = (over: Partial<Placement> = {}): Placement => ({ key: "L1", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "villages", itemId: "I20", parts: 1, how: "auto", at: "2026-10-02T00:00:00Z", ...over });
const view = (over: Partial<View> = {}): View => ({
  workOrders: [wo(1, "2026-10-05")], today: "2026-11-24", frameworks: [{ id: "wf", unitsPerBeneficiary: 1 } as FrameworkTemplate],
  projects: [{ id: "builders", name: "Sample Builders Foundation", aliases: [], levels: [], types: [], status: "active", ddStatus: "approved" }],
  giftProjects: [{ id: "villages", name: "Sample Village Projects", crmNames: [], partnerIds: ["builders"], clusters: [] }],
  assignments: { records: [{ key: "L1", partnerId: "builders", giftProjectId: "villages", itemId: "I20", parts: 1, how: "auto", at: "x" }] },
  placements: { records: [out()], counter: 1 }, ...over,
}) as View;

describe("the Outcomes list", () => {
  it("shows one line for each outcome with its reference, benefit, project, partner, donor, plan, funded and stage", () => {
    const html = outcomeRecordsPage(view());
    expect(html).toContain("<h1>Outcomes</h1>");
    expect(html).toContain('<span class="refbox">OUT-0001</span>');
    expect(html).toContain("Small Pump");
    expect(html).toContain("Sample Village Projects");
    expect(html).toContain("Sample Builders Foundation");
    expect(html).toContain('title="One payment"'); // the one payment icon before the donor
    expect(html).toContain("Invented Donor");
    expect(html).toContain(">100%</td>");
    expect(html).toContain("Allocated</span>");
    expect(html).toContain('class="dot on"');
    expect(html).not.toContain("<br>");
    expect((html.match(/<td class="m">/g) ?? []).length).toBe(12);
  });
  it("shows the month the gift was paid in green, and says how far funded when the gift holds fewer units than the whole", () => {
    expect(outcomeRecordsPage(view())).toContain('aria-label="Oct 2026"><rect class="ring" x="1.2" y="1.2" width="21.6" height="21.6" rx="7" stroke-width=".7"/><rect class="sq p"');
    const part = outcomeRecordsPage(view({ frameworks: [{ id: "wf", unitsPerBeneficiary: 4 } as FrameworkTemplate] }));
    expect(part).toContain(">25%</td>");
    expect(part).toContain('class="seg g"');
  });
  it("keeps an ended outcome, marked ended with its reason, and the Ended filter finds it", () => {
    const ended = view({ placements: { records: [out({ to: "2026-11-20", endReason: "cancelled" })], counter: 1 } });
    const html = outcomeRecordsPage(ended);
    expect(html).toContain('class="dot off"');
    expect(html).toContain("The plan was cancelled");
    expect(outcomeRecordsPage({ ...ended, outcomeRecFilter: { ...NO_OUTCOME_FILTER, show: "ended" } } as View)).toContain("OUT-0001");
    expect(outcomeRecordsPage({ ...view(), outcomeRecFilter: { ...NO_OUTCOME_FILTER, show: "ended" } } as View)).toContain("Nothing matches.");
  });
  it("filters by project, type, under-funded and search, and sorts by a heading", () => {
    expect(outcomeRecordsPage({ ...view(), outcomeRecFilter: { ...NO_OUTCOME_FILTER, text: "invented donor" } } as View)).toContain("OUT-0001");
    expect(outcomeRecordsPage({ ...view(), outcomeRecFilter: { ...NO_OUTCOME_FILTER, text: "nobody" } } as View)).toContain("Nothing matches.");
    expect(outcomeRecordsPage({ ...view(), outcomeRecFilter: { ...NO_OUTCOME_FILTER, project: "other" } } as View)).toContain("Nothing matches.");
    expect(outcomeRecordsPage({ ...view(), outcomeRecFilter: { ...NO_OUTCOME_FILTER, show: "underfunded" } } as View)).toContain("Nothing matches."); // fully funded
    expect(outcomeRecordsPage(view())).toContain('<option value="villages">Sample Village Projects</option>');
    expect(outcomeRecordsPage({ ...view(), outcomeRecSort: { key: "funded", dir: "desc" } } as View)).toContain("Funded ▼");
  });
  it("says when there are none, and never trusts a name as HTML", () => {
    expect(outcomeRecordsPage(view({ placements: { records: [], counter: 0 } }))).toContain("No outcomes yet.");
    const html = outcomeRecordsPage(view({ workOrders: [wo(1, "2026-10-05", { itemName: "<img src=x onerror=alert(1)>", supporterName: "<script>1</script>" })] }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
  });
});
