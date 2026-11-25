/**
 * history.ts
 *
 * What it does: the allocation history (DECISIONS 186). From the placement records it builds, for one gift, every child (or outcome) the gift has held, and for one enrolment (a child in a cluster for a benefit),
 * every gift that has sponsored it, each with the day it started, the day it ended (or "now") and why it ended. Newest first. Nothing is deleted when a placement ends, so this is everything that happened.
 * Who calls it: the history windows (app/history-window.ts) and the counts on the gift window and on a cluster's Beneficiaries tab. Depends on: placement.ts (the types only). Pure functions: no database, no screen.
 *
 * Rules:
 * - A row is one placement record. A gift spread over several children has a row for each, with the units each took.
 * - A row that has not ended is "now". One that has ended says why, in plain words (the plan was paused, cancelled or completed; the child left; a person moved it or took it back).
 * - Newest first: by the day it started, then by when it ended.
 */

import { END_LABEL, type Placement } from "./placement.js";

export interface HistoryRow {
  from: string; // YYYY-MM-DD it started
  to: string; // YYYY-MM-DD it ended, "" while it holds the place
  units: number;
  why: string; // why it ended, in words, "" while it holds the place
  holds: boolean; // true while it holds the place
  key: string; // the gift (assignment) it belongs to
  enrolmentId: string; // the child's place, "" for an outcome
  outcomeRef: string; // the outcome, "" for a place
  how: "auto" | "manual";
}

const toRow = (p: Placement): HistoryRow => ({
  from: p.at.slice(0, 10), to: p.to ?? "", units: p.parts, why: p.to === undefined ? "" : p.endReason ? END_LABEL[p.endReason] : "Ended", holds: p.to === undefined,
  key: p.key, enrolmentId: p.enrolmentId, outcomeRef: p.outcomeRef, how: p.how,
});

// Newest first: the latest start, then the one still holding, then the latest end.
const newestFirst = (a: HistoryRow, b: HistoryRow): number => b.from.localeCompare(a.from) || Number(b.holds) - Number(a.holds) || b.to.localeCompare(a.to) || a.enrolmentId.localeCompare(b.enrolmentId);

// Everything one gift has held: each child's place or outcome, with when and why it ended.
export const historyOfGift = (records: Placement[], key: string): HistoryRow[] => records.filter((p) => p.key === key).map(toRow).sort(newestFirst);

// Every gift that has sponsored one place (a child enrolled in a cluster for a benefit).
export const historyOfEnrolment = (records: Placement[], enrolmentId: string): HistoryRow[] => records.filter((p) => p.kind === "place" && p.enrolmentId === enrolmentId).map(toRow).sort(newestFirst);

// How many records a gift or a place has, for the button that opens its history.
export const countOfGift = (records: Placement[], key: string): number => records.filter((p) => p.key === key).length;
export const countOfEnrolment = (records: Placement[], enrolmentId: string): number => records.filter((p) => p.kind === "place" && p.enrolmentId === enrolmentId).length;
