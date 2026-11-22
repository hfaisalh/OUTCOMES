/**
 * roles.test.ts
 *
 * What it does: tests the example roles and what each one lets a person see in the menu (DECISIONS 91). Invented roles only.
 * Who calls it: vitest. Depends on: roles.ts and the menu rules.
 */

import { describe, expect, it } from "vitest";
import { visibleMenu } from "../../app/menu";
import { ROLES, roleById } from "./roles";

describe("example roles", () => {
  const ids = (id: string) => visibleMenu(roleById(id).permissions).map((m) => m.id);
  it("shows the administrator everything and a person with no permission nothing", () => {
    expect(ids("admin")).toContain("settings");
    expect(ids("none")).toEqual([]);
  });
  it("shows each role only what its permissions allow", () => {
    expect(ids("viewer")).toEqual(["dashboard"]);
    expect(ids("agent")).toContain("work-orders");
    expect(ids("agent")).not.toContain("categories");
    expect(ids("gifts")).toContain("categories");
    expect(ids("gifts")).not.toContain("settings");
  });
  it("has unique ids, and an unknown role is the one with no permissions", () => {
    expect(new Set(ROLES.map((r) => r.id)).size).toBe(ROLES.length);
    expect(roleById("who").permissions).toEqual([]);
  });
});
