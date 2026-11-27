/**
 * gifts-page.test.ts
 *
 * What it does: tests the Gifts page on the demo feed and invented gifts: that it is one list with a row for each gift (a subscription with its payments, a
 * single payment), what each row shows (plan, units, dates, where it is allocated, what needs a look), the filters and tabs, ticking a whole gift, and that CRM text
 * is never trusted as HTML. Who calls it: vitest. Depends on: gifts-page.ts.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG, readFeed } from "../modules/01c-crm-connector/feed";
import { planWorkOrders, type WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { suggestAll } from "../modules/02-project-rules/categories";
import { demoCategories, demoFeedRows, starterFrameworks } from "./demo-data";
import { SYM } from "./symbols";
import { giftDetailHtml, giftListHtml, giftMetricsHtml, giftsPage, shortDate, shownGiftKeys } from "./gifts-page";
import type { View } from "./pages";

const lines = readFeed(demoFeedRows(), MWF_CRM_CONFIG).lines;
const MAP = { I10: "sponsorship", I11: "transactional", I13: "sponsorship" }; // the item "I14" is left unsorted on purpose
const categories = demoCategories();
const plan = planWorkOrders(lines, [], { categoryByItem: MAP, usesFrameworks: true });
const flagged = [{ id: "I10", name: "Orphan Sponsorship Monthly", count: 1 }, { id: "I14", name: "Animal Sacrifice", count: 1 }];
const view = (over: Partial<View> = {}): View => ({ workOrders: plan.created, review: [], itemCategories: MAP, flaggedItems: flagged, filter: "all", message: "", config: MWF_CRM_CONFIG, categories, suggestions: suggestAll(flagged, MAP, categories), selectedItem: "", live: false, canPickup: false, run: null, today: "2026-11-20", ...over });
const base = plan.created[0] as WorkOrder;
const sub = (n: number, over: Partial<WorkOrder> = {}): WorkOrder => ({ ...base, key: `s${n}`, subscriptionId: "S9", instalmentNumber: String(n), instalmentCount: "10", paidDate: `2026-0${n}-10 10:00:00`, ...over });

describe("giftsPage", () => {
  it("is one list: it lists the flagged lines and shows the unrouted one with a picker", () => {
    const html = giftsPage(view());
    expect(html).toContain("<h1>Gifts</h1>");
    expect(html).not.toContain("By commitment"); // there is no second view to switch to
    expect(html).toContain("Animal Sacrifice");
    expect(html).toContain('data-assign-wf="I14"');
    expect(html).toContain("1/12"); // the plan is the short form in the list
    expect(html).toContain("1/\u221E");
  });
  it("shows a subscription as one row with paid of planned, and its payments inside it", () => {
    const orders = [1, 2, 3].map((n) => sub(n));
    const html = giftListHtml(view({ workOrders: orders }));
    expect((html.match(/data-sel-gift=/g) ?? []).length).toBe(1);
    expect(html).toContain("3/10");
    expect(html).toContain('data-keys="s1 s2 s3"'); // one tick box takes every payment
    expect(html).toContain('data-gift-open="S9"'); // a click opens the details
    expect(html.replace(/<details class="keydrop">.*?<\/details>/s, "")).not.toContain("<details"); // the payments are in the window, not the row (the key to the symbols is the only disclosure)
    const detail = giftDetailHtml(view({ workOrders: orders }), "S9");
    expect(detail).toContain("3 of 10");
    expect(detail).toContain("Payments (3)");
    expect(giftListHtml(view({ workOrders: [sub(1), sub(3)] }))).toContain('title="Missing instalment 2'); // what needs a look is a symbol with the words in its tooltip
    expect(giftDetailHtml(view({ workOrders: [sub(1), sub(3)] }), "S9")).toContain("Missing instalment 2"); // and in words in the window
    expect(giftDetailHtml(view({ workOrders: orders }), "nope")).toBe(""); // a gift that is gone closes the window
  });
  it("shows a single payment as its own row, and how many months it covers", () => {
    const html = giftListHtml(view({ workOrders: [{ ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", periodCount: 12 }] }));
    expect(html).toContain("12/12");
    expect(html).toContain("One payment");
    expect(giftDetailHtml(view({ workOrders: [{ ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", periodCount: 12 }] }), "once-o1")).toContain("covers 12 months");
  });
  it("shows units from the framework's rule, who they go to, and asks for the framework when there is none", () => {
    const fws = starterFrameworks();
    const mk = (frameworkId: string, over: Partial<WorkOrder> = {}) => [1, 2, 3, 4].map((n) => sub(n, { instalmentCount: "12", frameworkId, ...over }));
    const detail = (orders: WorkOrder[], frameworks = fws) => giftDetailHtml(view({ workOrders: orders, frameworks }), "S9");
    const per = detail(mk("sponsorship-whole"));
    expect(per).toContain("4 of 12");
    expect(per).toContain("month");
    // Units are a row of small pies, one for each instalment. How parts are shared out is Allocation's business, so no such words are shown here.
    const pies = detail(mk("sponsorship-shared-parts"));
    expect((pies.match(/class="upie"/g) ?? []).length).toBe(12);
    expect(pies).toContain("Instalment 1");
    expect(pies).toContain(": paid");
    expect(pies).not.toContain("shared with other donors");
    const share = detail(mk("delivered-once"));
    expect(share).toContain("0.33 of 1");
    expect(share).toContain("of the whole item)");
    expect(detail(mk(""))).toContain("No workflow chosen");
    expect(detail(mk("x"), [{ ...fws[0]!, id: "x", instalment: undefined }])).toContain("Set how an instalment counts in the workflow");
  });
  it("shows where a gift is allocated, or that it waits for allocation with the reason (every gift needs one, DECISIONS 98)", () => {
    const fws = starterFrameworks();
    const orders = [1, 2].map((n) => sub(n, { frameworkId: "sponsorship-shared-parts", planStatus: "active", planNextDue: "2026-12-10", planPaid: 2 }));
    const outcomes = [{ id: "orphan-1", name: "Orphan 1", type: "child", cohort: "", frameworkId: "sponsorship-shared-parts", active: true, projectId: "p1" }];
    const partners = [{ id: "p1", name: "Aghosh", aliases: [], levels: [], types: [] }];
    const allocated = giftListHtml(view({ workOrders: orders, frameworks: fws, outcomes, projects: partners, outcomeAllocations: [{ commitmentKey: "S9", outcomeId: "orphan-1", parts: 1, how: "auto", at: "t" }] }));
    expect(allocated).toContain("Orphan 1");
    expect(allocated).toContain("Aghosh");
    expect(giftListHtml(view({ workOrders: orders, frameworks: fws, outcomes, projects: partners, outcomeAllocations: [] }))).toContain("Waiting for allocation");
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, frameworkId: "" })), frameworks: fws }))).toContain("It needs a workflow first");
    // a paused plan stays parked and says so, and a cancelled one is parked as cancelled (DECISIONS 102)
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, planStatus: "paused" })), frameworks: fws }))).toContain("Plan paused, parked until payments resume");
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, planStatus: "cancelled" })), frameworks: fws }))).not.toContain("Waiting for allocation");
  });
  it("shows the stage each gift is in, with the reason on hover and in the window (DECISIONS 141)", () => {
    const fws = starterFrameworks();
    const mk = (frameworkId: string, over: Partial<WorkOrder> = {}) => [1, 2, 3, 4].map((n) => sub(n, { instalmentCount: "12", frameworkId, ...over }));
    const list = giftListHtml(view({ workOrders: mk("sponsorship-shared-parts"), frameworks: fws }));
    expect(list).toContain("<th>Stage<button");
    expect(list).toMatch(/<span class="pill stage st-work-order" title="Released, waiting for a partner">WO created<\/span>/); // released, but no partner yet: not "Assigned" (DECISIONS 189)
    const detail = giftDetailHtml(view({ workOrders: mk("sponsorship-shared-parts"), frameworks: fws }), "S9");
    expect(detail).toContain("<span>Stage</span>");
    // a gift whose workflow releases only when fully paid is funding at Work order
    const pump = giftListHtml(view({ workOrders: mk("delivered-once"), frameworks: fws.map((f) => (f.id === "delivered-once" ? { ...f, instalment: "share_of_whole" as const } : f)) }));
    expect(pump).toContain('class="pill stage st-work-order" title="Funding, 4 of 12 paid">WO created</span>');
    // and its units are one green or orange pie for each instalment, with the count under them, not a blue bar
    const pumpWin = giftDetailHtml(view({ workOrders: mk("delivered-once"), frameworks: fws.map((f) => (f.id === "delivered-once" ? { ...f, instalment: "share_of_whole" as const } : f)) }), "S9");
    expect(pumpWin).toContain('class="upies"');
    expect(pumpWin).not.toContain('class="ubar"');
    expect(pumpWin).toContain("4 of 12 instalments paid, 33% of the whole item");
    expect(pumpWin).toContain('class="sq p"'); // one unit: rounded squares, not pies
    expect(pumpWin).not.toContain('<i class="c">'); // the key names only colours that appear
    // an item with no workflow is still at Gift
    expect(giftListHtml(view())).toContain('class="pill stage st-gift" title="Choose a workflow for its item">Gift</span>');
  });
  it("reads the stage from Assignment and Placement: assigned to a partner, then allocated to a child (DECISIONS 176)", () => {
    const fws = starterFrameworks();
    const orders = [1, 2, 3, 4].map((n) => sub(n, { instalmentCount: "12", frameworkId: "sponsorship-shared-parts" }));
    const partners = [{ id: "trust", name: "Sample Trust", aliases: [], levels: [], types: [] }] as unknown as View["projects"];
    const assignments = { records: [{ key: "sub:S9", partnerId: "trust", giftProjectId: "", itemId: base.itemId, parts: 1, how: "auto" as const, at: "x" }] };
    const assigned = giftListHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments }));
    expect(assigned).toContain('title="Assigned to Sample Trust, waiting to be allocated">Assigned</span>'); // no longer "waiting for a partner"
    expect(assigned).not.toContain("Released, waiting for a partner");
    const detail = giftDetailHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments }), "S9");
    expect(detail).toContain("Assigned to Sample Trust, waiting to be allocated");
    const child = { id: "B1", kind: "person", name: "Sample Amina" } as unknown as NonNullable<View["beneficiaries"]>["records"][number];
    const enrolments = { counter: 1, records: [{ id: "EN-1", beneficiaryId: "B1", giftProjectId: "p", clusterId: "c", itemId: base.itemId, role: "", status: "active" as const, since: "x" }] };
    const allocations = { counter: 0, records: [{ key: "sub:S9", kind: "beneficiary" as const, enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "p", itemId: base.itemId, parts: 1, how: "auto" as const, at: "x" }] };
    const allocated = giftListHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments, allocations, enrolments, beneficiaries: { records: [child], counters: {} } }));
    expect(allocated).toMatch(/class="pill stage st-allocation"[^>]*>Allocated<\/span>/);
    expect(allocated).toContain("Sample Amina");
    // Assigned to is the partner, Allocated to is the beneficiary, in their own columns (DECISIONS 184).
    expect(allocated).toContain("<th>Assigned to<button");
    expect(allocated).toContain("<th>Allocated to<button");
    expect(allocated).toContain('<span title="Assigned to Sample Trust">Sample Trust</span>');
    expect(allocated).not.toContain("Sample Amina</span> <span class=\"muted\"> Sample Trust"); // the partner is no longer under the child
    const win = giftDetailHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments, allocations, enrolments, beneficiaries: { records: [child], counters: {} } }), "S9");
    expect(win).toContain("<span>Assigned to</span>");
    expect(win).toMatch(/<span>Assigned to<\/span>[\s\S]*Sample Trust[\s\S]*<span>Allocated to<\/span>[\s\S]*Sample Amina/);
    // The detail window has a button to the allocation history, with the count, only when there is a history (DECISIONS 186).
    const withHistory = giftDetailHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments, allocations, enrolments, beneficiaries: { records: [child], counters: {} } }), "S9");
    expect(withHistory).toContain('<button type="button" class="linkish" data-hist="gift" data-id="sub:S9">View history (1)</button>');
    expect(giftDetailHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments }), "S9")).not.toContain("data-hist=");
    // A paused, cancelled or completed plan holds no place, whatever was recorded (DECISIONS 185).
    for (const status of ["paused", "cancelled", "completed"]) {
      const list = giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, planStatus: status })), frameworks: fws, projects: partners, assignments, allocations, enrolments, beneficiaries: { records: [child], counters: {} } }));
      expect(list).not.toContain("Sample Amina");
      expect(list).not.toMatch(/class="pill stage st-allocation"/);
    }
    // An allocation whose beneficiary is gone is not an allocation: the gift is assigned and waiting to be allocated again.
    const stale = giftListHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments, allocations, enrolments: { counter: 0, records: [] }, beneficiaries: { records: [], counters: {} } }));
    expect(stale).toContain('title="Assigned to Sample Trust, waiting to be allocated">Assigned</span>');
    expect(stale).not.toMatch(/class="pill stage st-allocation"/);
  });
  it("calls a completed plan neither Assigned nor waiting: it holds no place (DECISIONS 189)", () => {
    const fws = starterFrameworks();
    const orders = [1, 2].map((n) => sub(n, { instalmentCount: "2", frameworkId: "sponsorship-shared-parts", planStatus: "completed" }));
    const list = giftListHtml(view({ workOrders: orders, frameworks: fws }));
    expect(list).toContain('title="Plan completed, it holds no allocation">WO created</span>');
    expect(list).not.toContain("Assigned</span>");
    expect(list).not.toContain("Waiting for allocation"); // a dash, since it needs none
  });
  it("filters to unrouted only, and narrows the list by the filter boxes and says how many are shown", () => {
    const html = giftListHtml(view({ filter: "unrouted" }));
    expect(html).toContain("Animal Sacrifice");
    expect(html).not.toContain("Orphan Sponsorship Monthly");
    const narrowed = giftListHtml(view({ criteria: { text: "animal", itemId: "", categoryId: "", status: "", kind: "any", legacy: "", from: "", to: "" } }));
    expect(narrowed).toContain("Animal Sacrifice");
    expect(narrowed).toMatch(/Showing \d+ gift/);
    expect(giftListHtml(view({ workOrders: [], filter: "all" }))).toContain("No gifts in this list.");
  });
  it("has a tab for gifts that need a look, and shows only those", () => {
    const orders = [sub(1), sub(3), { ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "" }];
    const html = giftListHtml(view({ workOrders: orders, filter: "look" }));
    expect((html.match(/data-sel-gift=/g) ?? []).length).toBe(1);
    expect(giftsPage(view({ workOrders: orders }))).toContain('data-filter="look"');
  });
  it("shows excluded payments under their own tab with a Restore button, and ticking a whole gift ticks its payments", () => {
    const excluded = { ...base, key: "x1", status: "excluded" as const, exclusion: { reason: "Test", by: "me", at: "t", was: "ready" as const } };
    const html = giftListHtml(view({ workOrders: [excluded], filter: "excluded" }));
    expect(html).toContain("Restore");
    expect(html).toContain("Test");
    const orders = [sub(1), sub(2)];
    expect(shownGiftKeys(view({ workOrders: orders }))).toEqual(["s1", "s2"]);
    const ticked = giftListHtml(view({ workOrders: orders, selected: ["s1", "s2"] }));
    expect(ticked).toContain("<b>2</b> selected");
    expect(ticked).toMatch(/data-sel-gift="S9"[^>]*checked/);
  });
  it("never lets CRM text become HTML", () => {
    const evil = plan.created.map((w) => ({ ...w, supporterName: "<img src=x onerror=alert(1)>", projectName: "<b>x</b>" }));
    const html = giftsPage(view({ workOrders: evil }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>x</b>");
  });
  it("has five tiles of one shape that count what the list shows, so they change with the tab and the filters (DECISIONS 99, 215)", () => {
    const orders = [sub(1, { planStatus: "paused" }), sub(2, { planStatus: "paused" }), { ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", currency: "GBP" }];
    const all = giftMetricsHtml(view({ workOrders: orders }));
    expect(all).toMatch(/<b>2<\/b><span>Gifts<\/span>/); // one subscription and one single payment
    expect(all).toMatch(/<b>1<\/b> recurring[\s\S]*<b>1<\/b> one payments/); // recurring and single payments are the detail of Gifts
    expect(all).toMatch(/<span>Value<\/span>/);
    expect(all).toMatch(/<b>1<\/b><span>Plans stopped<\/span>[\s\S]*<b>0<\/b> cancelled[\s\S]*<b>1<\/b> paused[\s\S]*<b>0<\/b> completed/); // the stopped plan statuses share one tile, with a number like the others
    expect(all).toContain("<span>Unallocated</span>");
    expect(all).toMatch(/<b>0<\/b> allocated[\s\S]*<b>0<\/b> need none/); // allocated + unallocated + need none = gifts, so the tile adds up
    expect(all).toContain("<span>Review</span>");
    // a narrower filter changes the tiles
    const narrowed = giftMetricsHtml(view({ workOrders: orders, criteria: { text: "no-such-donor", itemId: "", categoryId: "", status: "", kind: "any", legacy: "", from: "", to: "" } }));
    expect(narrowed).toMatch(/<b>0<\/b><span>Gifts<\/span>/);
    // the page holds the tiles in a place that is redrawn with the list, and the pick-up note sits beside the tabs
    const page = giftsPage(view({ workOrders: orders }));
    expect(page).toContain('data-list="main-metrics"');
    expect(page).toMatch(/class="pagehead"[\s\S]*Gifts come in under/); // the pick-up note sits beside the title
  });
  it("shows an icon beside the item, chosen or suggested from its name (DECISIONS 107)", () => {
    const html = giftListHtml(view({ workOrders: [sub(1, { itemName: "Small Pump", itemId: "I9" })] }));
    expect(html).toContain('class="ico ico-sm" title="Small Pump"');
    const chosen = giftListHtml(view({ workOrders: [sub(1, { itemName: "Small Pump", itemId: "I9" })], itemIcons: { I9: "tanker" } }));
    expect(chosen).toContain("<rect x=\"2\" y=\"9\" width=\"12\""); // the tanker's shape, not the pump's
    expect(giftListHtml(view({ workOrders: [sub(1, { itemName: "Something unusual", itemId: "I8" })] }))).not.toContain('class="ico ico-sm"');
  });
  it("shows the project the donor chose, and the cause instead when it is general or blank (DECISIONS 108, 109)", () => {
    const html = giftListHtml(view({ workOrders: [
      sub(1, { key: "a1", subscriptionId: "SA", projectName: "Aghosh", cause: "Orphan Care" }),
      sub(1, { key: "b1", subscriptionId: "SB", projectName: "Where Needed Most", cause: "Water for All" }),
      sub(1, { key: "c1", subscriptionId: "SC", cause: "Educare" }),
      sub(1, { key: "d1", subscriptionId: "SD" }),
      sub(1, { key: "e1", subscriptionId: "SE", projectName: "Where Needed Most", cause: "Where Most Needed" }),
    ] }));
    expect(html).toContain('<span class="muted" title="Where Most Needed. No project was chosen: the gift is for its item">No project</span>'); // the cause is itself general: it says No project, not General
    expect(html).toContain('data-gsort="project">Project</button><button');
    expect(html).toContain('title="Aghosh. Cause: Orphan Care">Aghosh'); // a named project is shown, its cause is in the tooltip
    expect(html).toContain('<span class="muted">Water for All</span>'); // general: the cause instead
    expect(html).toContain('<span class="muted">Educare</span>'); // blank: the cause instead
    expect(html).not.toContain('>Where Needed Most<');
    expect(html).not.toContain('>Where Most Needed<');
    expect(html).toContain('<span class="muted">\u2013</span>'); // no project and no cause: a dash
  });
  it("has no info button at the end of a row, since the row opens the details, and short dates (DECISIONS 109)", () => {
    const html = giftListHtml(view({ workOrders: [sub(1, { paidDate: "2026-11-20 10:00:00", planNextDue: "2026-12-20" })] }));
    expect(html).not.toContain("gi-open");
    expect(html).toContain('<tr class="grow" data-gift-open="S9" tabindex="0"');
    expect(html).toContain('title="2026-11-20">20/11/26');
    expect(html).toContain('title="2026-12-20">20/12/26');
    expect(shortDate("2026-01-05")).toBe("05/01/26");
    expect(shortDate("")).toBe("");
  });
  it("marks a custom amount gift for manual allocation in the list, the tab, the filter and the tile, and in the window (DECISIONS 113)", () => {
    const fws = starterFrameworks();
    const clean = [1, 2].map((n) => sub(n, { key: `c${n}`, subscriptionId: "SC", frameworkId: "sponsorship-shared-parts", amount: 35, partsAuto: 1 }));
    const custom = [1, 2].map((n) => sub(n, { key: `m${n}`, subscriptionId: "SM", frameworkId: "sponsorship-shared-parts", amount: 40, partsManual: "A custom amount: 40 is not the price of a part (35)" }));
    const v = (over: Partial<View> = {}) => view({ workOrders: [...clean, ...custom], frameworks: fws, ...over });
    const html = giftListHtml(v());
    expect(html).toContain(SYM.manual); // the manual symbol, not the hourglass, on the custom gift
    expect(html).toContain("Allocate manually. A custom amount: 40 is not the price of a part (35)");
    expect(html).toContain("allocate manually"); // in the key
    // the Manual tab shows only that gift, and the filter finds its payments
    const tab = giftListHtml(v({ filter: "manual" }));
    expect((tab.match(/data-sel-gift=/g) ?? []).length).toBe(1);
    expect(tab).toContain('data-sel-gift="SM"');
    expect(giftsPage(v())).toContain('data-filter="manual"');
    expect(giftListHtml(v({ criteria: { text: "", itemId: "", categoryId: "", status: "", kind: "custom", legacy: "", from: "", to: "" } }))).toContain('data-sel-gift="SM"');
    expect(giftsPage(v())).toContain("Custom amount");
    // the tile splits unallocated from manual
    expect(giftMetricsHtml(v())).toMatch(/<b>1<\/b> manual/);
    // the window explains and offers the parts, and marking manually is offered on a normal gift
    const win = giftDetailHtml(v(), "SM");
    expect(win).toContain("<b>Allocate manually.</b>");
    expect(win).toContain('id="gp-select"'); // choose in a drop-down...
    expect(win).toContain('data-parts-save="1" data-keys="m1 m2"'); // ...then Save, which goes to every payment of the gift
    expect(win).toContain('class="iconact ok"'); // an icon button, not words
    expect(win).toContain('aria-label="Save the units"');
    expect(win).not.toContain("Reset"); // nothing set manually yet, so nothing to take back
    expect(giftDetailHtml(v(), "SC")).toContain('data-manual-set="c1" data-keys="c1 c2" data-on="1"');
    expect(win).not.toContain('data-on="0"'); // a custom amount is not marked by a person, so there is nothing to take back
    const byPerson = giftDetailHtml(v({ workOrders: [{ ...(custom[0] as WorkOrder), partsByPerson: true }, custom[1] as WorkOrder] }), "SM");
    expect(byPerson).toContain('data-manual-set="m1" data-keys="m1 m2" data-on="0"');
    // once every payment has its parts, the gift is no longer manual: no hand, no orange box, and it waits for allocation
    const decided = giftListHtml(v({ workOrders: [...clean, ...custom.map((w) => ({ ...w, partsFixed: 2 }))] }));
    expect(decided).not.toContain('title="Allocate manually.'); // no hand on a row (the key still names it)
    expect(decided).toContain("manual changes that the CRM does not know about"); // the orange tick says a person set the parts
    expect(giftDetailHtml(v({ workOrders: [...clean, ...custom.map((w) => ({ ...w, partsFixed: 2 }))] }), "SM")).not.toContain("Allocate manually.");
  });
  it("always offers Units to choose and Save, and Reset once a person has set them, even after the gift is no longer manual (DECISIONS 116)", () => {
    const set = [1, 2].map((n) => sub(n, { key: `f${n}`, subscriptionId: "SF", amount: 40, quantity: 2, partsFixed: 2 }));
    const win = giftDetailHtml(view({ workOrders: set }), "SF");
    expect(win).toContain('id="gp-select"');
    expect(win).toContain('<option value="2" selected>2 units</option>');
    expect(win).toContain('data-parts-save="1" data-keys="f1 f2"');
    expect(win).toContain('data-parts-set="f1" data-keys="f1 f2" data-n="0"'); // Reset
    expect(win).toContain("Set manually. The CRM says 2.");
    expect(win).toContain('class="iconact" data-parts-set="f1"'); // Reset is an icon too
    expect(win).toContain('<th class="num">Units</th>'); // each payment shows its parts
    expect(win).toContain('title="Units set manually. The CRM says 2."'); // a hand icon on the payment
    // a gift with parts the system worked out has the control but no Reset
    const auto = giftDetailHtml(view({ workOrders: [sub(1, { key: "g1", subscriptionId: "SG", partsAuto: 1 })] }), "SG");
    expect(auto).toContain('id="gp-select"');
    expect(auto).not.toContain('data-n="0"');
  });
  it("shows a plan with no end as the infinity sign, and says manually, not by hand (DECISIONS 119)", () => {
    const open = [1, 2].map((n) => sub(n, { key: `i${n}`, subscriptionId: "SI", instalmentCount: "Indefinitely", partsFixed: 2 }));
    const win = giftDetailHtml(view({ workOrders: open }), "SI");
    expect(win).not.toContain("Indefinitely");
    expect(win).not.toContain("ongoing");
    expect(win).toContain('1 of <span class="inf" title="Continues until cancelled"');
    expect(win).toContain("2 of ");
    expect(win).toContain("Set manually. The CRM says");
    expect(win).toContain(SYM.manual); // the manual icon, not the word
    expect(win).not.toMatch(/by hand/i);
    expect(giftListHtml(view({ workOrders: open }))).not.toMatch(/by hand/i);
  });
  it("shows each payment on one line, with icons, short dates and no line number (DECISIONS 120)", () => {
    const orders = [sub(1, { key: "L6782", subscriptionId: "SP", paidDate: "2026-09-07 10:00:00", transactionRef: "MWFUK-205764" }), sub(2, { key: "L7952", subscriptionId: "SP", paidDate: "2026-11-05 10:00:00", transactionRef: "MWFUK-206800", status: "unrouted" }), sub(0, { key: "A1", subscriptionId: "SP", legacyUpload: true, instalmentNumber: "", paidDate: "2026-08-26 10:00:00", transactionRef: "ARCHIVE-SUB-1" })];
    const win = giftDetailHtml(view({ workOrders: orders }), "SP");
    expect(win).toContain('<tr class="pay">');
    expect(win).toContain('class="dotok"'); // ready is a green circle
    expect(win).toContain('title="Unrouted: choose its workflow"');
    expect(win).toContain('title="Line L6782">MWFUK-205764'); // the line number is a tooltip, not a second line of text
    expect(win).not.toContain("<div class=\"muted\">Line ");
    expect(win).toContain('title="2026-09-07"><span class="cellstart">07/09/26'); // short date, full date in the tooltip
    expect(win).toContain('class="legacyico"'); // a legacy record is an icon
    expect(win).not.toContain("Legacy upload");
    expect(win).toContain('aria-label="Exclude this payment"'); // an icon button, not the word Exclude
    expect(win).not.toContain(">Exclude<");
    expect(win).not.toContain("<th>Category</th><th>Status</th>");
    // aligned (DECISIONS 121): the header sits over its column, and both icon buttons are the small size
    expect(win).toContain('<th class="num">Units</th><th class="num">Value</th><th class="actcol"></th><th class="actcol"></th>'); // each button has its own column
    expect(win).toContain('<td class="date" title="2026-09-07">'); // the date is left aligned, under its header
    expect(win).toContain('<summary class="iconact sm"');
    expect(win).toContain('class="iconact" data-excl=');
    expect(win).not.toContain("payacts-in");
    expect((win.match(/<td class="actcol"><div class="actbox">/g) ?? []).length).toBe(6); // two button cells on each of the three payments
  });
  it("puts the Allocate manually button in its own spaced block under the status (DECISIONS 122)", () => {
    const win = giftDetailHtml(view({ workOrders: [sub(1, { key: "n1", subscriptionId: "SN", partsAuto: 1 })] }), "SN");
    expect(win).toMatch(/<div class="statusact"><button[^>]*data-manual-set="n1"/);
  });
  it("for a one-off year paid at once, offers the months to change, and no price is checked (DECISIONS 126, 129)", () => {
    const year = { ...base, key: "Y1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", amount: 480, quantity: 1, paidDate: "2026-11-07 10:00:00", periodCount: 12 } as WorkOrder;
    const win = giftDetailHtml(view({ workOrders: [year] }), "once-Y1");
    expect(win).not.toContain("Allocate manually.</b>"); // 480 is the item's unit: nothing is flagged
    expect(win).not.toContain("data-accept-price");
    expect(win).toContain('<option value="12" selected>12 months</option>'); // the months come from the catalogue plan length
    expect(win).toContain('<option value="24">24 months</option>');
    expect(win).toContain('data-periods-save="Y1"');
    expect(win).not.toContain("data-months-save"); // a subscription's catch-up control is not used here
    // a person can set the months when the CRM gave none
    const set = giftDetailHtml(view({ workOrders: [{ ...year, periodCount: undefined, periodsFixed: 12 } as WorkOrder] }), "once-Y1");
    expect(set).toContain('data-periods-set="Y1" data-n="0"'); // and undo it
    expect(set).toContain("one-off \u00B7 12 months");
  });
  it("manages only a custom amount gift by hand, and offers parts or leaving it out of project management (DECISIONS 129)", () => {
    const custom = { ...base, key: "C1", subscriptionId: "SC1", customAmount: true, partsManual: "A custom amount: the donor chose the amount, so it is not tied to a catalogue item" } as WorkOrder;
    const win = giftDetailHtml(view({ workOrders: [custom] }), "SC1");
    expect(win).toContain("<b>Allocate manually.</b> A custom amount: the donor chose the amount");
    expect(win).toContain("excluding its payments");
    expect(win).toContain('id="gp-select"');
    // any other price of any other item is simply the item's unit
    expect(giftDetailHtml(view({ workOrders: [{ ...base, key: "N1", subscriptionId: "SN1", amount: 42 } as WorkOrder] }), "SN1")).not.toContain("Allocate manually.</b>");
  });

  it("sorts by a heading, reverses on a second click, puts empty values last, and says so with aria-sort (decision 214)", () => {
    const rows = [sub(1, { supporterName: "Zara" }), sub(2, { supporterName: "Amir" })].map((w) => ({ ...w, subscriptionId: `S${w.instalmentNumber}` }));
    const names = (html: string): string[] => [...html.matchAll(/class="clip" title="(Amir|Zara) /g)].map((m) => m[1] as string);
    const asc = giftListHtml(view({ workOrders: rows, giftSort: { key: "donor", dir: "asc" } }));
    expect(names(asc)).toEqual(["Amir", "Zara"]);
    expect(asc).toContain('aria-sort="ascending"');
    expect(names(giftListHtml(view({ workOrders: rows, giftSort: { key: "donor", dir: "desc" } })))).toEqual(["Zara", "Amir"]);
    expect(giftListHtml(view({ workOrders: rows }))).toContain('aria-sort="none"');
  });
  it("shows the bulk bar only once something is ticked, and keeps the key to the symbols in a disclosure (decision 214)", () => {
    const rows = [sub(1)];
    expect(giftListHtml(view({ workOrders: rows }))).not.toContain('class="bulkbar"');
    const ticked = giftListHtml(view({ workOrders: rows, selected: [rows[0]!.key] }));
    expect(ticked).toContain('class="bulkbar"');
    expect(ticked).toContain('data-bulk="exclude">Exclude selected');
    expect(giftListHtml(view({ workOrders: rows }))).toContain("Key to the symbols</summary>");
  });

  it("shows each filter that is on as a chip that can be removed alone, with a way to clear them all (decision 215)", () => {
    const crit = { text: "", itemId: "I10", categoryId: "", status: "", kind: "recurring" as const, legacy: "" as const, from: "", to: "" };
    const html = giftListHtml(view({ workOrders: [sub(1), sub(2)], criteria: crit }));
    expect(html).toContain('data-action="clear-filter" data-scope="main" data-key="itemId"');
    expect(html).toContain('data-key="kind"');
    expect(html).toContain("Type: Recurring");
    expect(html).toContain('data-action="clear-filters" data-scope="main">Clear all');
    expect(giftListHtml(view({ workOrders: [sub(1)] }))).not.toContain('class="chip"'); // nothing is filtered, so there are no chips
  });
  it("offers a way out when nothing matches the filters (decision 215)", () => {
    const crit = { text: "no-such-donor", itemId: "", categoryId: "", status: "", kind: "any" as const, legacy: "" as const, from: "", to: "" };
    const html = giftListHtml(view({ workOrders: [sub(1)], criteria: crit }));
    expect(html).toContain("No gifts match the filters.");
    expect(html).toContain('data-action="clear-filters" data-scope="main">Clear the filters');
  });
  it("hides Rec. ID and Value to begin with, lets a person show or hide the others, and always keeps Donor, Item and Status (decision 215)", () => {
    const rows = [sub(1)];
    const usual = giftListHtml(view({ workOrders: rows }));
    expect(usual).not.toContain("<th>Rec. ID</th>");
    expect(usual).not.toContain('data-gsort="value"');
    expect(usual).toContain('data-gsort="paid"');
    const fewer = giftListHtml(view({ workOrders: rows, giftHidden: ["project", "plan", "stage", "assigned", "alloc"] }));
    expect(fewer).toContain("<th>Rec. ID</th>"); // a person's own choice replaces the usual one
    expect(fewer).not.toContain('data-gsort="plan"');
    expect(fewer).not.toContain("<th>Stage<button");
    expect(fewer).toContain('data-gsort="donor"');
    expect(fewer).toContain('data-gsort="item"');
    expect(fewer).toContain("<th>Status</th>");
    const row = fewer.slice(fewer.indexOf("<tbody>"));
    expect((row.match(/<td/g) ?? []).length).toBe((fewer.match(/<th[ >]/g) ?? []).length); // every shown heading has a cell
    const open = giftListHtml(view({ workOrders: rows, giftColsOpen: true }));
    expect(open).toContain('data-gcol="plan" checked');
    expect(open).toContain('data-gcol="value">'); // hidden to begin with, so not ticked
    expect(open).toContain('data-gcols="reset"');
  });

  it("draws every symbol as one SVG family and never as a character that a computer may draw as an emoji (decision 216)", () => {
    const html = giftListHtml(view({ workOrders: [sub(1), sub(2, { planStatus: "cancelled" })] })) + giftDetailHtml(view({ workOrders: [sub(1)] }), "S9");
    expect(html).toContain('class="sym"');
    expect(html).toContain('role="img"');
    for (const emoji of ["\u270B", "\u26D4", "\u23F0", "\u2691", "\u26A0", "\u2714", "\u23F8", "\u23F3"]) expect(html).not.toContain(emoji);
  });

  it("makes the tiles buttons that show just their group, says which is pressed, and keeps the numbers the same when one is chosen (decision 216)", () => {
    const orders = [sub(1, { planStatus: "paused", subscriptionId: "A" }), sub(1, { planStatus: "active", subscriptionId: "B" }), sub(1, { planStatus: "cancelled", subscriptionId: "C" })]; // three different gifts
    const all = giftMetricsHtml(view({ workOrders: orders }));
    expect(all).toContain('data-filter="stopped" aria-pressed="false"');
    expect(all).toContain('data-filter="waiting"');
    expect(all).toContain('data-filter="attention"');
    expect(all).toContain('data-filter="all" aria-pressed="true"');
    const stopped = giftMetricsHtml(view({ workOrders: orders, filter: "stopped" }));
    expect(stopped).toContain('data-filter="stopped" aria-pressed="true"');
    expect(stopped).toMatch(/<b>3<\/b><span>Gifts<\/span>/); // the totals do not collapse to the chosen group
    const listed = giftListHtml(view({ workOrders: orders, filter: "stopped" }));
    expect((listed.match(/data-gift-open=/g) ?? []).length).toBe(2); // the paused and the cancelled one
  });
  it("shows how many gifts are behind each tab, and which tab is chosen (decision 216)", () => {
    const orders = [sub(1, { subscriptionId: "A" }), sub(1, { subscriptionId: "B" })];
    const page = giftsPage(view({ workOrders: orders, filter: "all" }));
    expect(page).toMatch(/data-filter="all" class="on" aria-pressed="true">All <span class="cnt">2<\/span>/);
    expect(page).toMatch(/data-filter="manual" class="" aria-pressed="false">Manual <span class="cnt">0<\/span>/);
  });

  describe("filtering a column by its values (decision 217)", () => {
    const orders = [
      sub(1, { subscriptionId: "A", projectName: "Aghosh", planStatus: "active" }), sub(1, { subscriptionId: "B", projectName: "Aghosh", planStatus: "paused" }),
      sub(1, { subscriptionId: "C", projectName: "Flood Relief", planStatus: "active" }),
    ];
    const rows = (html: string): number => (html.match(/data-gift-open=/g) ?? []).length;
    it("puts a funnel in each heading that can be filtered, and none in the others", () => {
      const html = giftListHtml(view({ workOrders: orders }));
      for (const col of ["project", "plan", "stage", "assigned", "alloc"]) expect(html).toContain(`data-gfilt="${col}"`);
      expect(html).not.toContain('data-gfilt="paid"');
      expect(html).toContain('aria-label="Filter Project by its values"');
    });
    it("keeps only the gifts whose value is ticked, as alternatives within a column and together across columns", () => {
      expect(rows(giftListHtml(view({ workOrders: orders })))).toBe(3);
      expect(rows(giftListHtml(view({ workOrders: orders, giftColFilters: { project: ["Aghosh"] } })))).toBe(2);
      expect(rows(giftListHtml(view({ workOrders: orders, giftColFilters: { project: ["Aghosh", "Flood Relief"] } })))).toBe(3); // this or that
      expect(rows(giftListHtml(view({ workOrders: orders, giftColFilters: { project: ["Aghosh"], plan: ["paused"] } })))).toBe(1); // and
      expect(rows(giftListHtml(view({ workOrders: orders, giftColFilters: { project: [] } })))).toBe(3); // nothing ticked is no filter
    });
    it("shows each filter as a chip with its values, and the open column's values with their counts from the other filters", () => {
      const html = giftListHtml(view({ workOrders: orders, giftColFilters: { project: ["Aghosh"] }, giftFiltOpen: "plan" }));
      expect(html).toContain('data-gfclear="project"');
      expect(html).toContain("Project: Aghosh");
      expect(html).toContain('data-gfv="plan" value="active"'); // active gifts of Aghosh: one
      expect(html).toMatch(/value="active"[^>]*><span class="vpop-label">active<\/span><span class="muted vpop-n">1<\/span>/); // a drop-down under the funnel (DECISIONS 229)
      expect(html).toMatch(/value="paused"[^>]*><span class="vpop-label">paused<\/span><span class="muted vpop-n">1<\/span>/);
      expect(html).not.toContain('value="Flood Relief"'); // not offered under Plan status; and Flood Relief is filtered out by the Project chip
      const checked = giftListHtml(view({ workOrders: orders, giftColFilters: { plan: ["paused"] }, giftFiltOpen: "plan" }));
      expect(checked).toContain('value="paused" checked');
    });
    it("counts a column's values from the gifts the other filters leave, so no value gives nothing", () => {
      const html = giftListHtml(view({ workOrders: orders, giftColFilters: { plan: ["paused"] }, giftFiltOpen: "project" }));
      expect(html).toMatch(/value="Aghosh"[^>]*><span class="vpop-label">Aghosh<\/span><span class="muted vpop-n">1<\/span>/); // only the paused one is Aghosh
      expect(html).not.toContain('value="Flood Relief"');
    });
  });

  it("shows where each gift came from as a country code, can filter by it, and says so in the gift window (DECISIONS 261)", () => {
    const orders = [sub(1, { key: "us1", subscriptionId: "SU", site: "US", currency: "USD" }), sub(1, { key: "gb1", subscriptionId: "SG", site: "GB", currency: "GBP" }), sub(1, { key: "x1", subscriptionId: "SX" })];
    const html = giftListHtml(view({ workOrders: orders }));
    expect(html).toContain('<th class="c">Site');
    expect(html).toContain('<span class="site" title="United States, paid in USD">US</span>');
    expect(html).toContain('<span class="site" title="United Kingdom, paid in GBP">GB</span>');
    expect(html).toContain('title="No site given">-</span>'); // a gift with no site shows a quiet dash
    expect(html).toContain('data-gfilt="site"'); // and the Site column can be filtered by its values
    const onlyUs = giftListHtml(view({ workOrders: orders, giftColFilters: { site: ["US"] } }));
    expect((onlyUs.match(/data-sel-gift=/g) ?? []).length).toBe(1);
    expect(shownGiftKeys(view({ workOrders: orders, giftColFilters: { site: ["No site"] } }))).toEqual(["x1"]);
    expect(giftDetailHtml(view({ workOrders: orders }), "SU")).toContain(">US</span> <span class=\"muted\">USD</span>"); // the gift window
  });

  it("marks a plan carried over from the old site with an icon beside the gift, a filter you can show, a row in the gift window and a note to check it (DECISIONS 264, 266)", () => {
    const orders = [sub(1, { key: "old1", subscriptionId: "SO", carriedOver: true }), sub(1, { key: "new1", subscriptionId: "SN" })];
    const html = giftListHtml(view({ workOrders: orders }));
    expect((html.match(/class="legacyic"/g) ?? []).length).toBe(1); // only the carried over plan gets the icon
    expect(html).toContain('role="img" aria-label="Carried over from the old site"');
    expect(html).not.toContain('<th class="c">Old site'); // the column is off by default
    const shown = giftListHtml(view({ workOrders: orders, giftHidden: ["recid", "value"] }));
    expect(shown).toContain('<th class="c">Old site');
    expect(shown).toContain('data-gfilt="origin"');
    const only = giftListHtml(view({ workOrders: orders, giftHidden: ["recid", "value"], giftColFilters: { origin: ["Carried over"] } }));
    expect((only.match(/data-sel-gift=/g) ?? []).length).toBe(1);
    const rest = giftListHtml(view({ workOrders: orders, giftHidden: ["recid", "value"], giftColFilters: { origin: ["Not carried over"] } }));
    expect((rest.match(/data-sel-gift=/g) ?? []).length).toBe(1); // two values only, whatever the gift is
    const window = giftDetailHtml(view({ workOrders: orders }), "SO");
    expect(window).toContain("Carried over from the old website");
    expect(window).toContain("Carried over from the old site"); // the note under Needs a look
    expect(giftDetailHtml(view({ workOrders: orders }), "SN")).not.toContain("Carried over from the old");
  });
});
