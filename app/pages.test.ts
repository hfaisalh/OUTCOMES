/**
 * pages.test.ts
 *
 * What it does: tests pages.ts on the demo feed: what the work orders page shows, that CRM text is
 * never trusted as HTML, and that an unrouted work order offers a framework picker.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG, readFeed } from "../modules/01c-crm-connector/feed";
import { planWorkOrders } from "../modules/01c-crm-connector/work-orders";
import { DEMO_ITEM_FRAMEWORKS, demoFeedRows } from "./demo-data";
import { esc, workOrdersPage, type View } from "./pages";

const lines = readFeed(demoFeedRows(), MWF_CRM_CONFIG).lines;
const plan = planWorkOrders(lines, [], { frameworkByItem: DEMO_ITEM_FRAMEWORKS, usesFrameworks: true });
const view = (over: Partial<View> = {}): View => ({ workOrders: plan.created, review: [], itemFrameworks: DEMO_ITEM_FRAMEWORKS, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, ...over });

describe("workOrdersPage", () => {
  it("lists the four flagged lines and shows the unrouted one with a picker", () => {
    const html = workOrdersPage(view());
    expect(html).toContain("Animal Sacrifice");
    expect(html).toContain('data-assign="I14"');
    expect(html).toContain("1 of 12");
    expect(html).toContain("2 of Indefinitely");
  });

  it("filters to unrouted only", () => {
    const html = workOrdersPage(view({ filter: "unrouted" }));
    expect(html).toContain("Animal Sacrifice");
    expect(html).not.toContain("Orphan Sponsorship Monthly");
  });

  it("never lets CRM text become HTML", () => {
    const evil = plan.created.map((w) => ({ ...w, supporterName: "<img src=x onerror=alert(1)>" }));
    const html = workOrdersPage(view({ workOrders: evil }));
    expect(html).not.toContain("<img");
    expect(esc("a&b")).toBe("a&amp;b");
  });
});
