/**
 * server-form.test.ts
 *
 * What it does: checks the server wrapper (api/_server.ts) reads a plain HTML form post, which is how
 * the owner sign-in form arrives, and answers with a redirect and a cookie. Uses a fake request, no network.
 */

import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { node } from "../../api/_server";
import { handleOwnerLogin } from "./handlers";

const saved = { ...process.env };
beforeEach(() => {
  process.env["LAUNCH_SECRET"] = "l";
  process.env["SESSION_SECRET"] = "s";
  process.env["OWNER_PASSPHRASE"] = "a long owner passphrase";
  delete process.env["DATABASE_URL"];
});
afterEach(() => Object.assign(process.env, saved));

async function post(body: string, type: string) {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method: "POST", url: "/api/owner-login", headers: { "content-type": type } });
  const headers: Record<string, string> = {};
  let out = "";
  const res = { statusCode: 0, setHeader: (k: string, v: string) => (headers[k.toLowerCase()] = v), end: (s?: string) => (out = s ?? "") };
  await node(handleOwnerLogin)(req as never, res as never);
  return { status: res.statusCode, headers, out };
}

describe("owner sign-in form post through the server wrapper", () => {
  it("signs in and redirects to the app with a cookie", async () => {
    const r = await post("passphrase=a+long+owner+passphrase", "application/x-www-form-urlencoded");
    expect([r.status, r.headers["location"]]).toEqual([302, "/app/"]);
    expect(r.headers["set-cookie"]).toMatch(/HttpOnly/);
  });
  it("redirects back with a wrong-passphrase flag and no cookie", async () => {
    const r = await post("passphrase=nope", "application/x-www-form-urlencoded");
    expect([r.status, r.headers["location"], r.headers["set-cookie"]]).toEqual([302, "/app/?signin=wrong", undefined]);
  });
  it("still reads JSON", async () => {
    const r = await post(JSON.stringify({ passphrase: "nope" }), "application/json");
    expect(r.status).toBe(401);
  });
});
