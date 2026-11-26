/**
 * projects-page.test.ts
 *
 * What it does: tests the Projects page and its form on invented projects: the table, the names the CRM uses, suggestions, and escaping.
 * Who calls it: vitest. Depends on: projects-page.ts and project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../modules/01c-crm-connector/feed";
import { addProject } from "../modules/06-projects/projects";
import type { View } from "./pages";
import { projectFormHtml } from "./project-form";
import { projectsPage } from "./projects-page";

const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, ...over });
const wo = (n: string) => ({ key: n, projectName: n, status: "ready", subscriptionId: "", instalmentCount: "", paidDate: "" }) as never;
const partners = addProject(addProject([], "Aghosh Orphan Homes").value, "Dadyal Orphan Complex").value;

describe("projectsPage", () => {
  it("starts with a New project button and says so when there are no projects", () => {
    const html = projectsPage(base());
    expect(html).toContain("No projects yet");
    expect(html).toContain('data-pj="new"');
  });
  it("lists the projects as a table with the Display Name, the fixed Original Name, partners in order and gifts, and warns of one with no partner", () => {
    const gps = [{ id: "aghosh", name: "Aghosh Homes", crmName: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes", "dadyal-orphan-complex"] }, { id: "empty", name: "Orphan Care Complex", crmName: "", crmNames: [], partnerIds: [] }];
    const html = projectsPage(base({ projects: partners, giftProjects: gps, workOrders: [wo("Aghosh"), wo("Aghosh"), wo("aghosh")] }));
    expect(html).toContain('data-pj="open" data-id="aghosh"');
    expect(html).toContain("<th>Display Name</th><th>Original Name</th>");
    expect(html).toContain("<b>Aghosh Homes</b>"); // the name shown in OUTCOMES
    expect(html).toContain('title="The CRM\'s own project name, fixed">Aghosh</span>'); // the CRM's own name, kept as it is
    expect(html).toContain("Not linked"); // a project made only in OUTCOMES
    for (const w of ["Aghosh Orphan Homes <span class=\"more\">+1</span>", "<td>3</td>", "No partner"]) expect(html).toContain(w); // one line: the first partner and how many more
    expect(html).toContain('title="1. Aghosh Orphan Homes\n2. Dadyal Orphan Complex"'); // the whole order is in the tooltip
    expect(html).toContain("<th title=");
    expect(html).toContain(">Partners / vendors</th>");
    expect(html).not.toContain("Vendors, in order");
    expect(html).toContain("Any benefit"); // no benefits listed offers any
    expect(html).toContain("A project with no partner makes its gifts wait");
    expect(html).not.toContain("Other CRM names");
  });
  it("shows an older project, with only a name, as linked to the CRM by that name", () => {
    expect(projectsPage(base({ giftProjects: [{ id: "o", name: "Hope for Palestine", crmNames: [], partnerIds: [] }] as never }))).toContain('fixed">Hope for Palestine</span>');
  });
  it("counts the gifts with no project on their own, and has no list of CRM names to put into projects any more", () => {
    const html = projectsPage(base({ projects: partners, giftProjects: [{ id: "a", name: "Aghosh", crmNames: [], partnerIds: [] }] as never, workOrders: [wo("Where Needed Most"), wo("Where Needed Most"), wo("Aghosh")] }));
    expect(html).toContain("Gifts with no project <span class=\"muted\">(2)</span>");
    expect(html).toContain("not a general fund");
    expect(html).not.toContain("Names the CRM uses");
    expect(html).not.toContain("data-crm-project");
  });
  it("shows the benefits a project offers by name (DECISIONS 154)", () => {
    const gps = [{ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: [], itemIds: ["I1", "I2"] }];
    const html = projectsPage(base({ giftProjects: gps, flaggedItems: [{ id: "I1", name: "Orphan Sponsorship", count: 1 }, { id: "I2", name: "Small Pump", count: 1 }] as never }));
    expect(html).toContain("Orphan Sponsorship, Small Pump");
  });
  it("marks a project made automatically, until a person saves it (DECISIONS 155)", () => {
    const html = projectsPage(base({ giftProjects: [{ id: "a", name: "Dadyal", crmNames: [], partnerIds: [], auto: true }, { id: "b", name: "Aghosh", crmNames: [], partnerIds: [] }] as never }));
    expect((html.match(/>automatic</g) ?? []).length).toBe(1);
  });
  it("never trusts a name as HTML", () => {
    const html = projectsPage(base({ giftProjects: [{ id: "x", name: "<img src=x onerror=alert(1)>", crmName: "<b>crm</b>", crmNames: [], partnerIds: [] }] }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>crm</b>");
    expect(html).toContain("&lt;img");
  });
});

describe("projectFormHtml", () => {
  const ctx = { crmNames: [{ name: "Aghosh", gifts: 22 }, { name: "Where Needed Most", gifts: 279 }], partners };
  it("asks for the Display Name, shows the Original Name fixed once there is one, and ticks the partners it has", () => {
    const html = projectFormHtml({ name: "Aghosh Homes", crmName: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"], notes: "A note" }, "aghosh", ctx);
    expect(html).toContain("Display Name");
    expect(html).toContain("Original Name (fixed)");
    expect(html).toContain('id="pr-name" value="Aghosh Homes"');
    expect(html).toContain('id="pr-crm-locked" value="Aghosh" readonly'); // the CRM name cannot be changed
    expect(html).not.toContain('id="pr-crm"'); // so there is no choice
    expect(html).toContain("cannot be changed");
    expect(html).not.toContain("CRM names"); // the old section is gone
    expect(html).not.toContain('class="pr-name"');
    expect(html).toContain("Partners / vendors");
    expect(html).not.toContain("<h3>Vendors</h3>");
    expect(html).toMatch(/class="pr-partner" value="aghosh-orphan-homes" checked/);
    expect(html).not.toMatch(/class="pr-partner" value="dadyal-orphan-complex" checked/);
    expect(html).toContain('data-pj="remove"');
  });
  it("lets a new project, or one not linked yet, be linked to a CRM name no project has, once", () => {
    const fresh = projectFormHtml({ name: "" }, "", ctx);
    expect(fresh).toContain('id="pr-crm"');
    expect(fresh).toContain('<option value="Aghosh">Aghosh (22)</option>');
    expect(fresh).toContain("Not linked to a CRM project");
    const unlinked = projectFormHtml({ name: "Mine", crmName: "", crmNames: [] }, "mine", ctx);
    expect(unlinked).toContain('id="pr-crm"');
    expect(unlinked).not.toContain("pr-crm-locked");
  });
  it("shows an older project's own name as its fixed Original Name", () => {
    expect(projectFormHtml({ name: "Hope", crmNames: [] }, "hope", ctx)).toContain('id="pr-crm-locked" value="Hope" readonly');
  });
  it("has no Remove button for a new project, shows an error, and never trusts text as HTML", () => {
    const html = projectFormHtml({ name: "<script>alert(1)</script>" }, "", ctx, "Give the project a name.");
    expect(html).not.toContain('data-pj="remove"');
    expect(html).toContain("Give the project a name.");
    expect(html).not.toContain("<script>");
  });
  it("shows two benefits and how many more on one line, with the whole list in the tooltip (decision 212)", () => {
    const gps = [{ id: "p", name: "Flood Relief", crmName: "Flood Relief", crmNames: [], partnerIds: [], itemIds: ["I1", "I2", "I3", "I4"] }];
    const html = projectsPage(base({ projects: [], giftProjects: gps, workOrders: [], flaggedItems: [{ id: "I1", name: "Water Tanker" }, { id: "I2", name: "Medical Camp" }, { id: "I3", name: "Build A Home" }, { id: "I4", name: "Rickshaw" }] as never }));
    expect(html).toContain(">Water Tanker, Medical Camp <span class=\"more\">+2</span>");
    expect(html).toContain('title="Water Tanker, Medical Camp, Build A Home, Rickshaw"');
  });
});

