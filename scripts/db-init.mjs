/**
 * db-init.mjs
 *
 * What it does: creates OUTCOMES' tables (sql/001_init.sql) in the database named by DATABASE_URL.
 * Safe to run again. Who runs it: a developer, once per database: `vercel env pull .env.local`
 * then `node --env-file=.env.local scripts/db-init.mjs`. Depends on: @neondatabase/serverless.
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local");
  process.exit(1);
}
const sql = neon(url);
const file = new URL("../sql/001_init.sql", import.meta.url);
// Split on semicolons at the end of a statement, ignoring comment lines.
const statements = readFileSync(file, "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);
for (const s of statements) await sql.query(s);
console.log(`Done: ${statements.length} statements run.`);
