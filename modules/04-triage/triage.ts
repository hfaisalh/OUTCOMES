/**
 * triage.ts
 *
 * What it does: gathers everything that needs a person into one "Needs attention" list: items not
 * yet in a category, problems found when files were imported, and changes the audit found. A person
 * can mark an entry reviewed. The list is rebuilt from the saved data each time, so an entry
 * disappears by itself when its cause is fixed.
 * Who calls it: the /api/triage endpoint (modules/00-platform/handlers.ts) and the page in demo mode.
 * Depends on: Module 1c types only. Pure functions: no database, no screen.
 *
 * Rules: nothing here changes a work order. Unrouted items are fixed by putting the item in a
 * category, never by marking them reviewed. A reviewed entry stays reviewed, and shows again only
 * if the person reopens it.
 */

import type { ReviewItem, WorkOrder } from "../01c-crm-connector/work-orders.js";

export type AttentionKind = "unrouted" | "import" | "changed" | "no_longer_needs_feedback" | "missing_from_feed";

export interface AttentionItem {
  id: string; // stable, so a reviewed mark sticks across imports
  kind: AttentionKind;
  title: string; // short, plain English
  detail: string; // what happened and what to do
  itemId?: string; // for unrouted entries: the item to put in a category
  itemName?: string;
  count?: number; // how many work orders it affects
  status: "open" | "reviewed";
  reviewedAt?: string;
  note?: string;
}

// A person's decision on an entry.
export interface TriageMark {
  at: string; // ISO time
  note: string;
}

export interface TriageInput {
  workOrders: WorkOrder[];
  review: ReviewItem[]; // changes held for a person (Module 1c)
  notes: string[]; // problems found while reading or converting the last import
  marks: Record<string, TriageMark>;
}

// A short stable id for a piece of text, so the same problem keeps the same id.
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const REVIEW_TITLE: Record<ReviewItem["reason"], string> = {
  changed: "Changed in the CRM",
  no_longer_needs_feedback: "No longer needs feedback",
  missing_from_feed: "No longer in the CRM",
};

export function buildAttention(input: TriageInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const mark = (id: string) => input.marks[id];

  // Section: items whose work orders are not in a category yet. One entry per item.
  const unrouted = new Map<string, { name: string; count: number }>();
  for (const w of input.workOrders) {
    if (w.status !== "unrouted") continue;
    const e = unrouted.get(w.itemId) ?? { name: w.itemName, count: 0 };
    e.count++;
    unrouted.set(w.itemId, e);
  }
  for (const [itemId, e] of unrouted) {
    out.push({ id: `unrouted:${itemId}`, kind: "unrouted", title: `${e.name} is not in a category`, detail: `${e.count} work order${e.count === 1 ? "" : "s"} wait for this item to be put in a category.`, itemId, itemName: e.name, count: e.count, status: "open" });
  }

  // Section: problems found when a file was imported.
  for (const note of [...new Set(input.notes)]) {
    const id = `import:${hash(note)}`;
    const m = mark(id);
    out.push({ id, kind: "import", title: "Import problem", detail: note, status: m ? "reviewed" : "open", ...(m ? { reviewedAt: m.at, note: m.note } : {}) });
  }

  // Section: changes the audit found, held for a person (Module 1c, DECISIONS 21).
  const byKey = new Map(input.workOrders.map((w) => [w.key, w]));
  for (const r of input.review) {
    const id = `${r.reason}:${r.key}`;
    const m = mark(id);
    const w = byKey.get(r.key);
    out.push({ id, kind: r.reason, title: `${REVIEW_TITLE[r.reason]}: ${r.key}`, detail: `${w ? `${w.itemName}, ${w.supporterName}. ` : ""}${r.message}`, status: m ? "reviewed" : "open", ...(m ? { reviewedAt: m.at, note: m.note } : {}) });
  }

  // Open first, then reviewed. Within each, in the order built.
  return [...out.filter((i) => i.status === "open"), ...out.filter((i) => i.status === "reviewed")];
}

// Applies a person's decision to the saved marks and returns the new marks.
export function applyDecision(marks: Record<string, TriageMark>, id: string, action: "review" | "reopen", at: string, note: string): Record<string, TriageMark> {
  const next = { ...marks };
  if (action === "review") next[id] = { at, note: note.slice(0, 300) };
  else delete next[id];
  return next;
}
