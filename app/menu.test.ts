/**
 * menu.test.ts
 *
 * What it does: tests menu.ts. The menu follows the CRM role's permissions.
 */

import { describe, expect, it } from "vitest";
import { landingPage, PERMISSIONS as P, visibleMenu } from "./menu";

describe("visibleMenu", () => {
  it("shows nothing without the access permission, even with others", () => {
    expect(visibleMenu([P.viewWorkOrders, P.settings])).toEqual([]);
    expect(landingPage([P.viewWorkOrders])).toBeNull();
  });

  it("shows only the items the role allows", () => {
    const ids = visibleMenu([P.access, P.viewWorkOrders, P.dashboards]).map((m) => m.id);
    expect(ids).toEqual(["work-orders", "dashboard"]);
  });

  it("lands on the first allowed item", () => {
    expect(landingPage([P.access, P.settings, P.mapFrameworks])).toBe("frameworks");
  });

  it("shows everything to a role with every permission", () => {
    expect(visibleMenu(Object.values(P))).toHaveLength(5);
  });
});
