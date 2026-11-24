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
    expect(html).not.toContain("<details"); // the payments are in the window, not the row
    const detail = giftDetailHtml(view({ workOrders: orders }), "S9");
    expect(detail).toContain("3 of 10");
    expect(detail).toContain("Payments (3)");
    expect(giftListHtml(view({ workOrders: [sub(1), sub(3)] }))).toContain('title="Missing instalment 2'); // what needs a look is a symbol with the words in its tooltip
    expect(giftDetailHtml(view({ workOrders: [sub(1), sub(3)] }), "S9")).toContain("Missing instalment 2"); // and in words in the window
    expect(giftDetailHtml(view({ workOrders: orders }), "nope")).toBe(""); // a gift that is gone closes the window
  });
  it("shows a single payment as its own row, and how many months it covers", () => {
    const html = giftListHtml(view({ workOrders: [{ ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", periodCount: 12 }] }));
    expect(html).toContain("12 mo");
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
    expect(share).toContain("whole item not paid yet");
    expect(detail(mk(""))).toContain("No workflow chosen");
    expect(detail(mk("x"), [{ ...fws[0]!, id: "x", instalment: undefined }])).toContain("Set how an instalment counts in the workflow");
  });
  it("shows where a gift is allocated, or that it waits for allocation with the reason (every gift needs one, DECISIONS 98)", () => {
    const fws = starterFrameworks();
    const orders = [1, 2].map((n) => sub(n, { frameworkId: "sponsorship-shared-parts", planStatus: "active", planNextDue: "2026-12-10", planPaid: 2 }));
    const outcomes = [{ id: "orphan-1", name: "Orphan 1", type: "child", cohort: "", frameworkId: "sponsorship-shared-parts", active: true, projectId: "p1" }];
    const partners = [{ id: "p1", name: "Aghosh", aliases: [], levels: [], types: [] }];
    const placed = giftListHtml(view({ workOrders: orders, frameworks: fws, outcomes, projects: partners, allocations: [{ commitmentKey: "S9", outcomeId: "orphan-1", parts: 1, how: "auto", at: "t" }] }));
    expect(placed).toContain("Orphan 1");
    expect(placed).toContain("Aghosh");
    expect(giftListHtml(view({ workOrders: orders, frameworks: fws, outcomes, projects: partners, allocations: [] }))).toContain("Waiting for allocation");
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, frameworkId: "" })), frameworks: fws }))).toContain("It needs a workflow first");
    // a paused plan stays parked and says so, and a cancelled one is parked as cancelled (DECISIONS 102)
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, planStatus: "paused" })), frameworks: fws }))).toContain("Plan paused, parked until payments resume");
    expect(giftListHtml(view({ workOrders: orders.map((w) => ({ ...w, planStatus: "cancelled" })), frameworks: fws }))).not.toContain("Waiting for allocation");
  });
  it("shows the stage each gift is in, with the reason on hover and in the window (DECISIONS 141)", () => {
    const fws = starterFrameworks();
    const mk = (frameworkId: string, over: Partial<WorkOrder> = {}) => [1, 2, 3, 4].map((n) => sub(n, { instalmentCount: "12", frameworkId, ...over }));
    const list = giftListHtml(view({ workOrders: mk("sponsorship-shared-parts"), frameworks: fws }));
    expect(list).toContain("<th>Stage</th>");
    expect(list).toMatch(/<span class="pill stage st-(assignment|allocation)" title="[^"]*">(Assigned|Allocated)<\/span>/);
    const detail = giftDetailHtml(view({ workOrders: mk("sponsorship-shared-parts"), frameworks: fws }), "S9");
    expect(detail).toContain("<span>Stage</span>");
    // a gift whose workflow releases only when fully paid is funding at Work order
    const pump = giftListHtml(view({ workOrders: mk("delivered-once"), frameworks: fws.map((f) => (f.id === "delivered-once" ? { ...f, instalment: "share_of_whole" as const } : f)) }));
    expect(pump).toContain('class="pill stage st-work-order" title="Funding, 4 of 12 paid">WO created</span>');
    // an item with no workflow is still at Gift
    expect(giftListHtml(view())).toContain('class="pill stage st-gift" title="Choose a workflow for its item">Gift</span>');
  });
  it("reads the stage from Assignment and Placement: assigned to a partner, then allocated to a child (DECISIONS 176)", () => {
    const fws = starterFrameworks();
    const orders = [1, 2, 3, 4].map((n) => sub(n, { instalmentCount: "12", frameworkId: "sponsorship-shared-parts" }));
    const partners = [{ id: "trust", name: "Sample Trust", aliases: [], levels: [], types: [] }] as unknown as View["projects"];
    const assignments = { records: [{ key: "sub:S9", partnerId: "trust", giftProjectId: "", itemId: base.itemId, parts: 1, how: "auto" as const, at: "x" }] };
    const assigned = giftListHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments }));
    expect(assigned).toContain('title="Assigned to Sample Trust, waiting for a place">Assigned</span>'); // no longer "waiting for a partner"
    expect(assigned).not.toContain("Released, waiting for a partner");
    const detail = giftDetailHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments }), "S9");
    expect(detail).toContain("Assigned to Sample Trust, waiting for a place");
    const child = { id: "B1", kind: "person", name: "Sample Amina" } as unknown as NonNullable<View["beneficiaries"]>["records"][number];
    const enrolments = { counter: 1, records: [{ id: "EN-1", beneficiaryId: "B1", giftProjectId: "p", clusterId: "c", itemId: base.itemId, role: "", status: "active" as const, since: "x" }] };
    const placements = { counter: 0, records: [{ key: "sub:S9", kind: "place" as const, enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "p", itemId: base.itemId, parts: 1, how: "auto" as const, at: "x" }] };
    const placed = giftListHtml(view({ workOrders: orders, frameworks: fws, projects: partners, assignments, placements, enrolments, beneficiaries: { records: [child], counters: {} } }));
    expect(placed).toMatch(/class="pill stage st-allocation"[^>]*>Allocated<\/span>/);
    expect(placed).toContain("Sample Amina");
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
  it("has six tiles that count what the list shows, so they change with the tab and the filters (DECISIONS 99)", () => {
    const orders = [sub(1, { planStatus: "paused" }), sub(2, { planStatus: "paused" }), { ...base, key: "o1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", currency: "GBP" }];
    const all = giftMetricsHtml(view({ workOrders: orders }));
    expect(all).toMatch(/<b>2<\/b><span>Gifts<\/span>/); // one subscription and one single payment
    expect(all).toMatch(/<b>1<\/b><span>Recurring<\/span>[\s\S]*<b>1<\/b> one payments/); // recurring large, single payments small beside it
    expect(all).toMatch(/<span>Value<\/span>/);
    expect(all).toMatch(/<b>0<\/b> cancelled[\s\S]*<b>1<\/b> paused[\s\S]*<b>0<\/b> completed/); // plan statuses share one tile
    expect(all).toContain("<span>Unallocated</span>");
    expect(all).toMatch(/<b>0<\/b> allocated[\s\S]*<b>0<\/b> need none/); // allocated + unallocated + need none = gifts, so the tile adds up
    expect(all).toContain("<span>Review</span>");
    // a narrower filter changes the tiles
    const narrowed = giftMetricsHtml(view({ workOrders: orders, criteria: { text: "no-such-donor", itemId: "", categoryId: "", status: "", kind: "any", legacy: "", from: "", to: "" } }));
    expect(narrowed).toMatch(/<b>0<\/b><span>Gifts<\/span>/);
    // the page holds the tiles in a place that is redrawn with the list, and the pick-up note sits beside the tabs
    const page = giftsPage(view({ workOrders: orders }));
    expect(page).toContain('data-list="main-metrics"');
    expect(page).toMatch(/class="tabrow"[\s\S]*Gifts are brought in under/);
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
    expect(html).toContain("<th>Project</th>");
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
    expect(html).toContain("\u270B"); // the hand symbol, not the hourglass, on the custom gift
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
    expect(win).toContain("\u270B"); // the hand icon, not the word
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
});
