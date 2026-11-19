# Server setup

The server parts run as Vercel functions in `api/` (the logic is in `modules/00-platform/`). Settings are environment variables, set in Vercel and never committed.

| Variable | What it is | Status |
|---|---|---|
| `LAUNCH_SECRET` | Shared with the CRM. Signs the launch token (`docs/LAUNCH-SPEC.md`) | Set. A copy is in `.secrets/launch-secret.txt` on the laptop that set it (not in git). Give it to the CRM developers by a private channel |
| `SESSION_SECRET` | Only OUTCOMES. Signs the session cookie | Set |
| `CRON_SECRET` | Lets Vercel's scheduled job call `/api/pickup` | Set |
| `DATABASE_URL` | The Postgres database | **Not set yet.** Without it a temporary memory store is used and the page says "TEMPORARY STORAGE, nothing is kept" |
| `<TOKEN NAME>` | The read token for an organisation's CRM, named in that organisation's setup (`crm.tokenEnv`) | Not set |

## Add the database
1. Accept the Neon terms at `https://vercel.com/hfaisalh/~/integrations/accept-terms/neon?source=cli` (a legal step only the account owner can do).
2. `vercel integration add neon --name outcomes-db`
3. `vercel env pull .env.local` then `npm run db:init` (creates the tables in `sql/001_init.sql`).
4. `vercel deploy --prod`

## Connect an organisation's CRM
An organisation's setup holds `crm: { kind: "api", baseUrl, tokenEnv }`. Set the variable named by `tokenEnv` to the read token, and give the CRM developers `docs/CRM-FEED-SPEC.md`. The scheduled job runs daily at 03:00 UTC (the free Vercel plan allows once a day). "Run pickup now" on the Work orders page runs one at any time.

## Rules the server keeps
- The organisation always comes from the signed session, never from the request.
- Each endpoint checks the permission. A launch token works once.
- With no secrets set the server answers 503 instead of accepting anyone.
- The CRM token is never stored in the database or sent to the page.
