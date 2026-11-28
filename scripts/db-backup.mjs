/**
 * db-backup.mjs
 *
 * What it does: saves a copy of one organisation's setup and records to a file (DECISIONS 330), so a test can never cost you your configuration. The setup is everything you configured: workflows and their settings, the benefit connections and types, partners, projects, rules and automatic settings. The records are the register, enrolments, assignments, allocations, answers and steps.
 * Who runs it: a developer, on purpose, before testing or any big change: `node --env-file=.env.local scripts/db-backup.mjs --org mwf`. The file goes to real-data/ (kept out of git), because the records hold beneficiary data: never commit it, never email it.
 * To put the setup back: `node --env-file=.env.local scripts/db-restore-config.mjs --org mwf --file real-data/<the file>` (a dry run first; add --yes to do it).
 * Depends on: @neondatabase/serverless. It only reads.
 */
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "node:fs";

const org = process.argv.includes("--org") ? process.argv[process.argv.indexOf("--org") + 1] : "";
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local"); process.exit(1); }
if (!org) { console.error("Say which organisation: --org <short code>, for example --org mwf"); process.exit(1); }

const sql = neon(process.env.DATABASE_URL);
const TABLES = ["beneficiaries", "enrolments", "assignments", "allocations", "stock", "confirmations", "progress"];
const row = (await sql.query("SELECT config, version FROM org_config WHERE org = $1", [org]))[0];
if (!row) { console.error(`No setup was found for ${org}.`); process.exit(1); }
const backup = { org, savedAt: new Date().toISOString(), version: row.version, config: row.config, tables: {} };
for (const t of TABLES) {
  backup.tables[t] = await sql.query(`SELECT * FROM ${t} WHERE org = $1`, [org]);
  console.log(`  ${t}: ${backup.tables[t].length} rows`);
}
mkdirSync("real-data", { recursive: true });
const file = `real-data/backup-${org}-${backup.savedAt.replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify(backup));
const keys = Object.keys(row.config ?? {});
console.log(`Saved the setup (${keys.length} settings) and the records of ${org} to ${file}. Keep it private.`);
