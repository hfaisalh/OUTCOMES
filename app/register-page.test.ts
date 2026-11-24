/**
 * register-page.test.ts
 *
 * What it does: tests the Beneficiaries page and its window (DECISIONS 163) on invented people: the table with ID, kind, age or size, area and guardian or members, the filters, the empty states, the
 * window for a person and for a household, the tick box that appears for a possible match, and that names are never trusted as HTML. These tests double as examples.
 * Who calls it: vitest. Depends on: register-page.ts, register-form.ts and beneficiaries.ts.
 */

import { describe, expect, it } from "vitest";
import { registerPage } from "./register-page";
import { registerFormHtml } from "./register-form";
import { addBeneficiary, emptyRegister, NO_FILTER, type Register } from "../modules/07-beneficiaries/beneficiaries";
import type { View } from "./pages";

const ok = (r: { value: Register } | { error: string }): Register => { if ("error" in r) throw new Error(r.error); return r.value; };
const reg = (): Register => {
  let r = ok(addBeneficiary(emptyRegister(), "person", { name: "Ayesha Khan", dob: "2014-03-09", guardian: "Samina Khan", area: "Dadyal" }));
  r = ok(addBeneficiary(r, "person", { name: "Bilal Raza", area: "Mirpur" }));
  return ok(addBeneficiary(r, "household", { name: "Khan family", area: "Dadyal", memberIds: ["PRS-0001"] }));
};
const view = (over: Partial<View> = {}): View => ({ beneficiaries: reg(), today: "2026-11-24", ...over }) as View;

describe("the Beneficiaries page", () => {
  it("lists each record with its ID, kind, age or size, area and guardian or members, and opens it on a click", () => {
    const html = registerPage(view());
    expect(html).toContain("<h1>Beneficiaries</h1>");
    expect(html).toContain('<span class="refbox">PRS-0001</span>');
    expect(html).toContain("12 yrs"); // born 2014-03-09, today 24/11/2026
    expect(html).toContain("Samina Khan");
    expect(html).toContain('<td class="num">1</td>'); // the household has one person listed
    expect(html).toContain("Ayesha Khan"); // the household's member by name
    expect(html).toContain('data-bn="open" data-id="HH-0001"');
    expect(html).toContain('data-bn="new" data-kind="person"');
    expect(html).toContain('data-bn="new" data-kind="household"');
  });
  it("filters by kind, status and text, and says so when nothing matches or nothing is there", () => {
    expect(registerPage(view({ registerFilter: { ...NO_FILTER, kind: "household" } }))).not.toContain("Bilal Raza");
    expect(registerPage(view({ registerFilter: { ...NO_FILTER, text: "mirpur" } }))).not.toContain("Ayesha Khan</b>");
    expect(registerPage(view({ registerFilter: { ...NO_FILTER, text: "zzz" } }))).toContain("Nothing matches.");
    expect(registerPage(view({ beneficiaries: emptyRegister() }))).toContain("No beneficiaries yet.");
    expect(registerPage(view({ registerFilter: { ...NO_FILTER, kind: "person" } }))).toContain('<option value="person" selected>People</option>');
  });
  it("never trusts a name as HTML", () => {
    const r = ok(addBeneficiary(emptyRegister(), "person", { name: "<img src=x onerror=alert(1)>", area: "<script>1</script>" }));
    const html = registerPage(view({ beneficiaries: r }));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>1");
  });
});

describe("the beneficiary window", () => {
  it("asks a person for name, date of birth, gender, guardian, area and notes, and has no status or Remove while new", () => {
    const html = registerFormHtml({}, "", "person", []);
    for (const id of ["rg-name", "rg-dob", "rg-gender", "rg-guardian", "rg-area", "rg-notes"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("New person");
    expect(html).not.toContain('id="rg-status"');
    expect(html).not.toContain('data-bn="remove"');
    expect(html).toContain("Contact details are not kept here");
  });
  it("asks a household for a name, a size and the persons in it, ticked from the register", () => {
    const persons = reg().records.filter((r) => r.kind === "person");
    const html = registerFormHtml({ memberIds: ["PRS-0001"] }, "", "household", persons);
    expect(html).toContain("New household");
    expect(html).toContain('id="rg-size"');
    expect(html).toContain('class="rg-member" value="PRS-0001" checked');
    expect(html).toContain('class="rg-member" value="PRS-0002">');
    expect(html).not.toContain('id="rg-dob"');
  });
  it("shows an existing record with its ID, status and a Remove button, filled in", () => {
    const rec = reg().records[0]!;
    const html = registerFormHtml(rec, rec.id, "person", []);
    expect(html).toContain('id="rg-name" value="Ayesha Khan"');
    expect(html).toContain('id="rg-dob" value="2014-03-09"');
    expect(html).toContain('<select id="rg-status">');
    expect(html).toContain('data-bn="remove"');
  });
  it("shows the tick box only when the duplicate check found a possible match, and shows the message where the person is looking", () => {
    expect(registerFormHtml({}, "", "person", [])).not.toContain('id="rg-different"');
    const warn = registerFormHtml({ name: "Ayesha Khan" }, "", "person", [], "Possible match: Ayesha Khan (PRS-0001). If this is a different person, tick that it is not the same and save again.");
    expect(warn).toContain('id="rg-different"');
    expect(warn).toContain('role="alert">Possible match');
    expect(registerFormHtml({ name: "Ayesha Khan" }, "", "person", [], "Ayesha Khan (PRS-0001) is already in the register.")).not.toContain('id="rg-different"');
  });
});
