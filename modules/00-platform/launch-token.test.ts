/**
 * launch-token.test.ts
 *
 * What it does: tests launch-token.ts. The tests double as examples of what the CRM must send.
 */

import { describe, expect, it } from "vitest";
import { readCookie, sessionFrom, signToken, verifyToken, type Claims } from "./launch-token";

const SECRET = "test-secret-not-real";
const NOW = 1_800_000_000;
const launch = (over: Partial<Claims> = {}): Claims => ({ typ: "launch", jti: "j1", sub: "u7", name: "Sample User", org: "mwf", perms: ["outcomes.access"], iat: NOW, exp: NOW + 60, ...over });

describe("verifyToken", () => {
  it("accepts a good launch token", () => {
    const r = verifyToken(SECRET, signToken(SECRET, launch()), "launch", NOW + 5);
    expect(r.ok && r.claims.sub).toBe("u7");
  });

  it("refuses a token signed with another secret or changed afterwards", () => {
    expect(verifyToken(SECRET, signToken("other", launch()), "launch", NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const [part, sig] = signToken(SECRET, launch()).split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...launch(), org: "someone-else" })).toString("base64url");
    expect(verifyToken(SECRET, `${forged}.${sig}`, "launch", NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(part).not.toBe(forged);
  });

  it("refuses garbage", () => {
    for (const t of ["", "abc", "a.b.c", "."]) expect(verifyToken(SECRET, t, "launch", NOW).ok).toBe(false);
  });

  it("refuses an expired token and one from the future", () => {
    expect(verifyToken(SECRET, signToken(SECRET, launch()), "launch", NOW + 61)).toEqual({ ok: false, reason: "expired" });
    expect(verifyToken(SECRET, signToken(SECRET, launch({ iat: NOW + 500, exp: NOW + 560 })), "launch", NOW)).toEqual({ ok: false, reason: "not_yet_valid" });
  });

  it("refuses a launch token that lives too long", () => {
    expect(verifyToken(SECRET, signToken(SECRET, launch({ exp: NOW + 3600 })), "launch", NOW)).toEqual({ ok: false, reason: "too_long" });
  });

  it("never lets a launch token be used as a session, or the other way round", () => {
    expect(verifyToken(SECRET, signToken(SECRET, launch()), "session", NOW)).toEqual({ ok: false, reason: "wrong_type" });
    const s = sessionFrom(launch(), "s1", NOW);
    expect(verifyToken(SECRET, signToken(SECRET, s), "launch", NOW)).toEqual({ ok: false, reason: "wrong_type" });
  });

  it("refuses a token with missing claims", () => {
    const { org: _o, ...rest } = launch();
    expect(verifyToken(SECRET, signToken(SECRET, rest as Claims), "launch", NOW)).toEqual({ ok: false, reason: "missing_claims" });
  });
});

describe("session", () => {
  it("keeps the person, organisation and permissions, with its own id and a longer life", () => {
    const s = sessionFrom(launch({ perms: ["outcomes.access", "outcomes.settings"] }), "s1", NOW);
    expect([s.typ, s.jti, s.org, s.perms, s.exp - s.iat]).toEqual(["session", "s1", "mwf", ["outcomes.access", "outcomes.settings"], 3600]);
  });
  it("reads a cookie by name", () => {
    expect(readCookie("a=1; outcomes_session=xyz.abc; b=2", "outcomes_session")).toBe("xyz.abc");
    expect(readCookie(undefined, "x")).toBe("");
  });
});
