# 13 Partner portal

**Purpose.** A partner organisation signs in on its own and sees only its own beneficiaries, gifts and outcomes (DECISIONS 249). It feeds the waiting list, accepts or refuses batches and, later, receives the work order details of its own gifts.

**Inputs.** Everything OUTCOMES holds (partners, projects, register, enrolments, assignments, confirmations, progress, placements) and one partner id, taken from the signed session, never from the request.

**Outputs.** The partner's slice: a short profile, the projects it delivers, the beneficiaries it gave, their enrolments, and its own assignments, answers, progress and placements. No donor details, no funding or due diligence, no other partner's records.

**Decisions.** DECISIONS 249 (the journey and this first step), 24 and 32 (sign-in from the CRM), 246 (the waiting list the partner feeds).

**Rules in one place.** `scope.ts` (`partnerSlice`, the permission names). The sign-in side is in `modules/00-platform` (`launch-token.ts` carries the `partner` claim, `http.ts` refuses a partner sign-in at staff endpoints, `partner-handler.ts` answers `GET /api/outcomes` for a partner session).

**Built.** The sign-in screen with email and password, test accounts managed on Settings (DECISIONS 250), and a read-only Partner home (`app/partner-home.ts`). The rule and tests; the partner claim and permission; the server guard; a test sign-in at `/api/demo-login?partner=<partner id>` on test servers.

**Not built.** A limit on wrong passwords, adding children (one by one, CSV), accept or refuse a batch, work order details for its own gifts, the partner profile with two views, validated locations, partner costs.

**How to test.** `npx vitest run modules/13-partner-portal modules/00-platform/partner-handler.test.ts`. Tests use invented data and double as examples.
