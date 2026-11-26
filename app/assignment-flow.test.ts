/**
 * assignment-flow.test.ts
 *
 * What it does: drives Assignment like a person (demo mode, a fake page): give two items a workflow, load the sample setup, open Assignment, see which gifts need a partner, assign automatically, see who each went to,
 * move one to another partner, take one back, and reset. Invented gifts and partners only. Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : null),
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
const toggle = (item: string, wf: string): void => fire("change", { target: { id: "", dataset: { wfToggle: item, wf }, checked: true, value: "" } });

describe("Assignment, used like a person would", () => {
  it("assigns released gifts to the first partner with room, lets a person move one, and resets", async () => {
    click({ page: "workflows" }, "data-page");
    toggle("I10", "sponsorship-shared-parts"); // Orphan Sponsorship Monthly
    toggle("I13", "sponsorship-shared-parts"); // Hifz Sponsorship Monthly
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    expect(shell.innerHTML).toContain("Sample setup loaded");

    click({ page: "assignment" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Assignment</h1>");
    expect(shell.innerHTML).toContain("Available capacity with each partner");
    expect(shell.innerHTML).toContain("Sample Orphan Care Trust");
    expect(shell.innerHTML).toContain("Orphan Sponsorship Monthly");
    expect(shell.innerHTML).toMatch(/Suggested: Sample Orphan Care Trust|Will be assigned automatically/);
    expect(shell.innerHTML).toContain('data-asg="reset" disabled'); // nothing assigned yet

    // The starting workflows are set to suggest, so running assigns nothing by itself and says how many are suggested.
    click({ asg: "run" }, "data-asg"); await flush();
    expect(shell.innerHTML).toContain("Assigned 0 automatically. 2 more are suggested for a person to confirm");
    expect(shell.innerHTML).toContain('data-asg="reset" disabled');
    click({ asg: "confirm" }, "data-asg"); await flush();
    expect(shell.innerHTML).toContain("Confirmed 2 suggestions.");
    expect(shell.innerHTML).not.toContain('data-asg="reset" disabled');
    expect(shell.innerHTML).toContain('<span class="pill">Assigned</span>');
    expect(shell.innerHTML).toContain('(allowed 3)</span></td><td class="num">1</td><td class="num">2</td>'); // the trust: its own children give the room, a ceiling of 3, one taken, two free (DECISIONS 183)
    expect(shell.innerHTML).not.toContain("Sample Lapsed Partner</option>"); // a lapsed partner is never offered

    const key = shell.innerHTML.match(/data-asg="unassign" data-key="([^"]+)"/)?.[1] ?? "";
    expect(key).not.toBe("");
    fire("change", { target: { dataset: { asg: "set", key }, value: "sample-care-partners" } }); await flush();
    expect(shell.innerHTML).toContain('<option value="sample-care-partners" selected>');

    click({ asg: "unassign", key }, "data-asg"); await flush();
    expect(shell.innerHTML).not.toContain(`data-asg="unassign" data-key="${key}"`);

    click({ asg: "reset" }, "data-asg"); await flush();
    expect(shell.innerHTML).toContain('data-asg="reset" disabled');
  });
});
