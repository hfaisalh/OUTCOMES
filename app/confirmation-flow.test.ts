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

describe("Confirmation, used like a person would", () => {
  it("lists assigned gifts as waiting, confirms one for the partner, and refuses a rejection with no reason", async () => {
    click({ page: "workflows" }, "data-page");
    toggle("I10", "sponsorship-shared-parts");
    toggle("I13", "sponsorship-shared-parts");
    click({ page: "settings" }, "data-page");
    click({ sample: "load" }, "data-sample"); await flush();
    click({ page: "assignment" }, "data-page");
    click({ asg: "confirm" }, "data-asg"); await flush(); // confirm every suggestion, so two gifts are assigned

    click({ page: "confirmation" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Confirmation</h1>");
    expect(shell.innerHTML).toContain('data-tile="cnf:waiting" aria-pressed="false"><b>2</b><span>Waiting</span>');

    const key = shell.innerHTML.match(/data-cnf="confirm" data-key="([^"]+)"/)?.[1] ?? "";
    expect(key).not.toBe("");
    click({ cnf: "reject", key }, "data-cnf"); await flush(); // no reason typed
    expect(shell.innerHTML).toContain("Say why the partner cannot take it");
    expect(shell.innerHTML).toContain('<b>2</b><span>Waiting</span>');

    click({ cnf: "confirm", key }, "data-cnf"); await flush();
    expect(shell.innerHTML).toContain('<b>1</b><span>Waiting</span>');
    expect(shell.innerHTML).toContain('data-tile="cnf:confirmed" aria-pressed="false"><b>1</b><span>Confirmed</span>');
    expect(shell.innerHTML).not.toContain(`data-cnf="confirm" data-key="${key}"`);

    click({ page: "assignment" }, "data-page");
    click({ asg: "reset" }, "data-asg"); await flush(); // clearing assignments clears the answers too
    click({ page: "confirmation" }, "data-page");
    expect(shell.innerHTML).toContain("Nothing is assigned yet");
  });
});
