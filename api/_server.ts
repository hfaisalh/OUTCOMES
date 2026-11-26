/**
 * _server.ts
 *
 * What it does: builds the server's settings from environment variables and turns Node's request
 * and response into the plain ones in modules/00-platform/handlers.ts. Files in api/ that start
 * with an underscore are not endpoints.
 * Who calls it: api/launch.ts, logout.ts, me.ts, config.ts, work-orders.ts and pickup.ts.
 * Depends on: modules/00-platform and the Neon database driver.
 *
 * Environment variables (set in Vercel, never committed, see docs/SERVER-SETUP.md):
 *   LAUNCH_SECRET   shared with the CRM, signs the launch tokens
 *   SESSION_SECRET  OUTCOMES only, signs the session cookie
 *   CRON_SECRET     lets the scheduled job call /api/pickup
 *   OWNER_PASSPHRASE  the owner's sign-in passphrase (16+ characters) until the CRM sign-in exists. Unset switches it off
 *   DEMO_LOGIN      set to 1 only on a test server: switches on /api/demo-login (the pretend CRM)
 *   DATABASE_URL    the Postgres database. Without it a memory store is used and nothing is kept
 *   <TOKEN_ENV>     the read token for an organisation's CRM, named in its setup
 */

import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { apiReader, apiReporter, ConnectorError, type CrmReader, type CrmReporter } from "../modules/01c-crm-connector/reader.js";
import type { Deps, HttpRequest, HttpResponse } from "../modules/00-platform/handlers.js";
import { withConflictRetry } from "../modules/00-platform/http.js";
import { mockFeed } from "../modules/01d-mock-crm/mock-crm.js";
import { pgStore } from "../modules/00-platform/pg-store.js";
import { memoryStore, type OrgConfig, type Store } from "../modules/00-platform/store.js";

// One store per running function. The memory store is only for trying things out.
let store: Store | null = null;
function getStore(): { store: Store; kind: Deps["storage"] } {
  const url = process.env["DATABASE_URL"];
  if (!store) {
    if (url) {
      const sql = neon(url);
      store = pgStore((text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>);
    } else {
      store = memoryStore();
    }
  }
  return { store, kind: url ? "database" : "memory" };
}

// The connection to an organisation's CRM, from its setup and the token held in the environment.
function connector(config: OrgConfig): { reader: CrmReader; reporter: CrmReporter } | null {
  // The pretend CRM (Module 1d): new gifts arrive as time passes. It accepts report-back and forgets it.
  if (config.crm.kind === "demo") return { reader: { readFeed: async () => mockFeed(Date.now()) }, reporter: { send: async () => undefined } };
  if (config.crm.kind !== "api") return null; // "upload" and "none" have no connection to read
  const token = process.env[config.crm.tokenEnv] ?? "";
  if (token === "") {
    const fail = () => Promise.reject(new ConnectorError("The CRM access token is not set on the server."));
    return { reader: { readFeed: fail }, reporter: { send: fail } };
  }
  const cfg = { baseUrl: config.crm.baseUrl, token };
  const f = fetch as unknown as Parameters<typeof apiReader>[1];
  return { reader: apiReader(cfg, f), reporter: apiReporter(cfg, f) };
}

export function deps(): Deps {
  const s = getStore();
  return {
    store: s.store,
    storage: s.kind,
    secrets: { launch: process.env["LAUNCH_SECRET"] ?? "", session: process.env["SESSION_SECRET"] ?? "", cron: process.env["CRON_SECRET"] ?? "" },
    nowMs: () => Date.now(),
    newId: () => randomUUID(),
    connector,
    demoLogin: process.env["DEMO_LOGIN"] === "1",
    ownerPassphrase: process.env["OWNER_PASSPHRASE"] ?? "",
  };
}

// Reads the request body. JSON is the normal case. A plain HTML form post (the owner sign-in form) is read as fields.
async function readBody(req: IncomingMessage): Promise<unknown> {
  const isForm = String(req.headers["content-type"] ?? "").includes("application/x-www-form-urlencoded");
  const fields = (raw: string) => Object.fromEntries(new URLSearchParams(raw));
  let pre = (req as IncomingMessage & { body?: unknown }).body; // Vercel may already have read it
  if (pre !== undefined) {
    if (Buffer.isBuffer(pre)) pre = pre.toString("utf8");
    return isForm && typeof pre === "string" ? fields(pre) : pre;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw === "") return undefined;
  if (isForm) return fields(raw);
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Wraps a handler as a Vercel function. A server with no secrets set answers 503 rather than accepting anyone.
export function node(handler: (req: HttpRequest, d: Deps) => Promise<HttpResponse>) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const d = deps();
    const send = (r: HttpResponse) => {
      res.statusCode = r.status;
      for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
      if (r.body === undefined) return void res.end();
      if (typeof r.body === "string") return void res.end(r.body);
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(r.body));
    };
    if (d.secrets.launch === "" || d.secrets.session === "") return send({ status: 503, body: { error: "The server is not set up yet (secrets missing)." } });
    const url = new URL(req.url ?? "/", "http://localhost");
    const request: HttpRequest = {
      method: req.method ?? "GET",
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])),
      body: req.method === "GET" ? undefined : await readBody(req),
    };
    try {
      send(await withConflictRetry(handler, request, d)); // a clash with another person's save is retried on the fresh setup (DECISIONS 235)
    } catch {
      send({ status: 500, body: { error: "Something went wrong on the server. Try again, and tell the developers if it keeps happening." } });
    }
  };
}
