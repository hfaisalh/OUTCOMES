/**
 * create-account.mjs
 *
 * What it does: makes the FIRST account of a place, or resets a password (DECISIONS 333), from your computer. This is how the first platform administrator is made, and the first administrator of each organisation. It asks for the password with hidden typing and saves only a salted hash. Nothing is kept in an environment setting, and there is no passphrase.
 * Who runs it: a developer, on purpose:
 *   node --env-file=.env.local scripts/create-account.mjs --org platform --email you@example.org --name "Your Name"
 *   node --env-file=.env.local scripts/create-account.mjs --org mwf --email admin@example.org --name "Name" --role admin
 * `--org platform` makes a platform administrator (it may switch between all organisations). Any other `--org` makes an account in that organisation, with `--role` admin by default (admin, manager, gifts, agent, viewer). Add `--reset` to change the password of an account that already exists.
 * Rule: the password needs 12 or more characters. A platform administrator is kept in the reserved place `_platform`, apart from every organisation.
 * Depends on: @neondatabase/serverless and node:crypto. The hash is the same as the server's (scrypt, 16 byte salt, 32 byte key).
 */
import { neon } from "@neondatabase/serverless";
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : "");
const orgArg = arg("--org");
const email = arg("--email").trim().toLowerCase();
const name = arg("--name").trim().replace(/\s+/g, " ").slice(0, 80);
const reset = process.argv.includes("--reset");
const platform = orgArg === "platform";
const org = platform ? "_platform" : orgArg;
const role = platform ? "platform" : arg("--role") || "admin";
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set. Pull it first: vercel env pull .env.local --environment=production"); process.exit(1); }
if (!orgArg || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name === "") { console.error('Say --org (platform or an organisation), --email and --name "Your Name".'); process.exit(1); }
if (!platform && !["admin", "manager", "gifts", "agent", "viewer"].includes(role)) { console.error("The role must be admin, manager, gifts, agent or viewer."); process.exit(1); }

// Hidden typing: the password is never shown on the screen, never put in the command, never in a file.
function ask(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => { if (s.includes(prompt)) write.call(rl, s); };
    rl.question(prompt, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}
const password = await ask("Password (12 or more characters): ");
if (password.length < 12) { console.error("That is too short: use 12 or more characters."); process.exit(1); }
if (password !== (await ask("Type it again: "))) { console.error("The two did not match."); process.exit(1); }

const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 32).toString("hex")}`;
const sql = neon(process.env.DATABASE_URL);
const row = (await sql.query("SELECT config FROM org_config WHERE org = $1", [org]))[0];
if (!row && !platform) { console.error(`No organisation called ${org} was found. Check the short code.`); process.exit(1); }
const config = row?.config ?? { categories: [], itemMap: {}, frameworks: [], itemFramework: {}, usesFrameworks: true, crm: { kind: "none" } };
const logins = config.logins ?? [];
const have = logins.find((l) => l.email === email);
if (have && !reset) { console.error(`${email} already has an account here. Add --reset to change its password.`); process.exit(1); }
if (!have && reset) { console.error(`${email} has no account here to reset.`); process.exit(1); }
const next = { ...config, logins: [...logins.filter((l) => l.email !== email), { email, name: have?.name ?? name, role: have?.role ?? role, hash }] };
if (row) await sql.query("UPDATE org_config SET config = $2::jsonb, version = version + 1 WHERE org = $1", [org, JSON.stringify(next)]);
else await sql.query("INSERT INTO org_config (org, config, version) VALUES ($1, $2::jsonb, 1)", [org, JSON.stringify(next)]);
console.log(`${reset ? "Password changed" : "Account made"}: ${email}${platform ? " (platform administrator)" : ` in ${org} as ${role}`}. Sign in on the normal sign-in screen with the email and password.`);
