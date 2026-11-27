/**
 * import.test.ts
 *
 * What it does: tests how a partner adds many beneficiaries from a CSV file (DECISIONS 271): reading the file (column names, dates, gender, parents, projects, repeats in the file, limits), the template, and adding the rows with the one-by-one rule so a bad row does not stop the others and another partner's records are never described.
 * Invented people. These tests double as examples. Who calls it: vitest. Depends on: import.ts.
 */
import { describe, expect, it } from "vitest";
import { addBeneficiary, emptyRegister } from "../07-beneficiaries/beneficiaries";
import { addMany, MAX_ROWS, readBeneficiaryCsv, templateCsv, TEMPLATE_HEADER } from "./import";

const projects = [{ id: "g1", name: "Orphan Homes" }, { id: "g2", name: "Girls School" }];
const csv = (...lines: string[]): string => lines.join("\r\n");
const read = (...lines: string[]) => readBeneficiaryCsv(csv(...lines), projects);

describe("reading the file", () => {
  it("takes the columns by name in any order and spelling close to the template, ignoring ones it does not know", () => {
    const r = read("DOB,Full name,Phone,CNIC,Sex", "02/04/2016,Amina Khan,0300,B-1,F");
    expect(r.problem).toBe("");
    expect(r.rows[0]).toEqual({ line: 2, error: "", values: { dob: "2016-04-02", name: "Amina Khan", idNumber: "B-1", gender: "female" } });
  });

  it("makes a date from YYYY-MM-DD or DD/MM/YYYY and never guesses a bad one", () => {
    const r = read("Name,Date of birth", "A One,2016-04-02", "B Two,2/4/2016", "C Three,31/02/2016", "D Four,04/02/16", "E Five,");
    expect(r.rows.map((x) => x.values["dob"] ?? "")).toEqual(["2016-04-02", "2016-04-02", "31/02/2016", "04/02/16", ""]);
    expect(r.rows.map((x) => x.error)).toEqual(["", "", "Write the date of birth as YYYY-MM-DD or DD/MM/YYYY.", "Write the date of birth as YYYY-MM-DD or DD/MM/YYYY.", ""]);
  });

  it("understands gender and living or deceased parents in simple words, and flags anything else", () => {
    const r = read("Name,Gender,Father,Mother", "A One,male,Dead,alive", "B Two,girl,late,", "C Three,other,,", "D Four,,unknown,");
    expect(r.rows[0]!.values).toMatchObject({ gender: "male", fatherStatus: "deceased", motherStatus: "living" });
    expect(r.rows[1]!.values).toMatchObject({ gender: "female", fatherStatus: "deceased" });
    expect(r.rows[2]!.error).toBe("Gender is female or male.");
    expect(r.rows[3]!.error).toBe("Father is living or deceased.");
  });

  it("matches the Project column to a project the partner delivers, by name or id, and flags one it does not", () => {
    const r = read("Name,Project", "A One,orphan homes", "B Two,g2", "C Three,Boys College", "D Four,");
    expect(r.rows.map((x) => x.values["targetProjectId"] ?? "")).toEqual(["g1", "g2", "", ""]);
    expect(r.rows[2]!.error).toBe('"Boys College" is not a project you deliver.');
    expect(r.rows[3]!.error).toBe(""); // no project on the row: the one chosen for the whole upload applies
  });

  it("flags a row that repeats an earlier row of the same file, by ID number or by name and date of birth", () => {
    const r = read("Name,Date of birth,National ID", "A One,2016-01-01,B-1", "B Two,2017-01-01,b-1", "A  One,2016-01-01,", "C Three,2018-01-01,B-3");
    expect(r.rows.map((x) => x.error)).toEqual(["", "The same person as line 2.", "The same person as line 2.", ""]);
  });

  it("flags a row with no name, skips blank rows, and numbers the rows with the header as row 1", () => {
    const r = read("Name,Area", "A One,Chak 5", ",,", "", "B,Chak 6", "C Three,Chak 7");
    expect(r.rows.map((x) => [x.line, x.error])).toEqual([[2, ""], [3, "Give a name."], [4, ""]]);
  });

  it("refuses a file that cannot be used, saying why", () => {
    expect(read("Age,Area", "5,Chak").problem).toContain("one must be Name");
    expect(read("Name,Area").problem).toBe("The file has no rows under the column names.");
    expect(read("Name;Area", "A One;Chak").problem).toContain("semicolons");
    const many = ["Name", ...Array.from({ length: MAX_ROWS + 1 }, (_, i) => `Person ${i}`)];
    expect(read(...many).problem).toBe(`Upload at most ${MAX_ROWS} beneficiaries at a time. This file has ${MAX_ROWS + 1}.`);
    expect(readBeneficiaryCsv("﻿Name\r\nA One", projects).rows).toHaveLength(1); // a spreadsheet's hidden start mark is ignored
  });

  it("gives a template whose columns it reads back, with an invented example row", () => {
    const r = readBeneficiaryCsv(templateCsv(), projects);
    expect(r.problem).toBe("");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ error: "", values: { name: "Amina Khan", dob: "2016-04-02", gender: "female", fatherStatus: "living", motherStatus: "deceased" } });
    expect(templateCsv().split("\r\n")[0]).toBe(TEMPLATE_HEADER.join(","));
  });
});

describe("adding the rows", () => {
  const rows = (...vs: Record<string, string>[]) => vs.map((values, i) => ({ line: i + 2, values }));
  const full = (name: string, idNumber: string, extra: Record<string, string> = {}) => ({ name, dob: "2016-04-02", guardian: "A mother", idNumber, ...extra });

  it("adds every good row as the partner's own, meant for the project, and lets a bad row fail without stopping the rest", () => {
    const r = addMany(emptyRegister(), "p1", ["g1", "g2"], rows(full("Amina Khan", "B-1"), { name: "X", dob: "bad" }, full("Bilal Ahmed", "B-2", { targetProjectId: "g2" })), "g1", false, "2026-11-27");
    expect(r.added.map((a) => [a.line, a.id])).toEqual([[2, "PRS-0001"], [4, "PRS-0002"]]);
    expect(r.skipped).toEqual([{ line: 3, name: "X", error: "Give a name." }]);
    expect(r.register.records.map((b) => [b.name, b.partnerId, b.targetProjectId])).toEqual([["Amina Khan", "p1", "g1"], ["Bilal Ahmed", "p1", "g2"]]);
  });

  it("refuses a project the partner does not deliver, and a row that repeats one just added", () => {
    const r = addMany(emptyRegister(), "p1", ["g1"], rows(full("Amina Khan", "B-1", { targetProjectId: "elsewhere" }), full("Bilal Ahmed", "B-2"), full("Other Name", "B-2")), "g1", false, "2026-11-27");
    expect(r.added.map((a) => a.name)).toEqual(["Bilal Ahmed"]);
    expect(r.skipped.map((s) => s.error)).toEqual([expect.stringContaining("Choose the project"), expect.stringContaining("is already in your register.")]);
  });

  it("never describes another partner's record, and the same-person box applies to all rows at once", () => {
    const theirs = addBeneficiary(emptyRegister(), "person", { name: "Private Person", dob: "2012-12-12", idNumber: "B-SECRET", partnerId: "p2", targetProjectId: "g1" }, false, "2026-11-01");
    if ("error" in theirs) throw new Error(theirs.error);
    const r = addMany(theirs.value, "p1", ["g1"], rows(full("Someone", "B-SECRET")), "g1", false, "2026-11-27");
    expect(r.skipped[0]!.error).toBe("This person is already registered. Please contact MWF to sort it out.");
    expect(JSON.stringify(r.skipped)).not.toMatch(/Private|2012|PRS-0001/);
    const mine = addMany(emptyRegister(), "p1", ["g1"], rows(full("Amina Khan", "B-1")), "g1", false, "2026-11-27").register;
    const similar = rows({ name: "Amina Khan", dob: "2017-01-01" });
    expect(addMany(mine, "p1", ["g1"], similar, "g1", false, "2026-11-27").skipped[0]!.error).toContain("Possible match");
    expect(addMany(mine, "p1", ["g1"], similar, "g1", true, "2026-11-27").added).toHaveLength(1);
  });
});
