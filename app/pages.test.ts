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
import { signinNote, attentionPage, auditPage, esc, categoriesPage, workOrdersPage, type View } from "./pages";

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

describe("auditPage", () => {
  const record = { id: "a1", at: "2026-11-19T10:00:00Z", source: "donation-lines.csv", lines: 7736, coverage: { from: "2026-01-02", to: "2026-10-31" }, complete: true, counts: { added: 424, changed: 1, moved: 0, no_longer_needs_feedback: 0, removed: 2, unchanged: 0 }, findings: [{ key: "T1:L1", kind: "changed" as const, message: "The amount <b>changed</b>." }], addedSample: [] };

  it("shows the history and what to look at, and never trusts text as HTML", () => {
    const html = auditPage(view({ live: true, audits: [record] }));
    expect(html).toContain("donation-lines.csv");
    expect(html).toContain("2026-01-02 to 2026-10-31");
    expect(html).toContain("Changed");
    expect(html).not.toContain("<b>changed</b>");
  });
  it("says when there is nothing yet, and asks a demo visitor to sign in", () => {
    expect(auditPage(view({ live: true, audits: [] }))).toContain("No imports yet.");
    expect(auditPage(view())).toContain("Sign in as the owner");
  });
  it("says removed lines were not judged when the import was not complete", () => {
    expect(auditPage(view({ live: true, audits: [{ ...record, complete: false }] }))).toContain("not judged");
  });
});

describe("credit chain on the work orders page", () => {
  it("shows who a gift is credited to and flags a group's own gift, and shows nothing when there is no chain", () => {
    const first = plan.created[0]!;
    const withChain = { ...first, supporterKind: "group", credits: [{ role: "agent", id: "A1", name: "Sample Rep" }, { role: "group", id: "G1", name: "<b>Branch</b>" }] };
    const html = workOrdersPage(view({ workOrders: [withChain] }));
    expect(html).toContain("Credited: agent: Sample Rep › group: &lt;b&gt;Branch&lt;/b&gt;");
    expect(html).toContain("No individual donor");
    expect(workOrdersPage(view({ workOrders: [first] }))).not.toContain("Credited:");
  });
});

describe("attentionPage", () => {
  const items = [
    { id: "unrouted:I1", kind: "unrouted" as const, title: "Water Pump is not in a category", detail: "2 work orders wait.", itemId: "I1", itemName: "Water Pump", count: 2, status: "open" as const },
    { id: "import:x", kind: "import" as const, title: "Import problem", detail: "A <b>bad</b> date.", status: "open" as const },
    { id: "changed:T:1", kind: "changed" as const, title: "Changed in the CRM: T:1", detail: "Amount changed.", status: "reviewed" as const, note: "Checked", reviewedAt: "t" },
  ];

  it("shows open entries first, a category picker for an unrouted item, and review buttons when signed in", () => {
    const html = attentionPage(view({ live: true, attention: items }));
    expect(html).toContain('data-assign="I1"');
    expect(html).toContain('data-attn="import:x" data-attn-action="review"');
    expect(html).toContain('data-attn="changed:T:1" data-attn-action="reopen"');
    expect(html).toContain("Note: Checked");
    expect(html).not.toContain("<b>bad</b>");
    expect(html.indexOf("Import problem")).toBeLessThan(html.indexOf("Changed in the CRM"));
  });
  it("says when nothing needs attention, and offers no review buttons in demo mode", () => {
    expect(attentionPage(view({ attention: [] }))).toContain("Nothing needs attention.");
    expect(attentionPage(view({ live: false, attention: items }))).not.toContain("data-attn=");
  });
});

describe("signinNote", () => {
  it("explains a wrong passphrase from the address, and says nothing otherwise", () => {
    expect(signinNote("?signin=wrong")).toContain("not right");
    expect(signinNote("")).toBe("");
    expect(signinNote("?other=1")).toBe("");
  });
});
