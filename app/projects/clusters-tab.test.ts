/**
 * clusters-tab.test.ts
 *
 * What it does: tests the Clusters tab of the project window (DECISIONS 158): the clusters first, sub clusters in a drop down list, a + to add inside, capacity on the top cluster, and that names are never trusted as HTML.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: clusters-tab.ts and project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { closedClusters, clusterUi, clustersTabHtml } from "./clusters-tab";
import { projectFormHtml } from "./project-form";
import type { ClusterState } from "../../modules/06-projects/clusters";

const home: ClusterState = {
  clusters: [
    { id: "lahore-university", name: "Lahore University", label: "University", parentId: "", place: "Lahore", capacity: 40, status: "active", roles: ["Principal"] },
    { id: "science", name: "Science", label: "Faculty", parentId: "lahore-university", place: "Block 2", status: "closed" },
    { id: "physics", name: "Physics", label: "Department", parentId: "science", place: "", status: "active" },
    { id: "arts", name: "Arts", label: "Faculty", parentId: "lahore-university", place: "", status: "active" },
  ],
};

const reset = (): void => { closedClusters.clear(); clusterUi.adding = ""; clusterUi.node = ""; clusterUi.nodeTab = "details"; clusterUi.notice = ""; };

describe("the Clusters tab, the tree", () => {
  it("shows every cluster as a tree, a sub cluster under the one it is in, with hierarchy lines and a folder icon on those that hold others", () => {
    reset();
    const html = clustersTabHtml(home);
    expect(html.indexOf('data-id="lahore-university"')).toBeLessThan(html.indexOf('data-id="science"'));
    expect(html.indexOf('data-id="science"')).toBeLessThan(html.indexOf('data-id="physics"'));
    expect(html).toContain('class="tl end"'); // the last of its brothers and sisters ends with an elbow
    expect(html).toContain('class="tl mid"'); // one with more after it has a tee
    const more: ClusterState = { clusters: [...home.clusters, { id: "painting", name: "Painting", label: "Department", parentId: "arts", place: "", status: "active" }] };
    expect(clustersTabHtml(more)).toContain('class="tl v"'); // a line carries on past a faculty that has more below it (Arts comes before Science)
    expect(html).toContain("Clusters <span class=\"muted\">(4)</span>");
    expect(html).toContain('data-cl="expand-all"');
  });
  it("draws a top cluster with no lines, and a deeper one with one more column of line for each level", () => {
    reset();
    const html = clustersTabHtml(home);
    const row = (id: string): string => html.split("<tr").find((r) => r.includes(`data-cl="goto" data-id="${id}"`)) ?? "";
    expect(row("lahore-university")).not.toContain("tls");
    expect((row("science").match(/class="tl[ "]/g) ?? []).length).toBe(1);
    expect((row("physics").match(/class="tl[ v"]/g) ?? []).length).toBe(2);
  });
  it("closes a folder to hide what is inside it, and every folder is open until closed", () => {
    reset();
    expect(clustersTabHtml(home)).toContain('data-id="physics"');
    expect(clustersTabHtml(home)).toContain('data-cl="toggle" data-id="science" aria-expanded="true"');
    closedClusters.add("science");
    const closed = clustersTabHtml(home);
    expect(closed).not.toContain('data-cl="goto" data-id="physics"');
    expect(closed).toContain('data-cl="toggle" data-id="science" aria-expanded="false"');
    closedClusters.add("lahore-university");
    expect(clustersTabHtml(home)).not.toContain('data-cl="goto" data-id="science"');
    reset();
  });
  it("gives each row a settings gear drawn as an icon, a + to add inside, and a remove, and sets capacity on the top cluster only", () => {
    reset();
    const html = clustersTabHtml(home);
    expect(html).toMatch(/class="iconact gear" data-cl="goto" data-id="physics"[^>]*><svg/);
    expect(html).toContain('data-cl="sub-open" data-id="science"');
    expect(html).toContain('data-cl="cluster-rm" data-id="science"');
    expect(html).toContain('<td class="num">40</td>'); // the total on the top cluster
    expect(html).toContain("about 20"); // a sub cluster's even share
    expect(html).not.toContain('data-cl="capacity"'); // no input boxes in the rows
  });
  it("adds a sub cluster from an inline row under the cluster whose + was pressed, suggested the label its sisters use", () => {
    reset();
    expect(clustersTabHtml(home)).not.toContain('id="cl-sname"');
    clusterUi.adding = "lahore-university";
    const html = clustersTabHtml(home);
    expect(html).toContain('id="cl-sname"');
    expect(html).toContain('id="cl-slabel" list="cl-labels" value="Faculty"');
    expect(html).toContain('data-cl="sub-cancel"');
    reset();
  });
  it("adds a master cluster from a row at the bottom, and asks for the first one when there are none", () => {
    reset();
    expect(clustersTabHtml(home)).toContain('id="cl-tname"');
    const none = clustersTabHtml({ clusters: [] });
    expect(none).toContain("No clusters yet. Add the first one below.");
    expect(none).toContain('id="cl-tname"');
    expect(none).not.toContain('data-cl="expand-all"');
  });
  it("shows a search box only once the list is long", () => {
    reset();
    expect(clustersTabHtml(home)).not.toContain('id="cl-search"');
    const many: ClusterState = { clusters: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `School ${i}`, label: "School", parentId: "", place: "", status: "active" as const })) };
    expect(clustersTabHtml(many)).toContain('id="cl-search"');
  });
  it("shows an error where the person is looking, and never trusts a name as HTML", () => {
    reset();
    expect(clustersTabHtml(home, "Give the cluster a name.")).toContain('role="alert">Give the cluster a name.');
    const evil: ClusterState = { clusters: [{ id: "c", name: "<img src=x onerror=alert(1)>", label: "<b>L</b>", parentId: "", place: "<script>1</script>", status: "active", roles: ["<i>r</i>"] }] };
    const html = clustersTabHtml(evil);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
    expect(html).not.toContain("<b>L</b>");
    clusterUi.node = "c";
    expect(clustersTabHtml(evil)).not.toContain("<i>r</i>");
    reset();
  });
});

describe("the Clusters tab, one cluster", () => {
  it("shows the path across the top and the details of a master cluster, with its total capacity", () => {
    reset();
    clusterUi.node = "lahore-university";
    const html = clustersTabHtml(home);
    expect(html).toContain('data-cl="goto" data-id="">Clusters</button>');
    expect(html).toContain("<b>Lahore University</b>");
    expect(html).toContain('id="cn-roles" value="Principal"');
    expect(html).toContain('id="cn-capacity" type="number" min="0" value="40"');
    expect(html).toContain('data-cl="node-save" data-id="lahore-university"');
    expect(html).toContain('Sub-Clusters <span class="muted">(3)</span>');
    reset();
  });
  it("shows a sub cluster its even share as a guide, with no capacity box, and a path back up", () => {
    reset();
    clusterUi.node = "physics";
    const html = clustersTabHtml(home);
    expect(html).not.toContain('id="cn-capacity"');
    expect(html).toContain("about <b>20</b>");
    expect(html).toContain('data-cl="goto" data-id="lahore-university">Lahore University</button>');
    expect(html).toContain('data-cl="goto" data-id="science">Science</button>');
    reset();
  });
  it("shows what is inside a cluster as the same tree, starting from that cluster", () => {
    reset();
    clusterUi.node = "lahore-university";
    clusterUi.nodeTab = "inside";
    const html = clustersTabHtml(home);
    expect(html).toContain('data-cl="goto" data-id="physics"');
    expect(html).not.toContain('data-cl="goto" data-id="lahore-university"'); // the cluster itself is the page, not a row
    expect(html).toContain('id="cl-bname"');
    expect(html).toContain('id="cl-blabel" list="cl-labels" value="Faculty"');
    reset();
  });
  it("falls back to the tree when the open cluster no longer exists", () => {
    reset();
    clusterUi.node = "gone";
    expect(clustersTabHtml(home)).toContain("<b>Lahore University</b>");
    expect(clustersTabHtml(home)).not.toContain("cn-name");
    reset();
  });
});

describe("parked outcomes in a cluster (DECISIONS 209)", () => {
  const stock = [{ id: "STK-0001", partnerId: "trust", giftProjectId: "p", clusterId: "physics", itemId: "I11", name: "Chak 5 pump", at: "2026-11-01T00:00:00Z" }, { id: "STK-0002", partnerId: "trust", giftProjectId: "p", clusterId: "physics", itemId: "I11", name: "Dhok 2 pump", at: "2026-11-02T00:00:00Z" }];
  const ctx = { projectId: "p", items: [{ id: "I11", name: "Small Pump" }], beneficiaries: [], enrolments: [], stock, stockItems: [{ id: "I11", name: "Small Pump" }], partners: [{ id: "trust", name: "Sample Trust" }], allocations: [{ key: "sub:S1", kind: "outcome" as const, enrolmentId: "", outcomeRef: "OUT-0001", stockId: "STK-0001", giftProjectId: "p", itemId: "I11", parts: 1, how: "auto" as const, at: "x" }] };
  it("lists what is parked in the cluster and inside it, free or used by an outcome, and lets a free one be removed", () => {
    reset();
    clusterUi.node = "science"; clusterUi.nodeTab = "outcomes"; // the stock is in Physics, inside Science
    const html = clustersTabHtml(home, "", ctx);
    expect(html).toContain('data-tab="outcomes">Outcomes <span class="muted">(2)</span>');
    expect(html).toContain("Park an outcome in Science");
    expect(html).toContain("<b>Chak 5 pump</b>");
    expect(html).toContain("Used by OUT-0001");
    expect(html).toContain('data-cl="stock-rm" data-id="STK-0002"'); // free: can be removed
    expect(html).not.toContain('data-cl="stock-rm" data-id="STK-0001"'); // used: cannot
    reset();
  });
  it("offers a form with the benefits that can be parked and the project's partners, and says so when there are none", () => {
    reset();
    clusterUi.node = "science"; clusterUi.nodeTab = "outcomes";
    const html = clustersTabHtml(home, "", ctx);
    expect(html).toContain('id="st-name"');
    expect(html).toContain('data-cl="stock-add" data-id="science"');
    expect(clustersTabHtml(home, "", { ...ctx, stockItems: [] })).not.toContain('data-tab="outcomes"'); // nothing can be parked in this project, so there is no tab
    reset();
  });
});

describe("the cluster window layout (DECISIONS 210)", () => {
  const ctx = { projectId: "p", items: [{ id: "I10", name: "Orphan Sponsorship" }, { id: "I11", name: "Small Pump" }], itemNames: { I10: "Orphan Sponsorship", I11: "Small Pump", "MWF-EDU-002": "Education Support" }, enrolItemIds: ["I10"], beneficiaries: [{ id: "PRS-1", kind: "person", name: "Sample Amina", status: "active", eligibility: "ready" }] as never, enrolments: [{ id: "EN-1", beneficiaryId: "PRS-1", giftProjectId: "p", clusterId: "physics", itemId: "MWF-EDU-002", role: "", status: "active", since: "2026-11-26" }] as never };
  it("offers a search box, and marks each benefit with what it goes to and each person with their kind, so the list can be narrowed (DECISIONS 234)", () => {
    reset();
    clusterUi.node = "lahore-university"; clusterUi.nodeTab = "people";
    const html = clustersTabHtml(home, "", { ...ctx, receivers: { I10: "person" } });
    expect(html).toContain('id="en-search"');
    expect(html).toContain('<option value="I10" data-receiver="person">');
    expect(html).toMatch(/<option value="PRS-1" data-kind="person" data-text="[^"]*prs-1[^"]*"/);
  });
  it("offers only benefits that take a person in the Enrol form, shows names and not codes, and keeps a row's actions behind a menu", () => {
    reset();
    clusterUi.node = "lahore-university"; clusterUi.nodeTab = "people";
    const html = clustersTabHtml(home, "", ctx);
    expect(html).toContain('<option value="I10" data-receiver="">Orphan Sponsorship</option>');
    expect(html).not.toContain('<option value="I11">Small Pump</option>');
    expect(html).toContain("Education Support"); // the name, not MWF-EDU-002
    expect(html).not.toContain(">MWF-EDU-002<");
    expect(html).toContain('<details class="rowmenu">');
    expect(html).toContain('data-cl="enr-end"');
    expect(html.indexOf("Enrol someone in")).toBeLessThan(html.indexOf("<table")); // the form comes before the list
    expect(html).not.toContain("come next"); // no leftover placeholder line
    reset();
  });
  it("lists those who can be enrolled first, greys those who cannot with the reason, and groups households (decision 211)", () => {
    reset();
    clusterUi.node = "lahore-university"; clusterUi.nodeTab = "people";
    const people = [{ id: "PRS-2", kind: "person", name: "Sample Review", status: "active", eligibility: "review" }, { id: "PRS-1", kind: "person", name: "Sample Ready", status: "active", eligibility: "ready" }, { id: "HH-1", kind: "household", name: "Sample Family", status: "active" }] as never;
    const html = clustersTabHtml(home, "", { ...ctx, beneficiaries: people });
    expect(html.indexOf('value="PRS-1"')).toBeLessThan(html.indexOf('value="PRS-2"')); // ready first
    expect(html).toMatch(/<option value="PRS-2" data-kind="person" data-text="[^"]*" disabled data-ineligible="1">Sample Review \(PRS-2\) \u00B7 Needs review<\/option>/);
    expect(html).toContain('<optgroup label="Households">');
    reset();
  });
  it("has no Outcomes tab when nothing in the project can be parked", () => {
    reset();
    clusterUi.node = "lahore-university"; clusterUi.nodeTab = "people";
    expect(clustersTabHtml(home, "", ctx)).not.toContain('data-tab="outcomes"');
    reset();
  });
});

describe("the project window with tabs", () => {
  const ctx = { crmNames: [], partners: [], items: [] };
  it("has Details and Clusters tabs for a saved project, and none for a new one", () => {
    const saved = projectFormHtml({ name: "Dadyal", clusters: home.clusters }, "dadyal", ctx);
    expect(saved).toContain('data-pj="tab" data-tab="details"');
    expect(saved).toContain('data-pj="tab" data-tab="clusters">Clusters <span class="muted">(4)</span>');
    expect(projectFormHtml({ name: "" }, "", ctx)).not.toContain("data-pj=\"tab\"");
  });
  it("shows the details form by default, and the clusters tab with only a Close button, so saving the details cannot blank anything", () => {
    const details = projectFormHtml({ name: "Dadyal" }, "dadyal", ctx);
    expect(details).toContain('id="pr-name"');
    expect(details).toContain('data-pj="save"');
    const tab = projectFormHtml({ name: "Dadyal", clusters: home.clusters }, "dadyal", ctx, "", "clusters");
    expect(tab).toContain('data-cl="cluster-add"');
    expect(tab).not.toContain('id="pr-name"');
    expect(tab).not.toContain('data-pj="save"');
    expect(tab).toContain('<footer><button data-pj="cancel">Close</button></footer>');
  });
});
