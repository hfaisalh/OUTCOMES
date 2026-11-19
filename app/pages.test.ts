/**
 * pages.test.ts
 *
 * What it does: tests pages.ts on the demo feed: what the work orders page shows, that CRM text is
 * never trusted as HTML, and that an unrouted work order offers a framework picker.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG, readFeed } from "../modules/01c-crm-connector/feed";
import { planWorkOrders } from "../modules/01c-crm-connector/work-orders";
import { demoFeedRows, demoFrameworks } from "./demo-data";
import { suggestAll } from "../modules/02-project-rules/frameworks";
import { esc, frameworksPage, workOrdersPage, type View } from "./pages";

const lines = readFeed(demoFeedRows(), MWF_CRM_CONFIG).lines;
const MAP = { I10: "orphan-sponsorship", I11: "water", I13: "hifz" }; // the item "I14" is left unsorted on purpose
const frameworks = demoFrameworks();
const plan = planWorkOrders(lines, [], { frameworkByItem: MAP, usesFrameworks: true });
const flagged = [{ id: "I10", name: "Orphan Sponsorship Monthly", count: 1 }, { id: "I14", name: "Animal Sacrifice", count: 1 }];
const view = (over: Partial<View> = {}): View => ({ workOrders: plan.created, review: [], itemFrameworks: MAP, flaggedItems: flagged, filter: "all", message: "", config: MWF_CRM_CONFIG, frameworks, suggestions: suggestAll(flagged, MAP, frameworks), selectedItem: "", ...over });

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

describe("frameworksPage", () => {
  it("shows sorted items inside their framework and unsorted items with a suggestion", () => {
    const html = frameworksPage(view({ itemFrameworks: { I10: "orphan-sponsorship" } }));
    expect(html).toContain('data-drop="orphan-sponsorship"');
    expect(html).toContain('draggable="true" data-item="I14"');
    expect(html).toContain("suggested: Animal Sacrifice");
    expect(html).toContain("Accept 1 suggestion");
  });

  it("disables accepting when there is nothing to suggest, and marks the selected item", () => {
    const html = frameworksPage(view({ suggestions: {}, selectedItem: "I14" }));
    expect(html).toContain("disabled");
    expect(html).toContain('class="chip sel"');
  });
});
