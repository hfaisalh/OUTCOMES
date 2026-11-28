/**
 * trends-data.ts
 *
 * What it does: builds each gift's dates from what the screens already hold (when it was paid, assigned, answered, allocated, delivered and completed) and hands them to the pure trends (modules/17-dashboard/trends.ts), for all benefits or for one (DECISIONS 304).
 * Who calls it: app/dashboard/trends-card.ts and the tests. Depends on: the View, the assignment and confirmation helpers and the pure trends. No HTML here and no change to anything.
 * Data flow: View -> gifts with dates -> a point for each month and a short list of what improved.
 */

import { assignables, contextFrom } from "../../modules/08-assignment/assignment";
import { prioritySet } from "../../modules/08-assignment/priority-gifts";
import { confirmDaysOf } from "../../modules/02-project-rules/workflows";
import { improvements, lastMonths, monthlyTrends, type GiftLife, type Improvement, type MonthPoint } from "../../modules/17-dashboard/trends";
import type { View } from "../shared/pages";

export interface PartnerTrend { id: string; name: string; gifts: number; points: MonthPoint[]; improvements: Improvement[] }
export interface TrendsData { points: MonthPoint[]; improvements: Improvement[]; benefits: { id: string; name: string }[]; partners: { id: string; name: string }[]; byPartner: PartnerTrend[]; gifts: number }

export function trendsData(v: View, itemId = "", months = 12, partnerId = ""): TrendsData {
  const today = v.today ?? new Date().toISOString().slice(0, 10);
  const ctx = contextFrom({ urgent: prioritySet(v.priorityGifts), workOrders: v.workOrders, partners: v.projects ?? [], giftProjects: v.giftProjects ?? [], frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now: `${today}T00:00:00Z` });
  const all = assignables(ctx);
  const benefits = [...new Map(all.map((u) => [u.w.itemId, u.w.itemName || u.w.itemId])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const units = itemId === "" ? all : all.filter((u) => u.w.itemId === itemId);
  const partnerOf = new Map((v.assignments?.records ?? []).map((a) => [a.key, a.partnerId]));
  const partnerNames = new Map((v.projects ?? []).map((p) => [p.id, p.name]));

  const assigned = new Map((v.assignments?.records ?? []).map((a) => [a.key, a.at]));
  const answers = new Map((v.confirmations?.records ?? []).map((c) => [c.key, c]));
  const allocated = new Map<string, string>();
  for (const r of v.allocations?.records ?? []) if (!allocated.has(r.key) || r.at < (allocated.get(r.key) as string)) allocated.set(r.key, r.at);
  const stageAt = new Map<string, { first: string; done: string }>();
  for (const p of v.progress?.records ?? []) {
    if (p.kind !== "stage") continue;
    const cur = stageAt.get(p.key) ?? { first: "", done: "" };
    if (cur.first === "" || p.at < cur.first) cur.first = p.at;
    if ((p.id === "complete" || p.id === "feedback") && (cur.done === "" || p.at < cur.done)) cur.done = p.at;
    stageAt.set(p.key, cur);
  }
  const fws = new Map((v.frameworks ?? []).map((f) => [f.id, f]));
  const lives: GiftLife[] = units.map((u) => {
    const a = answers.get(u.key);
    const fw = fws.get(u.w.frameworkId ?? "");
    const st = stageAt.get(u.key);
    return {
      key: u.key, itemId: u.w.itemId, ...(partnerOf.has(u.key) ? { partnerId: partnerOf.get(u.key) as string } : {}), paidAt: (u.w.paidDate ?? "").slice(0, 10) || today,
      ...(assigned.has(u.key) ? { assignedAt: assigned.get(u.key) as string } : {}),
      ...(a ? { answeredAt: a.at, ...(a.answer === "confirmed" ? { confirmedAt: a.at } : {}), answerDays: fw ? confirmDaysOf(fw) : 3 } : {}),
      ...(allocated.has(u.key) ? { allocatedAt: allocated.get(u.key) as string } : {}),
      ...(st?.first ? { deliveredAt: st.first } : {}),
      ...(st?.done ? { completedAt: st.done } : {}),
    };
  });
  const range = lastMonths(today, months);
  const chosen = partnerId === "" ? lives : lives.filter((l) => l.partnerId === partnerId);
  const points = monthlyTrends(chosen, range);
  // Each partner with a gift, for the comparison (DECISIONS 305): the busiest eight, then in name order so a partner keeps its colour.
  const per = new Map<string, GiftLife[]>();
  for (const l of lives) if (l.partnerId) per.set(l.partnerId, [...(per.get(l.partnerId) ?? []), l]);
  const byPartner: PartnerTrend[] = [...per].map(([id, ls]) => ({ id, name: partnerNames.get(id) ?? id, gifts: ls.length, ls })).sort((a, b) => b.gifts - a.gifts).slice(0, 8).sort((a, b) => a.name.localeCompare(b.name)).map(({ ls, ...p }) => { const pts = monthlyTrends(ls, range); return { ...p, points: pts, improvements: improvements(pts) }; });
  return { points, improvements: improvements(points), benefits, partners: [...per.keys()].map((id) => ({ id, name: partnerNames.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name)), byPartner, gifts: chosen.length };
}
