/**
 * pages.test.ts
 *
 * What it does: tests pages.ts on the demo feed: what the work orders page shows, that CRM text is
 * never trusted as HTML, and that an unrouted work order offers a framework picker.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG, readFeed } from "../modules/01c-crm-connector/feed";
import { planWorkOrders } from "../modules/01c-crm-connector/work-orders";
import { demoCategories, demoFeedRows } from "./demo-data";
import { suggestAll } from "../modules/02-project-rules/categories";
import { esc, categoriesPage, workOrdersPage, type View } from "./pages";

const lines = readFeed(demoFeedRows(), MWF_CRM_CONFIG).lines;
const MAP = { I10: "sponsorship", I11: "transactional", I13: "sponsorship" }; // the item "I14" is left unsorted on purpose
const categories = demoCategories();
const plan = planWorkOrders(lines, [], { categoryByItem: MAP, usesFrameworks: true });
const flagged = [{ id: "I10", name: "Orphan Sponsorship Monthly", count: 1 }, { id: "I14", name: "Animal Sacrifice", count: 1 }];
const view = (over: Partial<View> = {}): View => ({ workOrders: plan.created, review: [], itemCategories: MAP, flaggedItems: flagged, filter: "all", message: "", config: MWF_CRM_CONFIG, categories, suggestions: suggestAll(flagged, MAP, categories), selectedItem: "", live: false, canPickup: false, run: null, ...over });

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

describe("categoriesPage", () => {
  it("shows sorted items inside their category and unsorted items with a suggestion", () => {
    const html = categoriesPage(view({ itemCategories: { I10: "sponsorship" } }));
    expect(html).toContain('data-drop="sponsorship"');
    expect(html).toContain('draggable="true" data-item="I14"');
    expect(html).toContain("suggested: Transactional");
    expect(html).toContain("Accept 1 suggestion");
  });

  it("disables accepting when there is nothing to suggest, and marks the selected item", () => {
    const html = categoriesPage(view({ suggestions: {}, selectedItem: "I14" }));
    expect(html).toContain("disabled");
    expect(html).toContain('class="chip sel"');
  });
});
