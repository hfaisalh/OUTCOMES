/**
 * db-reset-records.mjs
 *
 * What it does: clears the invented test records of one organisation (DECISIONS 253): the Beneficiary register, enrolments, assignments, allocations, parked outcomes, confirmations and progress, and the older outcome allocations. It does NOT touch work orders (gifts from the CRM), the setup (categories, workflows, benefits), partners, projects or the sign-in accounts. Sample partners and projects are removed in the app (Settings, Remove sample data).
 * Who runs it: a developer, on purpose: `node --env-file=.env.local scripts/db-reset-records.mjs --org mwf` shows what it would remove, and adds `--yes` to do it. Depends on: @neondatabase/serverless.
 */
import { neon } from "@neondatabase/serverless";

const org = process.argv.includes("--org") ? process.argv[process.argv.indexOf("--org") + 1] : "";
const yes = process.argv.includes("--yes");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local"); process.exit(1); }
if (!org) { console.error("Say which organisation: --org <short code>, for example --org mwf"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const TABLES = ["beneficiaries", "enrolments", "assignments", "allocations", "stock", "confirmations", "progress"];
// The saved setup keeps counters (and, before the record tables, the records) under these keys. Removing them starts the IDs again from 1.
const KEYS = ["beneficiaries", "enrolments", "assignments", "allocations", "placements", "confirmations", "progress", "outcomeAllocations"];

console.log(`Organisation: ${org}${yes ? "" : " (dry run: nothing is removed, add --yes to do it)"}`);
for (const t of TABLES) {
  const rows = await sql.query(`SELECT count(*)::int AS n FROM ${t} WHERE org = $1`, [org]);
  console.log(`  ${t}: ${rows[0].n} rows`);
  if (yes) await sql.query(`DELETE FROM ${t} WHERE org = $1`, [org]);
}
if (yes) {
  await sql.query(`UPDATE org_config SET config = config ${KEYS.map((k) => `- '${k}'`).join(" ")} WHERE org = $1`, [org]);
  console.log("Cleared. Counters in the setup were reset too, so new IDs start again from 1.");
}
