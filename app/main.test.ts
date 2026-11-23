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

  const toggle = (item: string, wf: string, on: boolean) => fire("change", { target: { id: "", dataset: { wfToggle: item, wf }, checked: on, value: "" } });

  it("lists every item with a switch on the Workflows page, off for items with no workflow", () => {
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toContain('data-wf-toggle="I14"');
    expect(shell.innerHTML).not.toMatch(/data-wf-toggle="I14"[^>]*checked/);
  });

  it("switches an item on for a workflow and its gifts are routed", () => {
    toggle("I14", "sponsorship-shared-parts", true);
    click({ page: "work-orders" }, "data-page");
    expect(shell.innerHTML).not.toContain('data-assign-wf="I14"');
    expect(shell.innerHTML).toContain("Animal Sacrifice");
    click({ page: "workflows" }, "data-page");
    expect(shell.innerHTML).toMatch(/data-wf-toggle="I14"[^>]*checked/);
  });

  it("locks an item that is in another workflow, and frees it when it is switched off there (DECISIONS 133)", () => {
    toggle("I14", "delivered-once", true);
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).toMatch(/data-wf-toggle="I14"[^>]*disabled/); // in the other workflow, so locked here
    click({ wfSelect: "delivered-once" }, "data-wf-select");
    toggle("I14", "delivered-once", false);
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).not.toMatch(/data-wf-toggle="I14"[^>]*disabled/);
  });

  it("chooses an icon from the library popup: OK keeps it, Cancel leaves it (DECISIONS 135)", () => {
    click({ page: "workflows" }, "data-page");
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    click({ wfIconopen: "sponsorship-shared-parts" }, "data-wf-iconopen");
    expect(shell.innerHTML).toContain("wf-modal");
    click({ wfIconchoose: "tent" }, "data-wf-iconchoose");
    click({ wfIconcancel: "1" }, "data-wf-iconcancel");
    expect(shell.innerHTML).not.toContain("wf-modal");
    click({ wfIconopen: "sponsorship-shared-parts" }, "data-wf-iconopen");
    click({ wfIconchoose: "tent" }, "data-wf-iconchoose");
    click({ wfIconok: "sponsorship-shared-parts" }, "data-wf-iconok");
    expect(shell.innerHTML).not.toContain("wf-modal");
    expect(shell.innerHTML).toMatch(/data-wf-iconopen="sponsorship-shared-parts"[^>]*>[\s\S]{0,600}<path d="M2.5 20 12 4/); // the tent
  });

  it("chooses a workflow for an unrouted gift from the list", () => {
    fire("change", { target: { id: "", dataset: { assignWf: "I11" }, value: "sponsorship-shared-parts" } });
    expect(shell.innerHTML).not.toContain('data-assign-wf="I11"');
  });

  it("changes a setting of a workflow on the Workflows page", () => {
    click({ page: "workflows" }, "data-page");
    fire("change", { target: { id: "", dataset: { wfFull: "sponsorship-shared-parts" }, checked: true, value: "" } });
    click({ wfSelect: "sponsorship-shared-parts" }, "data-wf-select");
    expect(shell.innerHTML).toContain('data-wf-full="sponsorship-shared-parts" checked');
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
    expect(shell.innerHTML).toContain("follow these set rules");
    expect(shell.innerHTML).toContain('class="fc"'); // the flow chart
    for (const n of [1, 2, 3]) expect(shell.innerHTML).toContain(`data-wf-stage="${n}"`); // work orders, assigned for implementation, report
    expect(shell.innerHTML).toContain("data-wf-toggle");
    expect(shell.innerHTML).toContain("Switch an item on");
    expect(shell.innerHTML).toContain('data-icon-item='); // item icons
    expect(shell.innerHTML).not.toContain("Category (reporting)"); // no category here
    expect(shell.innerHTML).not.toContain("What one delivery is");
  });
  it("shows the rules of the stage that is clicked, with its decisions (DECISIONS 138, 139)", () => {
    stageClick("1");
    expect(shell.innerHTML).toContain("Work orders: gift into units and shares");
    stageClick("2");
    expect(shell.innerHTML).toContain("Decision: assignment for implementation");
    stageClick("3");
    expect(shell.innerHTML).toContain("Decision: the partner confirms the batch");
    stageClick("4");
    expect(shell.innerHTML).toContain('data-wf-act="sub-add"');
    stageClick("5");
    expect(shell.innerHTML).toContain("Decision: approval");
    expect(shell.innerHTML).toContain('data-wf-act="task-add"');
    stageClick("6");
    expect(shell.innerHTML).toContain("Decision: reporting protocol");
    expect(shell.innerHTML).toContain("a stage"); // the legend
    stageClick("7");
    expect(shell.innerHTML).toContain("Decision: ask the donor for feedback");
  });
  it("turns the assignment and approval decisions on and off", () => {
    click({ page: "workflows" }, "data-page");
    click({ action: "add-starters" }, "data-action");
    click({ wfSelect: "water-pump" }, "data-wf-select");
    stageClick("2");
    fire("change", { target: { id: "", dataset: { wfFlag: "urgent", wf: "water-pump" }, checked: false, value: "" } });
    expect(shell.innerHTML).not.toMatch(/data-wf-flag="urgent" data-wf="water-pump" checked/);
    stageClick("5");
    fire("change", { target: { id: "", dataset: { wfFlag: "approve", wf: "water-pump" }, checked: false, value: "" } });
    expect(shell.innerHTML).not.toMatch(/data-wf-flag="approve" data-wf="water-pump" checked/);
    stageClick("7");
    expect(shell.innerHTML).toContain("Decision: ask the donor for feedback");
    expect(shell.innerHTML).toMatch(/data-wf-flag="feedback" data-wf="water-pump" checked/);
    stageClick("3");
    fire("change", { target: { id: "", dataset: { wfConfirm: "days", wf: "water-pump" }, checked: false, value: "9" } });
    expect(shell.innerHTML).toContain('data-wf-confirm="days" data-wf="water-pump" value="9"');
  });
  it("adds, changes, moves and removes the partner's stages, and sets how the assignment happens (DECISIONS 137, 138)", () => {
    click({ page: "workflows" }, "data-page");
    click({ action: "add-starters" }, "data-action");
    click({ wfSelect: "water-pump" }, "data-wf-select");
    stageClick("4");
    expect(shell.innerHTML).toContain("Basic details");
    stageClick("2");
    fire("change", { target: { id: "", dataset: { wfAssign: "water-pump" }, value: "auto", checked: false } });
    expect(shell.innerHTML).toContain('<option value="auto" selected>');
    stageClick("4");
    fire("change", { target: { id: "", dataset: { wfSub: "days", wf: "water-pump", sub: "basic-details" }, value: "5", checked: false } });
    expect(shell.innerHTML).toContain('data-wf-sub="days" data-wf="water-pump" data-sub="basic-details" value="5"');
    fire("change", { target: { id: "", dataset: { wfSub: "tell", wf: "water-pump", sub: "basic-details" }, value: "Your gift has been accepted.", checked: false } });
    expect(shell.innerHTML).toContain("Your gift has been accepted.");
    click({ wfAct: "sub-down", wf: "water-pump", sub: "basic-details" }, "data-wf-act");
    expect(shell.innerHTML.indexOf('data-sub="in-delivery"')).toBeLessThan(shell.innerHTML.indexOf('data-sub="basic-details"'));
    click({ wfAct: "sub-remove", wf: "water-pump", sub: "basic-details" }, "data-wf-act");
    expect(shell.innerHTML).not.toContain('data-sub="basic-details"');
  });
  it("adds the standard workflows with their tasks and stages, once", () => {
    click({ page: "workflows" }, "data-page");
    click({ action: "add-starters" }, "data-action");
    for (const n of ["Orphan sponsorship", "Student sponsorship", "Water pump", "House build", "Activity"]) expect(shell.innerHTML).toContain(n);
    click({ wfSelect: "orphan-sponsorship" }, "data-wf-select");
    stageClick("5");
    expect(shell.innerHTML).toContain("3 month basic check"); // a MEAL check
    stageClick("4");
    expect(shell.innerHTML).toContain("Basic details");
    click({ action: "add-starters" }, "data-action");
    expect(shell.innerHTML).toContain("already there");
  });
  it("sets the kind of benefit of an item on the Benefits page (DECISIONS 143)", () => {
    click({ page: "benefits" }, "data-page");
    expect(shell.innerHTML).toContain("<h1>Benefits</h1>");
    fire("change", { target: { id: "", dataset: { kindItem: "MWF-ORP-001" }, value: "distribution", checked: false } });
    expect(shell.innerHTML).toContain('<option value="distribution" selected>Distribution</option>');
    fire("change", { target: { id: "", dataset: { kindItem: "MWF-ORP-001" }, value: "", checked: false } });
    expect(shell.innerHTML).not.toContain('<option value="distribution" selected>Distribution</option>');
  });
  it("has no Categories page in the menu any more", () => {
    click({ menu: "settings" }, "data-menu");
    expect(shell.innerHTML).not.toContain('data-page="categories"');
  });
});
