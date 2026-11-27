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
import { matchText, pickerHtml, rankPersons, SHOWN } from "./household-picker";
import { addBeneficiary, emptyRegister, NO_FILTER, type Beneficiary, type Register } from "../modules/07-beneficiaries/beneficiaries";
import type { View } from "./pages";
import type { WorkOrder } from "../modules/01c-crm-connector/work-orders";
import type { FrameworkTemplate } from "../modules/02-project-rules/categories";
import type { Placement } from "../modules/09-placement/placement";

const ok = (r: { value: Register } | { error: string }): Register => { if ("error" in r) throw new Error(r.error); return r.value; };
const reg = (): Register => {
  let r = ok(addBeneficiary(emptyRegister(), "person", { name: "Ayesha Khan", dob: "2014-03-09", guardian: "Samina Khan", area: "Dadyal" }));
  r = ok(addBeneficiary(r, "person", { name: "Bilal Raza", area: "Mirpur" }));
  return ok(addBeneficiary(r, "household", { name: "Khan family", area: "Dadyal", memberIds: ["PRS-0001"] }));
};
const view = (over: Partial<View> = {}): View => ({ beneficiaries: reg(), today: "2026-11-24", ...over }) as View;

const sub = (n: number, paid: string, over: Partial<WorkOrder> = {}): WorkOrder => ({
  key: `L${n}`, lineId: `L${n}`, transactionRef: `T${n}`, paidDate: paid, supporterId: "S1", supporterName: "Invented Donor", group: "", itemId: "I10", itemName: "Orphan Sponsorship Monthly", amount: 30, quantity: 1,
  intention: "", subscriptionId: "SUB1", instalmentNumber: String(n), instalmentCount: "12", frameworkId: "wf", categoryId: "sponsorship", status: "ready", projectName: "Aghosh", planStatus: "active", ...over,
}) as WorkOrder;
const fw = { id: "wf", unitsPerBeneficiary: 3 } as FrameworkTemplate;
const gp = { id: "aghosh", name: "Aghosh", crmNames: [], partnerIds: [], clusters: [{ id: "c1", name: "Class 1", label: "Class", parentId: "", place: "", status: "active" as const }] };
const enrol = { id: "EN-1", beneficiaryId: "PRS-0001", giftProjectId: "aghosh", clusterId: "c1", itemId: "I10", role: "", status: "active" as const, since: "2026-09-01" };
const placed = (over: Partial<Placement> = {}): Placement => ({ key: "sub:SUB1", kind: "place", enrolmentId: "EN-1", outcomeRef: "", giftProjectId: "aghosh", itemId: "I10", parts: 3, how: "auto", at: "x", ...over });
const live = (over: Partial<View> = {}): View => view({ workOrders: [sub(1, "2026-09-05"), sub(2, "2026-10-05")], frameworks: [fw], giftProjects: [gp], enrolments: { records: [enrol], counter: 1 }, placements: { records: [placed()], counter: 0 }, ...over });

describe("the household picker", () => {
  const mk = (id: string, name: string, guardian: string, area = ""): Beneficiary => ({ id, name, guardian, area, kind: "person" }) as Beneficiary;
  const people = [mk("PRS-1", "Zara", "Mrs Ali", "North"), mk("PRS-2", "Adam", "Mrs Bibi", "South"), mk("PRS-3", "Bilal", "Mrs Ali", "South"), mk("PRS-4", "Carla", "", "North")];
  it("finds a person by any word of the name, ID, guardian or area", () => {
    expect(people.filter((p) => matchText(p, "ali")).map((p) => p.id)).toEqual(["PRS-1", "PRS-3"]);
    expect(people.filter((p) => matchText(p, "south bibi")).map((p) => p.id)).toEqual(["PRS-2"]);
    expect(people.filter((p) => matchText(p, "")).length).toBe(4);
  });
  it("lists people who share a guardian, then an area, with the members first", () => {
    expect(rankPersons([people[1]!, people[2]!, people[3]!], [people[0]!]).map((p) => p.id)).toEqual(["PRS-3", "PRS-4", "PRS-2"]); // Bilal shares the guardian, Carla the area
  });
  it("shows a person who is in another household with it, offers Move here, and lists them after the free ones (DECISIONS 244)", () => {
    const home = { id: "HH-1", kind: "household", name: "Ali family", memberIds: ["PRS-1"], guardian: "", area: "" } as unknown as Beneficiary;
    const html = pickerHtml(people, [], [home], "HH-2");
    expect(html).toContain('<span class="hh-home" title="Saving this household takes them out of Ali family">in Ali family (HH-1)</span>');
    expect(html).toMatch(/data-hh-add="PRS-1">Move here</);
    expect(html).toMatch(/data-hh-add="PRS-2">Add</);
    expect(html.indexOf('data-id="PRS-1"')).toBeGreaterThan(html.indexOf('data-id="PRS-4"')); // free people first
    expect(pickerHtml(people, [], [home], "HH-1")).not.toContain("Move here"); // a person is not "in another household" when it is this one
  });
  it("lists only the first few matches, and the rest by typing", () => {
    const many = Array.from({ length: 30 }, (_, i) => mk(`PRS-${i + 10}`, `Child ${i}`, "", ""));
    expect((pickerHtml(many, []).match(/class="hh-item"/g) ?? []).length).toBe(30);
    expect((pickerHtml(many, []).match(/class="hh-item"[^>]*hidden/g) ?? []).length).toBe(30 - SHOWN);
  });
});

describe("the Beneficiaries tiles count people", () => {
  it("counts a person enrolled in two benefits once", () => {
    const two = [enrol, { ...enrol, id: "EN-2", itemId: "I11" }];
    const html = registerPage(view({ workOrders: [sub(1, "2026-09-05")], frameworks: [fw], giftProjects: [gp], enrolments: { records: two, counter: 2 } }));
    expect(html).toContain("<b>3</b><span>Beneficiaries</span>"); // Ayesha (two rows), Bilal and the Khan household
    expect(html).toContain("<b>1</b><span>Enrolled</span>");
    expect(html).toContain("<b>2</b> not enrolled yet");
  });
});

describe("the Beneficiaries page, month by month", () => {
  it("shows each beneficiary with the ID, name, kind and where, and opens the profile on a click", () => {
    const html = registerPage(view());
    expect(html).toContain("<h1>Beneficiaries</h1>");
    expect(html).toContain('title="PRS-0001 · Dadyal"><b>Ayesha Khan</b>'); // the ID is in the tooltip, not a column
    expect(html).toContain('<td class="num">12</td>'); // born 2014-03-09, today 24/11/2026
    expect(html).toContain('data-regsort="status">Status');
    expect(html).not.toContain("<th>ID</th>");
    expect(html).toContain('data-bn="open" data-id="HH-0001"');
    expect(html).toContain("Not enrolled in any benefit yet");
    expect(html).not.toContain("<th>Guardian or members</th>");
    expect(html).toContain('data-bn="new" data-kind="person"');
    expect(html).toContain('data-bn="new" data-kind="household"');
  });
  it("draws one line for an enrolment: project, the benefit, plan, donor, units filled of the whole, and a pie for each of twelve months with the legend", () => {
    const html = registerPage(live());
    expect(html).toContain("<td>Aghosh</td>");
    expect(html).toContain("2/12"); // the plan like the Gifts list: paid over planned
    expect(html).toContain('title="Recurring gift"'); // the recurring icon before the donor
    expect(html).toContain("Invented Donor");
    expect(html).not.toContain("<br>");
    expect(html).toContain("Orphan Sponsorship Monthly");
    expect(html).toContain(">75%</td>"); // 2 months paid and 7 expected, of the 12 shown, is 9 of 12
    expect(html).toContain('class="dot on"');
    expect((html.match(/<td class="m">/g) ?? []).length).toBe(12);
    expect(html).toContain('<th class="m now">Nov</th>');
    expect(html).toContain('class="sw p"');
    expect(html).toContain("Unfilled</span>");
    expect(html).not.toContain("Nothing expected");
  });
  it("shows a unit with no gift in its own colour so a gap stands out, and finds gaps, failed payments and donors", () => {
    const part = registerPage(live({ placements: { records: [placed({ parts: 2 })], counter: 0 } }));
    expect(part).toContain('class="seg g"');
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, show: "gaps" } }))).not.toContain("Ayesha Khan</b>");
    expect(registerPage(live({ placements: { records: [placed({ parts: 2 })], counter: 0 }, registerFilter: { ...NO_FILTER, show: "gaps" } }))).toContain("Ayesha Khan</b>");
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, text: "invented donor" } }))).toContain("Ayesha Khan</b>");
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, text: "nobody" } }))).toContain("Nothing matches.");
    const late = registerPage(live({ workOrders: [sub(1, "2026-08-05")], registerFilter: { ...NO_FILTER, show: "missed" } }));
    expect(late).toContain("Ayesha Khan</b>");
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, show: "missed" } }))).not.toContain("Ayesha Khan</b>"); // all paid so far, none missed // paid in August only, so September to now are missed
  });
  it("colours a month paid when a payment was made, and the ones after it expected, with one slice for each unit", () => {
    const html = registerPage(live());
    expect(html).toContain('aria-label="Sep 2026"><circle class="ring" cx="12" cy="12" r="11.7" stroke-width=".7"/><circle class="ring" cx="12" cy="12" r="6.3" stroke-width=".7"/><circle class="seg p"');
    expect((html.match(/aria-label="Oct 2026">(<circle class="ring"[^>]*\/>){2}(<circle class="seg p"[^>]*\/>){3}/g) ?? []).length).toBe(1);
    expect(html).toContain('class="seg e"'); // a later month of a plan that still runs
  });
  it("shows units not filled as nothing expected, and a placement that has ended holds nothing", () => {
    const part = registerPage(live({ placements: { records: [placed({ parts: 1 })], counter: 0 } }));
    expect(part).toContain('class="seg g"');
    expect(part).toContain('class="seg g"');
    const ended = registerPage(live({ placements: { records: [placed({ to: "2026-11-01", endReason: "paused" })], counter: 0 } }));
    expect(ended).toContain(">0%</td>");
    expect(ended).not.toContain('class="seg p"');
  });
  it("shows a single payment the rules do not count per period (a scholarship) with a plan and its paid month, and the months after it unfilled", () => {
    const one = sub(1, "2026-10-05", { key: "ONE1", subscriptionId: "", instalmentNumber: "", instalmentCount: "" });
    const html = registerPage(live({ workOrders: [one], placements: { records: [placed({ key: "ONE1", parts: 3 })], counter: 0 } }));
    expect(html).toContain("1/1");
    expect(html).toContain('aria-label="Oct 2026"><circle class="ring" cx="12" cy="12" r="11.7" stroke-width=".7"/><circle class="ring" cx="12" cy="12" r="6.3" stroke-width=".7"/><circle class="seg p"');
    expect(html).toContain('title="One payment"');
    expect(html).toContain('class="seg g"'); // the months after the one payment are unfilled: the gift's period has ended (decision 213)
  });
  it("shows a single payment that covers a year as a complete plan, 12/12, all twelve months paid", () => {
    const one = sub(1, "2026-10-05", { key: "ONE1", subscriptionId: "", instalmentNumber: "", instalmentCount: "", periodCount: 12 });
    const html = registerPage(live({ workOrders: [one], placements: { records: [placed({ key: "ONE1", parts: 3 })], counter: 0 } }));
    expect(html).toContain("12/12");
    expect((html.match(/class="seg p"/g) ?? []).length).toBe(3 * 8); // October to May are paid, 8 months of 3 units
    expect(html).toContain(">67%</td>");
  });
  it("sorts by a column heading, reverses on a second click, puts empty values last, and marks the sorted heading", () => {
    const names = (html: string): string[] => [...html.matchAll(/<td class="nm"[^>]*><b>([^<]*)<\/b>/g)].map((m) => m[1] as string);
    const two = live({ beneficiaries: reg() });
    expect(two.registerSort).toBeUndefined();
    expect(registerPage(two)).toContain('data-regsort="allocated"');
    expect(names(registerPage(live({ registerSort: { key: "allocated", dir: "asc" } })))[0]).toBe("Ayesha Khan"); // the only enrolled one has a score, the others have none and go last
    expect(names(registerPage(live({ registerSort: { key: "name", dir: "desc" } })))[0]).toBe("Khan family");
    expect(names(registerPage(live({ registerSort: { key: "name", dir: "asc" } })))[0]).toBe("Ayesha Khan");
    expect(registerPage(live({ registerSort: { key: "age", dir: "asc" } }))).toContain("Age \u25B2");
    expect(registerPage(live({ registerSort: { key: "age", dir: "desc" } }))).toContain("Age \u25BC");
    expect(registerPage(live())).toContain('class="tablewrap regwrap"');
  });
  it("gives a beneficiary with two benefits two rows, and filters by project", () => {
    const two = live({ enrolments: { records: [enrol, { ...enrol, id: "EN-2", itemId: "I11" }], counter: 2 } });
    expect((registerPage(two).match(/data-id="PRS-0001"/g) ?? []).length).toBe(2);
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, project: "aghosh" } }))).not.toContain("Bilal Raza");
    expect(registerPage(live({ registerFilter: { ...NO_FILTER, project: "aghosh" } }))).toContain("Ayesha Khan");
    expect(registerPage(live())).toContain('<option value="aghosh">Aghosh</option>');
  });
});

describe("the Beneficiaries page, filters", () => {
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
  it("asks a person for the details an admission needs, and has no status or Remove while new", () => {
    const html = registerFormHtml({}, "", "person", []);
    for (const id of ["rg-name", "rg-dob", "rg-gender", "rg-pob", "rg-idnumber", "rg-father", "rg-mother", "rg-guardian", "rg-guardianrel", "rg-eligibility", "rg-eligibilitynote", "rg-area", "rg-partner", "rg-partnerref", "rg-notes"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("New person");
    expect(html).not.toContain('id="rg-status"');
    expect(html).not.toContain('data-bn="remove"');
    expect(html).toContain("Contact details, health records, fingerprints and documents are not kept here");
  });
  it("lets a person be meant for a project, and says where they stand in the line (DECISIONS 246)", () => {
    const html = registerFormHtml({ targetProjectId: "p1" }, "PRS-0001", "person", [], "", [], [], [{ id: "p1", name: "Aghosh" }], "Waiting for Aghosh: 2 of 5 in line (first in, first out).");
    expect(html).toMatch(/id="rg-target">.*<option value="p1" selected>Aghosh<\/option>/s);
    expect(html).toContain("2 of 5 in line");
    expect(registerFormHtml({}, "", "household", [], "", [], [], [{ id: "p1", name: "Aghosh" }])).not.toContain('id="rg-target"'); // a household has no target
  });
  it("has a Priority switch with a reason, ticked when the person has priority (DECISIONS 247)", () => {
    const on = registerFormHtml({ priority: true, priorityNote: "Both parents deceased" }, "PRS-0001", "person", []);
    expect(on).toMatch(/id="rg-priority" checked/);
    expect(on).toContain('value="Both parents deceased"');
    expect(registerFormHtml({}, "", "person", [])).not.toMatch(/id="rg-priority" checked/);
  });
  it("offers the partners a record may come from, and the admission decisions, and shows them selected", () => {
    const html = registerFormHtml({ partnerId: "al-noor", partnerRef: "AN-77", eligibility: "review", fatherStatus: "deceased" }, "PRS-0001", "person", [], "", [{ id: "al-noor", name: "Al-Noor" }, { id: "other", name: "Other" }]);
    expect(html).toContain('<option value="al-noor" selected>Al-Noor</option>');
    expect(html).toContain('id="rg-partnerref" value="AN-77"');
    expect(html).toContain('<option value="review" selected>Needs review</option>');
    expect(html).toContain('<option value="deceased" selected>Deceased</option>');
  });
  it("asks a household for a name, a size and its persons, as chips with a search to add more (DECISIONS 242)", () => {
    const persons = reg().records.filter((r) => r.kind === "person");
    const html = registerFormHtml({ memberIds: ["PRS-0001"] }, "", "household", persons);
    expect(html).toContain("New household");
    expect(html).toContain('id="rg-size"');
    expect(html).toContain('class="rg-member" value="PRS-0001" checked hidden'); // a member is a chip holding the ticked box the save reads
    expect(html).toContain('data-hh-add="PRS-0002"'); // another person is found in the list and added
    expect(html).not.toContain('data-hh-add="PRS-0001"'); // a member is not offered again
    expect(html).toContain('id="hh-search"');
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
