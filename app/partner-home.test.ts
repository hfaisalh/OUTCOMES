/**
 * partner-home.test.ts
 *
 * What it does: tests the partner's home screen and the accounts card (DECISIONS 249, 250): the figures, the children list, no other partner's data, text never becoming HTML, and the accounts form posting to the server without ever showing a password.
 * Invented partner and children. Who calls it: vitest. Depends on: partner-home.ts, accounts-card.ts, pages.ts (signinNote).
 */
import { describe, expect, it } from "vitest";
import { accountsCard } from "./accounts-card";
import { partnerHomeHtml } from "./partner-home";
import { signinNote } from "./pages";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";
import type { Beneficiary } from "../modules/07-beneficiaries/beneficiaries";
import type { View } from "./pages";

const kid = (id: string, name: string, eligibility: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility, eligibilityNote: "", partnerId: "p1", partnerRef: "", memberIds: [], ...over } as Beneficiary);
const slice = (): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha <Trust>", reference: "R-1" },
  giftProjects: [{ id: "g1", name: "Orphan homes", itemIds: [], clusters: [{ id: "c", name: "Lahore", label: "Home", parentId: "", place: "", status: "active" }] }],
  beneficiaries: [kid("PRS-1", "Amina Khan", "ready", { targetProjectId: "g1" }), kid("PRS-2", "Bilal Ahmed", "review"), kid("PRS-3", "Chand Ali", "ready", { targetProjectId: "g1" })],
  enrolments: [{ id: "EN-1", beneficiaryId: "PRS-3", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }],
  assignments: [{ key: "sub:1", partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }],
  confirmations: [], progress: [], placements: [],
});

describe("the partner's home screen", () => {
  it("shows the figures, the children and the projects, and escapes names", () => {
    const html = partnerHomeHtml(slice(), "Sara");
    expect(html).toContain("Welcome, Alpha &lt;Trust&gt;");
    expect(html).toContain("<b>3</b><span>Children</span>");
    expect(html).toContain("<b>1</b><span>Enrolled</span>");
    expect(html).toContain("<b>1</b><span>Waiting for a vacancy</span>");
    expect(html).toContain("<b>1</b><span>Need details</span>");
    expect(html).toContain("<b>1</b><span>Gifts to answer</span>");
    expect(html).toContain("Orphan homes");
    expect(html).toContain('data-action="sign-out"');
    expect(html).not.toContain("<Trust>");
  });
  it("shows the project a child is enrolled in, or else the one it waits for", () => {
    const html = partnerHomeHtml(slice(), "Sara");
    expect(html).toContain("<td>PRS-3</td><td>Chand Ali</td><td>Orphan homes</td><td>Enrolled</td>");
    expect(html).toContain("<td>PRS-1</td><td>Amina Khan</td><td>Orphan homes</td><td>Ready</td>");
  });
  it("says so when there is nothing yet", () => {
    const empty = { ...slice(), beneficiaries: [], giftProjects: [], enrolments: [], assignments: [] };
    expect(partnerHomeHtml(empty, "Sara")).toContain("No children yet");
    expect(partnerHomeHtml(empty, "Sara")).toContain("No project has been given to you yet");
  });
});

describe("the sign-in accounts card", () => {
  const view = (over: Partial<View> = {}): View => ({ live: true, logins: [{ email: "sara@alpha.org", name: "Sara", role: "partner", partnerId: "p1" }], projects: [{ id: "p1", name: "Alpha Trust" }], ...over } as unknown as View);
  it("lists accounts with what each signs in as, and posts the forms to the server", () => {
    const html = accountsCard(view());
    expect(html).toContain("sara@alpha.org");
    expect(html).toContain("Partner: Alpha Trust");
    expect(html).toContain('value="login-add"');
    expect(html).toContain('value="login-remove"');
    expect(html).toContain('type="password" name="password"');
    expect(html).not.toMatch(/hash|scrypt/);
  });
  it("is not shown without the right to change settings, or in the demo", () => {
    expect(accountsCard(view({ logins: undefined }))).toBe("");
    expect(accountsCard(view({ live: false }))).toBe("");
  });
  it("turns the address notes into plain sentences", () => {
    expect(signinNote("?signin=wrong-login")).toContain("email or password");
    expect(signinNote("?signin=wrong")).toContain("passphrase");
    expect(signinNote("?account=That%20email%20already%20has%20an%20account.")).toBe("That email already has an account.");
    expect(signinNote("")).toBe("");
  });
});
