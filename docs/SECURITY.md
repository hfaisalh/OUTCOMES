# Security

How OUTCOMES protects its data and its users, what is done, and what is still open. Reviewed 28/11/26 (DECISIONS 291, 295).

## Principles

1. **Least data.** Donor contact details stay in the CRM. OUTCOMES holds the CRM donor ID and a display name. Beneficiary records hold a name, date of birth, guardian's name and village or district, never an address, health record or document.
2. **Least privilege.** A person gets only what their role allows. A partner reaches one endpoint and sees one slice of the data: its own.
3. **Everything is logged.** Each save is written to the change log with who, what and when. Records are not deleted from history.
4. **Fail closed.** No secret set means the server answers 503. No session means 401. No permission means 403.

## What is in place

| Area | Control | Where |
|---|---|---|
| Sessions | Signed (HMAC), expiring, in an `HttpOnly; Secure; SameSite=Lax` cookie. A launch token from the CRM works once. | `modules/00-platform/launch-token.ts` |
| Sign-in | Test accounts use salted scrypt hashes (never stored or returned in clear); a wrong email and a wrong password give the same answer; the owner passphrase is compared in constant time. | `logins.ts`, `handlers.ts` |
| Brute force | 8 wrong tries from one address, or 30 for one email, stop sign-in for 15 minutes. Best effort (memory of the running function). | `guard.ts` |
| Cross-site | A change request carrying an Origin from another host is refused (403), on top of SameSite. | `guard.ts`, `api/_server.ts` |
| Partner isolation | A partner session is refused at every staff endpoint; the partner slice is built by one pure function and tested not to carry another partner's records, rates or costs. | `13-partner-portal/scope.ts`, `http.ts` |
| Browser | Content Security Policy (own scripts only, no inline scripts, own images plus OpenStreetMap tiles, own server for requests, no framing), HSTS, no sniffing, strict referrer policy, camera, microphone, location and payment off. | `vercel.json` |
| Output | Every value put into a page goes through one escaping function; tests feed hostile text through the screens. | `esc` in `app/shared/pages.ts` |
| Input | Every request body is read field by field and checked (lengths, dates, amounts, ids); an unknown action is refused; uploads are capped (500 rows). | the pure rule behind each action |
| Third parties | Only a typed place name leaves for the place search, through our server, cached and limited to 40 a minute per person. The map tiles come from OpenStreetMap. Nothing about a person is sent. | `14-locations`, `places-handler.ts` |
| Dependencies | `npm audit` reports no known vulnerabilities. Few runtime dependencies (a database driver and the map library). | `package.json` |
| Concurrency | Every save checks the version it was read at; a clash is retried on the fresh copy, then refused. | `store.ts`, `http.ts` |

## Open items, in order

1. **Database-backed sign-in limit.** The limit is per running function. A second function instance starts at zero. Move the count to the database for a hard guarantee.
2. **Sign-in comes from the CRM.** The test accounts and the owner passphrase are for testing. Before real use, switch them off (`OWNER_PASSPHRASE` unset, `DEMO_LOGIN` unset) and sign in only from the CRM.
3. **Row-level security in the database.** Today the server enforces which organisation and which partner. Postgres row-level security would add a second wall.
4. **Backups and retention.** Agree the backup schedule, how long the change log is kept, and the process for erasing a beneficiary (the erase action exists, DECISIONS 240; the policy around it is the organisation's).
5. **Framing by the CRM.** If OUTCOMES is shown inside the CRM in a frame, change `frame-ancestors` in `vercel.json` to name the CRM.
6. **Penetration test** by a third party before the first live organisation.
7. **Secrets rotation** schedule for `LAUNCH_SECRET`, `SESSION_SECRET` and the CRM tokens.

## Reporting a problem

Tell the developers at once and do not share the details further. Do not put real donor or beneficiary data in an issue, a message or a test.
