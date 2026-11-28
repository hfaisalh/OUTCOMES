/**
 * partner-costs.test.ts
 *
 * What it does: tests the partner's costs card and form, and the staff Dashboard card (DECISIONS 280). Invented partners and amounts.
 * Who calls it: vitest. Depends on: partner-costs.ts, costs-card.ts.
 */
import { describe, expect, it } from "vitest";
import { costsCard } from "./costs-card";
import { costFormHtml, costsCardHtml } from "./partner-costs";
import type { PartnerUi } from "./partner-outcomes";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import type { View } from "./pages";

const ui = (over: Partial<PartnerUi> = {}): PartnerUi => ({ open: [], details: [], lastOpened: "", refusing: null, form: null, csv: null, message: "", error: "", ...over });
const cost = (id: string, partnerId: string, amount: number, currency = "GBP", category = "Marketing") => ({ id, partnerId, date: "2026-11-20", category, amount, currency, projectId: "g1", note: "Flyers <b>", by: "x", at: "t" });
const slice = { giftProjects: [{ id: "g1", name: "Orphan care" }], costs: [cost("PC-0001", "p1", 100), cost("PC-0002", "p1", 9000, "PKR", "Media")] } as unknown as PartnerSlice;

describe("the partner's costs card", () => {
  it("lists its costs with a total for each currency and by category, escaped, with Edit and Remove named for a screen reader", () => {
    const html = costsCardHtml(slice, ui(), "2026-11-28");
    expect(html).toContain("PKR 9,000.00 · GBP 100.00");
    expect(html).toContain("Flyers &lt;b&gt;");
    expect(html).toContain('aria-label="Edit cost PC-0001"');
    expect(html).toContain("Nothing is paid from here");
  });
  it("is calm when there are none, and has a Record a cost button", () => {
    const html = costsCardHtml({ giftProjects: [], costs: [] } as unknown as PartnerSlice, ui(), "2026-11-28");
    expect(html).toContain("No costs recorded yet.");
    expect(html).toContain('data-action="pt-cost-add"');
  });
});

describe("the cost form", () => {
  it("is a labelled dialog that starts on today, with the categories and the partner's projects, and keeps the error under it", () => {
    const html = costFormHtml({ id: "", values: {}, error: "The amount is wrong." }, [{ id: "g1", name: "Orphan care" }], "2026-11-28");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('value="2026-11-28"');
    expect(html).toContain("<option value=\"Marketing\">Marketing</option>");
    expect(html).toContain("<option value=\"g1\">Orphan care</option>");
    expect(html).toContain('role="alert" tabindex="-1">The amount is wrong.');
    expect(html).toContain("Record cost");
  });
  it("keeps what was typed and says Save when changing one", () => {
    const html = costFormHtml({ id: "PC-0001", values: { amount: "12.5", category: "Media", projectId: "g1" }, error: "" }, [{ id: "g1", name: "Orphan care" }], "2026-11-28");
    expect(html).toContain('value="12.5"');
    expect(html).toContain('<option value="Media" selected>');
    expect(html).toContain('<option value="g1" selected>');
    expect(html).toContain(">Save</button>");
  });
});

describe("the staff Dashboard card", () => {
  const v = { projects: [{ id: "p1", name: "Alpha Trust" }, { id: "p2", name: "Beta Trust" }], partnerCosts: [cost("PC-0001", "p1", 100), cost("PC-0002", "p2", 50), cost("PC-0003", "p1", 9000, "PKR", "Media")] } as unknown as View;
  it("adds up by partner and category with one total per currency, and lists the latest", () => {
    const html = costsCard(v);
    expect(html).toContain("<b>3</b><span>Costs recorded");
    expect(html).toContain("<b>2</b><span>Partners reporting");
    expect(html).toContain("PKR 9,000.00 · GBP 100.00");
    expect(html).toContain("Alpha Trust");
    expect(html).toContain("Beta Trust");
  });
  it("says so when nothing is recorded", () => {
    expect(costsCard({ projects: [], partnerCosts: [] } as unknown as View)).toContain("No partner has recorded a cost yet.");
  });
});

describe("costs for a benefit and the agreed rates (DECISIONS 290)", () => {
  const withRates = { giftProjects: [{ id: "g1", name: "Orphan care", itemIds: ["PUMP"] }], itemNames: { PUMP: "Hand pump <x>" }, costs: [{ ...cost("PC-0001", "p1", 40), itemId: "PUMP" }], partner: { itemIds: ["PUMP", "WELL"], benefitTerms: { PUMP: { costPerUnit: 250, currency: "GBP", inclusive: false, note: "Plus transport" }, WELL: { costPerUnit: 100, currency: "PKR" } } } } as unknown as PartnerSlice;
  it("shows the partner its agreed rates, and says where extra costs may be added", () => {
    const html = costsCardHtml(withRates, ui(), "2026-11-28");
    expect(html).toContain("Your agreed rates");
    expect(html).toContain("Hand pump &lt;x&gt;");
    expect(html).toContain("GBP 250.00");
    expect(html).toContain("Extra costs may be added");
    expect(html).toContain("All inclusive");
    expect(html).toContain("Plus transport");
  });
  it("offers the benefits the partner delivers in the form, and keeps the chosen one", () => {
    const html = costsCardHtml(withRates, ui({ cost: { id: "", values: { itemId: "PUMP" }, error: "" } }), "2026-11-28");
    expect(html).toContain('<option value="PUMP" selected>Hand pump &lt;x&gt;</option>');
    expect(html).toContain('<option value="WELL">WELL</option>'); // on the profile, even with no name known
  });
  it("shows no rates block when none is agreed, and an old cost with no benefit still draws", () => {
    const html = costsCardHtml({ giftProjects: [], itemNames: {}, costs: [cost("PC-0009", "p1", 5)], partner: {} } as unknown as PartnerSlice, ui(), "2026-11-28");
    expect(html).not.toContain("Your agreed rates");
    expect(html).toContain("PC-0009");
  });
});
