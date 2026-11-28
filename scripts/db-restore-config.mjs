/**
 * db-restore-config.mjs
 *
 * What it does: puts one organisation's SETUP back from a backup made by db-backup.mjs (DECISIONS 330): the workflows and their settings, the benefit connections and types, partners, projects, rules and automatic settings. It does not touch the records, only the setup. Gifts are never touched.
 * Who runs it: a developer, on purpose: `node --env-file=.env.local scripts/db-restore-config.mjs --org mwf --file real-data/backup-mwf-....json` is a dry run that says what would change; add `--yes` to do it.
 * Rule: the setup is put back as it was saved, so anything configured since is lost. Run db-backup.mjs first if you are unsure.
 * Depends on: @neondatabase/serverless.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : "");
const org = arg("--org"), file = arg("--file"), yes = process.argv.includes("--yes");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local"); process.exit(1); }
if (!org || !file) { console.error("Say which organisation and file: --org mwf --file real-data/backup-....json"); process.exit(1); }

const backup = JSON.parse(readFileSync(file, "utf8"));
if (backup.org !== org) { console.error(`That backup is for ${backup.org}, not ${org}.`); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const now = (await sql.query("SELECT config FROM org_config WHERE org = $1", [org]))[0]?.config ?? {};
const keys = new Set([...Object.keys(now), ...Object.keys(backup.config)]);
const changed = [...keys].filter((k) => JSON.stringify(now[k]) !== JSON.stringify(backup.config[k]));
console.log(`Organisation: ${org}, backup saved ${backup.savedAt}${yes ? "" : " (dry run: nothing is changed, add --yes to do it)"}`);
console.log(changed.length ? `Settings that differ from the backup: ${changed.join(", ")}` : "The setup already matches the backup.");
if (yes && changed.length) {
  await sql.query("UPDATE org_config SET config = $2::jsonb, version = version + 1 WHERE org = $1", [org, JSON.stringify(backup.config)]);
  console.log("The setup was put back.");
}
