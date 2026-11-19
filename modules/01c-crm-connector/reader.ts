/**
 * reader.ts
 *
 * What it does: the two sides of a CRM connector, written as interfaces so a CRM can be read through
 * a database view or an API without changing anything else (DECISIONS 30). Includes the API
 * versions, a fixed-rows version for tests and demos, and plain-English errors.
 * Who calls it: the pick-up job.
 * Depends on: feed.ts and report-back.ts types. The network call is injected, so tests need no network.
 *
 * A database reader is written by the organisation's developers: run `SELECT * FROM <the feed view>`
 * and return the rows as text (see docs/CRM-FEED-SPEC.md). It needs only read access to that view.
 */

import type { FeedRow } from "./feed.js";
import type { ReportBackItem } from "./report-back.js";

// The read side: the CRM as the data input.
export interface CrmReader {
  // `since` is an ISO timestamp, when given only lines changed after it are wanted. A reader may ignore it.
  readFeed(since?: string): Promise<FeedRow[]>;
}

// The write side: report back to the CRM. Kept separate from reading.
export interface CrmReporter {
  send(items: ReportBackItem[]): Promise<void>;
}

export class ConnectorError extends Error {}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface ApiConfig {
  baseUrl: string; // for example https://crm.example.org/api/outcomes
  token: string; // read-only token for reading, a separate token for reporting. Never logged.
}

const clean = (url: string) => url.replace(/\/+$/, "");

// Plain English for what went wrong, without ever including the token.
function failure(status: number): ConnectorError {
  if (status === 401 || status === 403) return new ConnectorError("The CRM refused the connection. Check the access token in the connector settings.");
  if (status === 404) return new ConnectorError("The CRM address was not found. Check the connector address.");
  return new ConnectorError(`The CRM answered with an error (${status}). Try again later.`);
}

// Reads the feed from an API that answers { rows: [ ... ] }.
export function apiReader(config: ApiConfig, fetchImpl: FetchLike): CrmReader {
  return {
    async readFeed(since) {
      const url = `${clean(config.baseUrl)}/feed${since ? `?since=${encodeURIComponent(since)}` : ""}`;
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${config.token}` } }).catch(() => {
        throw new ConnectorError("Could not reach the CRM. Check the connection and the connector address.");
      });
      if (!res.ok) throw failure(res.status);
      const body = (await res.json()) as { rows?: unknown };
      if (!Array.isArray(body.rows)) throw new ConnectorError("The CRM answer did not contain a list of rows.");
      // Everything is handled as text, whatever the CRM sent.
      return (body.rows as Record<string, unknown>[]).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)])));
    },
  };
}

// Sends report-back items to an API that accepts { items: [ ... ] }.
export function apiReporter(config: ApiConfig, fetchImpl: FetchLike): CrmReporter {
  return {
    async send(items) {
      if (items.length === 0) return;
      const res = await fetchImpl(`${clean(config.baseUrl)}/report-back`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => {
        throw new ConnectorError("Could not reach the CRM. Check the connection and the connector address.");
      });
      if (!res.ok) throw failure(res.status);
    },
  };
}

// A reader over rows you already have: tests, demos, and a database reader's result.
export const rowsReader = (rows: FeedRow[]): CrmReader => ({ readFeed: async () => rows });
