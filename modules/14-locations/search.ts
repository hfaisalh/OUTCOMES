/**
 * search.ts
 *
 * What it does: asks the free place search (Photon, built on OpenStreetMap) for places that match some typed letters, and keeps answers for a day so the same search is not repeated.
 * Who calls it: modules/00-platform/places-handler.ts. Depends on: locations.ts and a `fetch` it is given, so the tests use a fake and never reach the internet.
 * Rules:
 * - Rule: only the place name typed is sent, never anything about a person (DECISIONS 274).
 * - Rule: the search is polite. Too-short texts are not sent, an answer is kept for a day, the wait is capped at 4 seconds, and a failure gives an empty list, never an error the person must handle: they can use what they typed.
 */

import { cleanQuery, readPlaces, usableQuery, type Place } from "./locations.js";

export const SEARCH_URL = "https://photon.komoot.io/api/";
const KEEP_MS = 24 * 60 * 60 * 1000;
const MAX_KEPT = 500;
const WAIT_MS = 4000;

export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
const kept = new Map<string, { at: number; places: Place[] }>();

export async function searchPlaces(query: unknown, fetcher: Fetcher, nowMs: number): Promise<Place[]> {
  if (!usableQuery(query)) return [];
  const q = cleanQuery(query);
  const key = q.toLowerCase();
  const hit = kept.get(key);
  if (hit && nowMs - hit.at < KEEP_MS) return hit.places;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WAIT_MS);
    // Ask for more than shown, because streets and shops are dropped after.
    const res = await fetcher(`${SEARCH_URL}?q=${encodeURIComponent(q)}&limit=15&lang=en`, { signal: ctl.signal, headers: { "User-Agent": "OUTCOMES-place-search" } });
    clearTimeout(timer);
    if (!res.ok) return [];
    const places = readPlaces(await res.json());
    if (kept.size >= MAX_KEPT) kept.clear(); // simplest safe cap: start again
    kept.set(key, { at: nowMs, places });
    return places;
  } catch {
    return [];
  }
}

export const forgetSearches = (): void => kept.clear(); // for the tests
