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

  it("changes a setting of a workflow on the Workflows page", () => {
    click({ page: "workflows" }, "data-page");
    fire("change", { target: { id: "", dataset: { tpl: "unit", tplid: "sponsorship-shared-parts" }, value: "orphan child" } });
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).toContain('value="orphan child"');
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
  it("has the field mapping tool inside Other sources as a four step flow, not a link to a new page (DECISIONS 93)", () => {
    const tap = (attrs: Record<string, string>) => fire("click", { target: el(attrs, [".mp", "data-mp"]) });
    click({ page: "sources" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Other sources</h1>");
    expect(shell.innerHTML).toContain('class="mp-steps"');
    expect(shell.innerHTML).toContain('id="mp-file"'); // step 1: choose the file
    expect(shell.innerHTML).not.toContain("<iframe");
    expect(shell.innerHTML).toMatch(/data-n="2"[^>]*disabled/); // later steps wait for a file
    tap({ mp: "demo", kind: "salesforce" });
    expect(shell.innerHTML).toContain("Match the columns"); // a file is loaded, so it moves on
    expect(shell.innerHTML).toContain("Demo with invented sample data");
    tap({ mp: "step", n: "3" });
    expect(shell.innerHTML).toContain("Match the values");
    tap({ mp: "step", n: "4" });
    expect(shell.innerHTML).toContain("Check the result");
    expect(shell.innerHTML).toContain('data-mp="save"');
    tap({ mp: "step", n: "1" });
    expect(shell.innerHTML).toContain('id="mp-file"');
  });
});

describe("the Workflows page (DECISIONS 130)", () => {
  const stageClick = (n: string) => click({ wfStage: n }, "data-wf-stage");
  it("lists the workflows, shows one as a sentence and a flow of six stages, and its items", () => {
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Workflows</h1>");
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).toContain("Sponsorship: shared parts");
    expect(shell.innerHTML).toContain('class="wf-sentence"');
    expect(shell.innerHTML).toContain("When a gift for");
    for (const title of ["Gift paid", "Outcome", "Released", "Assigned", "Delivering", "Updates and report"]) expect(shell.innerHTML).toContain(`<b>${title}</b>`);
    expect(shell.innerHTML).toContain("Try a sample gift");
    expect(shell.innerHTML).toContain('data-itemfw='); // each item has its workflow, category and icon
    expect(shell.innerHTML).toContain('data-itemcat=');
    expect(shell.innerHTML).toContain('data-icon-item=');
    expect(shell.innerHTML).toContain("Category (reporting)");
  });
  it("shows the rules of the stage that is clicked: what a payment buys, the outcome type, when it is released, assignment, delivering, and the tasks", () => {
    stageClick("1");
    expect(shell.innerHTML).toContain("What a payment buys");
    stageClick("2");
    expect(shell.innerHTML).toContain('data-wf-type="sponsorship-shared-parts"');
    expect(shell.innerHTML).toContain("Add type");
    stageClick("3");
    expect(shell.innerHTML).toContain("When it is released");
    stageClick("4");
    expect(shell.innerHTML).toContain("Assigned to a partner");
    stageClick("5");
    expect(shell.innerHTML).toContain("The partner does the work");
    stageClick("6");
    expect(shell.innerHTML).toContain("Updates and the donor report");
    expect(shell.innerHTML).toContain('data-wf-act="task-add"');
  });
  it("adds the standard workflows with their tasks and outcome types, once, and suggests a workflow for each item", () => {
    click({ page: "workflows" }, "data-page");
    click({ action: "add-starters" }, "data-action");
    for (const n of ["Orphan sponsorship", "Student sponsorship", "Water pump", "House build", "Activity"]) expect(shell.innerHTML).toContain(n);
    click({ wfSelect: "orphan-sponsorship" }, "data-wf-select");
    stageClick("6");
    expect(shell.innerHTML).toContain("3 month basic check");
    stageClick("2");
    expect(shell.innerHTML).toContain('<option value="orphan" selected>Orphan</option>'); // linked to its outcome type
    expect(shell.innerHTML).toContain("ID prefix");
    click({ action: "add-starters" }, "data-action");
    expect(shell.innerHTML).toContain("already there");
  });
  it("keeps the categories page for sorting items into categories, a label for reporting", () => {
    click({ page: "categories" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Categories</h1>");
    expect(shell.innerHTML).toContain("only a label for reporting");
    expect(shell.innerHTML).not.toContain("<h2>Frameworks");
    expect(shell.innerHTML).not.toContain("Outcome types");
  });
});
