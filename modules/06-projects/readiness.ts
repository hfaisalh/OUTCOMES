/**
 * readiness.ts
 *
 * What it does: checks that each gift item is connected end to end before Assignment is built on top (DECISIONS 156): it has a workflow, a type, at least one partner that can
 * take it, and it says which projects offer it. An item that is not connected says what is missing, so nothing is left unmapped. Custom Amount items are not checked yet: they
 * are dealt with separately later (Faisal, 23/11/2026).
 * Who calls it: the Benefits page (app/setup/benefits-page.ts). Depends on: projects.ts. Pure functions: no database, no screen.
 *
 * Rules:
 * - Ready means: it has a workflow, it has a type (chosen or suggested), and at least one partner is eligible for it (active, approved, delivering it, capacity not 0).
 * - A project offers an item when the item is in its list, or when its list is empty (it offers any).
 * - A custom amount item is never counted as ready or as missing something: it is left for later.
 */

import { eligiblePartners, projectOffers, type GiftProject, type Project } from "./projects.js";

export interface ItemReadiness {
  itemId: string;
  custom: boolean; // a Custom Amount item, left for later
  hasWorkflow: boolean;
  type: string; // the id of its type, "" when none
  partners: string[]; // the partners that can take it, by name
  projects: string[]; // the projects that offer it by name, where the item is in their list
  openProjects: number; // projects with no list, which offer any item
  missing: string[]; // what is not connected, in plain words
  ready: boolean;
}

export interface ReadinessInput {
  items: { id: string; name: string }[];
  workflowOf: (itemId: string) => string; // "" when none
  typeOf: (itemId: string, itemName: string) => string; // "" when none
  customItemIds: Set<string>;
  partners: Project[];
  giftProjects: GiftProject[];
  today: string;
}

export function itemReadiness(i: ReadinessInput): ItemReadiness[] {
  const open = i.giftProjects.filter((g) => (g.itemIds ?? []).length === 0).length;
  return i.items.map((item): ItemReadiness => {
    const custom = i.customItemIds.has(item.id);
    const hasWorkflow = i.workflowOf(item.id) !== "";
    const type = i.typeOf(item.id, item.name);
    const partners = eligiblePartners(i.partners, item.id, i.today).map((p) => p.name);
    const projects = i.giftProjects.filter((g) => (g.itemIds ?? []).length > 0 && projectOffers(g, item.id)).map((g) => g.name);
    const missing = custom ? [] : [...(hasWorkflow ? [] : ["No workflow"]), ...(type !== "" ? [] : ["No type"]), ...(partners.length > 0 ? [] : ["No partner can take it"])];
    return { itemId: item.id, custom, hasWorkflow, type, partners, projects, openProjects: open, missing, ready: !custom && missing.length === 0 };
  });
}

export const readySummary = (rows: ItemReadiness[]): { ready: number; checked: number; custom: number } => ({ ready: rows.filter((r) => r.ready).length, checked: rows.filter((r) => !r.custom).length, custom: rows.filter((r) => r.custom).length });
