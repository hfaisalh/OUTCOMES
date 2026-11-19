# Server setup

The server parts run as Vercel functions in `api/` (the logic is in `modules/00-platform/`). Settings are environment variables, set in Vercel and never committed.

| Variable | What it is | Status |
|---|---|---|
| `LAUNCH_SECRET` | Shared with the CRM. Signs the launch token (`docs/LAUNCH-SPEC.md`) | Set. A copy is in `.secrets/launch-secret.txt` on the laptop that set it (not in git). Give it to the CRM developers by a private channel |
| `SESSION_SECRET` | Only OUTCOMES. Signs the session cookie | Set |
| `CRON_SECRET` | Lets Vercel's scheduled job call `/api/pickup` | Set |
| `DATABASE_URL` | The Postgres database (Neon, set through the Vercel integration) | Set. The page says whether storage is the database or temporary |
| `OWNER_PASSPHRASE` | The owner's sign-in passphrase (16 or more characters) until the CRM sign-in exists (DECISIONS 43). Unset switches the owner sign-in off | **Not set yet.** Add it in Vercel (Settings, Environment Variables) or `vercel env add OWNER_PASSPHRASE production`, then redeploy |
| `DEMO_LOGIN` | Test sign-in for the pretend CRM (Module 1d). Set to `1` on a protected test server only | Remove it to switch the test sign-in off |
| `<TOKEN NAME>` | The read token for an organisation's CRM, named in that organisation's setup (`crm.tokenEnv`) | Not set |

## Add the database
1. Accept the Neon terms at `https://vercel.com/hfaisalh/~/integrations/accept-terms/neon?source=cli` (a legal step only the account owner can do).
2. `vercel integration add neon --name outcomes-db`
3. `vercel env pull .env.local` then `npm run db:init` (creates the tables in `sql/001_init.sql`).
4. `vercel deploy --prod`

## Saved real data (DECISIONS 43)
1. Set `OWNER_PASSPHRASE` as above and redeploy (`vercel deploy --prod`).
2. Create the audit table: `vercel env pull .env.local` then `npm run db:init` (safe to run again, it only adds what is missing).
3. Open `/app/`, sign in as the owner on the Work orders page, then choose the three CRM export files and press Load. Work orders and an audit record are saved. Come back later and load fresh exports: the Audit page shows what changed since the last import.

## Connect an organisation's CRM
An organisation's setup holds `crm: { kind: "api", baseUrl, tokenEnv }`. Set the variable named by `tokenEnv` to the read token, and give the CRM developers `docs/CRM-FEED-SPEC.md`. The scheduled job runs daily at 03:00 UTC (the free Vercel plan allows once a day). "Run pickup now" on the Work orders page runs one at any time.

## Rules the server keeps
- The organisation always comes from the signed session, never from the request.
- Each endpoint checks the permission. A launch token works once.
- With no secrets set the server answers 503 instead of accepting anyone.
- The CRM token is never stored in the database or sent to the page.
