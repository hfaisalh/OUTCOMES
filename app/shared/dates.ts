/**
 * dates.ts
 *
 * What it does: how dates are shown everywhere in OUTCOMES (DECISIONS 120): day, month and year in two digits each, 22/11/26, and 22/11/26 21:21 with a time.
 * Who calls it: the Gifts page, the audit, Needs attention and the other pages that show a date. Depends on: nothing. Pure.
 *
 * Rule: dates are stored and sent as YYYY-MM-DD and only shown this way. Text that is not a date is returned as it is, so nothing disappears.
 */

// 2026-11-22 or 2026-11-22 10:00:00 gives 22/11/26.
export const shortDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${(m[1] as string).slice(2)}` : iso;
};

// 2026-11-22T21:21:00Z or 2026-11-22 21:21 gives 22/11/26 21:21.
export const shortDateTime = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${(m[1] as string).slice(2)} ${m[4]}:${m[5]}` : shortDate(iso);
};
