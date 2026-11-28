/**
 * partner-profile.test.ts
 *
 * What it does: tests the partner's profile card and form (DECISIONS 281). Invented partner.
 * Who calls it: vitest. Depends on: partner-profile.ts.
 */
import { describe, expect, it } from "vitest";
import { profileCardHtml, profileFormHtml, profileFormOf } from "./partner-profile";
import type { PartnerSlice } from "../../modules/13-partner-portal/scope";

const slice = { partner: { id: "p1", name: "Alpha", reportVia: "Email", language: "Urdu <b>", contacts: [{ name: "Amina Khan", position: "Director", phone: "1", mobile: "", email: "a@example.org", handles: "" }] } } as unknown as PartnerSlice;

describe("the partner's profile card and form", () => {
  it("shows what the partner may see, escaped, with its contacts and a Change button", () => {
    const html = profileCardHtml(slice, null, "");
    expect(html).toContain("Urdu &lt;b&gt;");
    expect(html).toContain("Amina Khan");
    expect(html).toContain('data-action="pt-profile-edit"');
  });
  it("opens the form from the profile, with one spare contact row, labelled fields and the error under it", () => {
    const f = profileFormOf(slice.partner);
    expect(f.contacts).toHaveLength(1);
    const html = profileFormHtml({ ...f, error: "An email address is not written correctly." });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="pp-c0-name" value="Amina Khan"');
    expect(html).toContain('id="pp-c1-name" value=""'); // the spare row
    expect(html).not.toContain('id="pp-c2-name"');
    expect(html).toContain('role="alert" tabindex="-1">An email address');
    expect(html).toContain("MWF keeps the rest");
  });
  it("offers no spare row once there are five contacts", () => {
    const five = { ...profileFormOf(slice.partner), contacts: Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, position: "", phone: "", email: "" })) };
    expect(profileFormHtml(five)).not.toContain('id="pp-c5-name"');
  });
});
