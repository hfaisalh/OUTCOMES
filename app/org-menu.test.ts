/** org-menu.test.ts: the organisation switcher in the user menu of a platform administrator (decision 333). */
import { describe, expect, it } from "vitest";
import { orgMenu } from "./org-menu";

describe("the organisation switcher", () => {
  it("lists each organisation as a button, marks where you are, and labels a test organisation", () => {
    const html = orgMenu(["mwf", "mwf-test"], "mwf");
    expect(html).toContain("Platform administrator: switch organisation");
    expect(html).toContain('data-action="switch-org" data-org="mwf-test"');
    expect(html).toContain('aria-current="true">mwf (you are here)');
    expect(html).toContain("mwf-test · test");
  });
  it("shows nothing to anyone who has no organisations to switch to, and escapes a name", () => {
    expect(orgMenu(undefined, "mwf")).toBe("");
    expect(orgMenu([], "mwf")).toBe("");
    expect(orgMenu(["<b>x</b>"], "mwf")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
