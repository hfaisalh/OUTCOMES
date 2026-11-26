/**
 * db-init.mjs
 *
 * What it does: creates and updates OUTCOMES' tables (every file in sql/, in name order) in the database named by DATABASE_URL.
 * Safe to run again. Who runs it: a developer, once per database: `vercel env pull .env.local`
 * then `node --env-file=.env.local scripts/db-init.mjs`. Depends on: @neondatabase/serverless.
 */

import { neon } from "@neondatabase/serverless";
import { readdirSync, readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local");
  process.exit(1);
}
const sql = neon(url);
// Every sql/NNN_*.sql file, in order. Each one is safe to run again.
const dir = new URL("../sql/", import.meta.url);
let total = 0;
for (const name of readdirSync(dir).filter((n) => /^\d+_.*\.sql$/.test(n)).sort()) {
  // Split on semicolons at the end of a statement, ignoring comment lines.
  const statements = readFileSync(new URL(name, dir), "utf8")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await sql.query(s);
  total += statements.length;
  console.log(`${name}: ${statements.length} statements run.`);
}
console.log(`Done: ${total} statements run.`);
