/**
 * clusters-tab.test.ts
 *
 * What it does: tests the Clusters tab of the project window (DECISIONS 158): the levels on one line, the clusters as a tree, the row that adds a cluster, and that names are never trusted as HTML.
 * Invented data. These tests double as examples. Who calls it: vitest. Depends on: clusters-tab.ts and project-form.ts.
 */

import { describe, expect, it } from "vitest";
import { clustersTabHtml, openClusters } from "./clusters-tab";
import { projectFormHtml } from "./project-form";
import type { ClusterState } from "../modules/06-projects/clusters";

const home: ClusterState = {
  levels: [{ id: "block", name: "Block", parentId: "" }, { id: "classroom", name: "Classroom", parentId: "block" }],
  clusters: [
    { id: "block-a", name: "Block A", levelId: "block", parentId: "", place: "Lahore", capacity: 60, status: "active" },
    { id: "classroom-5a", name: "5A", levelId: "classroom", parentId: "block-a", place: "Ground floor", capacity: 30, status: "closed" },
  ],
};

describe("the Clusters tab", () => {
  it("shows the levels on one line, editable, in order", () => {
    const html = clustersTabHtml(home);
    expect(html).toMatch(/data-cl="level-name" data-id="block" value="Block"[\s\S]*data-cl="level-name" data-id="classroom" value="Classroom"/);
    expect(html).toContain("&rsaquo;");
    expect(html).toContain('data-cl="level-rm" data-id="block"');
    expect(html).toContain('data-cl="level-add"');
  });
  it("shows the first level, with the clusters inside as a drop down list that is closed until opened", () => {
    openClusters.clear();
    const closed = clustersTabHtml(home);
    expect(closed).toContain('data-cl="capacity" data-id="block-a" value="60"');
    expect(closed).toContain('data-cl="toggle" data-id="block-a" aria-expanded="false"');
    expect(closed).not.toContain('data-id="classroom-5a"'); // hidden while closed
    expect(closed).toContain('<span class="pill">1</span>'); // how many are inside
    openClusters.add("block-a");
    const html = clustersTabHtml(home);
    expect(html.indexOf('data-id="block-a"')).toBeLessThan(html.indexOf('data-id="classroom-5a"'));
    expect(html).toContain("padding-left:32px"); // the classroom is indented one step
    expect(html).not.toContain('data-cl="capacity" data-id="classroom-5a"'); // capacity is set at the first level only
    expect(html).toContain('<option value="closed" selected>Closed</option>');
    expect(html).toContain('data-cl="cluster-rm" data-id="classroom-5a"');
    expect(html).toContain("Clusters <span class=\"muted\">(2)</span>");
    openClusters.clear();
  });
  it("has a row to add a cluster, with the level, and only clusters to sit in that belong to the level above", () => {
    const html = clustersTabHtml(home);
    expect(html).toContain('id="cl-name"');
    expect(html).toContain('<option value="classroom" data-parent="block">Classroom</option>');
    expect(html).toContain('<option value="block-a" data-level="block">Block: Block A</option>'); // the cluster a classroom can be inside
    expect(html).toContain('data-cl="cluster-add"');
  });
  it("asks for a level first when there are none, then for the clusters", () => {
    const html = clustersTabHtml({ levels: [], clusters: [] });
    expect(html).toContain("No levels yet.");
    expect(html).toContain("Add a level first");
    expect(html).not.toContain('id="cl-name"');
    expect(clustersTabHtml({ levels: home.levels, clusters: [] })).toContain("No clusters yet. Add the first one below.");
  });
  it("shows an error where the person is looking, and never trusts a name as HTML", () => {
    expect(clustersTabHtml(home, "Choose a level.")).toContain('role="alert">Choose a level.');
    const html = clustersTabHtml({ levels: [{ id: "x", name: "<b>L</b>", parentId: "" }], clusters: [{ id: "c", name: "<img src=x onerror=alert(1)>", levelId: "x", parentId: "", place: "<script>1</script>", status: "active" }] });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
    expect(html).not.toContain("<b>L</b>");
  });
});

describe("the project window with tabs", () => {
  const ctx = { crmNames: [], partners: [], items: [] };
  it("has Details and Clusters tabs for a saved project, and none for a new one", () => {
    const saved = projectFormHtml({ name: "Dadyal", clusters: home.clusters }, "dadyal", ctx);
    expect(saved).toContain('data-pj="tab" data-tab="details"');
    expect(saved).toContain('data-pj="tab" data-tab="clusters">Clusters <span class="muted">(2)</span>');
    expect(projectFormHtml({ name: "" }, "", ctx)).not.toContain("data-pj=\"tab\"");
  });
  it("shows the details form by default, and the clusters tab with only a Close button, so saving the details cannot blank anything", () => {
    const details = projectFormHtml({ name: "Dadyal" }, "dadyal", ctx);
    expect(details).toContain('id="pr-name"');
    expect(details).toContain('data-pj="save"');
    const tab = projectFormHtml({ name: "Dadyal", levels: home.levels, clusters: home.clusters }, "dadyal", ctx, "", "clusters");
    expect(tab).toContain('data-cl="cluster-add"');
    expect(tab).not.toContain('id="pr-name"');
    expect(tab).not.toContain('data-pj="save"');
    expect(tab).toContain('<footer><button data-pj="cancel">Close</button></footer>');
  });
});
