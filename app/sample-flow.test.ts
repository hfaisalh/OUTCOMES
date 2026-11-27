/**
 * sample-flow.test.ts
 *
 * What it does: presses the sample setup buttons like a person (demo mode, a fake page): load it, see the partners, projects, beneficiaries and enrolments appear on their pages and in a cluster, see that loading
 * twice is refused, and remove it to leave everything empty again. Everything is invented. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const root = { innerHTML: "", id: "project-root" };

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "project-root" ? root : null),
    createElement: () => ({}),
    body: { appendChild() {} },
    querySelectorAll: () => [],
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  await import("./main");
});
const el = (attrs: Record<string, string>, match: string) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (sel.includes(match) ? el(attrs, match) : null) });
const click = (attrs: Record<string, string>, match: string) => (handlers["click"] ?? []).forEach((h) => h({ target: el(attrs, match) }));
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("the sample setup, used like a person would", () => {
  it("loads, shows up everywhere, refuses a second load, and removes cleanly", async () => {
    click({ page: "settings" }, "data-page");
    expect(shell.innerHTML).toContain("The sample setup is not loaded.");
    expect(shell.innerHTML).toMatch(/data-sample="remove" disabled/);

    click({ sample: "load" }, "data-sample"); await flush();
    expect(shell.innerHTML).toContain("Sample setup loaded:");
    expect(shell.innerHTML).toContain("The sample setup is loaded.");
    expect(shell.innerHTML).toMatch(/data-sample="load" disabled/);

    click({ page: "beneficiaries" }, "data-page");
    expect(shell.innerHTML).toContain("Sample Amina");
    expect(shell.innerHTML).toContain("Sample Family Noor");
    expect(shell.innerHTML).toContain("Cannot offer a place"); // every admission decision is there
    click({ page: "partners" }, "data-page");
    expect(shell.innerHTML).toContain("Sample Builders Foundation");
    click({ page: "projects" }, "data-page");
    expect(shell.innerHTML).toContain("Sample Orphan Homes");

    // A cluster of the sponsorship project shows who is enrolled in it.
    click({ pj: "open", id: "sample-orphan-homes" }, "data-pj");
    click({ pj: "tab", tab: "clusters" }, "data-pj");
    click({ cl: "goto", id: "sample-home-north" }, "data-cl");
    click({ cl: "node-tab", tab: "people" }, "data-cl");
    expect(root.innerHTML).toContain("Sample Amina");
    expect(root.innerHTML).toContain("Sample Principal Hamid");
    expect(root.innerHTML).toContain("enrolled in Sample Home - North (capacity)");
    click({ pj: "cancel" }, "data-pj");

    // A second load adds nothing and says why.
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    expect(shell.innerHTML).toContain("already loaded");

    click({ sample: "remove" }, "data-sample"); await flush();
    expect(shell.innerHTML).toContain("Sample data removed:");
    expect(shell.innerHTML).toContain("The sample setup is not loaded.");
    click({ page: "beneficiaries" }, "data-page");
    expect(shell.innerHTML).toContain("No beneficiaries yet.");
    click({ page: "projects" }, "data-page");
    expect(shell.innerHTML).not.toContain("Sample Orphan Homes");
  });
});
