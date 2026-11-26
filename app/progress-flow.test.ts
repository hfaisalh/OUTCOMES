/**
 * progress-flow.test.ts
 *
 * What it does: drives Progress like a person (demo mode, a fake page): assign and place the sample gifts, open Progress, take the steps of one gift until it is complete, close its batch only when every gift in it is complete, and see the stage on the Gifts list. Invented gifts and partners only.
 * Who calls it: vitest. Depends on: main.ts.
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

describe("Progress, used like a person would", () => {
  it("takes a placed gift through its steps, refuses to close a batch until every gift is complete, then closes it", async () => {
    click({ page: "workflows" }, "data-page");
    toggle("I10", "sponsorship-shared-parts");
    toggle("I13", "sponsorship-shared-parts");
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    click({ page: "assignment" }, "data-page");
    click({ asg: "confirm" }, "data-asg"); await flush();
    click({ page: "progress" }, "data-page");
    expect(shell.innerHTML).toContain("No gift is placed yet"); // placing comes first
    click({ page: "placement" }, "data-page");
    click({ plc: "run" }, "data-plc"); await flush();

    click({ page: "progress" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Progress</h1>");
    expect(shell.innerHTML).toContain('data-tile="prg:partner" aria-pressed="false"><b>2</b><span>With the partner</span>');
    const keys = [...shell.innerHTML.matchAll(/data-prg="next" data-key="([^"]+)"/g)].map((m) => m[1]!);
    expect(keys).toHaveLength(2);

    // Take every step of the first gift, one click at a time, until nothing is left to take.
    for (let i = 0; i < 12 && shell.innerHTML.includes(`data-prg="next" data-key="${keys[0]}"`); i++) { click({ prg: "next", key: keys[0]! }, "data-prg"); await flush(); }
    expect(shell.innerHTML).not.toContain(`data-prg="next" data-key="${keys[0]}"`);
    expect(shell.innerHTML).toContain("All steps taken");
    expect(shell.innerHTML).toContain('data-tile="prg:complete" aria-pressed="false"><b>1</b><span>Complete</span>');

    // The batch is not ready: the second gift is not complete, so there is no Close button.
    click({ page: "assignment" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-prg="close"');

    // Complete the second gift too: the batch is ready, a person closes it, and a step cannot be taken back in a closed batch until it is opened again.
    click({ page: "progress" }, "data-page");
    for (let i = 0; i < 12 && shell.innerHTML.includes(`data-prg="next" data-key="${keys[1]}"`); i++) { click({ prg: "next", key: keys[1]! }, "data-prg"); await flush(); }
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).toContain('pill stage st-feedback'); // the Gifts list shows the stage the gift has reached (all steps taken, so Feedback)
    click({ page: "assignment" }, "data-page");
    expect(shell.innerHTML).toContain("Ready to close");
    const pid = shell.innerHTML.match(/data-prg="close" data-partner="([^"]+)" data-batch="(\d+)"/);
    expect(pid).not.toBeNull();
    click({ prg: "close", partner: pid![1]!, batch: pid![2]! }, "data-prg"); await flush();
    expect(shell.innerHTML).toContain('<span class="pill done">Closed</span>');
    click({ page: "progress" }, "data-page");
    click({ prg: "undo", key: keys[0]! }, "data-prg"); await flush();
    expect(shell.innerHTML).toContain("That gift is in a closed batch");
    click({ page: "assignment" }, "data-page");
    click({ prg: "open", partner: pid![1]!, batch: pid![2]! }, "data-prg"); await flush();
    expect(shell.innerHTML).toContain("Ready to close");

    // One step back takes only the latest (Feedback), so the gift is still complete. A second takes Completed back, and it is not.
    click({ page: "progress" }, "data-page");
    click({ prg: "undo", key: keys[0]! }, "data-prg"); await flush();
    expect(shell.innerHTML).toContain('data-tile="prg:complete" aria-pressed="false"><b>2</b><span>Complete</span>');
    click({ prg: "undo", key: keys[0]! }, "data-prg"); await flush();
    expect(shell.innerHTML).toContain('data-tile="prg:complete" aria-pressed="false"><b>1</b><span>Complete</span>');
  });
});
