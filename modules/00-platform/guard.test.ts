/**
 * guard.test.ts
 *
 * What it does: tests the sign-in limit and the cross-site refusal (DECISIONS 291). No clock and no network.
 * Who calls it: vitest. Depends on: guard.ts.
 */
import { describe, expect, it } from "vitest";
import { callerOf, makeLimiter, refuseCrossSite } from "./guard";
import type { HttpRequest } from "./http";

const req = (over: Partial<HttpRequest> = {}): HttpRequest => ({ method: "POST", query: {}, headers: {}, ...over });

describe("the limit on wrong sign-in tries", () => {
  it("blocks after the limit, whatever is typed next, and forgets after the window", () => {
    const l = makeLimiter(3, 1000);
    for (let i = 0; i < 2; i++) l.fail("ip1", 0);
    expect(l.blocked("ip1", 10)).toBe(false);
    l.fail("ip1", 20);
    expect(l.blocked("ip1", 30)).toBe(true);
    expect(l.retrySeconds("ip1", 30)).toBe(1);
    expect(l.blocked("ip2", 30)).toBe(false); // another address is not affected
    expect(l.blocked("ip1", 1500)).toBe(false); // the window has passed
  });
  it("a good sign-in clears the count", () => {
    const l = makeLimiter(2, 1000);
    l.fail("ip", 0); l.fail("ip", 1);
    expect(l.blocked("ip", 2)).toBe(true);
    l.clear("ip");
    expect(l.blocked("ip", 3)).toBe(false);
  });
  it("finds the caller from the forwarded address, the first being the real one", () => {
    expect(callerOf(req({ headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } }))).toBe("203.0.113.5");
    expect(callerOf(req({ headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(callerOf(req())).toBe("unknown");
  });
});

describe("requests from another website", () => {
  it("refuses a change that carries an Origin from another host", () => {
    const r = refuseCrossSite(req({ headers: { origin: "https://evil.example", host: "outcomes.example" } }));
    expect(r?.status).toBe(403);
  });
  it("allows the same host (also behind a proxy), reads, and requests with no Origin", () => {
    expect(refuseCrossSite(req({ headers: { origin: "https://outcomes.example", host: "outcomes.example" } }))).toBeNull();
    expect(refuseCrossSite(req({ headers: { origin: "https://outcomes.example", host: "internal", "x-forwarded-host": "outcomes.example" } }))).toBeNull();
    expect(refuseCrossSite(req({ method: "GET", headers: { origin: "https://evil.example", host: "outcomes.example" } }))).toBeNull();
    expect(refuseCrossSite(req({ headers: { host: "outcomes.example" } }))).toBeNull();
  });
  it("refuses an Origin that is not a web address", () => {
    expect(refuseCrossSite(req({ headers: { origin: "null", host: "outcomes.example" } }))?.status).toBe(403);
  });
});
