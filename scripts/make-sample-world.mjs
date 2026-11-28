/**
 * make-sample-world.mjs
 *
 * What it does: writes the invented "sample world" (DECISIONS 329): three CRM Export Centre files (Donation lines, Catalogue, Recurring plans) in samples/world/, with every date counted back from one day, so the gifts are of every age and plans are in every state. Upload them on Data > Upload files, like real exports.
 * Who calls it: a person, when the dates have gone stale: `node scripts/make-sample-world.mjs 2026-11-28` (the day gifts are counted back from; today when left out). The tests read the files already written.
 * What it covers: sponsorships that run until cancelled (new, mid-way, paused, cancelled, a payment overdue past the grace days), a limited scholarship (one finished its term), pumps paid once and in instalments (fully paid and waiting for the last payment), a home paid in six, livelihood and camp gifts, and a general gift that needs no feedback. Everything is invented: donors are "Sample Supporter" and nothing real is used.
 */

import { mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] ? new Date(`${process.argv[2]}T09:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + "T09:00:00Z");
const p2 = (n) => String(n).padStart(2, "0");
const dmy = (offset) => { const d = new Date(base.getTime() + offset * 86400000); return `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(10 + (Math.abs(offset) % 8))}:${p2((Math.abs(offset) * 7) % 60)}`; };
const csv = (rows) => rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(",")).join("\n") + "\n";

// --- The items (the catalogue) ---
const ITEMS = {
  ORP: { code: "MWF-ORP-001", name: "Orphan Sponsorship Monthly", cause: "Orphans", causeSku: "ORP", project: "Aghosh Orphan Home", feedback: "Feedback report", sub: "Yes", planned: "", cancel: "Yes", cost: 30, period: "Monthly", intention: "Sadaqah" },
  HIF: { code: "MWF-HIF-001", name: "Hifz Sponsorship Monthly", cause: "Hifz", causeSku: "HIF", project: "Hifz Academy", feedback: "Feedback report", sub: "Yes", planned: "", cancel: "Yes", cost: 25, period: "Monthly", intention: "Sadaqah" },
  ALM: { code: "MWF-ALM-001", name: "Aalim Scholarship", cause: "Scholarships", causeSku: "SCH", project: "Scholarship Programme", feedback: "Feedback report", sub: "Yes", planned: "12", cancel: "No", cost: 40, period: "Recurring", intention: "Sadaqah" },
  SPU: { code: "MWF-WAT-001", name: "Small Pump", cause: "Water", causeSku: "WAT", project: "Water for Villages", feedback: "Feedback report", sub: "No", planned: "", cancel: "", cost: 150, period: "One-time", intention: "Sadaqah Jariyah" },
  LPU: { code: "MWF-WAT-002", name: "Large Pump", cause: "Water", causeSku: "WAT", project: "Water for Villages", feedback: "Feedback report", sub: "Yes", planned: "4", cancel: "No", cost: 150, period: "Recurring", intention: "Sadaqah Jariyah" },
  BLD: { code: "MWF-BLD-001", name: "Build A Home", cause: "Housing", causeSku: "HOU", project: "Homes for Families", feedback: "Feedback report", sub: "Yes", planned: "6", cancel: "No", cost: 500, period: "Recurring", intention: "Sadaqah Jariyah" },
  FAM: { code: "MWF-FAM-001", name: "Family Startup", cause: "Livelihood", causeSku: "LIV", project: "Livelihood Fund", feedback: "Feedback report", sub: "No", planned: "", cancel: "", cost: 250, period: "One-time", intention: "Sadaqah" },
  MED: { code: "MWF-MED-001", name: "Medical Camp (One Day)", cause: "Health", causeSku: "HEA", project: "Medical Camps", feedback: "Feedback report", sub: "No", planned: "", cancel: "", cost: 100, period: "One-time", intention: "Sadaqah" },
  GEN: { code: "MWF-GEN-001", name: "General Donation", cause: "General", causeSku: "GEN", project: "Where Needed Most", feedback: "Acknowledgement only", sub: "No", planned: "", cancel: "", cost: 20, period: "One-time", intention: "Sadaqah" },
};

// --- The plans: where each started (days before the base day), how many payments were made, and its state ---
const PLANS = [
  ["ORP", -150, 5, "active"], ["ORP", -95, 4, "active"], ["ORP", -60, 2, "active"], ["ORP", -12, 1, "active"], ["ORP", -120, 3, "paused"], ["ORP", -100, 2, "cancelled"], ["ORP", -40, 2, "active", -20], ["ORP", -3, 1, "active"],
  ["HIF", -70, 3, "active"], ["HIF", -20, 1, "active"], ["HIF", -5, 1, "active"],
  ["ALM", -335, 12, "completed"], ["ALM", -75, 3, "active"],
  ["LPU", -90, 4, "completed"], ["LPU", -45, 2, "active"],
  ["BLD", -200, 6, "completed"],
];
const ONCE = [["SPU", -3], ["SPU", -9], ["SPU", -18], ["SPU", -40], ["SPU", -75], ["SPU", -130], ["FAM", -6], ["FAM", -35], ["FAM", -90], ["MED", -14], ["MED", -60], ["GEN", -4], ["GEN", -22]];

const DONORS = "ABCDEFGHIJKLMN".split("");
const head = ["Line ID", "Item Name", "Item Code", "Project", "Cause", "Intention", "Instalment no", "Subscription ID", "Order Quantity", "Order Reference", "Order Status", "Source", "Currency", "Item Cost", "Payment Gateway", "Merchant", "Donor ID", "Payment Date", "Period", "First Name (Billing)", "Last Name (Billing)", "Item Bundle", "Total Amount"];
const lines = [head];
const plans = [["Plan ID", "Plan status", "Instalments planned", "Until cancelled", "Instalments paid", "Gateway reference", "Opening order ID", "Next due"]];
let line = 30000, order = 3000, planId = 600, d = 0;
const add = (key, offset, n, sub, donor) => {
  const it = ITEMS[key];
  lines.push([++line, it.name, it.code, it.project, it.cause, it.intention, sub ? n : "", sub ? sub : "0", 1, `REF-${++order}`, "Paid", "Website", "GBP", it.cost, "Credit / Debit Card", "Stripe", `D${200 + DONORS.indexOf(donor)}`, dmy(offset), it.period, "Sample", `Supporter ${donor}`, "", it.cost]);
};
for (const [key, start, paid, status, nextDueOffset] of PLANS) {
  const it = ITEMS[key]; const id = ++planId; const gap = key === "BLD" || key === "LPU" ? 30 : 30;
  const donor = DONORS[d++ % DONORS.length]; // one donor for the whole plan
  for (let k = 1; k <= paid; k++) add(key, start + gap * (k - 1), k, id, donor);
  const next = nextDueOffset ?? start + gap * paid;
  plans.push([id, status, it.planned, it.cancel === "Yes" ? "Yes" : "No", paid, `sub_world_${id}`, 7000 + id, status === "active" || status === "paused" ? dmy(next).slice(0, 10) : ""]);
}
for (const [key, offset] of ONCE) add(key, offset, "", "", DONORS[d++ % DONORS.length]);
const catalogue = [["Item SKU", "Item", "Cause SKU", "Cause", "Feedback type", "Subscription", "Instalments", "Continues until cancelled"], ...Object.values(ITEMS).map((i) => [i.code, i.name, i.causeSku, i.cause, i.feedback, i.sub, i.planned, i.cancel])];

mkdirSync(new URL("../samples/world/", import.meta.url), { recursive: true });
const out = (name, rows) => writeFileSync(new URL(`../samples/world/${name}`, import.meta.url), csv(rows));
out("export-donation-lines.csv", lines); out("export-catalogue.csv", catalogue); out("export-recurring-plans.csv", plans);
console.log(`Wrote ${lines.length - 1} donation lines, ${plans.length - 1} plans and ${catalogue.length - 1} items to samples/world/, counted back from ${base.toISOString().slice(0, 10)}.`);
