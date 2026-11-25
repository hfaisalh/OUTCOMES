/**
 * allocate-flow.test.ts
 *
 * What it does: drives the rewired Allocation like a person (demo mode, a fake page): give two items a workflow, load the sample setup, assign the gifts to partners, open Allocate, see the open places, place the
 * gifts automatically, see which child each fills, move one by hand, take one back and reset. Invented gifts, partners and children only. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const histRoot = { innerHTML: "", id: "" };

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "hist-root" ? histRoot : null),
    createElement: () => histRoot,
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
const toggle = (item: string, wf: string): void => fire("change", { target: { id: "", dataset: { wfToggle: item, wf }, checked: true, value: "" } });

describe("Allocate, used like a person would", () => {
  it("places assigned gifts in the open places of the enrolled children, and lets a person move or take one back", async () => {
    click({ page: "workflows" }, "data-page");
    toggle("I10", "sponsorship-shared-parts"); // Orphan Sponsorship Monthly
    toggle("I13", "sponsorship-shared-parts"); // Hifz Sponsorship Monthly
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    click({ page: "assignment" }, "data-page");
    click({ asg: "confirm" }, "data-asg"); await flush();
    expect(shell.innerHTML).toContain("Confirmed 2 suggestions.");

    click({ page: "placement" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Allocate</h1>");
    expect(shell.innerHTML).toContain("<b>2</b><span>Assigned gifts</span>");
    expect(shell.innerHTML).toContain("Sample Amina"); // an open place: an approved child enrolled for the benefit
    expect(shell.innerHTML).toContain("Sample Orphan Homes");
    expect(shell.innerHTML).toContain('data-plc="reset" disabled');

    click({ plc: "run" }, "data-plc"); await flush();
    expect(shell.innerHTML).toMatch(/Placed 2 in open places and created 0 outcomes\. 0 wait/);
    expect(shell.innerHTML).toContain('<span class="pill">Placed</span>');
    expect(shell.innerHTML).not.toContain('data-plc="reset" disabled');

    const key = shell.innerHTML.match(/data-plc="unplace" data-key="([^"]+)"/)?.[1] ?? "";
    expect(key).not.toBe("");
    click({ plc: "unplace", key }, "data-plc"); await flush();
    expect(shell.innerHTML).not.toContain(`data-plc="unplace" data-key="${key}"`);
    expect(shell.innerHTML).toContain("Place automatically");

    // Taking it back did not delete it: it is in the gift's history, ended and kept (DECISIONS 186).
    click({ hist: "gift", id: key }, "data-hist");
    expect(histRoot.innerHTML).toContain("Allocation history");
    expect(histRoot.innerHTML).toContain("A person took it back");
    click({ hist: "close" }, "data-hist");
    expect(histRoot.innerHTML).toBe("");

    // Placing it again gives a second row: the first period and the second, both kept.
    click({ plc: "run" }, "data-plc"); await flush();
    click({ hist: "gift", id: key }, "data-hist");
    expect((histRoot.innerHTML.match(/<tr><td><b>/g) ?? []).length).toBe(2);
    expect(histRoot.innerHTML).toContain('<span class="pill">Now</span>');
    click({ hist: "close" }, "data-hist");

    click({ plc: "reset" }, "data-plc"); await flush();
    expect(shell.innerHTML).toContain('data-plc="reset" disabled');
  });
});
