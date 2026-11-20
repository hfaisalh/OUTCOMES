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
    expect(ids).toEqual(["work-orders", "attention", "commitments", "audit", "dashboard"]);
  });

  it("lands on the first allowed item", () => {
    expect(landingPage([P.access, P.settings, P.mapFrameworks])).toBe("categories");
  });

  it("shows everything to a role with every permission", () => {
    expect(visibleMenu(Object.values(P))).toHaveLength(8);
  });

  it("sums the working pages into one Intake entry with tabs, and keeps the rest as they are", () => {
    const all = menuEntries(Object.values(P));
    expect(all.map((e) => e.id)).toEqual(["intake", "dashboard", "sources", "settings"]);
    expect(all[0]?.pages.map((p) => p.id)).toEqual(["work-orders", "attention", "commitments", "audit", "categories"]);
  });

  it("shows only the tabs a role may use, and no Intake at all without any of them", () => {
    expect(menuEntries([P.access, P.viewWorkOrders])[0]?.pages.map((p) => p.id)).toEqual(["work-orders", "attention", "commitments", "audit"]);
    expect(menuEntries([P.access, P.mapFrameworks])[0]?.pages.map((p) => p.id)).toEqual(["categories"]);
    expect(menuEntries([P.access, P.settings]).map((e) => e.id)).toEqual(["settings"]);
  });
});
