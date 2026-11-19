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
import { addCategory, setKeywords, updateFramework, type Category, type Cycle } from "../modules/02-project-rules/categories";
import { PERMISSIONS as P } from "./menu";

export const demoFeedRows = (): FeedRow[] => toRecords(parseCsv(feedCsv)).records;

// MWF's starting categories, from the list discussed with Faisal (to be confirmed). Each category holds its
// framework (unit, cycle, report type) and the words that suggest it. Staff can change all of it.
const STARTER: [string, Cycle, string, string, string][] = [
  // name, cycle, keywords, unit, report type
  ["Sponsorship", "quarterly", "orphan, hifz, quran, school, college, university, uni, aalim, alim, homestay, sponsorship", "child", "Quarterly child update"],
  ["Transactional", "on_delivery", "water, well, pump, house, rebuild, masjid, mosque, marriage, marriages, wedding, sacrifice, qurbani, udhiya, aqiqah", "", ""],
  ["Livelihood", "half_yearly", "rozgar, livelihood, rickshaw", "", ""],
  ["Microfinance", "half_yearly", "loan, loans, microfinance", "", ""],
  ["B2B", "on_delivery", "", "", ""],
];

export function demoCategories(): Category[] {
  let c: Category[] = [];
  for (const [name, cycle, words, unit, reportType] of STARTER) {
    c = addCategory(c, name, cycle).value;
    const id = c[c.length - 1]?.id ?? "";
    c = updateFramework(setKeywords(c, id, words), id, { unit, reportType });
  }
  return c;
}

// What three CRM roles might be allowed to do (DECISIONS 32). Names are invented.
export const DEMO_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: "admin", name: "Outcomes administrator", permissions: Object.values(P) },
  { id: "agent", name: "Fulfilment agent", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", permissions: [] },
];
