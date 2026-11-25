/**
 * merge-flow.test.ts
 *
 * What it does: drives the workflow merge (DECISIONS 188) like a person (demo mode, a fake page): put an item in Sponsorship: whole, merge that workflow into Sponsorship: shared parts, and see that the item moved, the
 * old workflow is gone, and the item kept its 1 unit as its own number on the Benefits page. Invented data. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
let mergeTo = "sponsorship-shared-parts";

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "wf-merge-to" ? { value: mergeTo } : null),
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
const flush = () => new Promise((r) => setTimeout(r, 30));

describe("merging two sponsorship workflows, used like a person would", () => {
  it("moves the items, keeps each item's units, and removes the emptied workflow", async () => {
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toContain("Sponsorship: whole");
    fire("change", { target: { id: "", dataset: { wfToggle: "I13", wf: "sponsorship-whole" }, checked: true, value: "" } }); // Hifz Sponsorship Monthly goes in the whole workflow
    click({ wfSelect: "sponsorship-whole" }, "data-wf-select");
    expect(shell.innerHTML).toContain('data-action="merge-framework" data-id="sponsorship-whole"');
    expect(shell.innerHTML).toContain('<option value="sponsorship-shared-parts">Sponsorship: shared parts</option>');

    click({ action: "merge-framework", id: "sponsorship-whole" }, "data-action"); await flush();
    expect(shell.innerHTML).toContain("Merged: 1 item moved, and the old workflow removed.");
    expect(shell.innerHTML).not.toContain("Sponsorship: whole</"); // the workflow is gone from the list

    click({ page: "benefits" }, "data-page");
    expect(shell.innerHTML).toMatch(/data-item-units="I13" value="1"/); // the item kept its 1 unit as its own number
    fire("change", { target: { id: "", dataset: { itemUnits: "I13" }, value: "" } }); await flush(); // empty: the workflow's number applies
    expect(shell.innerHTML).toMatch(/data-item-units="I13" value="" placeholder="3"/);
  });
  it("says so when it cannot merge", async () => {
    mergeTo = "nope";
    click({ page: "workflows" }, "data-page");
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    click({ action: "merge-framework", id: "sponsorship-shared-parts" }, "data-action"); await flush();
    expect(shell.innerHTML).toContain("That workflow was not found.");
  });
});
