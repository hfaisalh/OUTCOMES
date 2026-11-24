/**
 * clusters-flow.test.ts
 *
 * What it does: drives the Clusters tab like a person (demo mode, a fake page): add a cluster, open its settings, Save, add a sub cluster, open the sub cluster. Proves Save changes the cluster and shows Saved,
 * and that the settings button of a sub cluster opens that sub cluster. Invented data. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const root = { innerHTML: "", id: "project-root" };
const values: Record<string, string> = {};
beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "project-root" ? root : id in values ? { value: values[id] } : (root.innerHTML.includes(`id="${id}"`) ? { value: "", setAttribute() {}, focus() {} } : null)),
    createElement: () => ({}),
    body: { appendChild() {} },
    querySelectorAll: () => [],
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  await import("./main");
});
const el = (attrs: Record<string, string>, match: string) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (sel.includes(match) ? el(attrs, match) : null) });
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));
const click = (attrs: Record<string, string>, match: string) => fire("click", { target: el(attrs, match) });
const flush = () => new Promise((r) => setTimeout(r, 20));
describe("the Clusters tab, used like a person would", () => {
  it("adds a cluster, saves its settings, and opens a sub cluster from its own settings button", async () => {
    click({ page: "projects" }, "data-page");
    click({ pj: "create-now", name: "Aghosh", items: "" }, "data-pj"); await flush();
    click({ pj: "open", id: "aghosh" }, "data-pj");
    click({ pj: "tab", tab: "clusters" }, "data-pj");
    Object.assign(values, { "cl-tname": "Home A", "cl-tlabel": "Home", "cl-tplace": "Lahore", "cl-tcap": "40" });
    click({ cl: "cluster-add", id: "" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("<b>Home A</b>");
    click({ cl: "goto", id: "home-a" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain('id="cn-name" value="Home A"');
    Object.assign(values, { "cn-name": "Home A2", "cn-label": "Home", "cn-place": "Karachi", "cn-roles": "Warden", "cn-status": "active", "cn-capacity": "50" });
    click({ cl: "node-save", id: "home-a" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain('id="cn-name" value="Home A2"');
    expect(root.innerHTML).toContain('id="cn-capacity" type="number" min="0" value="50"');
    expect(root.innerHTML).toContain('role="status">Saved.');
    click({ cl: "node-tab", tab: "inside" }, "data-cl");
    Object.assign(values, { "cl-bname": "Class 1", "cl-blabel": "Class", "cl-bplace": "" });
    click({ cl: "cluster-add-b", id: "home-a" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("<b>Class 1</b>");
    click({ cl: "goto", id: "class-1" }, "data-cl"); await flush();
    expect(root.innerHTML).toMatch(/data-id="home-a">Home A2<\/button>[\s\S]*<b>Class 1<\/b><\/nav>/); // the path ends at the sub cluster
    expect(root.innerHTML).toContain('id="cn-name" value="Class 1"');
    expect(root.innerHTML).not.toContain('id="cn-capacity"'); // a sub cluster has no capacity box
    click({ cl: "goto", id: "" }, "data-cl");
    expect(root.innerHTML).toContain("<b>Home A2</b>");
  });
});
