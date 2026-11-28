/**
 * facts.ts
 *
 * What it does: the numbers behind the Dashboard (DECISIONS 301), worked out from counts the screens already hold: the journey of a gift from "in" to "complete" with how much of each promise is done and how much is late, one fulfilment score, and the splits (by age, by funding level, the biggest parts and an "Other").
 * Who calls it: app/dashboard/dashboard-data.ts, which gathers the counts from the screens' data, and the tests. Depends on nothing. Pure: no database, no screen, so the same figures can be worked out in another stack.
 * Data flow: counts in, a list of stages with percentages and a score out. No percentage is ever worked out from nothing: a stage with nothing to measure says so ("no data yet") and is left out of the score.
 *
 * Rules:
 * - Rule: a stage's percentage is the share of the gifts that reached the step before it and have now taken this one. It never goes above 100.
 * - Rule: the fulfilment score is the plain average of the percentages of the stages that have data. It is a pointer, not an audit: the stages say what is behind it.
 * - Rule: late is only advice, counted from the day each step was due (DECISIONS 231, 232). Nothing moves by itself.
 * - Rule: a split shows its largest parts and folds the rest into "Other", so a chart never needs more colours than it can tell apart.
 */

// --- The journey of a gift ---
export interface JourneyCounts {
  paymentsIn30: number; // payments received in the last 30 days
  gifts: number; // gifts to fulfil (released, routed, not excluded)
  assigned: number; // handed to a partner
  confirmed: number; // the partner accepted
  lateAnswers: number; // assigned, no answer yet, and past the day to answer
  allocated: number; // funding a beneficiary or an outcome
  delivered: number; // allocated and the partner's phases are all done (DECISIONS 324)
  reviewable: number; // delivered, in a workflow that asks MWF to review
  reviewed: number; // of those, the review is taken
  lateDelivery: number; // allocated and a step past its due day
  complete: number; // reviewed, reported and completed
}

export type StageId = "in" | "assigned" | "confirmed" | "allocated" | "delivered" | "reviewed" | "complete";
export interface Stage {
  id: StageId;
  title: string;
  rule: string; // when it happens, in a few words
  pct: number | null; // null: nothing to measure yet
  done: number;
  of: number;
  late: number;
  page: string; // where to see the work behind it
}

const pct = (done: number, of: number): number | null => (of <= 0 ? null : Math.min(100, Math.round((Math.min(done, of) / of) * 100)));

export function journey(c: JourneyCounts): Stage[] {
  return [
    { id: "in", title: "Payments in", rule: "Every gift that needs feedback", pct: null, done: c.paymentsIn30, of: 0, late: 0, page: "work-orders" },
    { id: "assigned", title: "Assigned", rule: "Handed to a partner with room", pct: pct(c.assigned, c.gifts), done: c.assigned, of: c.gifts, late: 0, page: "assignment" },
    { id: "confirmed", title: "Confirmed", rule: "The partner accepts within its days", pct: pct(c.confirmed, c.assigned), done: c.confirmed, of: c.assigned, late: c.lateAnswers, page: "confirmation" },
    // Rule (DECISIONS 324): a gift allocated without a recorded answer (older gifts) still counts as confirmed, so the share never reads "249 of 15".
    { id: "allocated", title: "Allocated", rule: "Funds a beneficiary or an outcome", pct: pct(c.allocated, Math.max(c.confirmed, c.allocated)), done: c.allocated, of: Math.max(c.confirmed, c.allocated), late: 0, page: "allocate" },
    { id: "delivered", title: "Delivered", rule: "The partner's phases are done", pct: pct(c.delivered, c.allocated), done: c.delivered, of: c.allocated, late: c.lateDelivery, page: "progress" },
    { id: "reviewed", title: "Reviewed", rule: "MWF checks the work", pct: pct(c.reviewed, c.reviewable), done: c.reviewed, of: c.reviewable, late: 0, page: "progress" },
    { id: "complete", title: "Complete", rule: "Reported, the donor told", pct: pct(c.complete, c.allocated), done: c.complete, of: c.allocated, late: 0, page: "progress" },
  ];
}

// The average of the stages that have data, or null when none has.
export function fulfilmentScore(stages: Stage[]): number | null {
  const have = stages.filter((s) => s.pct !== null) as (Stage & { pct: number })[];
  return have.length === 0 ? null : Math.round(have.reduce((t, s) => t + s.pct, 0) / have.length);
}

// --- Splits ---
export interface Part { label: string; value: number }

// The biggest `keep` parts by value, the rest folded into one "Other". Parts with no value are dropped. A tie keeps the order it came in.
export function topParts(parts: Part[], keep: number, other = "Other"): Part[] {
  const sorted = parts.filter((p) => p.value > 0).map((p, i) => ({ p, i })).sort((a, b) => b.p.value - a.p.value || a.i - b.i).map((x) => x.p);
  if (sorted.length <= keep) return sorted;
  const rest = sorted.slice(keep).reduce((t, p) => t + p.value, 0);
  return [...sorted.slice(0, keep), { label: other, value: rest }];
}

export const AGE_BANDS = ["Under 6", "6 to 9", "10 to 13", "14 to 17", "18 and over", "Age not known"] as const;

// Whole years between a date of birth and today (both YYYY-MM-DD), or null when either is not a date.
export function ageOn(dob: string, today: string): number | null {
  const ok = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(dob) || !ok(today) || dob > today) return null;
  const [by, bm, bd] = dob.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

// The beneficiaries by age band, in the bands' own order (they are ordered, so they are not ranked by size).
export function byAgeBand(dobs: string[], today: string): Part[] {
  const count = new Map<string, number>(AGE_BANDS.map((b) => [b, 0]));
  for (const d of dobs) {
    const a = ageOn(d, today);
    const band = a === null ? "Age not known" : a < 6 ? "Under 6" : a < 10 ? "6 to 9" : a < 14 ? "10 to 13" : a < 18 ? "14 to 17" : "18 and over";
    count.set(band, (count.get(band) ?? 0) + 1);
  }
  return AGE_BANDS.map((b) => ({ label: b, value: count.get(b) ?? 0 }));
}

// How funded each place is: nothing yet, part, or the whole. `used` and `capacity` are units.
export function fundingLevels(fills: { used: number; capacity: number }[]): Part[] {
  const none = fills.filter((f) => f.used <= 0).length;
  const full = fills.filter((f) => f.capacity > 0 && f.used >= f.capacity).length;
  return [{ label: "Not funded yet", value: none }, { label: "Partly funded", value: fills.length - none - full }, { label: "Fully funded", value: full }];
}

// --- Benefits in the journey (DECISIONS 302) ---
export interface BenefitCounts { itemId: string; name: string; counts: JourneyCounts }
export interface BenefitShare { itemId: string; name: string; gifts: number; share: number; counts: JourneyCounts; stages: Stage[]; late: number }

// Every benefit with its share of all gifts (a whole number, a benefit with no gift has 0), the largest first, then by name so the order is always the same. `late` is every late answer and late delivery for that benefit.
export function benefitShares(list: BenefitCounts[]): BenefitShare[] {
  const total = list.reduce((t, b) => t + b.counts.gifts, 0);
  return list.map((b) => ({ itemId: b.itemId, name: b.name, gifts: b.counts.gifts, share: total === 0 ? 0 : Math.round((b.counts.gifts / total) * 100), counts: b.counts, stages: journey(b.counts), late: b.counts.lateAnswers + b.counts.lateDelivery }))
    .sort((a, b) => b.gifts - a.gifts || a.name.localeCompare(b.name));
}

// --- Review (DECISIONS 323) ---
// Rule: the share of reviews that sent the work back: rejections out of every decision made at review (passed or sent back). Null until a decision has been made.
export interface ReviewCounts { under: number; sentBack: number; reviewed: number; rejections: number }
export const rejectionRate = (r: Pick<ReviewCounts, "reviewed" | "rejections">): number | null => (r.reviewed + r.rejections === 0 ? null : Math.round((r.rejections / (r.reviewed + r.rejections)) * 100));
