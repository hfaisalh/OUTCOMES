/**
 * main.test.ts
 *
 * What it does: a smoke test of the whole shell without a browser. A tiny fake page records the
 * event handlers main.ts registers, then the test "drops" and "taps" like a person would, and reads
 * the page text. It proves the screens draw and the drag and tap paths reach the routing rules.
 * Who calls it: Vitest only.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
const shell = { innerHTML: "" };
let category = { value: "" };

beforeAll(async () => {
  vi.stubGlobal("document", {
    getElementById: (id: string) => (id === "shell" ? shell : id === "newcat" ? category : null),
    addEventListener: (type: string, h: Handler) => ((handlers[type] ??= []).push(h)),
  });
  await import("./main");
});

// A fake element that answers closest() for the one selector it carries.
const el = (attrs: Record<string, string>, matches: string[]) => ({
  dataset: attrs,
  classList: { add() {}, remove() {} },
  closest: (sel: string) => (matches.some((m) => sel.includes(m)) ? el(attrs, matches) : null),
});
const fire = (type: string, e: unknown) => (handlers[type] ?? []).forEach((h) => h(e));
const click = (attrs: Record<string, string>, match: string) => fire("click", { target: el(attrs, [match]) });

describe("the shell", () => {
  it("opens on work orders with every flagged line unrouted", () => {
    expect(shell.innerHTML).toContain("Work orders");
    expect(shell.innerHTML).toContain("Unrouted");
    expect(shell.innerHTML).toContain('data-assign="I14"');
  });

  it("shows the category board with suggestions", () => {
    click({ page: "categories" }, "data-page");
    expect(shell.innerHTML).toContain("Unsorted items");
    expect(shell.innerHTML).toContain("suggested: Transactional");
  });

  it("drags an item onto a category and the work order is routed", () => {
    fire("drop", { target: el({ drop: "transactional" }, ["data-drop"]), preventDefault() {}, dataTransfer: { getData: () => "I14" } });
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-assign="I14"');
    expect(shell.innerHTML).toContain("Animal Sacrifice");
  });

  it("taps an item then a category (the touch path)", () => {
    click({ page: "categories" }, "data-page");
    click({ item: "I11" }, "data-item");
    expect(shell.innerHTML).toContain('class="chip sel"');
    click({ drop: "transactional" }, "data-drop");
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-assign="I11"');
  });

  it("accepts the remaining suggestions in one click", () => {
    click({ page: "categories" }, "data-page");
    click({ action: "accept-suggestions" }, "data-action");
    expect(shell.innerHTML).toContain("Everything is sorted.");
  });

  it("shows the starter categories, adds a category, and refuses an empty name with a message", () => {
    expect(shell.innerHTML).toContain("Sponsorship");
    expect(shell.innerHTML).toContain("Transactional");
    category = { value: "Education" };
    click({ action: "add-category" }, "data-action");
    expect(shell.innerHTML).toContain('data-drop="education"');
    category = { value: "" };
    click({ action: "add-category" }, "data-action");
    expect(shell.innerHTML).toContain("Give the category a name.");
  });

  it("changes the framework of a category", () => {
    fire("change", { target: { id: "", dataset: { rule: "unit", fw: "education" }, value: "student" } });
    expect(shell.innerHTML).toContain('value="student"');
  });
});
