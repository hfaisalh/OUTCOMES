/**
 * db-copy-setup.mjs
 *
 * What it does: copies your RULES AND CONFIGURATION from one organisation into another (DECISIONS 331), so the test organisation (mwf-test) starts with the same workflows, benefit connections and types, days to fulfil, rules and automatic settings as the real one, and none of the real gifts, records or accounts. Then test there, with the sample world, and nothing real is near it.
 * Who runs it: a developer, on purpose: `node --env-file=.env.local scripts/db-copy-setup.mjs --from mwf --to mwf-test` is a dry run that lists what would be copied; add `--yes` to do it. It reads the first organisation and only writes the second.
 * Copied: the workflows and their settings, the categories and item connections, benefit types and features, units, days to fulfil, icons, outcome types, the allocation order, the automatic settings, the grace days and the ID rule, partner types and fields, and the feed layout.
 * Never copied: gifts, the register, enrolments, assignments, allocations, answers, steps, messages, costs, partners, projects, accounts, or the CRM connection. The test organisation is set to take uploaded files, so it can never read the real CRM.
 * Depends on: @neondatabase/serverless.
 */
import { neon } from "@neondatabase/serverless";

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : "");
const from = arg("--from"), to = arg("--to"), yes = process.argv.includes("--yes");
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local"); process.exit(1); }
if (!from || !to || from === to) { console.error("Say two different organisations: --from mwf --to mwf-test"); process.exit(1); }

const KEEP = ["categories", "itemMap", "frameworks", "itemFramework", "usesFrameworks", "itemKinds", "kindFeatures", "itemUnits", "itemTimelines", "itemIcons", "outcomeTypes", "allocationSteps", "autoRules", "graceDays", "requireRef", "partnerTypes", "partnerFields", "feed", "allocationPrefix"];
const sql = neon(process.env.DATABASE_URL);
const source = (await sql.query("SELECT config FROM org_config WHERE org = $1", [from]))[0]?.config;
if (!source) { console.error(`No setup was found for ${from}.`); process.exit(1); }
const copy = Object.fromEntries(KEEP.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));
const target = (await sql.query("SELECT config FROM org_config WHERE org = $1", [to]))[0]?.config ?? { categories: [], itemMap: {} };
const next = { ...target, ...copy, crm: { kind: "upload" } }; // the test organisation takes uploaded files only
console.log(`${from} -> ${to}${yes ? "" : " (dry run: nothing is written, add --yes to do it)"}`);
console.log(`Settings copied: ${Object.keys(copy).join(", ")}`);
if (yes) {
  const exists = (await sql.query("SELECT 1 FROM org_config WHERE org = $1", [to])).length > 0;
  if (exists) await sql.query("UPDATE org_config SET config = $2::jsonb, version = version + 1 WHERE org = $1", [to, JSON.stringify(next)]);
  else await sql.query("INSERT INTO org_config (org, config, version) VALUES ($1, $2::jsonb, 1)", [to, JSON.stringify(next)]);
  console.log(`Done. Sign in to ${to} with OWNER_TEST_PASSPHRASE.`);
}
