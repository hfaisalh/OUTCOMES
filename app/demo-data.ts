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
import { PERMISSIONS as P } from "./menu";

export const demoFeedRows = (): FeedRow[] => toRecords(parseCsv(feedCsv)).records;

export const FRAMEWORKS: { id: string; name: string }[] = [
  { id: "orphan", name: "Orphan Sponsorship" },
  { id: "hifz", name: "Hifz" },
  { id: "water", name: "Water" },
  { id: "qurbani", name: "Animal Sacrifice" },
];

// Items already mapped to a framework. The item "I14" is left out on purpose, so it shows as unrouted.
export const DEMO_ITEM_FRAMEWORKS: Record<string, string> = { I10: "orphan", I11: "water", I13: "hifz" };

// What three CRM roles might be allowed to do (DECISIONS 32). Names are invented.
export const DEMO_ROLES: { id: string; name: string; permissions: string[] }[] = [
  { id: "admin", name: "Outcomes administrator", permissions: Object.values(P) },
  { id: "agent", name: "Fulfilment agent", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", permissions: [] },
];
