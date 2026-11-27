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

  it("previews every row with what is wrong in words, says how many are ready, and offers to add only those", () => {
    const html = csvWindowHtml(state({ fileName: "kids.csv", projectId: "g1", read: read("Name,Date of birth", "Amina Khan,2016-04-02", "Bilal,bad", "Chand Ali,") }), projects);
    expect(html).toContain("<b>3 rows</b> in kids.csv: 2 ready, 1 with a problem.");
    expect(html).toContain("Rows with a problem are not sent.");
    expect(html).toContain('<span class="pill review">Problem</span> Write the date of birth as YYYY-MM-DD or DD/MM/YYYY.');
    expect(html).toContain('<span class="pill ready">Ready</span>');
    expect(html).toContain('data-action="pt-csv-send">Add 2 beneficiaries</button>');
    expect(html).toContain("Orphan Homes"); // the chosen project shows on the rows that have none of their own
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

  it("shows a problem with the whole file, or the result with every row not added and why, and escapes names", () => {
    expect(csvWindowHtml(state({ fileName: "x.csv", read: { rows: [], problem: "The file has no rows under the column names." } }), projects)).toContain('<div class="pe-error" role="alert">The file has no rows');
    const done = csvWindowHtml(state({ result: { message: "Added 2 beneficiaries: 1 enrolled, 1 on the waiting list, 0 needing details. 1 not added.", added: 2, skipped: [{ line: 4, name: "A <b>", error: "This person is already registered. Please contact MWF to sort it out." }] } }), projects);
    expect(done).toContain("Added 2 beneficiaries");
    expect(done).toContain("Not added (1)");
    expect(done).toContain('<td class="num">4</td><td>A &lt;b&gt;</td><td>This person is already registered.');
    expect(done).toContain('data-action="pt-csv-close">Done</button>');
    expect(done).not.toContain("pt-csv-send");
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
    reply = { ok: true, body: { partner: { id: "p1", name: "A" }, beneficiaries: [], message: "Added 2 beneficiaries: 1 enrolled, 1 on the waiting list, 0 needing details.", upload: { added: 2, skipped: [] } } };
    let applied: PartnerSlice | undefined;
    await csvAction("pt-csv-send", (s) => { applied = s; });
    expect(sent[0]).toMatchObject({ action: "ben-add-many", targetProjectId: "g1", allowSimilar: true });
    expect((sent[0]!["rows"] as { line: number; values: Record<string, string> }[]).map((r) => [r.line, r.values["name"], r.values["dob"]])).toEqual([[2, "Amina Khan", "2016-04-02"], [4, "Chand Ali", "2017-04-03"]]); // the bad row is not sent; DD/MM/YYYY became ISO
    expect(applied?.partner.name).toBe("A");
    expect(partnerUi.csv).toMatchObject({ busy: false, result: { added: 2, skipped: [], message: expect.stringContaining("Added 2") } });
  });

  it("shows the server's error and lets the person try again", async () => {
    await csvAction("pt-csv-open", () => undefined);
    await choose(file("Name\r\nAmina Khan"));
    reply = { ok: false, body: { error: "Send between 1 and 500 rows." } };
    await csvAction("pt-csv-send", () => undefined);
    expect(partnerUi.csv).toMatchObject({ busy: false, error: "Send between 1 and 500 rows.", result: null });
  });

  it("downloads the template as a CSV file", async () => {
    let name = "", clicked = false;
    vi.stubGlobal("document", { createElement: () => ({ set href(_v: string) {}, set download(v: string) { name = v; }, click: () => { clicked = true; } }) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    await csvAction("pt-csv-template", () => undefined);
    expect([name, clicked]).toEqual(["beneficiaries-template.csv", true]);
  });
});
