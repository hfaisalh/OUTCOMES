/**
 * launch-token.ts
 *
 * What it does: makes and checks the signed tokens used for sign-in (DECISIONS 32). A launch token is
 * made by the CRM when someone clicks the OUTCOMES button. A session token is made by OUTCOMES after
 * a launch token is accepted, and is kept in a cookie.
 * Who calls it: handlers.ts (the server), and the tests. The CRM makes launch tokens itself, see docs/LAUNCH-SPEC.md.
 * Depends on: Node's built-in crypto only (HMAC-SHA256).
 *
 * Format: base64url(JSON claims) + "." + base64url(HMAC-SHA256(secret, first part)). The same format
 * is easy to make in PHP. Rules: a launch token lives at most 2 minutes and works once (handlers.ts
 * records its id), and a launch token can never be used as a session or the other way round (the
 * "typ" claim is checked).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenType = "launch" | "session";

export interface Claims {
  typ: TokenType;
  jti: string; // unique id of this token, used to stop a launch token being used twice
  sub: string; // the CRM user id
  name: string; // display name only
  org: string; // the organisation. Every record belongs to one (DECISIONS 23)
  perms: string[]; // OUTCOMES permissions from the person's CRM role (menu.ts PERMISSIONS)
  partner?: string; // set only for a partner's sign-in: the one partner whose data this person may see (DECISIONS 249). Staff have none
  iat: number; // issued at, seconds
  exp: number; // expires at, seconds
}

export const MAX_LAUNCH_SECONDS = 120; // Rule: a launch token may live at most two minutes
export const SESSION_SECONDS = 60 * 60; // Rule: a session lasts one hour, then the person opens OUTCOMES from the CRM again
const SKEW_SECONDS = 30; // allowed clock difference between the CRM and OUTCOMES

const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");
const mac = (secret: string, part: string) => createHmac("sha256", secret).update(part).digest();

export function signToken(secret: string, claims: Claims): string {
  const part = b64(JSON.stringify(claims));
  return `${part}.${b64(mac(secret, part))}`;
}

export type VerifyFailure = "malformed" | "bad_signature" | "wrong_type" | "missing_claims" | "expired" | "not_yet_valid" | "too_long";
export type VerifyResult = { ok: true; claims: Claims } | { ok: false; reason: VerifyFailure };

// Plain English for each failure. Never says which part of a signature was wrong.
export const EXPLAIN: Record<VerifyFailure, string> = {
  malformed: "The sign-in link is not valid.",
  bad_signature: "The sign-in link is not valid.",
  wrong_type: "The sign-in link is not valid.",
  missing_claims: "The sign-in link is missing details. Open OUTCOMES from the CRM again.",
  expired: "The sign-in link has expired. Open OUTCOMES from the CRM again.",
  not_yet_valid: "The sign-in link is not valid yet. Check the clocks of the CRM and OUTCOMES.",
  too_long: "The sign-in link was made to last too long, so it was refused.",
};

const isStringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

/**
 * Rules: the signature must match (compared in constant time), the type must be the one expected,
 * all claims must be present, it must not be expired or from the future, and a launch token must
 * not live longer than MAX_LAUNCH_SECONDS.
 */
export function verifyToken(secret: string, token: string, expected: TokenType, nowSeconds: number): VerifyResult {
  const pieces = token.split(".");
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) return { ok: false, reason: "malformed" };
  const [part, sig] = pieces as [string, string];
  const good = mac(secret, part);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== good.length || !timingSafeEqual(given, good)) return { ok: false, reason: "bad_signature" };

  let c: Partial<Claims>;
  try {
    c = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Partial<Claims>;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (c.typ !== expected) return { ok: false, reason: "wrong_type" };
  if (typeof c.jti !== "string" || c.jti === "" || typeof c.sub !== "string" || c.sub === "" || typeof c.name !== "string" || typeof c.org !== "string" || c.org === "" || !isStringArray(c.perms) || (c.partner !== undefined && (typeof c.partner !== "string" || c.partner === "")) || typeof c.iat !== "number" || typeof c.exp !== "number") {
    return { ok: false, reason: "missing_claims" };
  }
  if (c.exp <= nowSeconds) return { ok: false, reason: "expired" };
  if (c.iat > nowSeconds + SKEW_SECONDS) return { ok: false, reason: "not_yet_valid" };
  if (expected === "launch" && c.exp - c.iat > MAX_LAUNCH_SECONDS) return { ok: false, reason: "too_long" };
  return { ok: true, claims: c as Claims };
}

// Rule: a session carries the same person, organisation and permissions, with its own id and a longer life.
export function sessionFrom(launch: Claims, sessionId: string, nowSeconds: number): Claims {
  return { typ: "session", jti: sessionId, sub: launch.sub, name: launch.name, org: launch.org, perms: launch.perms, ...(launch.partner ? { partner: launch.partner } : {}), iat: nowSeconds, exp: nowSeconds + SESSION_SECONDS };
}

export const SESSION_COOKIE = "outcomes_session";

// The cookie cannot be read by page scripts (HttpOnly), is only sent over https (Secure) and not on cross-site posts (Lax).
export const sessionCookie = (value: string, maxAgeSeconds: number): string =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;

export const clearSessionCookie = (): string => sessionCookie("", 0);

export function readCookie(header: string | undefined, name: string): string {
  for (const piece of (header ?? "").split(";")) {
    const [k, ...rest] = piece.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}
