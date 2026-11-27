/**
 * confirmation-flow.test.ts
 *
 * What it does: drives Confirmation like a person (demo mode, a fake page): assign the sample gifts, open Confirmation, see them waiting, confirm one, try to reject one without a reason, and see the tiles change. Invented gifts and partners only.
 * Who calls it: vitest. Depends on: main.ts.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
const cnfRoot = { innerHTML: "", classList: { toggle() {}, add() {}, remove() {} }, querySelector: () => null }; // the Confirmation window

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "cnf-root" ? cnfRoot : null),
    createElement: () => ({}),
    body: { appendChild() {} },
    querySelectorAll: () => [],
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  await import("./main");
});
const el = (attrs: Record<string, string>, match: string) => ({ dataset: attrs, classList: { add() {}, remove() {} }, closest: (sel: string) => (sel.split(",").some((p) => p === `[${match}]` || p.startsWith(`[${match}=`)) ? el(attrs, match) : null) }); // an exact attribute match, so [data-cnf] is not also [data-cnfclose]
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));
const click = (attrs: Record<string, string>, match: string) => fire("click", { target: el(attrs, match) });
const flush = () => new Promise((r) => setTimeout(r, 20));
const toggle = (item: string, wf: string): void => fire("change", { target: { id: "", dataset: { wfToggle: item, wf }, checked: true, value: "" } });

describe("Confirmation, used like a person would", () => {
  it("lists the batches, opens one, confirms one gift and then the rest of the batch, and refuses a rejection with no reason", async () => {
    click({ page: "workflows" }, "data-page");
    toggle("I10", "sponsorship-shared-parts");
    toggle("I13", "sponsorship-shared-parts");
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    click({ page: "assignment" }, "data-page");
    click({ asg: "confirm" }, "data-asg"); await flush(); // confirm every suggestion, so two gifts are assigned

    click({ page: "confirmation" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Confirmation</h1>");
    expect(shell.innerHTML).toMatch(/data-tile="cnf:waiting" aria-pressed="false"><b>\d+<\/b><span>Batches waiting<\/span><div class="smrow"><span class="sm"><b>2<\/b> gifts/);

    // A line of the list opens its batch in a window, with the gifts in it.
    const id = shell.innerHTML.match(/data-cnfwin="([^"]+)"/)?.[1] ?? "";
    expect(id).not.toBe("");
    click({ cnfwin: id }, "data-cnfwin");
    expect(cnfRoot.innerHTML).toContain("Answer for the whole batch");
    const key = cnfRoot.innerHTML.match(/data-cnf="confirm" data-key="([^"]+)"/)?.[1] ?? "";
    expect(key).not.toBe("");
    click({ cnf: "reject", key }, "data-cnf"); await flush(); // no reason typed
    expect(shell.innerHTML).toContain("Say why the partner cannot take it");

    click({ cnf: "confirm", key }, "data-cnf"); await flush();
    expect(cnfRoot.innerHTML).not.toContain(`data-cnf="confirm" data-key="${key}"`); // that gift has its answer; the window was drawn again
    const rest = cnfRoot.innerHTML.match(/data-cnf="confirm-batch" data-keys="([^"]*)"/)?.[1] ?? "";
    click({ cnf: "confirm-batch", keys: rest }, "data-cnf"); await flush(); // the whole batch: only the gifts still waiting are answered
    expect(shell.innerHTML).toMatch(/data-tile="cnf:confirmed" aria-pressed="false"><b>[1-9]/);
    click({ cnfclose: "x" }, "data-cnfclose");
    await new Promise((r) => setTimeout(r, 200)); // the window eases out, then is emptied
    expect(cnfRoot.innerHTML).toBe("");

    click({ page: "assignment" }, "data-page");
    click({ asg: "reset" }, "data-asg"); await flush(); // clearing assignments clears the answers too
    click({ page: "confirmation" }, "data-page");
    expect(shell.innerHTML).toContain("Nothing is assigned yet");
  });
});
