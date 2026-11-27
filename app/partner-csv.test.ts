/**
 * partner-csv.test.ts
 *
 * What it does: tests the partner's CSV window and what its buttons do (DECISIONS 271): the steps and template, the preview with each row's problem in words, when Add is possible, that only good rows are sent, what is shown after, and the file, project and tick.
 * A fake page and server stand in for the browser and the network. Who calls it: vitest. Depends on: partner-csv.ts and partner-csv-session.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { csvWindowHtml, NEW_CSV, type CsvState } from "./partner-csv";
import { csvAction, csvChange } from "./partner-csv-session";
import { partnerUi } from "./partner-state";
import { readBeneficiaryCsv } from "../modules/13-partner-portal/import";
import type { PartnerSlice } from "../modules/13-partner-portal/scope";

const projects = [{ id: "g1", name: "Orphan Homes" }, { id: "g2", name: "Girls School" }];
const state = (over: Partial<CsvState> = {}): CsvState => ({ ...NEW_CSV, fresh: false, ...over });
const read = (...lines: string[]) => readBeneficiaryCsv(lines.join("\r\n"), projects);

describe("the CSV window", () => {
  it("opens as a dialog with the three steps, the template, a file and a project, and nothing to add yet", () => {
    const html = csvWindowHtml({ ...NEW_CSV }, projects);
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="pc-title"');
    expect(html).toContain("pe-in"); // eases in when it opens
    expect(html).toContain("Download the template");
    expect(html).toContain('type="file" id="pc-file" accept=".csv,text/csv"');
    expect(html).toContain('id="pc-project"');
    expect(html).toMatch(/data-action="pt-csv-send" disabled>Add<\/button>/);
    expect(csvWindowHtml(state(), projects)).not.toContain("pe-in");
  });

  it("lists every row as editable cells with what is wrong in words, says how many are ready, and offers to add only those", () => {
    const html = csvWindowHtml(state({ fileName: "kids.csv", projectId: "g1", read: read("Name,Date of birth", "Amina Khan,2016-04-02", "Bilal,bad", "Chand Ali,") }), projects);
    expect(html).toContain("<b>3 rows</b> from kids.csv: 2 ready, 1 with a problem.");
    expect(html).toContain("Rows with a problem are not sent.");
    expect(html).toContain('<input class="pc-in" id="pc-r2-name" value="Amina Khan" aria-label="Name, row 2" autocomplete="off">'); // a cell to correct, labelled for a screen reader
    expect(html).toContain('<span class="pill review">Problem</span> Write the date of birth as YYYY-MM-DD or DD/MM/YYYY.');
    expect(html).toContain('<span class="pill ready">Ready</span>');
    expect(html).toContain('data-action="pt-csv-remove" data-line="3" aria-label="Remove row 3"');
    expect(html).toContain('data-action="pt-csv-remove-bad">Remove all rows with a problem</button>');
    expect(html).toContain('data-action="pt-csv-download-bad">Download these rows as CSV</button>');
    expect(html).toContain('data-action="pt-csv-send">Add 2 beneficiaries</button>');
    expect(html).toContain(">As above</option>"); // a row with no project of its own uses the one chosen above
    expect(html).not.toContain("Download the template and fill it in"); // the steps make way for the list once a file is read
  });

  it("shows a value that cannot be used as a fix to make, and a row the server refused with its reason", () => {
    const rows = read("Name,Gender,Project", "Amina Khan,other,Boys College").rows.map((r) => ({ ...r, serverError: "This person is already registered. Please contact MWF to sort it out." }));
    const html = csvWindowHtml(state({ read: { rows, problem: "" } }), projects);
    expect(html).toContain('<option value="other" selected>other (fix)</option>');
    expect(html).toContain('<option value="Boys College" selected>Boys College (fix)</option>');
    const refused = csvWindowHtml(state({ projectId: "g1", read: { rows: read("Name", "Zara Malik").rows.map((r) => ({ ...r, serverError: "This person is already registered. Please contact MWF to sort it out." })), problem: "" } }), projects);
    expect(refused).toContain('<span class="pill review">Problem</span> This person is already registered.');
    expect(refused).toContain("1 with a problem");
  });

  it("needs a project only for rows that have none, and says so", () => {
    const noProject = csvWindowHtml(state({ read: read("Name", "Amina Khan") }), projects);
    expect(noProject).toMatch(/data-action="pt-csv-send" disabled>Add 1 beneficiary<\/button>/);
    expect(noProject).toContain('<abbr title="required"');
    const own = csvWindowHtml(state({ read: read("Name,Project", "Amina Khan,Girls School") }), projects);
    expect(own).toContain('data-action="pt-csv-send">Add 1 beneficiary</button>');
    expect(own).not.toContain('<abbr title="required"');
    expect(csvWindowHtml(state({ read: read("Name", "Amina Khan") }), [projects[0]!])).toContain('<option value="g1" selected>'); // one project: chosen for them
  });

  it("shows a problem with the whole file, and after Add says what was added, keeping the rows not added", () => {
    expect(csvWindowHtml(state({ fileName: "x.csv", read: { rows: [], problem: "The file has no rows under the column names." } }), projects)).toContain('<div class="pe-error" role="alert">The file has no rows');
    const some = csvWindowHtml(state({ projectId: "g1", result: { message: "Added 2 beneficiaries. 1 not added.", added: 2 }, read: read("Name", "A <b> One") }), projects);
    expect(some).toContain("Added 2 beneficiaries. 1 not added. The rows not added are below, with the reason. Correct, remove or send them again.");
    expect(some).toContain("A &lt;b&gt; One"); // escaped
    expect(some).toContain("Close</button>");
    const none = csvWindowHtml(state({ result: { message: "Added 3 beneficiaries.", added: 3 }, read: { rows: [], problem: "" } }), projects);
    expect(none).toContain("Nothing is left to add.");
    expect(none).toContain('data-action="pt-csv-close">Done</button>');
    expect(none).not.toContain("pt-csv-send");
    expect(none).not.toContain("Download the template"); // finished: the steps and the file controls are gone
  });
});

describe("its buttons", () => {
  const sent: Record<string, unknown>[] = [];
  let reply: { ok: boolean; body: unknown } = { ok: true, body: {} };
  beforeEach(() => {
    sent.length = 0; reply = { ok: true, body: {} };
    partnerUi.csv = null;
    vi.stubGlobal("fetch", async (_p: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return { ok: reply.ok, status: reply.ok ? 200 : 400, json: async () => reply.body }; });
  });
  const file = (text: string, size = text.length) => ({ name: "kids.csv", size, text: async () => text }) as unknown as File;
  const choose = (f: File) => csvChange({ id: "pc-file", files: { 0: f, length: 1 } as unknown as FileList }, projects);

  it("opens and closes the window, and reads a chosen file in the browser, never sending the file itself", async () => {
    await csvAction("pt-csv-open", () => undefined);
    expect(partnerUi.csv).toMatchObject({ fresh: true, read: null });
    expect(await choose(file("Name,Date of birth\r\nAmina Khan,2016-04-02"))).toBe(true);
    expect(partnerUi.csv).toMatchObject({ fileName: "kids.csv", fresh: false });
    expect(partnerUi.csv?.read?.rows).toHaveLength(1);
    expect(sent).toHaveLength(0); // reading only
    await csvAction("pt-csv-close", () => undefined);
    expect(partnerUi.csv).toBeNull();
  });

  it("keeps the project and the same-person tick, and refuses a file that is too big", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await csvChange({ id: "pc-project", value: "g2" }, projects);
    await csvChange({ id: "pc-similar", checked: true }, projects);
    expect(partnerUi.csv).toMatchObject({ projectId: "g2", allowSimilar: true });
    await choose(file("Name\r\nA One", 3_000_000));
    expect(partnerUi.csv?.read?.problem).toContain("too big");
    expect(await csvChange({ id: "pc-other" }, projects)).toBe(false);
  });

  it("sends only the rows that passed the preview, with the project and the tick, and shows what the server says", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name,Date of birth\r\nAmina Khan,2016-04-02\r\nBilal Ahmed,bad\r\nChand Ali,03/04/2017"));
    await csvChange({ id: "pc-project", value: "g1" }, projects);
    await csvChange({ id: "pc-similar", checked: true }, projects);
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [], message: "Added 2 beneficiaries: 1 enrolled, 1 on the waiting list, 0 needing details.", upload: { added: 2, addedLines: [2, 4], skipped: [] } } };
    let applied: PartnerSlice | undefined;
    await csvAction("pt-csv-send", (s) => { applied = s; });
    expect(sent[0]).toMatchObject({ action: "ben-add-many", targetProjectId: "g1", allowSimilar: true });
    expect((sent[0]!["rows"] as { line: number; values: Record<string, string> }[]).map((r) => [r.line, r.values["name"], r.values["dob"]])).toEqual([[2, "Amina Khan", "2016-04-02"], [4, "Chand Ali", "2017-04-03"]]); // the bad row is not sent; DD/MM/YYYY became ISO
    expect(applied?.partner.name).toBe("A");
    expect(partnerUi.csv).toMatchObject({ busy: false, result: { added: 2, message: expect.stringContaining("Added 2") } });
    expect(partnerUi.csv?.read?.rows.map((r) => r.line)).toEqual([3]); // the added rows left the list; the one with a problem stays
  });

  it("edits a cell, checks that row again on its own, and looks for repeats again, so a fixed row becomes ready", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name,Date of birth,National ID\r\nAmina Khan,13/13/2016,B-1\r\nBilal Ahmed,2015-01-01,B-1"));
    expect(partnerUi.csv?.read?.rows.map((r) => r.error)).toEqual(["Write the date of birth as YYYY-MM-DD or DD/MM/YYYY.", ""]);
    await csvChange({ id: "pc-r2-dob", value: "13/11/2016" }, projects);
    expect(partnerUi.csv?.read?.rows[0]).toMatchObject({ error: "", values: { dob: "2016-11-13" } });
    await csvChange({ id: "pc-r3-idNumber", value: "B-1" }, projects); // still the same ID as row 2, which is now good
    expect(partnerUi.csv?.read?.rows[1]!.error).toBe("The same person as row 2.");
    await csvChange({ id: "pc-r3-idNumber", value: "B-2" }, projects);
    expect(partnerUi.csv?.read?.rows.map((r) => r.error)).toEqual(["", ""]);
    expect(await csvChange({ id: "pc-r9-name", value: "x" }, projects)).toBe(true); // an unknown row changes nothing, harmlessly
  });

  it("removes one row, or every row with a problem", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name,Date of birth\r\nAmina Khan,2016-04-02\r\nBilal,bad\r\nChand Ali,2017-01-01\r\nDana,bad2"));
    await csvAction("pt-csv-remove", () => undefined, { dataset: { line: "2" } });
    expect(partnerUi.csv?.read?.rows.map((r) => r.line)).toEqual([3, 4, 5]);
    await csvAction("pt-csv-remove-bad", () => undefined);
    expect(partnerUi.csv?.read?.rows.map((r) => r.line)).toEqual([4]);
  });

  it("keeps the rows the server refused, with its reason, until each is edited, and sends them again when asked", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name,National ID\r\nAmina Khan,B-1\r\nBilal Ahmed,B-2"));
    await csvChange({ id: "pc-project", value: "g1" }, projects);
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [], message: "Added 1 beneficiary. 1 not added.", upload: { added: 1, addedLines: [2], skipped: [{ line: 3, name: "Bilal Ahmed", error: "This person is already registered. Please contact MWF to sort it out." }] } } };
    await csvAction("pt-csv-send", () => undefined, undefined, projects);
    const left = partnerUi.csv!.read!.rows;
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ line: 3, error: "", serverError: "This person is already registered. Please contact MWF to sort it out." });
    await csvChange({ id: "pc-r3-idNumber", value: "B-22" }, projects); // editing the row drops the old reason
    expect(partnerUi.csv!.read!.rows[0]!.serverError).toBeUndefined();
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [], message: "Added 1 beneficiary.", upload: { added: 1, addedLines: [3], skipped: [] } } };
    await csvAction("pt-csv-send", () => undefined, undefined, projects);
    expect(partnerUi.csv!.read!.rows).toHaveLength(0);
    expect(sent[1]!["rows"]).toEqual([{ line: 3, values: expect.objectContaining({ name: "Bilal Ahmed", idNumber: "B-22" }) }]);
  });

  it("shows the server's error and lets the person try again", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name\r\nAmina Khan"));
    reply = { ok: false, body: { error: "Send between 1 and 500 rows." } };
    await csvAction("pt-csv-send", () => undefined);
    expect(partnerUi.csv).toMatchObject({ busy: false, error: "Send between 1 and 500 rows.", result: null });
  });

  it("downloads the rows with a problem as a CSV to fix and upload again", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name,Date of birth\r\nAmina Khan,2016-04-02\r\nBilal Ahmed,bad"));
    let name = "", blob: Blob | undefined;
    vi.stubGlobal("document", { createElement: () => ({ set href(_v: string) {}, set download(v: string) { name = v; }, click: () => undefined }) });
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => { blob = b; return "blob:x"; }, revokeObjectURL: () => undefined });
    await csvAction("pt-csv-download-bad", () => undefined);
    expect(name).toBe("beneficiaries-to-fix.csv");
    expect(await blob!.text()).toContain("Bilal Ahmed,bad,");
    expect(await blob!.text()).not.toContain("Amina Khan"); // a good row is not in it
  });

  it("downloads the template as a CSV file", async () => {
    let name = "", clicked = false;
    vi.stubGlobal("document", { createElement: () => ({ set href(_v: string) {}, set download(v: string) { name = v; }, click: () => { clicked = true; } }) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    await csvAction("pt-csv-template", () => undefined);
    expect([name, clicked]).toEqual(["beneficiaries-template.csv", true]);
  });
});
