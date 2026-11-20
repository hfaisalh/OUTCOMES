/**
 * menu.test.ts
 *
 * What it does: tests menu.ts. The menu follows the CRM role's permissions.
 */

import { describe, expect, it } from "vitest";
import { landingPage, menuEntries, PERMISSIONS as P, visibleMenu } from "./menu";

describe("visibleMenu", () => {
  it("shows nothing without the access permission, even with others", () => {
    expect(visibleMenu([P.viewWorkOrders, P.settings])).toEqual([]);
    expect(landingPage([P.viewWorkOrders])).toBeNull();
  });

  it("shows only the items the role allows", () => {
    const ids = visibleMenu([P.access, P.viewWorkOrders, P.dashboards]).map((m) => m.id);
    expect(ids).toEqual(["work-orders", "projects", "allocation", "outcomes", "dashboard", "attention", "audit"]);
  });

  it("lands on the first allowed item", () => {
    expect(landingPage([P.access, P.settings, P.mapFrameworks])).toBe("categories");
  });

  it("shows everything to a role with every permission", () => {
    expect(visibleMenu(Object.values(P))).toHaveLength(10);
  });

  it("keeps the journey in the side menu (Gifts, Projects, Allocation) and puts setup behind one Settings entry", () => {
    const all = menuEntries(Object.values(P));
    expect(all.filter((e) => e.section === "Work").map((e) => e.id)).toEqual(["work-orders", "projects", "allocation", "dashboard"]);
    expect(all.find((e) => e.id === "allocation")?.pages.map((p) => p.id)).toEqual(["allocation", "outcomes"]);
    const setup = all.filter((e) => e.section === "Set up");
    expect(setup.map((e) => e.id)).toEqual(["setup"]);
    expect(setup[0]?.pages.map((p) => p.id)).toEqual(["attention", "audit", "categories", "sources", "settings"]);
  });

  it("shows only the Settings tabs a role may use, and no Settings at all without any of them", () => {
    expect(menuEntries([P.access, P.viewWorkOrders]).find((e) => e.id === "setup")?.pages.map((p) => p.id)).toEqual(["attention", "audit"]);
    expect(menuEntries([P.access, P.mapFrameworks]).map((e) => e.id)).toEqual(["setup"]);
    expect(menuEntries([P.access, P.dashboards]).map((e) => e.id)).toEqual(["dashboard"]);
  });
});
