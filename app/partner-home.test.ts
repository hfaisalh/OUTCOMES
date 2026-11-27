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

const QUIET: PartnerUi = { open: [], details: [], lastOpened: "", refusing: null, form: null, csv: null, message: "", error: "" };

const kid = (id: string, name: string, eligibility: string, over: Partial<Beneficiary> = {}): Beneficiary => ({ id, kind: "person", name, status: "active", area: "", notes: "", dob: "", gender: "", guardian: "", guardianRelation: "", placeOfBirth: "", idNumber: "", fatherStatus: "", motherStatus: "", eligibility, eligibilityNote: "", partnerId: "p1", partnerRef: "", memberIds: [], ...over } as Beneficiary);
const slice = (): PartnerSlice => ({
  partner: { id: "p1", name: "Alpha <Trust>", reference: "R-1" },
  giftProjects: [{ id: "g1", name: "Orphan homes", itemIds: [], clusters: [{ id: "c", name: "Lahore", label: "Home", parentId: "", place: "", status: "active" }] }],
  beneficiaries: [kid("PRS-1", "Amina Khan", "ready", { targetProjectId: "g1" }), kid("PRS-2", "Bilal Ahmed", "review"), kid("PRS-3", "Chand Ali", "ready", { targetProjectId: "g1" })],
  enrolments: [{ id: "EN-1", beneficiaryId: "PRS-3", giftProjectId: "g1", clusterId: "c", itemId: "S", role: "", status: "active", since: "2026-11-01" }],
  assignments: [{ key: "sub:1", partnerId: "p1", giftProjectId: "g1", itemId: "S", parts: 1, how: "auto", at: "2026-11-02T00:00:00Z" }],
  confirmations: [], progress: [], allocations: [], itemNames: { S: "Orphan Sponsorship Monthly" },
  gifts: { "sub:1": { reference: "sub:1", recurring: true, units: 2, planned: 12, paid: 3, cause: "Orphans", intention: "", tribute: "For my mother <Aisha>", phases: [{ label: "Visit the home", days: 7 }], review: true, feedback: false, answerBy: "2026-11-05" } },
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
    expect(partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, open: ["none"] })).toContain("Orphan Sponsorship Monthly"); // a batch shows its gifts when opened
    expect(html).toContain("Orphan homes");
    expect(html).toContain('data-action="sign-out"');
    expect(html).not.toContain("<Trust>");
  });
  it("shows the project a child is enrolled in, or else the one it waits for", () => {
    const html = partnerHomeHtml(slice(), "Sara", "v0.1.0 · abc123", QUIET);
    expect(html).toContain('<td>PRS-3</td><td>Chand Ali</td><td>Orphan homes</td><td><span class="pill blue">Enrolled</span></td>');
    expect(html).toContain('<td>PRS-1</td><td>Amina Khan</td><td>Orphan homes</td><td><span class="pill ready">On the waiting list</span></td>');
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
    expect(html).toContain("Your batches");
    expect(html).toContain('data-action="pt-accept" data-keys="sub:1"');
    expect(html).toContain('data-action="pt-refuse" data-keys="sub:1"');
    expect(html).not.toContain("pt-reason");
  });
  it("shows the refusal form with its reason box, and an error or message safely", () => {
    const form = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, refusing: ["sub:1"], error: "Say <why>." });
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
  it("offers no Accept or Refuse once everything is answered, but still lists the batch", () => {
    const s = slice();
    s.confirmations = [{ key: "sub:1", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" }];
    const html = partnerHomeHtml(s, "Sara", "dev", QUIET);
    expect(html).toContain("Gifts without a batch");
    expect(html).not.toContain('data-action="pt-accept"');
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

describe("the batch list opens to show what is in a batch (DECISIONS 256)", () => {
  const two = (): PartnerSlice => {
    const s = slice();
    const g = (key: string, batch: number) => ({ ...s.assignments[0]!, key, batch });
    s.assignments = [g("sub:1", 1), g("sub:2", 1), g("sub:3", 2)];
    s.confirmations = [{ key: "sub:3", partnerId: "p1", answer: "confirmed", at: "x", by: "A", reason: "" }];
    return s;
  };
  it("shows each batch closed, with a summary, an accessible toggle and no gifts listed below", () => {
    const html = partnerHomeHtml(two(), "Sara", "dev", QUIET);
    expect(html).toContain('data-action="pt-toggle" data-batch="1" aria-expanded="false" aria-controls="pb-body-1"');
    expect(html).toContain("2 gifts");
    expect(html).toContain("2 to answer");
    expect(html).toContain("1 confirmed");
    expect(html).not.toContain('id="pb-body-1"'); // closed: the gifts are not shown
    expect(html).not.toContain("Your gifts and outcomes"); // and not listed again in a long table below
  });
  it("puts the batch waiting for an answer first, and offers the whole batch Accept all and Refuse all", () => {
    const html = partnerHomeHtml(two(), "Sara", "dev", QUIET);
    expect(html.indexOf("Batch 1")).toBeLessThan(html.indexOf("Batch 2"));
    expect(html).toContain('data-action="pt-accept" data-keys="sub:1|sub:2">Accept all');
    expect(html).toContain("Refuse all");
  });
  it("opens a batch to its gifts, with an answer for each waiting gift, and marks only the one just opened to fade in", () => {
    const html = partnerHomeHtml(two(), "Sara", "dev", { ...QUIET, open: ["1"], lastOpened: "1" });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="pb-body-1" role="region" aria-label="Gifts in Batch 1"');
    expect(html).toContain("pb-in");
    expect(html).toContain('data-action="pt-accept" data-keys="sub:2">Accept</button>');
    expect(partnerHomeHtml(two(), "Sara", "dev", { ...QUIET, open: ["1"] })).not.toContain("pb-in");
  });
  it("puts the reason box for one gift directly under that gift, and for a whole batch at the top of the batch", () => {
    const one = partnerHomeHtml(two(), "Sara", "dev", { ...QUIET, refusing: ["sub:1"] });
    expect(one).toContain("Why can you not take this gift?");
    const rowOne = one.indexOf('<tr class="refusing">');
    expect(rowOne).toBeGreaterThan(-1);
    expect(one.indexOf('id="pt-reason"')).toBeGreaterThan(rowOne); // after the refused gift's row
    expect(one.indexOf('id="pt-reason"')).toBeLessThan(one.indexOf("</tbody>", rowOne)); // and still inside the table, before the next gift ends it
    expect(one.match(/id="pt-reason"/g)).toHaveLength(1);
    const all = partnerHomeHtml(two(), "Sara", "dev", { ...QUIET, refusing: ["sub:1", "sub:2"] });
    expect(all.indexOf('id="pt-reason"')).toBeLessThan(all.indexOf("<table"));
    expect(all).not.toContain('<tr class="refusing">');
  });
  it("opens the batch a refusal belongs to, so its reason box is never out of sight", () => {
    const html = partnerHomeHtml(two(), "Sara", "dev", { ...QUIET, refusing: ["sub:1", "sub:2"] });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Why can you not take these 2 gifts?");
    expect(html.indexOf('id="pt-reason"')).toBeGreaterThan(html.indexOf('id="pb-body-1"'));
  });
});

describe("seeing what a gift is before accepting it (DECISIONS 259)", () => {
  it("makes the benefit a button that opens the gift's details, closed at first", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, open: ["none"] });
    expect(html).toContain('data-action="pt-details" data-key="sub:1" aria-expanded="false" aria-controls="gd-sub:1"');
    expect(html).not.toContain('class="gd"');
  });
  it("shows the details when opened: reference, units, recurring progress, cause, tribute, phases and the answer-by day", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, open: ["none"], details: ["sub:1"] });
    expect(html).toContain('aria-expanded="true" aria-controls="gd-sub:1"');
    expect(html).toContain("<dt>Gift reference</dt><dd>sub:1</dd>");
    expect(html).toContain("<dt>Units to deliver</dt><dd>2</dd>");
    expect(html).toContain("Recurring: 3 of 12 payments made");
    expect(html).toContain("<dt>Cause</dt><dd>Orphans</dd>");
    expect(html).toContain("For my mother &lt;Aisha&gt;"); // the tribute is shown from the start, escaped
    expect(html).toContain("Visit the home");
    expect(html).toContain("MWF reviews the work");
    expect(html).not.toContain("the donor is asked for feedback");
    expect(html).toContain("<dt>Answer by</dt><dd>05/11/26</dd>");
  });
  it("says Not given for an empty fact, so a gap is never hidden, and shows the first answer-by day on the batch row", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, open: ["none"], details: ["sub:1"] });
    expect(html).toContain("<dt>Intention</dt><dd><span class=\"muted\">Not given</span></dd>");
    expect(html).toContain("answer by 05/11/26");
  });
});

describe("adding and completing beneficiaries (DECISIONS 260)", () => {
  it("offers Add beneficiary, and an Edit for each person but not for a household", () => {
    const s = slice();
    s.beneficiaries = [...s.beneficiaries, { id: "HH-1", kind: "household", name: "Khan house", status: "active", memberIds: [] } as never];
    const html = partnerHomeHtml(s, "Sara", "dev", QUIET);
    expect(html).toContain('data-action="pt-add"');
    expect(html).toContain('data-action="pt-edit" data-id="PRS-1" aria-label="Edit Amina Khan"');
    expect(html).not.toContain('data-id="HH-1"');
    expect(html).not.toContain('id="pe-form"'); // closed at first
  });
  it("says what a record still needs, in words, so the partner knows what to add", () => {
    const s = slice();
    s.beneficiaries = [kid("PRS-2", "Bilal Ahmed", "review", { guardian: "", idNumber: "", dob: "2015-01-01" })];
    expect(partnerHomeHtml(s, "Sara", "dev", QUIET)).toContain('<span class="pill unrouted">Needs details</span><div class="muted">Add guardian, ID number</div>');
  });
  it("opens the form as a pop-up window with a title, Close, and Cancel and Save in the footer", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, form: { id: "", values: {}, error: "", similar: false, fresh: true } });
    expect(html).toContain('class="pf-overlay pe-in" role="dialog" aria-modal="true" aria-labelledby="pe-title"');
    expect(html).toContain('<h2 id="pe-title">Add a beneficiary</h2>');
    expect(html).toContain('data-action="pt-form-cancel" aria-label="Close">Close</button>');
    expect(html).toContain('data-action="pt-form-cancel">Cancel</button><button type="button" class="primary" data-action="pt-form-save">Add beneficiary</button></footer>');
    expect(partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, form: { id: "", values: {}, error: "", similar: false } })).not.toContain("pe-in"); // not eased in again on a redraw
    expect(partnerHomeHtml(slice(), "Sara", "dev", QUIET)).not.toContain('role="dialog"'); // closed at first
  });
  it("opens the form with a visible label for every field, the required ones marked, and the projects to choose from", () => {
    const html = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, form: { id: "", values: {}, error: "", similar: false } });
    expect(html).toContain('id="pe-form"');
    for (const label of ["Name", "Date of birth", "Gender", "National ID or B-form number", "Father", "Mother", "Parent or guardian", "Meant for project", "Area", "Your own reference"]) expect(html).toContain(label);
    expect(html).toContain('id="pe-name" value="" autocomplete="off" required');
    expect(html).toContain('id="pe-dob" value="" autocomplete="off" type="date"');
    expect(html).toContain('<option value="g1" selected>Orphan homes</option>'); // one project: chosen for them
    const form = html.slice(html.indexOf('<form class="pe"'), html.indexOf("</form>"));
    expect(form).not.toMatch(/eligib|priorit|id="pe-status|id="pe-notes/i); // MWF's decisions are never asked
    expect(html).toContain('data-action="pt-form-cancel"');
  });
  it("fills the form with what was saved when editing, and keeps what was typed after an error, announced and with the same-person box only for a possible match", () => {
    const edit = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, form: { id: "PRS-1", values: { name: "Amina <Khan>", guardian: "A mother" }, error: "", similar: false } });
    expect(edit).toContain('<h2 id="pe-title">Complete this beneficiary</h2>');
    expect(edit).toContain('id="pe-name" value="Amina &lt;Khan&gt;"');
    expect(edit).toContain(">Save</button>");
    expect(edit).not.toContain('id="pe-different"');
    const dup = partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, form: { id: "", values: { name: "Amina Khan" }, error: "Possible match: Amina Khan (PRS-1).", similar: true } });
    expect(dup).toContain('id="pe-error" class="pf-error" role="alert" tabindex="-1">Possible match: Amina Khan (PRS-1).');
    expect(dup).toContain('id="pe-different"');
  });
  it("tells a partner with no project that it needs one first, and shows the saved message", () => {
    const s = slice();
    s.giftProjects = [];
    expect(partnerHomeHtml(s, "Sara", "dev", QUIET)).toContain("once MWF gives you a project to deliver");
    expect(partnerHomeHtml(slice(), "Sara", "dev", { ...QUIET, message: "Added Amina Khan (PRS-1). Enrolled in Orphan homes." })).toContain('role="status">Added Amina Khan (PRS-1). Enrolled in Orphan homes.');
  });
});
