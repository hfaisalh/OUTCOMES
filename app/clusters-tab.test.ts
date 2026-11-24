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

describe("the Clusters tab", () => {
  it("shows the clusters first, with the top ones visible and the sub clusters in a drop down list closed until opened", () => {
    openClusters.clear();
    const closed = clustersTabHtml(home);
    expect(closed).toContain('data-cl="capacity" data-id="lahore-university" value="40"');
    expect(closed).toContain('data-cl="toggle" data-id="lahore-university" aria-expanded="false"');
    expect(closed).toContain('<span class="pill" title="Sub clusters inside">2</span>'); // how many are inside
    expect(closed).not.toContain('data-id="science"'); // hidden while closed
    expect(closed).not.toContain("Level"); // there is no level setup
    openClusters.add("lahore-university");
    const html = clustersTabHtml(home);
    expect(html.indexOf('data-id="lahore-university"')).toBeLessThan(html.indexOf('data-id="science"'));
    expect(html).toContain("padding-left:32px"); // a faculty is indented one step
    expect(html).not.toContain('data-id="physics"'); // a department shows only when its faculty is opened
    openClusters.add("science");
    expect(clustersTabHtml(home)).toContain('data-id="physics"');
    openClusters.clear();
  });
  it("gives every cluster its own label, place, roles and status, and a + to add a sub cluster inside it", () => {
    openClusters.add("lahore-university");
    const html = clustersTabHtml(home);
    expect(html).toContain('data-cl="label" list="cl-labels" data-id="science" value="Faculty"');
    expect(html).toContain('data-cl="roles" data-id="lahore-university" value="Principal"');
    expect(html).toContain('<option value="closed" selected>Closed</option>');
    expect(html).toContain('data-cl="sub-open" data-id="science"');
    expect(html).toContain('data-cl="cluster-rm" data-id="science"');
    expect(html).toContain("Clusters <span class=\"muted\">(4)</span>");
    openClusters.clear();
  });
  it("sets capacity on the top cluster only, and shows a sub cluster its even share as a guide", () => {
    openClusters.add("lahore-university");
    openClusters.add("science");
    const html = clustersTabHtml(home);
    expect(html).not.toContain('data-cl="capacity" data-id="science"');
    expect(html).toContain("about 20"); // 40 over 2 faculties
    expect(html).toContain("about 20"); // physics is alone in science, so it takes the faculty's 20
    openClusters.clear();
  });
  it("adds a top cluster from a row at the bottom, and a sub cluster from an inline row under the cluster whose + was pressed, suggested the label its sisters use", () => {
    expect(clustersTabHtml(home)).toContain('id="cl-tname"');
    expect(clustersTabHtml(home)).not.toContain('id="cl-sname"');
    openClusters.add("lahore-university");
    clusterUi.adding = "lahore-university";
    const html = clustersTabHtml(home);
    expect(html).toContain('id="cl-sname"');
    expect(html).toContain('id="cl-slabel" list="cl-labels" value="Faculty"');
    expect(html).toContain('data-cl="cluster-add" data-id="lahore-university"');
    expect(html).toContain('data-cl="sub-cancel"');
    clusterUi.adding = "";
    openClusters.clear();
  });
  it("asks for the first cluster when there are none", () => {
    const html = clustersTabHtml({ clusters: [] });
    expect(html).toContain("No clusters yet. Add the first one below.");
    expect(html).toContain('id="cl-tname"');
  });
  it("shows an error where the person is looking, and never trusts a name as HTML", () => {
    expect(clustersTabHtml(home, "Choose a name.")).toContain('role="alert">Choose a name.');
    const html = clustersTabHtml({ clusters: [{ id: "c", name: "<img src=x onerror=alert(1)>", label: "<b>L</b>", parentId: "", place: "<script>1</script>", status: "active", roles: ["<i>r</i>"] }] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
    expect(html).not.toContain("<b>L</b>");
    expect(html).not.toContain("<i>r</i>");
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
