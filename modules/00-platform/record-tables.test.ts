/**
 * record-tables.test.ts
 *
 * What it does: shows the rules of DECISIONS 237. A setup is split into its document and its lists, put back exactly, and an older setup with records still inside the document is read as it is. Then pg-store is run against a small fake database to show that a save is one statement and sends only the lists that changed. The real SQL is checked against the real database by scripts/db-move-records.mjs.
 */
import { describe, expect, it } from "vitest";
import { pgStore, type Query } from "./pg-store";
import { assembleConfig, canon, rowsOf, splitConfig, TABLES, type Table } from "./record-tables";
import { ConflictError, defaultConfig, type OrgConfig } from "./store";

const full = (): OrgConfig => ({
  ...defaultConfig(),
  beneficiaries: { records: [{ id: "PRS-0002", name: "B" }, { id: "PRS-0001", name: "A" }] as never, counters: { PRS: 2 } },
  enrolments: { records: [{ id: "EN-0001", beneficiaryId: "PRS-0001" }] as never, counter: 1 },
  assignments: { records: [{ key: "L1", partnerId: "p" }, { key: "L2", partnerId: "p" }] as never },
  placements: { records: [{ key: "L1", kind: "place" }, { key: "L1", kind: "place" }] as never, counter: 2, stock: [{ id: "S1" }] as never, stockCounter: 1 },
  confirmations: { records: [{ key: "L1", answer: "confirmed" }] as never },
  progress: { records: [{ key: "L1", kind: "phase", id: "x" }] as never },
});
const empty = () => Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<Table, unknown[]>;

describe("record tables", () => {
  it("splits a setup into a document without records and the lists, and puts it back exactly", () => {
    const c = full();
    const { blob, lists } = splitConfig(c);
    expect(blob.beneficiaries).toEqual({ records: [], counters: { PRS: 2 } }); // the counters stay in the document
    expect(blob.placements).toMatchObject({ records: [], stock: [], counter: 2, stockCounter: 1 });
    expect(lists.beneficiaries).toHaveLength(2);
    const back = assembleConfig(blob, lists);
    expect(back.legacy).toBe(false);
    expect(back.config).toEqual(c);
  });

  it("keeps the order of a list, gives each record a stable row id, and numbers identical records", () => {
    const rows = rowsOf("beneficiaries", [{ id: "PRS-0002" }, { id: "PRS-0001" }]);
    expect(rows.map((r) => [r.rid, r.pos])).toEqual([["PRS-0002", 0], ["PRS-0001", 1]]);
    const same = rowsOf("placements", [{ a: 1, b: 2 }, { b: 2, a: 1 }]); // the same content written in another order
    expect(same[0]!.rid).toBe(rowsOf("placements", [{ b: 2, a: 1 }])[0]!.rid);
    expect(same[1]!.rid).toBe(`${same[0]!.rid}#2`);
    expect(canon({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
  });

  it("reads an older setup, with records still inside the document, as it is", () => {
    const old = full();
    const r = assembleConfig(old, empty());
    expect(r.legacy).toBe(true);
    expect(r.config).toEqual(old);
  });

  it("leaves a list absent when the setup never had it", () => {
    const c = defaultConfig();
    const r = assembleConfig(splitConfig(c).blob, empty());
    expect(r.config).toEqual(c);
    expect("beneficiaries" in r.config).toBe(false);
  });
});

// A fake that holds one organisation's document and lists, and applies a save only if the version in it is still current.
function fakeDb(config: OrgConfig, version: number) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const split = splitConfig(config);
  let held = version;
  const query: Query = async (sql, params) => {
    statements.push({ sql, params });
    if (sql.startsWith("SELECT config")) return [{ config: split.blob, version: held, ...split.lists }];
    if (sql.startsWith("WITH fence")) return params[2] === held ? [{ version: ++held }] : []; // the fence: someone saved since
    return [];
  };
  return { query, statements };
}

describe("pgStore with records in tables", () => {
  it("reads the setup whole, saves it in one statement, and sends only the lists that changed", async () => {
    const { query, statements } = fakeDb(full(), 7);
    const s = pgStore(query);
    const c = (await s.getConfig("o"))!;
    expect(c.version).toBe(7);
    expect(c.beneficiaries!.records).toHaveLength(2);
    expect(c.placements!.stock).toHaveLength(1);
    const next: OrgConfig = { ...c, confirmations: { records: [...c.confirmations!.records, { key: "L2", partnerId: "p", answer: "rejected", at: "t", by: "x", reason: "r" }] } };
    await s.putConfig("o", next);
    const save = statements.filter((x) => x.sql.startsWith("WITH fence"));
    expect(save).toHaveLength(1); // one statement, so the document and the lists succeed or fail together
    expect(save[0]!.sql).toContain("confirmations_put");
    for (const t of TABLES.filter((x) => x !== "confirmations")) expect(save[0]!.sql).not.toContain(`${t}_put`);
    expect(save[0]!.sql).toContain("EXISTS (SELECT 1 FROM fence)"); // nothing is written unless the version check passed
    expect(next.version).toBe(8);
  });

  it("sends every list when the store did not read the setup itself", async () => {
    const { query, statements } = fakeDb(full(), 1);
    const read = (await pgStore(query).getConfig("o"))!;
    await pgStore(query).putConfig("o", read); // a store that has not read it, such as another server instance
    const sql = statements.at(-1)!.sql;
    for (const t of TABLES) expect(sql).toContain(`${t}_put`);
  });

  it("refuses a save when someone saved since the read", async () => {
    const { query } = fakeDb(full(), 2);
    const s = pgStore(query);
    const c = (await s.getConfig("o"))!;
    await s.putConfig("o", { ...c });
    await expect(s.putConfig("o", { ...c, version: 2 })).rejects.toBeInstanceOf(ConflictError); // still at the old version
  });
});
