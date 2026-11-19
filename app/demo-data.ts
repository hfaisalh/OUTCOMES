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
import { addFramework, setKeywords, updateRules, type Framework } from "../modules/02-project-rules/frameworks";
import { PERMISSIONS as P } from "./menu";

export const demoFeedRows = (): FeedRow[] => toRecords(parseCsv(feedCsv)).records;

// Starting frameworks for the demo, with the words that suggest them (Module 2 lets staff change all of this).
export function demoFrameworks(): Framework[] {
  let f: Framework[] = [];
  for (const n of ["Orphan Sponsorship", "Hifz", "Water", "Animal Sacrifice"]) f = addFramework(f, n).value;
  f = setKeywords(f, "water", "water, well, pump");
  f = setKeywords(f, "animal-sacrifice", "sacrifice, qurbani, udhiya");
  f = updateRules(f, "orphan-sponsorship", { unit: "child", cycle: "quarterly", reportType: "Quarterly child update" });
  return f;
}

// What three CRM roles might be allowed to do (DECISIONS 32). Names are invented.
export const DEMO_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: "admin", name: "Outcomes administrator", permissions: Object.values(P) },
  { id: "agent", name: "Fulfilment agent", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", permissions: [] },
];
