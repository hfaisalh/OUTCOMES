/**
 * change-log.test.ts
 *
 * What it does: shows what the change log records (DECISIONS 235): who did what to which record, through the real handler on the memory store.
 */
import { describe, expect, it } from "vitest";
import { changesBetween } from "./change-log";
import { defaultConfig } from "./store";

const base = () => defaultConfig();
const withConf = (records: unknown[]) => ({ ...base(), confirmations: { records } }) as never;

describe("changesBetween", () => {
  it("lists a record added, and an edited one as removed plus added", () => {
    const a = { key: "L1", answer: "confirmed", by: "Sam" };
    const b = { key: "L1", answer: "rejected", by: "Sam" };
    expect(changesBetween(withConf([]), withConf([a]), "Sam", "cnf-confirm", "T").map((e) => [e.change, e.key])).toEqual([["added", "L1"]]);
    expect(changesBetween(withConf([a]), withConf([b]), "Sam", "cnf-reject", "T").map((e) => e.change)).toEqual(["added", "removed"]);
  });
  it("lists nothing when nothing in the logged parts changed", () => {
    expect(changesBetween(base(), { ...base(), graceDays: 9 }, "Sam", "x", "T")).toEqual([]);
  });
  it("cuts a very large change and says how much was left out", () => {
    const many = Array.from({ length: 700 }, (_, i) => ({ key: `L${i}` }));
    const r = changesBetween(withConf([]), withConf(many), "Sam", "asg-auto", "T");
    expect(r).toHaveLength(501);
    expect(r[500]).toMatchObject({ section: "note", record: { leftOut: 200 } });
  });
});
