/**
 * demo-data.ts
 *
 * What it does: the invented data behind the demo screens: the sample CRM feed, a short list of
 * categories, and three example CRM roles. Nothing here is real, and nothing is saved.
 * Who calls it: main.ts.
 * Depends on: samples/crm-feed-sample.csv and the Module 1 csv reader.
 *
 * Categories and their frameworks are owned by OUTCOMES (DECISIONS 31, 40). This short list stands in for Module 2.
 */

import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import type { FeedRow } from "../modules/01c-crm-connector/feed";
import feedCsv from "../samples/crm-feed-sample.csv?raw";
import { addCategory, setKeywords, type Category, type FrameworkTemplate, type Setup } from "../modules/02-project-rules/categories";
import { PERMISSIONS as P } from "./menu";

export const demoFeedRows = (): FeedRow[] => toRecords(parseCsv(feedCsv)).records;

// MWF's starting framework templates (to be confirmed by Faisal). A template is defined once and used by any category or item (DECISIONS 59).
// Orphan sponsorship is sold in parts: three parts make one orphan. A scholarship is one whole sponsorship a month.
export function starterFrameworks(): FrameworkTemplate[] {
  return [
    { id: "sponsorship-shared-parts", name: "Sponsorship: shared parts", unit: "child", cycle: "quarterly", reportType: "Quarterly child update", instalment: "per_period", unitsPerBeneficiary: 3 },
    { id: "sponsorship-whole", name: "Sponsorship: whole", unit: "student", cycle: "quarterly", reportType: "Quarterly student update", instalment: "per_period", unitsPerBeneficiary: 1 },
    { id: "delivered-once", name: "Delivered once", unit: "", cycle: "on_delivery", reportType: "", instalment: "share_of_whole", unitsPerBeneficiary: 1 },
    { id: "livelihood", name: "Livelihood and loans", unit: "", cycle: "half_yearly", reportType: "", instalment: "share_of_whole", unitsPerBeneficiary: 1 },
  ];
}

// MWF's starting categories, from the list discussed with Faisal (to be confirmed). Each has a default framework template and the words that suggest it.
const STARTER: [string, string, string][] = [
  // name, framework id, keywords
  ["Sponsorship", "sponsorship-shared-parts", "orphan, hifz, quran, school, college, university, uni, aalim, alim, homestay, sponsorship"],
  ["Transactional", "delivered-once", "water, well, pump, house, rebuild, masjid, mosque, marriage, marriages, wedding, sacrifice, qurbani, udhiya, aqiqah"],
  ["Livelihood", "livelihood", "rozgar, livelihood, rickshaw"],
  ["Microfinance", "livelihood", "loan, loans, microfinance"],
  ["B2B", "delivered-once", ""],
];

// Items that belong in Sponsorship but are a whole sponsorship each month, not three shared parts.
export const WHOLE_SPONSORSHIP_WORDS = ["hifz", "quran", "school", "college", "university", "uni", "aalim", "alim", "homestay"];

// Rule: auto-suggest first. An item in a category whose framework is "shared parts" but whose name says it is a whole sponsorship
// (Hifz, school, uni, Aalim and so on) is suggested the "Sponsorship: whole" framework. Items that already have their own are left alone.
export function suggestItemFrameworks(items: { id: string; name: string }[], s: Setup): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of items) {
    if (s.itemFramework[i.id] !== undefined) continue;
    const cat = s.categories.find((c) => c.id === s.itemMap[i.id]);
    if (!cat || cat.frameworkId !== "sponsorship-shared-parts" || !s.frameworks.some((f) => f.id === "sponsorship-whole")) continue;
    const words = new Set(i.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    if (WHOLE_SPONSORSHIP_WORDS.some((w) => words.has(w))) out[i.id] = "sponsorship-whole";
  }
  return out;
}

export function demoCategories(): Category[] {
  let c: Category[] = [];
  for (const [name, frameworkId, words] of STARTER) {
    c = addCategory(c, name, frameworkId).value;
    const id = c[c.length - 1]?.id ?? "";
    c = setKeywords(c, id, words);
  }
  return c;
}

// What three CRM roles might be allowed to do (DECISIONS 32). Names are invented.
export const DEMO_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: "admin", name: "Outcomes administrator", permissions: Object.values(P) },
  { id: "agent", name: "Fulfilment agent", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", permissions: [] },
];
