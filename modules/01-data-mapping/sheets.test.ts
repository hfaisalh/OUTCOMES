/**
 * sheets.test.ts
 *
 * What it does: tests sheets.ts and sheets-api.ts with a fake Google (no network). Tests double
 * as examples of the read-only calls and the plain English errors.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCodeBook } from "./codebook";
import { parseCsv } from "./csv";
import { giftsFromTable } from "./gifts";
import { runImport } from "./issues";
import { suggestMapping } from "./mapping";
import { parseSheetLink, valuesToTable } from "./sheets";
import { fetchSheetTable, SheetsError, type FetchLike } from "./sheets-api";

const read = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("parseSheetLink", () => {
  it("reads a full link, with and without a tab", () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=638095059#gid=638095059`)).toEqual({ spreadsheetId: ID, gid: "638095059" });
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toEqual({ spreadsheetId: ID });
  });
  it("reads a bare sheet ID and rejects other text", () => {
    expect(parseSheetLink(` ${ID} `)).toEqual({ spreadsheetId: ID });
    expect(parseSheetLink("https://example.com/x")).toBeNull();
    expect(parseSheetLink("")).toBeNull();
  });
});

describe("valuesToTable", () => {
  it("pads short rows, turns cells into text and skips empty rows", () => {
    expect(valuesToTable([["a", "b", "c"], ["1"], [], ["", "", ""], [2, null, true]])).toEqual([["a", "b", "c"], ["1", "", ""], ["2", "", "true"]]);
  });
});

// A fake Google: records every request and answers with the given tabs and values.
function fakeGoogle(opts: { tabs?: { sheetId: number; title: string }[]; values?: unknown[][]; failWith?: number } = {}) {
  const calls: { url: string; method: string; auth: string | undefined }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers["Authorization"] });
    if (opts.failWith) return { ok: false, status: opts.failWith, json: async () => ({ error: "secret detail" }) };
    if (url.includes("/values/")) return { ok: true, status: 200, json: async () => ({ values: opts.values ?? [] }) };
    return { ok: true, status: 200, json: async () => ({ sheets: (opts.tabs ?? [{ sheetId: 0, title: "SF Upload" }]).map((properties) => ({ properties })) }) };
  };
  return { f, calls };
}

describe("fetchSheetTable", () => {
  const tabs = [{ sheetId: 0, title: "Notes" }, { sheetId: 638095059, title: "SF Upload" }];

  it("sends only read-only GET requests with the token", async () => {
    const g = fakeGoogle({ tabs, values: [["a"], ["1"]] });
    await fetchSheetTable({ fetch: g.f, token: "tok", spreadsheetId: ID, tabName: "SF Upload" });
    expect(g.calls.every((c) => c.method === "GET" && c.auth === "Bearer tok")).toBe(true);
    expect(g.calls[1]?.url).toContain("/values/'SF%20Upload'?");
  });

  it("picks the tab by name (any case), else by gid, else the first tab", async () => {
    const run = (extra: { tabName?: string; gid?: string }) =>
      fetchSheetTable({ fetch: fakeGoogle({ tabs, values: [["a"]] }).f, token: "t", spreadsheetId: ID, ...extra }).then((r) => r.tabTitle);
    expect(await run({ tabName: "sf upload" })).toBe("SF Upload");
    expect(await run({ gid: "638095059" })).toBe("SF Upload");
    expect(await run({})).toBe("Notes");
  });

  it("says which tabs exist when the tab is not found", async () => {
    await expect(fetchSheetTable({ fetch: fakeGoogle({ tabs }).f, token: "t", spreadsheetId: ID, tabName: "Nope" })).rejects.toThrow(/Tabs in this sheet: Notes, SF Upload/);
  });

  it("gives plain English errors and never includes the response body or token", async () => {
    for (const [status, text] of [[401, /sign-in has expired/], [403, /Ask the owner to share it/], [404, /not found/], [429, /busy/], [500, /error 500/]] as const) {
      const err = await fetchSheetTable({ fetch: fakeGoogle({ failWith: status }).f, token: "secret-token", spreadsheetId: ID }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SheetsError);
      expect((err as SheetsError).message).toMatch(text);
      expect((err as SheetsError).message).not.toMatch(/secret/);
    }
  });

  it("gives the same import result as the CSV file", async () => {
    const table = parseCsv(read("sf-upload-sample.csv"));
    const g = fakeGoogle({ values: table });
    const { table: fromSheet } = await fetchSheetTable({ fetch: g.f, token: "t", spreadsheetId: ID });
    const { headers, gifts } = giftsFromTable(fromSheet);
    const { codeBook } = buildCodeBook(read("sf-meta-sample.csv"));
    const result = runImport(gifts, suggestMapping(headers), codeBook);
    expect(result.gifts).toHaveLength(8);
    expect(result.lines).toHaveLength(9);
    expect(result.issues).toHaveLength(3);
  });
});
