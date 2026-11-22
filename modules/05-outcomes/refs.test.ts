/**
 * refs.test.ts
 *
 * What it does: tests IDs for outcomes and allocations (DECISIONS 105): the prefix of each type, the next free number, never giving one twice, and giving
 * IDs to older outcomes. Invented data. These tests double as examples.
 * Who calls it: vitest. Depends on: refs.ts and outcome-types.ts.
 */

import { describe, expect, it } from "vitest";
import { addOutcomeType, setPrefix, starterOutcomeTypes, type OutcomeType } from "./outcome-types";
import type { Allocation, Outcome } from "./outcomes";
import { cleanPrefix, defaultPrefix, ensureRefs, nextRef, validPrefix, withPrefixes } from "./refs";

const out = (id: string, over: Partial<Outcome> = {}): Outcome => ({ id, name: id, type: "orphan", cohort: "", frameworkId: "f", active: true, ...over });
const alloc = (key: string, over: Partial<Allocation> = {}): Allocation => ({ commitmentKey: key, outcomeId: "x", parts: 1, how: "auto", at: "t", ...over });
const ok = (r: { types: OutcomeType[] } | { error: string }): OutcomeType[] => { if ("error" in r) throw new Error(r.error); return r.types; };

describe("prefixes", () => {
  it("cleans and checks a prefix, and suggests one from a name that is not taken", () => {
    expect(cleanPrefix("o-r p!")).toBe("ORP");
    expect(validPrefix("ORP")).toBe(true);
    expect(validPrefix("C")).toBe(false);
    expect(validPrefix("TOOLONG")).toBe(false);
    expect(defaultPrefix("House build", [])).toBe("HOU");
    expect(defaultPrefix("House build", ["HOU"])).toBe("HOU2");
  });
  it("starts Orphan as ORP and Water pump as PMP, and a new type gets a suggestion", () => {
    const t = ok(addOutcomeType(starterOutcomeTypes(), "Rickshaw"));
    expect(t.map((x) => x.prefix)).toEqual(["ORP", "PMP", "RIC"]);
  });
  it("lets a type change its prefix, but never to one another type uses", () => {
    const t = starterOutcomeTypes();
    expect(ok(setPrefix(t, "orphan", "kid"))[0]?.prefix).toBe("KID");
    expect(setPrefix(t, "orphan", "PMP")).toHaveProperty("error");
    expect(setPrefix(t, "orphan", "x")).toHaveProperty("error");
  });
  it("gives a type saved before IDs existed a prefix", () => {
    const old = starterOutcomeTypes().map(({ prefix: _p, ...rest }) => rest as OutcomeType);
    expect(withPrefixes(old).map((x) => x.prefix)).toEqual(["ORP", "PMP"]);
  });
});

describe("IDs", () => {
  it("counts up for a prefix with at least four digits, and skips one already in use", () => {
    const a = nextRef("ORP", {}, new Set());
    expect(a.ref).toBe("ORP-0001");
    expect(nextRef("ORP", a.counters, new Set(["ORP-0002"])).ref).toBe("ORP-0003");
    expect(nextRef("ORP", { ORP: 9999 }, new Set()).ref).toBe("ORP-10000");
  });
  it("gives every outcome and allocation without an ID one, from its type, and the child type to older outcomes", () => {
    const types = starterOutcomeTypes();
    const r = ensureRefs({ outcomes: [out("a"), out("b"), out("p", { outcomeTypeId: "water-pump" })], allocations: [alloc("S1"), alloc("S2")], counters: {} }, types);
    expect(r.outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "ORP-0002", "PMP-0001"]);
    expect(r.outcomes[0]?.outcomeTypeId).toBe("orphan");
    expect(r.allocations.map((a) => a.ref)).toEqual(["AL-0001", "AL-0002"]);
    expect(r.changed).toBe(true);
  });
  it("is steady: running it again changes nothing, and nothing is given twice", () => {
    const types = starterOutcomeTypes();
    const first = ensureRefs({ outcomes: [out("a")], allocations: [alloc("S1")], counters: {} }, types);
    const again = ensureRefs(first, types);
    expect(again.changed).toBe(false);
    expect(again.outcomes).toEqual(first.outcomes);
    // a new outcome continues the count
    const more = ensureRefs({ ...first, outcomes: [...first.outcomes, out("c")] }, types);
    expect(more.outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "ORP-0002"]);
  });
  it("keeps a typed or bulk assigned ID, raises the counter past it, and never repeats it", () => {
    const types = starterOutcomeTypes();
    const r = ensureRefs({ outcomes: [out("a", { ref: "ORP-0007" }), out("b")], allocations: [], counters: {} }, types);
    expect(r.outcomes.map((o) => o.ref)).toEqual(["ORP-0007", "ORP-0008"]);
    // an ID from another scheme is kept as it is
    expect(ensureRefs({ outcomes: [out("a", { ref: "HYS-12" })], allocations: [], counters: {} }, types).outcomes[0]?.ref).toBe("HYS-12");
  });
  it("changing a prefix changes new IDs only", () => {
    const types = starterOutcomeTypes();
    const first = ensureRefs({ outcomes: [out("a")], allocations: [], counters: {} }, types);
    const renamed = ok(setPrefix(types, "orphan", "KID"));
    const next = ensureRefs({ ...first, outcomes: [...first.outcomes, out("b")] }, renamed);
    expect(next.outcomes.map((o) => o.ref)).toEqual(["ORP-0001", "KID-0001"]);
  });
  it("uses the type that has the outcome's framework", () => {
    const types = starterOutcomeTypes().map((t) => (t.id === "water-pump" ? { ...t, frameworkIds: ["delivered-once"] } : t));
    const r = ensureRefs({ outcomes: [out("p", { frameworkId: "delivered-once" })], allocations: [], counters: {} }, types);
    expect(r.outcomes[0]).toMatchObject({ outcomeTypeId: "water-pump", ref: "PMP-0001" });
  });
});
