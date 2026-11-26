/**
 * db-move-records.mjs
 *
 * What it does: checks the record tables against the real database with a throwaway organisation (DECISIONS 237), then moves every organisation's records out of its JSON document into the tables and proves nothing changed.
 * Who runs it: a developer, after `npm run db:init` has created the tables AND the code that reads them is deployed: `node --env-file=.env.local scripts/db-move-records.mjs`. Add --test-only to run only the throwaway check. Safe to run again.
 * Depends on: rolldown, which comes with vite (to run the TypeScript store), @neondatabase/serverless.
 */
import { neon } from "@neondatabase/serverless";
import { rolldown } from "rolldown";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
// Bundle the TypeScript store into plain JavaScript in a temporary folder, then load it.
const dir = mkdtempSync(join(tmpdir(), "outcomes-move-"));
async function load(input, name) {
  const bundle = await rolldown({ input, platform: "node", external: ["@neondatabase/serverless"], resolve: { extensionAlias: { ".js": [".ts", ".js"] } }, logLevel: "silent" });
  await bundle.write({ file: join(dir, name), format: "esm" });
  return import(pathToFileURL(join(dir, name)).href);
}
const { pgStore } = await load("modules/00-platform/pg-store.ts", "store.mjs");
const { canon } = await load("modules/00-platform/record-tables.ts", "tables.mjs");
const sql = neon(process.env.DATABASE_URL);
const query = (text, params) => sql.query(text, params);
const TABLES = ["beneficiaries", "enrolments", "assignments", "placements", "stock", "confirmations", "progress"];
const fail = (m) => { console.error("FAILED: " + m); process.exit(1); };

// --- 1. A throwaway organisation: the real SQL, the real tables ---
const T = "zz-record-test";
const clean = async () => { for (const t of [...TABLES, "org_config"]) await query(`DELETE FROM ${t} WHERE org = $1`, [T]); };
await clean();
const config = { categories: [], itemMap: {}, usesFrameworks: true, feed: {}, crm: { kind: "none" },
  beneficiaries: { records: [{ id: "PRS-0002", name: "B", z: 1 }, { id: "PRS-0001", name: "A" }], counters: { PRS: 2 } },
  enrolments: { records: [{ id: "EN-0001", beneficiaryId: "PRS-0001" }], counter: 1 },
  assignments: { records: [{ key: "L1", partnerId: "p" }, { key: "L2", partnerId: "p" }] },
  placements: { records: [{ key: "L1", kind: "place" }, { key: "L1", kind: "place" }], counter: 2, stock: [{ id: "S1" }], stockCounter: 1 },
  confirmations: { records: [{ key: "L1", answer: "confirmed" }] }, progress: { records: [{ key: "L1", kind: "phase", id: "x" }] } };
const a = pgStore(query);
await a.putConfig(T, structuredClone(config)); // first save
const read1 = await a.getConfig(T);
const { version: v1, ...r1 } = read1;
if (canon(r1) !== canon(config)) fail("what was read back differs from what was saved");
const counts = async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, Number((await query(`SELECT count(*) AS n FROM ${t} WHERE org = $1`, [T]))[0].n)])));
const c1 = await counts();
if (c1.beneficiaries !== 2 || c1.placements !== 2 || c1.stock !== 1) fail("row counts " + JSON.stringify(c1));
// An edit: one record changes in place, one is added, one is removed. Another store (another server) does it.
const b = pgStore(query);
const read2 = await b.getConfig(T);
read2.beneficiaries.records = [{ id: "PRS-0002", name: "B edited", z: 1 }, ...read2.beneficiaries.records.slice(1), { id: "PRS-0003", name: "C" }];
read2.assignments.records = read2.assignments.records.slice(0, 1);
await b.putConfig(T, read2);
const read3 = await pgStore(query).getConfig(T);
if (read3.beneficiaries.records.map((x) => x.id).join() !== "PRS-0002,PRS-0001,PRS-0003") fail("order or content after edit");
if (read3.beneficiaries.records[0].name !== "B edited" || read3.assignments.records.length !== 1) fail("edit not kept");
if (read3.version !== v1 + 1) fail("version did not move by one");
// A stale save is refused and writes nothing.
let refused = false;
try { await a.putConfig(T, { ...read1, beneficiaries: { ...read1.beneficiaries, records: [] } }); } catch (e) { refused = e.name === "ConflictError"; }
if (!refused) fail("a stale save was not refused");
const c3 = await counts();
if (c3.beneficiaries !== 3 || c3.assignments !== 1) fail("a refused save changed rows " + JSON.stringify(c3));
await clean();
console.log("Throwaway check passed: save, read back, edit in place, order kept, stale save refused with nothing written.");
if (process.argv.includes("--test-only")) process.exit(0);

// --- 2. Every organisation: read, save (this moves the records into the tables), read again, compare ---
for (const { org } of await query("SELECT org FROM org_config ORDER BY org", [])) {
  const s = pgStore(query);
  const before = await s.getConfig(org);
  const { version: v0, ...b0 } = before;
  await s.putConfig(org, before); // a store that read it, but `legacy` is set so every list is sent
  const after = await pgStore(query).getConfig(org);
  const { version: v2, ...b2 } = after;
  if (canon(b0) !== canon(b2)) fail(`${org}: the setup read back differs from before the move`);
  const inDoc = JSON.stringify((await query("SELECT config FROM org_config WHERE org = $1", [org]))[0].config);
  const n = await Promise.all(TABLES.map(async (t) => `${t} ${(await query(`SELECT count(*) AS n FROM ${t} WHERE org = $1`, [org]))[0].n}`));
  console.log(`${org}: version ${v0} to ${v2}, document now ${inDoc.length} bytes. Rows: ${n.join(", ")}. Read back identical.`);
}
