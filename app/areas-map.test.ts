/**
 * areas-map.test.ts
 *
 * What it does: tests that the real map does nothing, and does not fail, where there is no page (the tests) or nothing to show.
 * Who calls it: vitest. Depends on: areas-map.ts. The map itself is checked in a browser.
 */
import { describe, expect, it } from "vitest";
import { mountAreasMap } from "./areas-map";

describe("the real map", () => {
  it("does nothing, and does not throw, when there is no page to put it in", async () => {
    await expect(mountAreasMap()).resolves.toBeUndefined();
  });
});
