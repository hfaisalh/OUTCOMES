/**
 * prices-page.test.ts
 *
 * What it does: tests the Prices page (DECISIONS 127): each item's prices with their gifts and status, the choices, and that CRM text cannot become HTML.
 * Invented data. Who calls it: vitest. Depends on: prices-page.ts.
 */

import { describe, expect, it } from "vitest";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import { emptyBook } from "../modules/04b-commitments/parts";
import { pricesPage } from "./prices-page";
import type { View } from "./pages";

const wo = (key: string, amount: number, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key, lineId: key, transactionRef: `T${key}`, paidDate: "2026-09-10 10:00:00", supporterId: "D1", supporterName: "Sample", group: "", itemId: "ORP", itemName: "Orphan Sponsorship",
  amount, quantity: 1, intention: "", subscriptionId: `S${key}`, instalmentNumber: "1", instalmentCount: "", categoryId: "c", frameworkId: "f", status: "ready", ...over,
});
const orders = [...[1, 2, 3, 4].map((n) => wo(`a${n}`, 35)), wo("b1", 70), wo("b2", 70)];
const view = (over: Partial<View> = {}): View => ({ workOrders: orders, review: [], priceBook: emptyBook(), live: true, ...over } as unknown as View);

describe("the Prices page", () => {
  it("lists each price of an item with its gifts, dates and status, and the unusual ones are marked", () => {
    const html = pricesPage(view());
    expect(html).toContain("<h1>Prices</h1>");
    expect(html).toContain("Orphan Sponsorship");
    expect(html).toContain("<b>35</b>");
    expect(html).toContain("Seen often"); // 4 gifts
    expect(html).toContain('class="pill review" title="A whole multiple or a fraction of a normal price'); // 70 is 2 x 35, so it is unusual
    expect(html).toContain("10/09/26"); // short dates
    expect(html).toMatch(/<b>1<\/b><span>Unusual prices/);
    expect(html).toMatch(/<b>2<\/b><span>Gifts at unusual prices/);
  });
  it("shows an earlier or newer price as assumed, not unusual, with accept and reject (DECISIONS 128)", () => {
    const html = pricesPage(view({ workOrders: [...[1, 2, 3, 4].map((n) => wo(`a${n}`, 48)), wo("old", 42)] }));
    expect(html).toContain('class="pill blue"');
    expect(html).toContain(">Assumed<");
    expect(html).toMatch(/<b>0<\/b><span>Unusual prices/); // 42 is not a multiple or a fraction of 48
    expect(html).toContain('data-price-act="accept" data-item="ORP" data-price="42"');
    expect(html).toContain('data-price-act="reject" data-item="ORP" data-price="42"');
  });
  it("offers accept for an unusual price and reject for a normal one, as icon buttons in their own columns", () => {
    const html = pricesPage(view());
    expect(html).toContain('data-price-act="accept" data-item="ORP" data-price="70"');
    expect(html).toContain('data-price-act="reject" data-item="ORP" data-price="35"');
    expect(html).not.toContain('data-price-act="accept" data-item="ORP" data-price="35"'); // already normal
    expect(html).toContain('<td class="actcol"><div class="actbox">');
  });
  it("shows a chosen price with a way to take the choice back, and a catalogue price as in the catalogue", () => {
    const accepted = pricesPage(view({ priceBook: { ...emptyBook(), accepted: [{ itemId: "ORP", price: 70 }], catalogue: { ORP: [45] } } }));
    expect(accepted).toContain("Accepted");
    expect(accepted).toContain('data-price-act="clear" data-item="ORP" data-price="70"');
    expect(accepted).toContain("In catalogue"); // 45, which no gift has used yet
    expect(pricesPage(view({ priceBook: { ...emptyBook(), rejected: [{ itemId: "ORP", price: 35 }] } }))).toContain("Rejected");
  });
  it("says what to do when there are no gifts, and never lets CRM text become HTML", () => {
    expect(pricesPage(view({ workOrders: [] }))).toContain("No gifts yet");
    const evil = pricesPage(view({ workOrders: [wo("x", 35, { itemName: "<img src=x>" })] }));
    expect(evil).not.toContain("<img");
  });
});
