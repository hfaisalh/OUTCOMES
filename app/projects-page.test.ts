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
  it("lists the projects as a table with their other CRM names, their partners and their gifts, and warns of one with no partner", () => {
    const gps = [{ id: "aghosh", name: "Aghosh", crmNames: ["Aghosh Lahore"], partnerIds: ["aghosh-orphan-homes", "dadyal-orphan-complex"] }, { id: "empty", name: "Orphan Care Complex", crmNames: [], partnerIds: [] }];
    const html = projectsPage(base({ projects: partners, giftProjects: gps, workOrders: [wo("Aghosh"), wo("Aghosh"), wo("Aghosh Lahore")] }));
    expect(html).toContain('data-pj="open" data-id="aghosh"');
    for (const w of ["Aghosh Lahore", "1. Aghosh Orphan Homes<br>2. Dadyal Orphan Complex", "<td>3</td>", "No vendor"]) expect(html).toContain(w); // vendors in their priority order
    expect(html).toContain("Any benefit"); // no benefits listed offers any
    expect(html).toContain("A project with no vendor makes its gifts wait");
  });
  it("lists the names the CRM uses, lets each be put in a project, and suggests one that shares a word", () => {
    const gps = [{ id: "aghosh", name: "Aghosh Orphan Homes", crmNames: [], partnerIds: [] }];
    const html = projectsPage(base({ projects: partners, giftProjects: gps, workOrders: [wo("Where Needed Most"), wo("Where Needed Most"), wo("Aghosh Girls Home"), wo("Hope for Palestine")] }));
    expect(html).toContain("Names the CRM uses");
    expect(html).not.toContain('data-crm-project="Where Needed Most"'); // it is not a project, so it is not listed
    expect(html).toContain("Gifts with no project <span class=\"muted\">(2)</span>"); // counted on its own, not as a project
    expect(html).toContain("not a general fund");
    expect(html).toContain("<option value=\"\">No project</option>");
    expect(html).not.toContain("(general)");
    expect(html).toContain('data-action="assign-crm" data-name="Aghosh Girls Home" data-project="aghosh"');
    expect(html).toContain("Use 1 suggestion");
    expect(html).toContain('data-pj="from-name" data-name="Hope for Palestine"'); // a name with no project and no suggestion can start one
  });
  it("shows the benefits a project offers by name, and offers one-click Create project beside a name with no project, carrying the items seen on its gifts (DECISIONS 154)", () => {
    const gps = [{ id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: [], itemIds: ["I1", "I2"] }];
    const html = projectsPage(base({ giftProjects: gps, flaggedItems: [{ id: "I1", name: "Orphan Sponsorship", count: 1 }, { id: "I2", name: "Small Pump", count: 1 }] as never, workOrders: ["I2", "I2", "I1"].map((itemId, n) => ({ key: `k${n}`, projectName: "Hope for Palestine", itemId, status: "ready", subscriptionId: "", instalmentCount: "", paidDate: "" })) as never }));
    expect(html).toContain("Orphan Sponsorship, Small Pump"); // the benefits offered
    expect(html).toContain('data-pj="create-now" data-name="Hope for Palestine" data-items="I2,I1"');
  });
  it("marks a project made automatically, until a person saves it (DECISIONS 155)", () => {
    const html = projectsPage(base({ giftProjects: [{ id: "a", name: "Dadyal", crmNames: [], partnerIds: [], auto: true }, { id: "b", name: "Aghosh", crmNames: [], partnerIds: [] }] as never }));
    expect((html.match(/>automatic</g) ?? []).length).toBe(1);
  });
  it("says so when no gift carries a project name, and never trusts a name as HTML", () => {
    expect(projectsPage(base())).toContain("No gifts carry a project name yet");
    const html = projectsPage(base({ giftProjects: [{ id: "x", name: "<img src=x onerror=alert(1)>", crmNames: [], partnerIds: [] }] }));
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("projectFormHtml", () => {
  const ctx = { crmNames: [{ name: "Aghosh", gifts: 22 }, { name: "Where Needed Most", gifts: 279 }], partners };
  it("asks for a name, ticks the CRM names and partners it has, and offers the real CRM names and every partner", () => {
    const html = projectFormHtml({ name: "Aghosh", crmNames: ["Aghosh", "Aghosh Lahore"], partnerIds: ["aghosh-orphan-homes"], notes: "A note" }, "aghosh", ctx);
    expect(html).toContain('value="Aghosh"');
    expect(html).toMatch(/class="pr-name" value="Aghosh" checked/);
    expect(html).not.toMatch(/class="pr-name" value="Where Needed Most" checked/);
    expect(html).toContain("Aghosh Lahore"); // a name the CRM does not have yet is kept
    expect(html).toMatch(/class="pr-partner" value="aghosh-orphan-homes" checked/);
    expect(html).not.toMatch(/class="pr-partner" value="dadyal-orphan-complex" checked/);
    expect(html).toContain("(279)");
    expect(html).toContain('data-pj="remove"');
  });
  it("has no Remove button for a new project, shows an error, and never trusts text as HTML", () => {
    const html = projectFormHtml({ name: "<script>alert(1)</script>" }, "", ctx, "Give the project a name.");
    expect(html).not.toContain('data-pj="remove"');
    expect(html).toContain("Give the project a name.");
    expect(html).not.toContain("<script>");
  });
});
