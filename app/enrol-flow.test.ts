/**
 * enrol-flow.test.ts
 *
 * What it does: drives enrolment like a person (demo mode, a fake page): make a project with a cluster, add an approved child and one not yet approved, open the cluster's Beneficiaries tab, enrol the approved child
 * (and see the other refused with the reason), see the capacity count, move and end the enrolment, and see that an enrolled child and a cluster that holds an enrolment cannot be removed. Invented people only.
 * Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const root = { innerHTML: "", id: "project-root" };
const benRoot = { innerHTML: "", id: "ben-root" };
const values: Record<string, string> = {};

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "project-root" ? root : id === "ben-root" ? benRoot : id in values ? { value: values[id] } : root.innerHTML.includes(`id="${id}"`) ? { value: "" } : null),
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
const addPerson = async (name: string, eligibility: string): Promise<void> => {
  click({ bn: "new", kind: "person" }, "data-bn");
  Object.assign(values, { "rg-name": name, "rg-eligibility": eligibility, "rg-dob": "", "rg-gender": "", "rg-area": "", "rg-notes": "", "rg-size": "" });
  click({ bn: "save" }, "data-bn"); await flush();
};

describe("enrolling in a cluster, used like a person would", () => {
  it("enrols an approved child, refuses one not approved, counts places, moves, ends, and blocks removals", async () => {
    // A project with a master cluster of 2 places and a sub cluster.
    click({ page: "projects" }, "data-page");
    click({ pj: "create-now", name: "Aghosh", items: "" }, "data-pj"); await flush();
    click({ pj: "open", id: "aghosh" }, "data-pj");
    click({ pj: "tab", tab: "clusters" }, "data-pj");
    Object.assign(values, { "cl-tname": "Home", "cl-tlabel": "Home", "cl-tplace": "", "cl-tcap": "2" });
    click({ cl: "cluster-add", id: "" }, "data-cl"); await flush();
    click({ cl: "goto", id: "home" }, "data-cl"); await flush();
    click({ cl: "node-tab", tab: "inside" }, "data-cl");
    Object.assign(values, { "cl-bname": "Class 1", "cl-blabel": "Class", "cl-bplace": "" });
    click({ cl: "cluster-add-b", id: "home" }, "data-cl"); await flush();
    click({ pj: "cancel" }, "data-pj");

    // Two children: one Ready, one still to be checked.
    click({ page: "beneficiaries" }, "data-page");
    await addPerson("Ayesha Khan", "ready");
    await addPerson("Eman Ali", "");
    expect(shell.innerHTML).toContain("PRS-0002");

    // The Beneficiaries tab of the master cluster.
    click({ pj: "open", id: "aghosh" }, "data-pj");
    click({ pj: "tab", tab: "clusters" }, "data-pj");
    click({ cl: "goto", id: "home" }, "data-cl");
    click({ cl: "node-tab", tab: "people" }, "data-cl");
    expect(root.innerHTML).toContain("Nobody is enrolled here yet.");
    expect(root.innerHTML).toContain('id="en-ben"');
    const item = root.innerHTML.match(/id="en-item"[^>]*><option value="([^"]+)"/)?.[1] ?? "";
    expect(item).not.toBe("");

    // The approved child is enrolled in the sub cluster of the master cluster's total.
    click({ cl: "goto", id: "home" }, "data-cl");
    Object.assign(values, { "en-item": item, "en-ben": "PRS-0001", "en-role": "" });
    click({ cl: "node-tab", tab: "people" }, "data-cl");
    click({ cl: "enr-add", id: "home" }, "data-cl"); await flush();
    const first = root.innerHTML;
    if (first.includes("needs an admission decision")) throw new Error(`the item is not a beneficiary-first type, so the rule differs: ${first.match(/role="alert">[^<]*/)?.[0]}`);
    expect(root.innerHTML).toContain("Ayesha Khan");
    expect(root.innerHTML).toContain("Enrolled.");
    expect(root.innerHTML).toContain("<b>1</b> of <b>2</b> enrolled");
    // A child who is not approved is refused, with the reason, and a person cannot take a pump, which goes to a household.
    Object.assign(values, { "en-ben": "PRS-0002" });
    click({ cl: "enr-add", id: "home" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("needs an admission decision of Ready");
    Object.assign(values, { "en-ben": "PRS-0001", "en-item": "I11" });
    click({ cl: "enr-add", id: "home" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("goes to a household");

    // Move the enrolment into the sub cluster, and the master cluster still counts it.
    fire("change", { target: { dataset: { cl: "enr-move", id: "EN-0001" }, value: "class-1" } }); await flush();
    expect(root.innerHTML).toContain("Moved.");
    expect(root.innerHTML).toContain("Class 1");
    expect(root.innerHTML).toContain("<b>1</b> of <b>2</b> enrolled");

    // An enrolled child and a cluster that holds an enrolment cannot be removed.
    click({ pj: "cancel" }, "data-pj");
    click({ page: "beneficiaries" }, "data-page");
    click({ bn: "open", id: "PRS-0001" }, "data-bn");
    click({ bn: "remove" }, "data-bn"); await flush();
    expect(benRoot.innerHTML).toContain("is enrolled 1 time");
    click({ bn: "cancel" }, "data-bn");
    expect(shell.innerHTML).toMatch(/PRS-0001[\s\S]*?<td class="num"[^>]*>\d+%<\/td>/); // the enrolment row, with the allocation score

    click({ page: "projects" }, "data-page");
    click({ pj: "open", id: "aghosh" }, "data-pj");
    click({ pj: "tab", tab: "clusters" }, "data-pj");
    click({ cl: "cluster-rm", id: "class-1" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("1 beneficiary is in it");

    // Ending the enrolment frees the place, the child and the cluster.
    click({ cl: "goto", id: "home" }, "data-cl");
    click({ cl: "node-tab", tab: "people" }, "data-cl");
    click({ cl: "enr-end", id: "EN-0001" }, "data-cl"); await flush();
    expect(root.innerHTML).toContain("Enrolment ended.");
    expect(root.innerHTML).toContain("Nobody is enrolled here yet.");
    expect(root.innerHTML).toContain("<b>0</b> of <b>2</b> enrolled");
  });
});
