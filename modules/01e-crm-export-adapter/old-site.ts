/**
 * old-site.ts
 *
 * What it does: finds the payments a carried-over recurring plan already had on the previous website (DECISIONS 269), from the CRM's Legacy donations export, and summarises them for the plan: how many, from when to when, and how much. Only the summary is kept, not each payment.
 * Who calls it: the CRM export adapter (export-adapter.ts), when a Legacy donations file is loaded with the others. Depends on: site.ts (the site and which way round its dates are written). Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules (the CRM has no column that links an old order to its plan, so this is a match by pattern, and it says so when it cannot be sure):
 * - Rule: only a plan carried over from the old site is looked at (its Legacy plan column says Yes, or, with no such column, its gateway reference starts "archive:").
 * - Rule: an old order belongs to the plan when it is Paid, on the same site, for the same CRM donor, in the same currency and for the same amount, and was paid between the day before the plan started and the day after it came into the CRM. It is a renewal (Recurring = Yes), or it is the opening order: not recurring itself, paid within a day of the plan's start. Only the earliest such opening order counts.
 * - Rule: if the same donor has two carried-over plans of the same amount, on the same site and currency, an old order could belong to either, so the plan is reported as "ambiguous" and nothing is counted. Never a guess.
 * - Rule: a plan with no old orders found has no summary at all.
 * - Rule: dates are read by the row's site (the USA writes month/day/year, the others day/month/year, DECISIONS 262).
 */

import { dateOrderOf, siteCode } from "./site.ts";

type Row = Record<string, string>;

export interface OldSite { match: "found" | "ambiguous"; count: number; first: string; last: string; total: number; opening: boolean } // opening: the count includes the order the plan started from, which the CRM does not always number as an instalment

const norm = (s: string): string => s.trim().toLowerCase();
function col(row: Row, label: string): string {
  const want = norm(label);
  for (const key of Object.keys(row)) if (norm(key) === want) return (row[key] ?? "").trim();
  return "";
}
const hasCol = (row: Row | undefined, label: string): boolean => !!row && Object.keys(row).some((k) => norm(k) === norm(label));
const yes = (s: string): boolean => ["yes", "y", "1", "true"].includes(norm(s));

// A day number from "dd/mm/yyyy hh:mm" or "mm/dd/yyyy hh:mm", by the site. null when it is not a real date.
function day(text: string, site: string, currency: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text.trim());
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [d, mo] = dateOrderOf(siteCode(site, currency)) === "mdy" ? [b, a] : [a, b];
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCMonth() === mo - 1 ? t / 86400000 : null;
}
const iso = (d: number): string => new Date(d * 86400000).toISOString().slice(0, 10);

const carried = (p: Row, plans: Row[]): boolean => (hasCol(plans[0], "Legacy plan") ? yes(col(p, "Legacy plan")) : col(p, "Gateway reference").toLowerCase().startsWith("archive:"));
const keyOf = (site: string, donor: string, currency: string, amount: string): string => `${siteCode(site, currency)}|${donor}|${currency.toUpperCase()}|${Number(amount).toFixed(2)}`;

export function matchOldSite(plans: Row[], legacy: Row[]): Map<string, OldSite> {
  const out = new Map<string, OldSite>();
  if (legacy.length === 0 || plans.length === 0) return out;
  const mine = plans.filter((p) => carried(p, plans) && col(p, "Plan ID") !== "" && col(p, "Donor ID") !== "" && col(p, "Donor ID") !== "0" && Number.isFinite(Number(col(p, "Amount per instalment (native)"))));
  const groups = new Map<string, Row[]>();
  for (const p of mine) {
    const k = keyOf(col(p, "Site"), col(p, "Donor ID"), col(p, "Currency"), col(p, "Amount per instalment (native)"));
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const orders = new Map<string, Row[]>();
  for (const o of legacy) {
    const donor = col(o, "CRM donor ID");
    if (norm(col(o, "Status")) !== "paid" || donor === "" || donor === "0" || !Number.isFinite(Number(col(o, "Amount (native)")))) continue;
    const k = keyOf(col(o, "Site"), donor, col(o, "Currency"), col(o, "Amount (native)"));
    orders.set(k, [...(orders.get(k) ?? []), o]);
  }
  for (const p of mine) {
    const k = keyOf(col(p, "Site"), col(p, "Donor ID"), col(p, "Currency"), col(p, "Amount per instalment (native)"));
    const id = col(p, "Plan ID");
    const found = orders.get(k) ?? [];
    if (found.length === 0) continue; // nothing on the old site: no summary
    if ((groups.get(k) ?? []).length > 1) { out.set(id, { match: "ambiguous", count: 0, first: "", last: "", total: 0, opening: false }); continue; }
    const start = day(col(p, "Started"), col(p, "Site"), col(p, "Currency"));
    const since = day(col(p, "In the CRM since"), col(p, "Site"), col(p, "Currency"));
    if (start === null) continue;
    const upto = since ?? Number.POSITIVE_INFINITY;
    const inside = found.map((o) => ({ o, d: day(col(o, "Paid date"), col(o, "Site"), col(o, "Currency")) })).filter((x): x is { o: Row; d: number } => x.d !== null && x.d >= start - 1 && x.d <= upto + 1);
    const renewals = inside.filter((x) => yes(col(x.o, "Recurring")));
    const opening = inside.filter((x) => !yes(col(x.o, "Recurring")) && Math.abs(x.d - start) <= 1).sort((a, b) => a.d - b.d).slice(0, 1);
    const all = [...renewals, ...opening].sort((a, b) => a.d - b.d);
    if (all.length === 0) continue;
    out.set(id, { match: "found", count: all.length, first: iso(all[0]!.d), last: iso(all[all.length - 1]!.d), total: Math.round(all.reduce((t, x) => t + Number(col(x.o, "Amount (native)")), 0) * 100) / 100, opening: opening.length > 0 });
  }
  return out;
}
