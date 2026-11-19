/**
 * demo-data.ts
 *
 * What it does: the invented data behind the demo screens: the sample CRM feed, a short list of
 * frameworks, and three example CRM roles. Nothing here is real, and nothing is saved.
 * Who calls it: main.ts.
 * Depends on: samples/crm-feed-sample.csv and the Module 1 csv reader.
 *
 * Frameworks are owned by OUTCOMES (DECISIONS 31). This short list stands in for Module 2.
 */

import { parseCsv, toRecords } from "../modules/01-data-mapping/csv";
import type { FeedRow } from "../modules/01c-crm-connector/feed";
import feedCsv from "../samples/crm-feed-sample.csv?raw";
import { addCategory, addFramework, setKeywords, updateRules, type Category, type Cycle, type Framework } from "../modules/02-project-rules/frameworks";
import { PERMISSIONS as P } from "./menu";

export const demoFeedRows = (): FeedRow[] => toRecords(parseCsv(feedCsv)).records;

// MWF's starting categories and frameworks, from the list discussed with Faisal (to be confirmed).
// Each category sets the feedback cycle a new framework starts with. Staff can change all of it.
export function demoCategories(): Category[] {
  let c: Category[] = [];
  for (const [name, cycle] of [["Sponsorship", "quarterly"], ["Transactional", "on_delivery"], ["Livelihood", "half_yearly"], ["Microfinance", "half_yearly"], ["B2B", "on_delivery"]] as [string, Cycle][]) c = addCategory(c, name, cycle).value;
  return c;
}

const STARTER: [string, string, string][] = [
  ["sponsorship", "Orphan Sponsorship", "orphan"], ["sponsorship", "Hifz", "hifz, quran"], ["sponsorship", "School", "school"],
  ["sponsorship", "College/Uni", "college, university, uni"], ["sponsorship", "Aalim", "aalim, alim"], ["sponsorship", "Homestay", "homestay"],
  ["transactional", "Water", "water, well, pump"], ["transactional", "Rebuild/House", "house, rebuild"], ["transactional", "Masjid", "masjid, mosque"],
  ["transactional", "Collective marriages", "marriage, marriages, wedding"], ["transactional", "Animal Sacrifice", "sacrifice, qurbani, udhiya, aqiqah"],
  ["livelihood", "Rozgar", "rozgar, livelihood"], ["livelihood", "Rickshaw", "rickshaw"], ["microfinance", "Loans", "loan, loans"],
];

export function demoFrameworks(): Framework[] {
  const cats = demoCategories();
  let f: Framework[] = [];
  for (const [cat, name, words] of STARTER) {
    f = addFramework(f, name, cats.find((c) => c.id === cat)).value;
    f = setKeywords(f, f[f.length - 1]?.id ?? "", words);
  }
  return updateRules(f, "orphan-sponsorship", { unit: "child", reportType: "Quarterly child update" });
}

// What three CRM roles might be allowed to do (DECISIONS 32). Names are invented.
export const DEMO_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: "admin", name: "Outcomes administrator", permissions: Object.values(P) },
  { id: "agent", name: "Fulfilment agent", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", permissions: [] },
];
