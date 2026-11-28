<p align="center"><img src="public/brand/logo.svg" alt="OUTCOMES" width="260"></p>

# OUTCOMES

**From a gift to a delivered outcome, reported back to the donor.**

OUTCOMES is a fulfilment and donor-feedback system for charities. Gifts that carry a promise (sponsor an orphan, build a well, teach a child to memorise) arrive from the CRM as instructions. OUTCOMES hands each to a delivery partner, tracks that the work is confirmed and done, matches the gift to a beneficiary or an outcome, and produces the feedback the donor was promised. It does not manage money: finance stays in the CRM and the accounts.

It was built for Minhaj Welfare Foundation (MWF) and is **white-label**: every record and setting belongs to an organisation, names specific to a CRM live in a preset, roles are configuration, and sign-in comes from the CRM where there is one. It runs standalone (fed by uploaded files) or as a module inside a CRM.

## What it does

| Step | What happens | Who |
|---|---|---|
| Gifts in | Donation lines, plans and payments are read from the CRM or uploaded files; the ones that need feedback become work orders. | Staff |
| Assign | Each gift goes to a partner that delivers the benefit, is in good standing and has room. Automatic or suggested, per workflow. | Staff, rules |
| Confirm | The partner accepts or refuses each batch, with reasons. | Partner |
| Allocate | The gift funds a beneficiary's place or creates an outcome, by an order the organisation sets (drag to reorder). | Staff, rules |
| Deliver | Phases, review, report and completion; the donor is told. | Partner, staff |
| Know | Where beneficiaries are from and where each benefit is served, on a map; partner costs and agreed rates; every change logged. | Staff |

Partners have their own sign-in and see only their own beneficiaries, gifts and outcomes: they add beneficiaries one by one or from a CSV, record costs, and keep their own profile.

## Why it can be trusted with this work

- **Privacy by design.** Donor contact details never enter OUTCOMES. Beneficiary data is sensitive and role-limited. A partner sees only its own data and never another partner's. Households are never held by address, only by village or district.
- **Secure by default.** Signed, expiring sessions in HttpOnly cookies; a strict Content Security Policy and the other security headers; limits on wrong sign-in tries; cross-site requests refused; every change logged with who and when. See `docs/SECURITY.md`.
- **Accessible.** Checked automatically against WCAG 2.2 level AA on every screen (`npm run a11y`). Works from a keyboard, on a phone, and with reduced motion.
- **Auditable.** Every save is versioned and written to a change log; nothing is deleted from the history of an allocation.
- **Portable.** The business rules are pure TypeScript with tests that double as examples, so they can be ported to Apex or another stack.

## For developers

- Read `CLAUDE.md` (the brief and the standards), then `docs/CONVENTIONS.md` (where things live and what they are called), `docs/DECISIONS.md` (every decision, dated, with the reason) and `docs/ROADMAP.md`.
- `npm run dev` runs the app locally (the demo with invented data opens at `/app/?demo=1`).
- Before every push: `npx tsc --noEmit`, `npx vitest run`, `npm run build`. Before a release: `npm run a11y`.
- Server setup and environment variables: `docs/SERVER-SETUP.md`. The CRM side: `docs/CRM-FEED-SPEC.md` and `docs/LAUNCH-SPEC.md`.
- More about the product, for people deciding whether to use it: `docs/PRODUCT.md`. How it lines up with common standards: `docs/STANDARDS.md`.

## Publishing the demo

`vercel deploy --prod` builds the site (`npm run build`) and publishes it, using `vercel.json`. Only invented sample data may be on it (DECISIONS 37).
