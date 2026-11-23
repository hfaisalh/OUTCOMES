/**
 * icons.test.ts
 *
 * What it does: tests the icon set and the suggestion of an icon from an item's name (DECISIONS 107), using the item names in the real catalogue.
 * Who calls it: vitest. Depends on: icons.ts.
 */

import { describe, expect, it } from "vitest";
import { ICON_IDS, ICONS, iconHtml, itemIcon, suggestIcon } from "./icons";

describe("icons", () => {
  it("has twenty distinct icons, each with a label and shapes", () => {
    expect(ICONS).toHaveLength(20);
    expect(new Set(ICON_IDS).size).toBe(20);
    for (const i of ICONS) expect(i.paths.length).toBeGreaterThan(20);
  });
  it("suggests the icon from the item's name, most specific first", () => {
    const pick = (n: string) => suggestIcon(n);
    expect(pick("Orphan Sponsorship")).toBe("orphan");
    expect(pick("Hifz Scholarship: Day Student")).toBe("hifz");
    expect(pick("Aalim Scholarship")).toBe("scholar");
    expect(pick("Uni Scholarship")).toBe("uni");
    expect(pick("School Scholarship")).toBe("student");
    expect(pick("Small Pump")).toBe("pump");
    expect(pick("Large Pump")).toBe("pump-lg");
    expect(pick("Deep Solar Well")).toBe("solar");
    expect(pick("Water Tanker")).toBe("tanker");
    expect(pick("Build A Home")).toBe("house");
    expect(pick("Rickshaw")).toBe("rickshaw");
    expect(pick("Trade Startup")).toBe("cart");
    expect(pick("Medical Camp (One Day)")).toBe("medical");
    expect(pick("Orphan Care Home")).toBe("care");
    expect(pick("Something unusual")).toBe("");
  });
  it("shows the chosen icon first, then the suggestion, then the type's icon", () => {
    expect(itemIcon("i1", "Small Pump", { i1: "tanker" })).toBe("tanker");
    expect(itemIcon("i1", "Small Pump", { i1: "not-an-icon" })).toBe("pump");
    expect(itemIcon("i2", "Something unusual", {}, "house")).toBe("house");
    expect(itemIcon("i2", "Something unusual")).toBe("");
  });
  it("draws an icon with its name as a tooltip, and nothing for an unknown icon", () => {
    expect(iconHtml("pump")).toContain('title="Small pump"');
    expect(iconHtml("pump", 'A "special" pump')).toContain("&quot;special&quot;");
    expect(iconHtml("nope")).toBe("");
  });
  it("makes an item name safe in the tooltip (CRM text never becomes HTML)", () => {
    const html = iconHtml("pump", "<img src=x onerror=alert(1)> & co");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; co");
  });
});
