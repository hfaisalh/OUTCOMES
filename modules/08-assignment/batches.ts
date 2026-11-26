/**
 * batches.ts
 *
 * What it does: Batches (DECISIONS 203). Every assignment to a partner carries a batch number, so the work can be tracked, released and invoiced in groups. A new batch starts after every N assignments to the same
 * partner (N is the partner's batch size, 10 unless it sets another). Nothing waits for a batch to fill: each gift is assigned and starts at once, the batch is only a label on it.
 * Who calls it: assignment.ts (to label new assignments) and the Assignment page (to show the batches). Depends on: nothing, it works on any record with a key, a partner, a time and an optional batch.
 * Pure functions: no database, no screen, so the rules can be ported to Salesforce (Apex) or another stack.
 *
 * Rules:
 * - Rule: a batch is a rolling label, never a wait. A gift is assigned straight away and takes the partner's current batch.
 * - Rule: the current batch is the partner's highest number. It takes assignments until it holds the batch size, then the next number opens.
 * - Rule: a label never changes once given. Taking an assignment back frees its place in the batch, and a gift moved to another partner joins that partner's current batch.
 * - Rule: a work order is covered when it has a place (a child enrolled for it) or an outcome made for it. A batch shows how many of its work orders are covered, so the partner and MWF see the same count.
 * - Rule: a batch is open while it holds fewer than its size, and full once it holds that many.
 */

export const DEFAULT_BATCH_SIZE = 10;

// The batch size a partner has set, else 10. A size that is not a whole number of at least 1 is ignored.
export const batchSizeOf = (p: { batchSize?: number } | undefined): number => (p?.batchSize !== undefined && Number.isInteger(p.batchSize) && p.batchSize >= 1 ? p.batchSize : DEFAULT_BATCH_SIZE);

export interface Batched { key: string; partnerId: string; at: string; batch?: number }

// Gives a batch number to every record that has none, partner by partner, oldest first. Records that already have one are left alone, so running it again changes nothing.
export function labelBatches<T extends Batched>(records: T[], sizeOf: (partnerId: string) => number): T[] {
  const out = records.map((r) => ({ ...r }));
  for (const partnerId of new Set(out.filter((r) => r.batch === undefined).map((r) => r.partnerId))) {
    const labelled = out.filter((r) => r.partnerId === partnerId && r.batch !== undefined);
    let current = Math.max(1, ...labelled.map((r) => r.batch as number));
    let count = labelled.filter((r) => r.batch === current).length;
    const size = Math.max(1, sizeOf(partnerId));
    for (const r of out.filter((x) => x.partnerId === partnerId && x.batch === undefined).sort((x, y) => x.at.localeCompare(y.at) || x.key.localeCompare(y.key))) {
      if (count >= size) { current++; count = 0; }
      r.batch = current;
      count++;
    }
  }
  return out;
}

export interface BatchRow { partnerId: string; batch: number; size: number; total: number; covered: number; state: "open" | "full" }

// One row for each batch of each partner: how many work orders it holds, how many are covered, and whether it is still open. `covered` is the set of gift keys that have a place or an outcome.
export function batchRollup(records: Batched[], covered: Set<string>, sizeOf: (partnerId: string) => number): BatchRow[] {
  const rows = new Map<string, BatchRow>();
  for (const r of labelBatches(records, sizeOf)) {
    const id = `${r.partnerId}|${r.batch}`;
    const size = Math.max(1, sizeOf(r.partnerId));
    const row = rows.get(id) ?? { partnerId: r.partnerId, batch: r.batch as number, size, total: 0, covered: 0, state: "open" as const };
    row.total++;
    if (covered.has(r.key)) row.covered++;
    row.state = row.total >= size ? "full" : "open";
    rows.set(id, row);
  }
  return [...rows.values()].sort((x, y) => x.partnerId.localeCompare(y.partnerId) || x.batch - y.batch);
}
