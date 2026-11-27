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
import type { PartnerUi } from "./partner-outcomes";

const QUIET: PartnerUi = { refusing: null, message: "", error: "" };

const kid = (id: string, name: string, eligibility: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility, eligibilityNote: "", partnerId: "p1", partnerRef: "", memberIds: [], ...over } as Beneficiary);
const slice = (): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha <Trust>", reference: "R-1" },
  giftProjects: [{ id: "g1", name: "Orphan homes", itemIds: [], clusters: [{ id: "c", name: "Lahore", label: "Home", parentId: "", place: "", status: "active" }] }],
  beneficiaries: [kid("PRS-1", "Amina Khan", "ready", { targetProjectId: "g1" }), kid("PRS-2", "Bilal Ahmed", "review"), kid("PRS-3", "Chand Ali", "ready", { targetProjectId: "g1" })],
  enrolments: [{ id: "EN-1", beneficiaryId: "PRS-3", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }],
  assignments: [{ key: "sub:1", partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }],
  confirmations: [], progress: [], allocations: [], itemNames: { S: "Orphan Sponsorship Monthly" },
});

describe("the partner's home screen", () => {
  it("shows the figures, the children and the projects, and escapes names", () => {
    const html = partnerHomeHtml(slice(), "Sara", "v0.1.0 · abc123", QUIET);
    expect(html).toContain("Welcome, Alpha &lt;Trust&gt;");
    expect(html).toContain("<b>3</b><span>Beneficiaries</span>");
    expect(html).toContain("<b>1</b><span>Enrolled</span>");
    expect(html).toContain("<b>1</b><span>Waiting for a vacancy</span>");
    expect(html).toContain("<b>1</b><span>Need details</span>");
    expect(html).toContain('class="ver"');
    expect(html).toContain("v0.1.0 · abc123");
    expect(html).toContain("How outcomes work");
    expect(html).toContain("Orphan Sponsorship Monthly");
    expect(html).toContain("Orphan homes");
    expect(html).toContain('data-action="sign-out"');
    expect(html).not.toContain("<Trust>");
  });
  it("shows the project a child is enrolled in, or else the one it waits for", () => {
    const html = partnerHomeHtml(slice(), "Sara", "v0.1.0 · abc123", QUIET);
    expect(html).toContain("<td>PRS-3</td><td>Chand Ali</td><td>Orphan homes</td><td>Enrolled</td>");
    expect(html).toContain("<td>PRS-1</td><td>Amina Khan</td><td>Orphan homes</td><td>Ready</td>");
  });
  it("counts and lists households as beneficiaries too, so Enrolled is never more than Beneficiaries", () => {
    const s = slice();
    s.beneficiaries = [{ id: "HH-1", kind: "household", name: "Khan house", status: "active", memberIds: [] } as never];
    s.enrolments = [{ id: "EN-9", beneficiaryId: "HH-1", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }];
    const html = partnerHomeHtml(s, "Sara", "dev", QUIET);
    expect(html).toContain("<b>1</b><span>Beneficiaries</span>");
    expect(html).toContain("<b>1</b><span>Enrolled</span>");
    expect(html).toContain("Khan house <span class=\"muted\">Household</span>");
    expect(html).toContain("<b>0</b><span>Waiting for a vacancy</span>");
  });
  it("says so when there is nothing yet", () => {
    const empty = { ...slice(), beneficiaries: [], giftProjects: [], enrolments: [], assignments: [] };
    expect(partnerHomeHtml(empty, "Sara", "dev", QUIET)).toContain("No gift has been assigned to you yet");
    expect(partnerHomeHtml(empty, "Sara", "dev", QUIET)).toContain("No beneficiaries yet");
    expect(partnerHomeHtml(empty, "Sara", "dev", QUIET)).toContain("No project has been given to you yet");
  });
});

describe("answering a gift", () => {
  it("offers Accept and Refuse for each batch waiting, with the gift keys", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", QUIET);
    expect(html).toContain("Waiting for your answer");
    expect(html).toContain('data-action="pt-accept" data-keys="sub:1"');
    expect(html).toContain('data-action="pt-refuse" data-keys="sub:1"');
    expect(html).not.toContain("pt-reason");
  });
  it("shows the refusal form with its reason box, and an error or message safely", () => {
    const form = partnerHomeHtml(slice(), "Sara", "dev", { refusing: ["sub:1"], message: "", error: "Say <why>." });
    expect(form).toContain('id="pt-reason"');
    expect(form).toContain('data-action="pt-refuse-send"');
    expect(form).toContain('data-action="pt-refuse-cancel"');
    expect(form).toContain("Say &lt;why&gt;.");
    expect(partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, message: "Accepted." })).toContain("Accepted.");
  });
  it("offers batch buttons when several gifts wait in one batch", () => {
    const s = slice();
    s.assignments = [...s.assignments, { ...s.assignments[0]!, key: "sub:2" }];
    expect(partnerHomeHtml(s, "Sara", "dev", QUIET)).toContain('data-keys="sub:1|sub:2"');
  });
  it("shows nothing to answer when everything is answered", () => {
    const s = slice();
    s.confirmations = [{ key: "sub:1", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" }];
    expect(partnerHomeHtml(s, "Sara", "dev", QUIET)).not.toContain("Waiting for your answer");
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

describe("switching views while testing (DECISIONS 255)", () => {
  it("lists a button for each partner in the staff menu, escaping names", async () => {
    const { viewAsMenu } = await import("./view-as-menu");
    const html = viewAsMenu([{ id: "p1", name: "Alpha <Trust>" }, { id: "p2", name: "Beta" }]);
    expect(html).toContain('data-action="view-as" data-partner="p1">Alpha &lt;Trust&gt;');
    expect(html).toContain('data-partner="p2"');
    expect(viewAsMenu(undefined)).toBe("");
    expect(viewAsMenu([])).toBe("");
  });
  it("shows Back to staff and says it is a test only while looking as a partner", () => {
    const test = partnerHomeHtml(slice(), "Faisal", "dev", QUIET, true);
    expect(test).toContain('data-action="view-as" data-partner=""');
    expect(test).toContain("Testing as partner");
    const real = partnerHomeHtml(slice(), "Sara", "dev", QUIET);
    expect(real).not.toContain("Back to staff");
    expect(real).toContain(">Partner<");
  });
});
