/**
 * dashboard-data.ts
 *
 * What it does: gathers, from what the screens already hold (the View), the counts and splits the Dashboard draws (DECISIONS 301): the journey of a gift, the figure tiles and the six splits. It reuses the same reading of the data as the Assignment, Confirmation, Allocate and Progress pages, so the Dashboard can never disagree with them.
 * Who calls it: app/dashboard/dashboard-page.ts and the tests. Depends on: the View, the modules that read it (assignment, allocation, progress, gifts) and the pure figures in modules/17-dashboard/facts.ts.
 * Data flow: View in, one plain object out (`DashData`). No HTML here and no change to anything.
 */

import { assignables, contextFrom } from "../../modules/08-assignment/assignment";
import { prioritySet } from "../../modules/08-assignment/priority-gifts";
import { allocateContext, emptyAllocations, fills } from "../../modules/09-allocation/allocation";
import { normaliseSteps } from "../../modules/09-allocation/order";
import { giftRows } from "../../modules/04b-commitments/gifts";
import { clusterStateOf } from "../../modules/06-projects/clusters";
import { emptyRegister } from "../../modules/07-beneficiaries/beneficiaries";
import { emptyEnrolments, itemRulesOf } from "../../modules/07-beneficiaries/enrolments";
import { missingFor } from "../../modules/07-beneficiaries/waiting";
import type { SavedFeatures } from "../../modules/02-project-rules/kind-features";
import { benefitShares, byAgeBand, fulfilmentScore, fundingLevels, journey, topParts, type BenefitShare, type JourneyCounts, type Part, type Stage } from "../../modules/17-dashboard/facts";
import { totalText } from "../../modules/15-partner-costs/costs";
import { isLate, rowsOf } from "../allocation/confirmation-rows";
import { standingsOf } from "../allocation/progress-page";
import { valueByCurrency } from "../gifts/gifts-page";
import { iconHtml, itemIcon } from "../shared/icons";
import type { View } from "../shared/pages";

export interface BenefitView extends BenefitShare { icon: string; value: string }
export interface DashData {
  stages: Stage[];
  score: number | null;
  counts: JourneyCounts;
  value: string; // the value of the payments, one figure for each currency
  recurringActive: number;
  plansStopped: number;
  needAttention: number; // unrouted, held for review, or a look
  unallocated: number;
  beneficiaries: number;
  enrolled: number;
  waiting: number;
  needDetails: number;
  funding: Part[];
  fully: number;
  unfunded: number;
  partlyFunded: number;
  partnersActive: number;
  batchesWaiting: number;
  costs: string;
  costCount: number;
  benefits: BenefitView[];
  splits: { funding: Part[]; clusters: Part[]; ages: Part[]; where: Part[]; plans: Part[]; partners: Part[] };
}

const DAY = 86400000;
const daysBefore = (today: string, n: number): string => new Date(Date.parse(`${today}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

export function dashboardData(v: View): DashData {
  const today = v.today ?? new Date().toISOString().slice(0, 10);
  const now = `${today}T00:00:00Z`;
  const partners = v.projects ?? [];
  const gps = v.giftProjects ?? [];
  const assignments = (v.assignments?.records ?? []);
  const enrolments = (v.enrolments ?? emptyEnrolments()).records;
  const people = (v.beneficiaries ?? emptyRegister()).records;

  // --- The journey ---
  const actx = contextFrom({ urgent: prioritySet(v.priorityGifts), workOrders: v.workOrders, partners, giftProjects: gps, frameworks: v.frameworks ?? [], outcomeTypes: v.outcomeTypes ?? [], today, now });
  const units = assignables(actx);
  const unitKeys = new Set(units.map((u) => u.key));
  const mine = assignments.filter((a) => unitKeys.has(a.key));
  const rows = rowsOf(v).filter((r) => unitKeys.has(r.key));
  const stand = standingsOf(v).filter((s) => unitKeys.has(s.key));
  const allocated = stand.filter((s) => s.allocated);
  const cutoff = daysBefore(today, 30);
  const counts: JourneyCounts = {
    paymentsIn30: v.workOrders.filter((w) => w.status !== "excluded" && (w.paidDate ?? "").slice(0, 10) >= cutoff).length,
    gifts: units.length,
    assigned: mine.length,
    confirmed: rows.filter((r) => r.st.state === "confirmed").length,
    lateAnswers: rows.filter(isLate).length,
    allocated: allocated.length,
    delivered: allocated.filter((s) => s.stage !== "allocation").length,
    lateDelivery: allocated.filter((s) => (s.next?.lateDays ?? 0) > 0).length,
    complete: allocated.filter((s) => s.complete).length,
  };
  const stages = journey(counts);

  // --- Gifts and plans ---
  const grows = giftRows(v.workOrders, v.workOrders, new Set(v.review.map((r) => r.key)));
  const recurring = grows.filter((g) => g.kind === "recurring");
  const live = v.workOrders.filter((w) => w.status !== "excluded");
  const planCount = (s: string): number => recurring.filter((g) => g.planStatus === s).length;

  // --- Beneficiaries and how funded they are ---
  const names = new Map(v.workOrders.map((w) => [w.itemId, w.itemName]));
  const rec = v.allocations ?? emptyAllocations();
  const fctx = allocateContext({ steps: v.allocationSteps ?? normaliseSteps(undefined), urgent: prioritySet(v.priorityGifts), assignments: mine, assignables: units, workOrders: v.workOrders, enrolments, beneficiaries: people, giftProjects: gps, frameworks: v.frameworks ?? [], rulesOf: (i) => itemRulesOf(v.itemKinds ?? {}, (v.kindFeatures ?? {}) as SavedFeatures, i, names.get(i) ?? ""), now, itemUnits: v.itemUnits });
  const activeHolders = new Set(enrolments.filter((e) => e.status === "active" && e.role === "").map((e) => e.id));
  const fillList = fills(fctx, rec).filter((f) => activeHolders.has(f.enrolmentId));
  const funding = fundingLevels(fillList);
  const persons = people.filter((b) => b.kind === "person" && b.status === "active");
  const enrolledIds = new Set(enrolments.filter((e) => e.status === "active").map((e) => e.beneficiaryId));

  // Where the enrolled are: the top cluster of the one they are in.
  const clusterName = new Map<string, string>();
  for (const g of gps) {
    const st = clusterStateOf(g.levels ?? [], g.clusters ?? []).clusters;
    for (const c of st) { let top = c; for (let i = 0; i < 20 && top.parentId !== ""; i++) top = st.find((x) => x.id === top.parentId) ?? top; clusterName.set(`${g.id}|${c.id}`, top.name); }
  }
  const tally = (key: (e: (typeof enrolments)[number]) => string): Part[] => { const m = new Map<string, number>(); for (const e of enrolments.filter((x) => x.status === "active" && x.role === "")) m.set(key(e), (m.get(key(e)) ?? 0) + 1); return [...m].map(([label, value]) => ({ label, value })); };
  const byPerson = new Map(people.map((b) => [b.id, b]));
  const partnerName = (id: string): string => partners.find((p) => p.id === id)?.name ?? "No partner";

  const pending = mine.length - counts.confirmed - rows.filter((r) => r.st.state === "rejected").length;
  const where: Part[] = [
    { label: "Not assigned yet", value: Math.max(0, units.length - mine.length) },
    { label: "Waiting for the partner", value: Math.max(0, pending) },
    { label: "Confirmed, not allocated", value: Math.max(0, counts.confirmed - counts.allocated) },
    { label: "With the partner", value: allocated.filter((s) => s.stage === "allocation").length },
    { label: "In review and report", value: allocated.filter((s) => s.stage === "review" || s.stage === "report").length },
    { label: "Complete", value: counts.complete },
  ];
  // --- Each benefit's own journey (DECISIONS 302): the same steps, counted for the gifts of one benefit ---
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const standByKey = new Map(stand.map((s) => [s.key, s]));
  const assignedKeys = new Set(mine.map((a) => a.key));
  const blank = (): JourneyCounts => ({ paymentsIn30: 0, gifts: 0, assigned: 0, confirmed: 0, lateAnswers: 0, allocated: 0, delivered: 0, lateDelivery: 0, complete: 0 });
  const per = new Map<string, { name: string; framework: string; counts: JourneyCounts }>();
  for (const u of units) {
    const e = per.get(u.w.itemId) ?? { name: u.w.itemName, framework: u.w.frameworkId ?? "", counts: blank() };
    const c = e.counts, r = rowByKey.get(u.key), s = standByKey.get(u.key);
    c.gifts++;
    if (assignedKeys.has(u.key)) c.assigned++;
    if (r?.st.state === "confirmed") c.confirmed++;
    if (r && isLate(r)) c.lateAnswers++;
    if (s?.allocated) { c.allocated++; if (s.stage !== "allocation") c.delivered++; if ((s.next?.lateDays ?? 0) > 0) c.lateDelivery++; if (s.complete) c.complete++; }
    per.set(u.w.itemId, e);
  }
  const benefits: BenefitView[] = benefitShares([...per].map(([itemId, e]) => ({ itemId, name: e.name || itemId, counts: e.counts }))).map((b) => ({
    ...b,
    icon: iconHtml(itemIcon(b.itemId, b.name, v.itemIcons, (v.outcomeTypes ?? []).find((t) => (per.get(b.itemId)?.framework ?? "") !== "" && t.frameworkIds.includes(per.get(b.itemId)?.framework ?? ""))?.icon ?? ""), b.name, "sm"),
    value: valueByCurrency(live.filter((w) => w.itemId === b.itemId)).text,
  }));
  const partnerCosts = v.partnerCosts ?? [];
  return {
    stages, score: fulfilmentScore(stages), counts,
    value: valueByCurrency(live).text,
    recurringActive: planCount("active"), plansStopped: recurring.filter((g) => ["cancelled", "paused", "completed"].includes(g.planStatus)).length,
    needAttention: grows.filter((g) => g.unrouted || g.inReview || g.needsLook).length,
    unallocated: Math.max(0, counts.confirmed - counts.allocated),
    beneficiaries: persons.length, enrolled: persons.filter((b) => enrolledIds.has(b.id)).length,
    waiting: persons.filter((b) => b.eligibility === "ready" && !enrolledIds.has(b.id)).length,
    needDetails: persons.filter((b) => missingFor(b).length > 0).length,
    funding, fully: funding[2]?.value ?? 0, unfunded: funding[0]?.value ?? 0, partlyFunded: funding[1]?.value ?? 0,
    partnersActive: partners.filter((p) => (p.status ?? "pending") === "active").length,
    batchesWaiting: new Set(rows.filter((r) => r.st.state === "waiting").map((r) => `${r.partnerId}|${r.batch ?? ""}`)).size,
    costs: totalText(partnerCosts), costCount: partnerCosts.length,
    benefits,
    splits: {
      funding,
      clusters: topParts(tally((e) => clusterName.get(`${e.giftProjectId}|${e.clusterId}`) ?? "No cluster"), 5),
      ages: byAgeBand(persons.map((b) => b.dob), today),
      where,
      plans: [{ label: "Active", value: planCount("active") }, { label: "Paused", value: planCount("paused") }, { label: "Cancelled", value: planCount("cancelled") }, { label: "Completed", value: planCount("completed") }, { label: "Not known", value: recurring.length - ["active", "paused", "cancelled", "completed"].reduce((t, s) => t + planCount(s), 0) }],
      partners: topParts(tally((e) => partnerName(byPerson.get(e.beneficiaryId)?.partnerId ?? "")), 5),
    },
  };
}
