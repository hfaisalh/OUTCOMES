/**
 * prices-page.ts
 *
 * What it does: the Prices page under Data (DECISIONS 127). For each item, every price one part for one month was paid at: how many gifts and payments, the first
 * and last date, and whether OUTCOMES treats it as normal (in the catalogue, seen on several gifts, or accepted) or unusual. A person can accept, reject or
 * take back a choice with one click. A gift at an unusual price is allocated manually.
 * Who calls it: app/main.ts. Depends on: modules/04b-commitments/parts.ts and the icons. Pure: it takes a View and returns HTML.
 */

import { shortDate } from "./dates";
import { iconHtml, itemIcon } from "./icons";
import { esc, metric, type View } from "./pages";
import { emptyBook, MIN_GIFTS, priceTable, type PriceEntry } from "../modules/04b-commitments/parts";

const money = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const TICK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const CROSS = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>`;
const UNDO = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg>`;

function status(e: PriceEntry): string {
  if (e.rejected) return `<span class="pill unrouted" title="A person rejected this price">Rejected</span>`;
  if (e.accepted) return `<span class="pill ready" title="A person accepted this price">Accepted</span>`;
  if (e.inCatalogue) return `<span class="pill ready" title="This price is in the catalogue price list">In catalogue</span>`;
  if (e.valid) return `<span class="pill ready" title="Seen on ${MIN_GIFTS} or more gifts of this item">Seen often</span>`;
  if (e.kind === "assumed") return `<span class="pill blue" title="Not in the catalogue and seen on fewer than ${MIN_GIFTS} gifts, but not a multiple or a fraction of a normal price. It is treated as the going price of those gifts, an earlier or a newer catalogue price. Reject it if it is wrong.">Assumed</span>`;
  return `<span class="pill review" title="A whole multiple or a fraction of a normal price, so it looks like a chosen amount. Gifts at this price are allocated manually. Accept it if it is right.">Unusual</span>`;
}

export function pricesPage(v: View): string {
  const book = v.priceBook ?? emptyBook();
  const table = priceTable(v.workOrders, book);
  const items = [...new Set(table.map((e) => e.itemId))];
  const unusual = table.filter((e) => e.kind === "unusual");
  const gifts = unusual.reduce((n, e) => n + e.gifts, 0);
  const row = (e: PriceEntry): string => `<tr class="${e.kind === "unusual" ? "oddprice" : ""}"><td class="num"><b>${esc(money(e.price))}</b></td><td class="num">${e.gifts || "–"}</td><td class="num">${e.payments || "–"}</td>
      <td class="date">${e.first ? esc(shortDate(e.first)) : ""}</td><td class="date">${e.last ? esc(shortDate(e.last)) : ""}</td><td>${status(e)}</td>
      <td class="actcol"><div class="actbox">${e.accepted || e.rejected ? `<button class="iconact" data-price-act="clear" data-item="${esc(e.itemId)}" data-price="${e.price}" title="Take the choice back" aria-label="Take the choice back">${UNDO}</button>` : e.valid ? "" : `<button class="iconact ok" data-price-act="accept" data-item="${esc(e.itemId)}" data-price="${e.price}" title="Accept this as a normal price" aria-label="Accept this as a normal price">${TICK}</button>`}</div></td>
      <td class="actcol"><div class="actbox">${e.rejected || e.accepted || e.kind === "unusual" ? "" : `<button class="iconact" data-price-act="reject" data-item="${esc(e.itemId)}" data-price="${e.price}" title="Reject this price" aria-label="Reject this price">${CROSS}</button>`}</div></td></tr>`;
  const block = (itemId: string): string => {
    const entries = table.filter((e) => e.itemId === itemId);
    const name = entries[0]?.itemName ?? itemId;
    return `<div class="card"><h2 class="priceitem">${iconHtml(itemIcon(itemId, name, v.itemIcons ?? {}), name)} ${esc(name)} <span class="muted">${esc(itemId)}</span></h2>
      <table class="subtable"><thead><tr><th class="num">Price of a part a month</th><th class="num">Gifts</th><th class="num">Payments</th><th>First</th><th>Last</th><th>Status</th><th class="actcol"></th><th class="actcol"></th></tr></thead><tbody>${entries.map(row).join("")}</tbody></table></div>`;
  };
  return `
    <h1>Prices</h1>
    <p class="sub">Donors cannot give custom amounts at item level: an item's amounts are set in the CRM catalogue. So each payment is compared with the prices its item has really sold at: the catalogue price list, prices seen on ${MIN_GIFTS} or more gifts, and prices you accept. A payment at any other price is a custom amount and is allocated manually. When the CRM changes a price, nothing here needs changing: the new price is learned from the gifts and the next catalogue upload.</p>
    ${v.message ? `<div class="note">${esc(v.message)}</div>` : ""}
    <div class="metrics">${metric(items.length, "Items")}${metric(table.length, "Prices found")}${metric(unusual.length, "Unusual prices", unusual.length ? "warn" : "")}${metric(gifts, "Gifts at unusual prices", gifts ? "warn" : "")}</div>
    ${v.live ? "" : `<p class="muted">This is the demo with invented data.</p>`}
    ${items.length ? items.map(block).join("") : `<div class="card empty">No gifts yet. Load the donation lines and the catalogue under Data.</div>`}`;
}
