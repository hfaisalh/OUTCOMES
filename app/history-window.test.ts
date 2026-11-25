/**
 * history-window.test.ts
 *
 * What it does: tests the allocation history windows (DECISIONS 186) on invented people and gifts: the history of one gift (each child it held, from, to, why it ended, newest first), the history of one place
 * (each gift that sponsored the child), the empty states, dates as day, month, year, and that names are never trusted as HTML. These tests double as examples. Who calls it: vitest. Depends on: history-window.ts.
 */

import { describe, expect, it } from "vitest";
import { enrolmentHistoryHtml, giftHistoryHtml, type HistoryData } from "./history-window";
import type { Placement } from "../modules/09-placement/placement";

const p = (key: string, enrolmentId: string, at: string, over: Partial<Placement> = {}): Placement => ({ key, kind: "place", enrolmentId, outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto", at: `${at}T10:00:00Z`, ...over });
const data = (over: Partial<HistoryData> = {}): HistoryData => ({
  placements: [
    p("sub:1", "EN-1", "2026-01-10", { to: "2026-04-01", endReason: "paused" }),
    p("sub:1", "EN-2", "2026-06-01"),
    p("sub:2", "EN-1", "2026-04-15", { to: "2026-09-30", endReason: "cancelled" }),
    p("sub:3", "EN-1", "2026-10-05"),
    { key: "G7", kind: "outcome", enrolmentId: "", outcomeRef: "OUT-0001", giftProjectId: "", itemId: "I11", parts: 1, how: "auto", at: "2026-03-03T10:00:00Z" },
  ],
  enrolments: [{ id: "EN-1", beneficiaryId: "B1", giftProjectId: "aghosh", clusterId: "c1", itemId: "I10", role: "", status: "active", since: "x" }, { id: "EN-2", beneficiaryId: "B2", giftProjectId: "aghosh", clusterId: "c1", itemId: "I10", role: "", status: "active", since: "x" }],
  beneficiaries: [{ id: "B1", name: "Amina" }, { id: "B2", name: "Bilal" }] as never,
  giftProjects: [{ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: [], clusters: [{ id: "c1", name: "Class 1", label: "Class", parentId: "", place: "", status: "active" }] }],
  gifts: new Map([["sub:1", { donor: "Invented Donor", item: "Orphan Sponsorship", payments: 6 }], ["sub:2", { donor: "Second Donor", item: "Orphan Sponsorship", payments: 3 }], ["sub:3", { donor: "Third Donor", item: "Orphan Sponsorship", payments: 1 }], ["G7", { donor: "Pump Donor", item: "Small Pump", payments: 1 }]]),
  itemName: (id) => (id === "I10" ? "Orphan Sponsorship" : id), ...over,
});

describe("the history of a gift", () => {
  it("lists each child the gift held, newest first, with the dates as day, month, year, and why it ended", () => {
    const html = giftHistoryHtml(data(), "sub:1");
    expect(html).toContain("Allocation history");
    expect(html).toContain("Invented Donor · Orphan Sponsorship");
    expect(html).toContain("A recurring gift of 6 payments");
    expect(html.indexOf("Bilal")).toBeLessThan(html.indexOf("Amina")); // the later one first
    expect(html).toContain("<td>01/06/26</td><td><span class=\"pill\">Now</span></td>"); // holds Bilal now
    expect(html).toContain("<td>10/01/26</td><td>01/04/26</td>");
    expect(html).toContain("The plan was paused");
    expect(html).toContain("Aghosh › Class 1"); // where
    expect(html).toContain('data-hist="close"');
  });
  it("shows an outcome the gift created, and says so when a gift has not been allocated", () => {
    expect(giftHistoryHtml(data(), "G7")).toContain("<b>OUT-0001</b> <span class=\"muted\">outcome</span>");
    expect(giftHistoryHtml(data(), "sub:99")).toContain("This gift has not been allocated yet.");
  });
});

describe("the history of a place", () => {
  it("lists every gift that sponsored the child, newest first, with the donor, the item and why each ended", () => {
    const html = enrolmentHistoryHtml(data(), "EN-1");
    expect(html).toContain("Sponsorship history");
    expect(html).toContain("Amina · Orphan Sponsorship");
    expect(html.indexOf("Third Donor")).toBeLessThan(html.indexOf("Second Donor"));
    expect(html.indexOf("Second Donor")).toBeLessThan(html.indexOf("Invented Donor"));
    expect(html).toContain("The plan was cancelled");
    expect(html).toContain("The plan was paused");
    expect(html).toContain("recurring, 6 payments");
    expect(html).toContain("Aghosh › Class 1");
  });
  it("says so when no gift has been allocated to the child", () => {
    expect(enrolmentHistoryHtml(data({ placements: [] }), "EN-1")).toContain("No gift has been allocated to this child yet.");
  });
});

describe("safety", () => {
  it("never trusts a name as HTML, and copes with a child or place that no longer exists", () => {
    const evil = giftHistoryHtml(data({ beneficiaries: [{ id: "B1", name: "<img src=x onerror=alert(1)>" }, { id: "B2", name: "Bilal" }] as never, gifts: new Map([["sub:1", { donor: "<script>1</script>", item: "x", payments: 1 }]]) }), "sub:1");
    expect(evil).not.toContain("<img src=x");
    expect(evil).not.toContain("<script>1");
    expect(giftHistoryHtml(data({ enrolments: [] }), "sub:1")).toContain("A place that no longer exists"); // rather than a blank
    expect(enrolmentHistoryHtml(data({ enrolments: [] }), "EN-1")).toContain("A place that no longer exists");
  });
});
