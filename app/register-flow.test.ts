/**
 * register-flow.test.ts
 *
 * What it does: drives the Beneficiaries page like a person (demo mode, a fake page): add a person, try to add the same person again (refused with the ID), add the same name with another date of birth
 * (a possible match, saved once the person says it is different), change a record, and remove one. Invented people only. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const root = { innerHTML: "", id: "ben-root" };
const values: Record<string, string> = {};
let members: string[] = [];
let different = false;

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "ben-root" ? root : id === "rg-different" ? { checked: different } : id in values ? { value: values[id] } : null),
    createElement: () => ({}),
    body: { appendChild() {} },
    querySelectorAll: (sel: string) => (sel === ".rg-member:checked" ? members.map((value) => ({ value })) : []),
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  await import("./main");
});

const el = (attrs: Record<string, string>, match: string) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (sel.includes(match) ? el(attrs, match) : null) });
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));
const click = (attrs: Record<string, string>, match: string) => fire("click", { target: el(attrs, match) });
const flush = () => new Promise((r) => setTimeout(r, 20));
const fill = (v: Record<string, string>): void => { for (const k of ["rg-name", "rg-dob", "rg-gender", "rg-guardian", "rg-area", "rg-notes", "rg-size", "rg-status"]) delete values[k]; Object.assign(values, { "rg-dob": "", "rg-gender": "", "rg-guardian": "", "rg-area": "", "rg-notes": "", "rg-size": "", ...v }); };

describe("the Beneficiaries page, used like a person would", () => {
  it("adds a person, refuses the same person again, takes a possible match once it is said to be different, changes a record and removes one", async () => {
    click({ page: "beneficiaries" }, "data-page");
    expect(shell.innerHTML).toContain("No beneficiaries yet.");

    click({ bn: "new", kind: "person" }, "data-bn");
    expect(root.innerHTML).toContain("New person");
    fill({ "rg-name": "Ayesha Khan", "rg-dob": "2014-03-09", "rg-guardian": "Samina Khan", "rg-area": "Dadyal" });
    click({ bn: "save" }, "data-bn"); await flush();
    expect(root.innerHTML).toBe(""); // the window closed
    expect(shell.innerHTML).toContain("PRS-0001");
    expect(shell.innerHTML).toContain("Ayesha Khan");

    click({ bn: "new", kind: "person" }, "data-bn");
    fill({ "rg-name": "  ayesha khan ", "rg-dob": "2014-03-09" });
    click({ bn: "save" }, "data-bn"); await flush();
    expect(root.innerHTML).toContain("is already in the register"); // refused, and the window stays open with the typed values kept
    expect(root.innerHTML).toContain("PRS-0001");
    expect(root.innerHTML).not.toContain('id="rg-different"');

    fill({ "rg-name": "Ayesha Khan", "rg-dob": "2016-01-01" });
    click({ bn: "save" }, "data-bn"); await flush();
    expect(root.innerHTML).toContain("Possible match");
    expect(root.innerHTML).toContain('id="rg-different"');
    different = true;
    click({ bn: "save" }, "data-bn"); await flush();
    different = false;
    expect(root.innerHTML).toBe("");
    expect(shell.innerHTML).toContain("PRS-0002");

    click({ bn: "new", kind: "household" }, "data-bn");
    members = ["PRS-0001"];
    fill({ "rg-name": "Khan family", "rg-area": "Dadyal" });
    click({ bn: "save" }, "data-bn"); await flush();
    members = [];
    expect(shell.innerHTML).toContain("HH-0001");

    click({ bn: "open", id: "PRS-0002" }, "data-bn");
    expect(root.innerHTML).toContain('id="rg-name" value="Ayesha Khan"');
    fill({ "rg-name": "Ayesha Khan", "rg-dob": "2016-01-01", "rg-area": "Mirpur", "rg-status": "inactive" });
    different = true;
    click({ bn: "save" }, "data-bn"); await flush();
    different = false;
    expect(shell.innerHTML).toContain("Mirpur");
    expect(shell.innerHTML).toContain("Inactive");

    click({ bn: "open", id: "PRS-0001" }, "data-bn");
    click({ bn: "remove" }, "data-bn"); await flush();
    expect(root.innerHTML).toContain("Khan family"); // in a household, so refused and still open
    click({ bn: "cancel" }, "data-bn");
    expect(root.innerHTML).toBe("");

    fire("change", { target: { dataset: { regf: "kind" }, value: "household" } });
    expect(shell.innerHTML).toContain("HH-0001");
    expect(shell.innerHTML).not.toContain("PRS-0002");
  });
});

describe("sorting the Beneficiaries list by a heading", () => {
  it("sorts on a click, reverses on a second click, and keeps the arrow on the sorted heading", async () => {
    click({ page: "beneficiaries" }, "data-page");
    click({ bn: "new", kind: "person" }, "data-bn");
    fill({ "rg-name": "Zainab Sorted", "rg-dob": "2012-05-05" });
    click({ bn: "save" }, "data-bn"); await flush(); // the list needs a record to draw its headings
    click({ regsort: "name" }, "data-regsort"); await flush();
    expect(shell.innerHTML).toContain("Name \u25B2");
    click({ regsort: "name" }, "data-regsort"); await flush();
    expect(shell.innerHTML).toContain("Name \u25BC");
    click({ regsort: "age" }, "data-regsort"); await flush();
    expect(shell.innerHTML).toContain("Age \u25B2");
    expect(shell.innerHTML).not.toContain("Name \u25BC");
  });
});
