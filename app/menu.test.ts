/**
 * menu.test.ts
 *
 * What it does: tests menu.ts. The menu follows the CRM role's permissions.
 */

import { describe, expect, it } from "vitest";
import { isPageId, landingPage, PAGE_IDS, menuEntries, PERMISSIONS as P, visibleMenu } from "./menu";

describe("visibleMenu", () => {
  it("shows nothing without the access permission, even with others", () => {
    expect(visibleMenu([P.viewWorkOrders, P.settings])).toEqual([]);
    expect(landingPage([P.viewWorkOrders])).toBeNull();
  });

  it("shows only the items the role allows", () => {
    const ids = visibleMenu([P.access, P.viewWorkOrders, P.dashboards]).map((m) => m.id);
    expect(ids).toEqual(["work-orders", "projects", "partners", "beneficiaries", "outcome-list", "allocation", "outcomes", "dashboard", "audit", "attention"]);
  });

  it("lands on the first allowed item", () => {
    expect(landingPage([P.access, P.settings, P.mapFrameworks])).toBe("data-feed");
  });

  it("shows everything to a role with every permission", () => {
    expect(visibleMenu(Object.values(P))).toHaveLength(16);
  });

  it("keeps the registers and the journey in the side menu (Gifts, Projects, Partners, Beneficiaries, Allocation) and puts setup behind one Settings entry", () => {
    const all = menuEntries(Object.values(P));
    expect(all.filter((e) => e.section === "Work").map((e) => e.id)).toEqual(["work-orders", "projects", "partners", "beneficiaries", "outcome-list", "allocation", "dashboard"]);
    expect(all.find((e) => e.id === "allocation")?.pages.map((p) => p.id)).toEqual(["allocation", "outcomes"]);
    // Getting data in has its own area (DECISIONS 92), and setup is behind the gear.
    expect(all.filter((e) => e.section === "Data").map((e) => e.id)).toEqual(["data"]);
    expect(all.find((e) => e.id === "data")?.pages.map((p) => p.id)).toEqual(["data-feed", "data-files", "audit", "sources"]);
    const setup = all.filter((e) => e.section === "Set up");
    expect(setup.map((e) => e.id)).toEqual(["setup"]);
    expect(setup[0]?.pages.map((p) => p.id)).toEqual(["attention", "workflows", "benefits", "settings"]);
  });

  it("shows only the Settings tabs a role may use, and no Settings at all without any of them", () => {
    expect(menuEntries([P.access, P.viewWorkOrders]).find((e) => e.id === "setup")?.pages.map((p) => p.id)).toEqual(["attention"]);
    expect(menuEntries([P.access, P.viewWorkOrders]).find((e) => e.id === "data")?.pages.map((p) => p.id)).toEqual(["audit"]);
    expect(menuEntries([P.access, P.mapFrameworks]).map((e) => e.id)).toEqual(["setup"]);
    expect(menuEntries([P.access, P.dashboards]).map((e) => e.id)).toEqual(["dashboard"]);
  });
});

describe("pages kept across a reload", () => {
  it("accepts only known page ids from the address", () => {
    expect(isPageId("workflows")).toBe(true);
    expect(isPageId("work-orders")).toBe(true);
    expect(isPageId("nope")).toBe(false);
    expect(isPageId("")).toBe(false);
    expect(PAGE_IDS.length).toBe(new Set(PAGE_IDS).size);
  });
});
