/**
 * guard.ts
 *
 * What it does: two small protections for the server (DECISIONS 291): a limit on wrong sign-in tries, and a refusal of requests that change something but come from another website.
 * Who calls it: the sign-in handlers (handlers.ts, signin-handler.ts) for the limit, and api/_server.ts for the cross-site refusal. Depends on nothing. Pure: the time is passed in, so the tests need no clock.
 *
 * Rules:
 * - Rule: after MAX_FAILS wrong tries from one address, or MAX_FAILS_PER_ACCOUNT for one email from anywhere, sign-in is refused for WINDOW_MS, whatever is typed, even the right password. A good sign-in clears the address's count.
 * - Rule: the count is kept in the running function's memory, so it is best effort: a new function instance starts at zero. It stops guessing at a normal pace; a stronger limit would need the database.
 * - Rule: a request that changes something (not GET or HEAD) that carries an Origin from another host is refused. Requests with no Origin (the scheduled job, scripts) are not affected: they carry no browser session to abuse.
 */

import type { HttpRequest, HttpResponse } from "./http.js";

export const MAX_FAILS = 8;
export const MAX_FAILS_PER_ACCOUNT = 30;
export const WINDOW_MS = 15 * 60 * 1000;

// --- Who is asking ---
// The address Vercel passes on (the first one is the real caller), else a fixed word so the limit still applies to all unknown callers together.
export function callerOf(req: HttpRequest): string {
  const fwd = (req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return fwd || (req.headers["x-real-ip"] ?? "").trim() || "unknown";
}

// --- The limit on wrong tries ---
interface Bucket { fails: number; since: number }
export function makeLimiter(max = MAX_FAILS, windowMs = WINDOW_MS) {
  const buckets = new Map<string, Bucket>();
  const live = (key: string, now: number): Bucket | undefined => {
    const b = buckets.get(key);
    if (b && now - b.since >= windowMs) { buckets.delete(key); return undefined; } // an old count is forgotten
    return b;
  };
  return {
    blocked: (key: string, now: number): boolean => (live(key, now)?.fails ?? 0) >= max,
    fail(key: string, now: number): void {
      const b = live(key, now);
      if (b) b.fails++; else buckets.set(key, { fails: 1, since: now });
      if (buckets.size > 5000) buckets.clear(); // a cap, so a flood of different addresses cannot fill the memory
    },
    clear: (key: string): void => void buckets.delete(key),
    retrySeconds: (key: string, now: number): number => { const b = live(key, now); return b ? Math.max(1, Math.ceil((b.since + windowMs - now) / 1000)) : 0; },
  };
}
export const signInLimit = makeLimiter();
export const accountLimit = makeLimiter(MAX_FAILS_PER_ACCOUNT);

export const tooMany = (retrySeconds: number): HttpResponse => ({ status: 429, headers: { "retry-after": String(retrySeconds), "cache-control": "no-store" }, body: { error: "Too many tries. Wait a few minutes and try again." } });

// --- Requests from another website ---
export function refuseCrossSite(req: HttpRequest): HttpResponse | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return null;
  const origin = req.headers["origin"];
  if (!origin) return null;
  const host = (req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "").split(",")[0]?.trim().toLowerCase();
  let from = "";
  try { from = new URL(origin).host.toLowerCase(); } catch { from = "invalid"; }
  return from === host ? null : { status: 403, body: { error: "This request came from another website, so it was refused." } };
}
