/**
 * projects-page.test.ts
 *
 * What it does: tests the Projects page and its form on invented projects: the table, the names the CRM uses, suggestions, and escaping.
 * Who calls it: vitest. Depends on: projects-page.ts and project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { MWF_CRM_CONFIG } from "../../modules/01c-crm-connector/feed";
import { addProject } from "../../modules/06-projects/projects";
import type { View } from "../shared/pages";
import { projectFormHtml } from "./project-form";
import { projectsPage } from "./projects-page";

const base = (over: Partial<View> = {}): View => ({ workOrders: [], review: [], itemCategories: {} as Record<string, string>, flaggedItems: [], filter: "all", message: "", config: MWF_CRM_CONFIG, categories: [], suggestions: {}, selectedItem: "", live: false, canPickup: false, run: null, ...over });
const wo = (n: string) => ({ key: n, projectName: n, status: "ready", subscriptionId: "", instalmentCount: "", paidDate: "" }) as never;
const partners = addProject(addProject([], "Aghosh Orphan Homes").value, "Dadyal Orphan Complex").value;

describe("the Projects page figures and tiles (DECISIONS 245)", () => {
  const cluster = (id: string, capacity?: number) => ({ id, name: id, label: "", parentId: "", place: "", status: "active" as const, ...(capacity !== undefined ? { capacity } : {}) });
  const enrol = (id: string, who: string, project: string, cl: string) => ({ id, beneficiaryId: who, giftProjectId: project, clusterId: cl, itemId: "I1", role: "", status: "active" as const, since: "2026-09-01" });
  const gps = [
    { id: "a", name: "Aghosh", crmNames: [], partnerIds: ["x"], clusters: [cluster("h1", 3)] },
    { id: "b", name: "Dadyal", crmNames: [], partnerIds: ["x"], clusters: [cluster("h2", 1)] },
    { id: "c", name: "Auto one", crmNames: [], partnerIds: [], auto: true },
  ] as never;
  const view = (f?: View["pjFilter"]) => base({ giftProjects: gps, enrolments: { records: [enrol("1", "P1", "a", "h1"), enrol("2", "P2", "a", "h1"), enrol("3", "P3", "b", "h2")], counter: 3 }, ...(f ? { pjFilter: f } : {}) });
  it("counts people, capacity and what is vacant for each project", () => {
    const html = projectsPage(view());
    expect(html).toMatch(/<b>Aghosh<\/b>.*?<td class="num">2<\/td><td class="num">1<\/td>.*?<td class="num">3<\/td><td class="num" title="2 of 3 enrolled">1<\/td>/s); // 2 people, 1 cluster, 3 places, 1 vacant
    expect(html).toContain('class="num full" title="1 of 1 enrolled">0</td>'); // Dadyal is full
  });
  it("has four tiles that filter the list", () => {
    const html = projectsPage(view());
    expect(html).toContain('data-tile="pj:all" aria-pressed="true"><b>3</b><span>Projects</span>');
    expect(html).toContain('metric tile warn" data-tile="pj:setup" aria-pressed="false"><b>1</b><span>Need set-up</span>');
    expect(html).toContain('data-tile="pj:vacant" aria-pressed="false"><b>1</b><span>With vacancies</span>');
    expect(html).toContain('metric tile warn" data-tile="pj:full" aria-pressed="false"><b>1</b><span>Full</span>');
    const full = projectsPage(view("full"));
    expect(full).toContain("<b>Dadyal</b>");
    expect(full).not.toContain("<b>Aghosh</b>");
    expect(projectsPage(view("setup"))).toContain("<b>Auto one</b>");
    expect(projectsPage(base({ giftProjects: [] }))).not.toContain("data-tile"); // no tiles when there are no projects
  });
});

describe("projectsPage", () => {
  it("starts with a New project button and says so when there are no projects", () => {
    const html = projectsPage(base());
    expect(html).toContain("No projects yet");
    expect(html).toContain('data-pj="new"');
  });
  it("lists each project as one line of figures, with the CRM name in a tooltip and the partners in order in another (DECISIONS 245)", () => {
    const gps = [{ id: "aghosh", name: "Aghosh Homes", crmName: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes", "dadyal-orphan-complex"] }, { id: "empty", name: "Orphan Care Complex", crmName: "", crmNames: [], partnerIds: [] }];
    const html = projectsPage(base({ projects: partners, giftProjects: gps, workOrders: [wo("Aghosh"), wo("Aghosh"), wo("aghosh")] }));
    expect(html).toContain('data-pj="open" data-id="aghosh"');
    expect(html).toContain("<th>Display Name</th><th>Status</th>");
    for (const h of [">Gifts</th>", ">Enrolled</th>", ">Clusters</th>", ">Benefits</th>", ">Partners</th>", ">Capacity</th>", ">Vacancies</th>", ">Waiting</th>", ">Roles</th>"]) expect(html).toContain(h);
    expect(html).not.toContain("Original Name</th>"); // the CRM name is in a tooltip now
    expect(html).not.toContain("Partners / vendors</th>");
    expect(html).toContain("<b>Aghosh Homes</b>"); // the name shown in OUTCOMES
    expect(html).toContain("The CRM&#39;s own project name, fixed: Aghosh"); // the CRM's own name, kept as it is
    expect(html).toContain("Not linked to a CRM project"); // a project made only in OUTCOMES
    expect(html).toContain('<td class="num">3</td>'); // the gifts the CRM names for it
    expect(html).toContain('title="1. Aghosh Orphan Homes\n2. Dadyal Orphan Complex">2</td>'); // two partners, the whole order in the tooltip
    expect(html).toContain("No partner"); // a project nobody delivers
    expect(html).toContain('<span class="pill ready">Ready</span>');
    expect(html).toContain("Any"); // no benefits listed offers any
    expect(html).toContain("A project with no partner makes its gifts wait");
    expect(html).not.toContain("Other CRM names");
  });
  it("shows an older project, with only a name, as linked to the CRM by that name", () => {
    expect(projectsPage(base({ giftProjects: [{ id: "o", name: "Hope for Palestine", crmNames: [], partnerIds: [] }] as never }))).toContain("fixed: Hope for Palestine");
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
  it("marks a project made automatically as needing set-up, until a person saves it (DECISIONS 155)", () => {
    const html = projectsPage(base({ projects: partners, giftProjects: [{ id: "a", name: "Dadyal", crmNames: [], partnerIds: ["aghosh-orphan-homes"], auto: true }, { id: "b", name: "Aghosh", crmNames: [], partnerIds: ["aghosh-orphan-homes"] }] as never }));
    expect((html.match(/>Needs set-up</g) ?? []).length).toBe(1); // the one automatic project
    expect((html.match(/>Ready</g) ?? []).length).toBe(1);
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
  it("shows how many benefits a project offers, with the names in the tooltip, and never a list that wraps (decision 212, 245)", () => {
    const gps = [{ id: "p", name: "Flood Relief", crmName: "Flood Relief", crmNames: [], partnerIds: [], itemIds: ["I1", "I2", "I3", "I4"] }];
    const html = projectsPage(base({ projects: [], giftProjects: gps, workOrders: [], flaggedItems: [{ id: "I1", name: "Water Tanker" }, { id: "I2", name: "Medical Camp" }, { id: "I3", name: "Build A Home" }, { id: "I4", name: "Rickshaw" }] as never }));
    expect(html).toContain('title="Water Tanker, Medical Camp, Build A Home, Rickshaw">4</td>');
  });
});

