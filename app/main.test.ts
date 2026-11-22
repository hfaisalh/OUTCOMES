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
  it("opens on the Gifts list with every flagged line unrouted", () => {
    expect(shell.innerHTML).toContain("<h1>Gifts</h1>");
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

describe("loading the CRM export files", () => {
  const sample = (n: string) => ({ name: n, text: async () => (await import("node:fs")).readFileSync(new URL(`../samples/${n}`, import.meta.url), "utf8") });

  it("chooses the files, then loads them when the button is pressed", async () => {
    click({ page: "data-files" }, "data-page"); // the upload lives in the Data area (DECISIONS 92)
    const files = [sample("export-donation-lines-sample.csv"), sample("export-catalogue-sample.csv"), sample("export-recurring-plans-sample.csv")];
    fire("change", { target: { id: "feedfile", dataset: {}, files } });
    expect(shell.innerHTML).toContain("Chosen: export-donation-lines-sample.csv");
    click({ action: "load-files" }, "data-action");
    await new Promise((r) => setTimeout(r, 20));
    expect(shell.innerHTML).toContain("Reading file 1 of 3");
    await new Promise((r) => setTimeout(r, 300));
    expect(shell.innerHTML).toContain("Loaded 7 lines from your files");
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).toContain("MWF-ORP-001".slice(0, 0) + "Orphan Sponsorship Monthly");
  });

  it("says what to do when Load is pressed with no files chosen", () => {
    click({ page: "data-files" }, "data-page");
    fire("change", { target: { id: "feedfile", dataset: {}, files: [] } });
    click({ action: "load-files" }, "data-action");
    expect(shell.innerHTML).toContain("Choose the files first");
  });
});

describe("owner sign-in form", () => {
  it("is a real form that posts to the server, so it works without any script", () => {
    click({ page: "data-feed" }, "data-page");
    expect(shell.innerHTML).toContain('<form method="post" action="/api/owner-login">');
    expect(shell.innerHTML).toContain('name="passphrase"');
    expect(shell.innerHTML).toContain('type="submit"');
  });
});

describe("typing in a field the page does not manage", () => {
  it("does not redraw the page, so the owner passphrase box and Sign in button are not replaced", () => {
    shell.innerHTML = "UNTOUCHED";
    fire("change", { target: { id: "", dataset: {}, value: "typed passphrase" } });
    expect(shell.innerHTML).toBe("UNTOUCHED");
  });
});

describe("the Data area and the icon menus (DECISIONS 92)", () => {
  it("keeps the upload and the refresh out of Gifts, and shows them under Data", () => {
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Gifts</h1>");
    expect(shell.innerHTML).not.toContain('id="feedfile"');
    expect(shell.innerHTML).toContain('data-page="data-feed"'); // the way to the Data area
    click({ page: "data-feed" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>CRM connection</h1>");
    expect(shell.innerHTML).toContain('data-action="refresh"');
    expect(shell.innerHTML).toContain("How data gets into Gifts");
  });
  it("opens the settings icon menu with its pages, and the person menu with sign out or sign in, one at a time", () => {
    click({ menu: "settings" }, "data-menu");
    expect(shell.innerHTML).toContain('role="menu"');
    expect(shell.innerHTML).toContain('data-page="categories"');
    click({ menu: "user" }, "data-menu");
    expect(shell.innerHTML).toContain('data-action="show-signin"'); // the demo is not signed in
    expect((shell.innerHTML.match(/role="menu"/g) ?? []).length).toBe(1);
    click({ menu: "user" }, "data-menu"); // a second click closes it
    expect(shell.innerHTML).not.toContain('role="menu"');
  });
});
