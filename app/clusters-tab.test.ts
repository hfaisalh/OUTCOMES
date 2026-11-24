/**
 * clusters-tab.test.ts
 *
 * What it does: tests the Clusters tab of the project window (DECISIONS 158): the clusters first, sub clusters in a drop down list, a + to add inside, capacity on the top cluster, and that names are never trusted as HTML.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: clusters-tab.ts and project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { clusterUi, clustersTabHtml, openClusters } from "./clusters-tab";
import { projectFormHtml } from "./project-form";
import type { ClusterState } from "../modules/06-projects/clusters";

const home: ClusterState = {
  clusters: [
    { id: "lahore-university", name: "Lahore University", label: "University", parentId: "", place: "Lahore", capacity: 40, status: "active", roles: ["Principal"] },
    { id: "science", name: "Science", label: "Faculty", parentId: "lahore-university", place: "Block 2", status: "closed" },
    { id: "physics", name: "Physics", label: "Department", parentId: "science", place: "", status: "active" },
    { id: "arts", name: "Arts", label: "Faculty", parentId: "lahore-university", place: "", status: "active" },
  ],
};

const reset = (): void => { openClusters.clear(); clusterUi.adding = ""; clusterUi.node = ""; clusterUi.nodeTab = "details"; };

describe("the Clusters tab, the list", () => {
  it("lists only the master clusters, one short line each, with how many are inside and a settings button", () => {
    reset();
    const html = clustersTabHtml(home);
    expect(html).toContain("<b>Lahore University</b>");
    expect(html).not.toContain("Science"); // sub clusters are not listed here
    expect(html).toMatch(/<td class="num">40<\/td><td class="num">3<\/td>/); // capacity 40, three inside (two faculties and a department)
    expect(html).toContain('data-cl="goto" data-id="lahore-university"');
    expect(html).toContain('data-cl="cluster-rm" data-id="lahore-university"');
    expect(html).not.toContain('data-cl="capacity"'); // no input boxes in the rows
  });
  it("adds a master cluster from a row at the bottom, and asks for the first one when there are none", () => {
    reset();
    expect(clustersTabHtml(home)).toContain('id="cl-tname"');
    const none = clustersTabHtml({ clusters: [] });
    expect(none).toContain("No clusters yet. Add the first one below.");
    expect(none).toContain('id="cl-tname"');
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
    const html = clustersTabHtml({ clusters: [{ id: "c", name: "<img src=x onerror=alert(1)>", label: "<b>L</b>", parentId: "", place: "<script>1</script>", status: "active", roles: ["<i>r</i>"] }] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
    expect(html).not.toContain("<b>L</b>");
    clusterUi.node = "c";
    expect(clustersTabHtml({ clusters: [{ id: "c", name: "<img src=x onerror=alert(1)>", label: "<b>L</b>", parentId: "", place: "<script>1</script>", status: "active", roles: ["<i>r</i>"] }] })).not.toContain("<i>r</i>");
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
    expect(html).toContain('Inside <span class="muted">(3)</span>');
    reset();
  });
  it("shows a sub cluster its even share as a guide, with no capacity box, and a path back up", () => {
    reset();
    clusterUi.node = "physics";
    const html = clustersTabHtml(home);
    expect(html).not.toContain('id="cn-capacity"');
    expect(html).toContain("about <b>20</b>"); // 40 over two faculties, physics alone in science
    expect(html).toContain('data-cl="goto" data-id="lahore-university">Lahore University</button>');
    expect(html).toContain('data-cl="goto" data-id="science">Science</button>');
    reset();
  });
  it("shows what is inside as folders that open and close, each with settings and a + to add inside", () => {
    reset();
    clusterUi.node = "lahore-university";
    clusterUi.nodeTab = "inside";
    const closed = clustersTabHtml(home);
    expect(closed).toContain('data-id="science"');
    expect(closed).toContain('data-cl="toggle" data-id="science" aria-expanded="false"');
    expect(closed).not.toContain('data-cl="goto" data-id="physics"'); // inside Science, which is closed
    openClusters.add("science");
    const open = clustersTabHtml(home);
    expect(open).toContain('data-cl="goto" data-id="physics"');
    expect(open).toContain('data-cl="sub-open" data-id="physics"');
    expect(open).toContain('id="cl-bname"'); // add inside this cluster
    expect(open).toContain('id="cl-blabel" list="cl-labels" value="Faculty"'); // the label its sisters use
    clusterUi.adding = "science";
    const adding = clustersTabHtml(home);
    expect(adding).toContain('id="cl-sname"');
    expect(adding).toContain('id="cl-slabel" list="cl-labels" value="Department"');
    reset();
  });
  it("falls back to the list when the open cluster no longer exists", () => {
    reset();
    clusterUi.node = "gone";
    expect(clustersTabHtml(home)).toContain("<b>Lahore University</b>");
    expect(clustersTabHtml(home)).not.toContain("cn-name");
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
