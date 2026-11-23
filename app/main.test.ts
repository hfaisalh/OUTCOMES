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
  it("opens on the Gifts list with every flagged line unrouted, each with a workflow to choose", () => {
    expect(shell.innerHTML).toContain("<h1>Gifts</h1>");
    expect(shell.innerHTML).toContain("Unrouted");
    expect(shell.innerHTML).toContain('data-assign-wf="I14"');
    expect(shell.innerHTML).not.toContain("data-assign=");
    expect(shell.innerHTML).not.toContain("All categories"); // no category on the list (DECISIONS 131)
  });

  it("shows the items with no workflow in a pool on the Workflows page", () => {
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toContain("Unassigned items");
    expect(shell.innerHTML).toContain('data-wf-item="I14"');
    expect(shell.innerHTML).toContain('data-wf-drop=""'); // the pool takes an item back out of a workflow
  });

  it("drags an item onto a workflow and its gifts are routed", () => {
    fire("drop", { target: el({ wfDrop: "sponsorship-shared-parts" }, ["data-wf-drop"]), preventDefault() {}, dataTransfer: { getData: () => "wfitem|I14" } });
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-assign-wf="I14"');
    expect(shell.innerHTML).toContain("Animal Sacrifice");
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toMatch(/data-wf-drop="sponsorship-shared-parts"[^>]*>[\s\S]*data-wf-item="I14"/); // it is in that workflow now, no longer in the pool
  });

  it("puts an item in only one workflow: placing it in another takes it out of the first (DECISIONS 131)", () => {
    fire("drop", { target: el({ wfDrop: "delivered-once" }, ["data-wf-drop"]), preventDefault() {}, dataTransfer: { getData: () => "wfitem|I14" } });
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    const inFirst = shell.innerHTML.split('Items in this workflow')[1]?.split("</div>")[0] ?? "";
    expect(inFirst).not.toContain('data-wf-item="I14"');
    click({ wfSelect: "delivered-once" }, "data-wf-select");
    expect(shell.innerHTML.split("Items in this workflow")[1]?.split("</div>")[0] ?? "").toContain('data-wf-item="I14"');
  });

  it("taps an item then a workflow (the touch path), and an item can be taken out again", () => {
    click({ wfItem: "I11" }, "data-wf-item");
    expect(shell.innerHTML).toContain("wf-chip sel");
    click({ wfDrop: "delivered-once" }, "data-wf-drop");
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-assign-wf="I11"');
    click({ page: "workflows" }, "data-page");
    fire("drop", { target: el({ wfDrop: "" }, ["data-wf-drop"]), preventDefault() {}, dataTransfer: { getData: () => "wfitem|I11" } });
    expect(shell.innerHTML.split("Unassigned items")[1]?.split("</section>")[0] ?? "").toContain('data-wf-item="I11"'); // back in the pool, available again
  });

  it("chooses a workflow for an unrouted gift from the list", () => {
    fire("change", { target: { id: "", dataset: { assignWf: "I11" }, value: "sponsorship-shared-parts" } });
    expect(shell.innerHTML).not.toContain('data-assign-wf="I11"');
  });

  it("changes a setting of a workflow on the Workflows page", () => {
    click({ page: "workflows" }, "data-page");
    fire("change", { target: { id: "", dataset: { wfMode: "sponsorship-shared-parts" }, value: "once" } });
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).toContain('<option value="once" selected>');
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
    expect(shell.innerHTML).toContain('data-page="workflows"');
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

describe("the Workflows page (DECISIONS 130, 131)", () => {
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
    expect(shell.innerHTML).toContain("Items in this workflow");
    expect(shell.innerHTML).toContain('data-icon-item='); // item icons
    expect(shell.innerHTML).not.toContain("Category (reporting)"); // no category here
    expect(shell.innerHTML).not.toContain("What one delivery is");
  });
  it("shows the rules of the stage that is clicked: how a unit supports, the outcome type, when it is released, assignment, delivering, and the tasks", () => {
    stageClick("1");
    expect(shell.innerHTML).toContain("A unit supports");
    expect(shell.innerHTML).not.toContain("What a payment buys");
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
  it("adds the standard workflows with their tasks and outcome types, once", () => {
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
  it("has no Categories page in the menu any more", () => {
    click({ menu: "settings" }, "data-menu");
    expect(shell.innerHTML).not.toContain('data-page="categories"');
  });
});
