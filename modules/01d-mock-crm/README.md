# Module 1d: pretend CRM

A stand-in for a CRM, so OUTCOMES can be tested with live input before MWF's CRM has the feed (DECISIONS 39). All data is invented.

## Purpose

Behave like a CRM that follows `docs/CRM-FEED-SPEC.md`. Gifts arrive over time, and some change afterwards.

## Inputs

Only the current time. The feed at a moment is worked out from the clock (gift number n arrives at epoch plus n times 5 minutes), so nothing is stored and the same moment always gives the same feed.

## Outputs

`mockFeed(nowMs)`: feed rows as text, the same columns as the real feed. The newest 1500 gifts only.

## What it does to gifts

| Event | Which gifts | What you should see in OUTCOMES |
|---|---|---|
| Pending, then paid after 6 minutes | one in seven | No work order while pending, one after it is paid |
| Failed | one in ten | Never a work order |
| Deleted after 9 minutes | one in 23 | Held on the review list |
| Amount raised after 12 minutes | one in 19 | Held on the review list |
| Replaced after 15 minutes | one in 29 | Held on the review list |
| Basket of two lines | one in six | Two work orders, one transaction |

The catalogue has 12 items. Ten need feedback, two do not (General Donation, Zakat Fund). **Flood Relief Appeal** matches no framework on purpose, so it stays unsorted until someone sorts it.

## How to use it

1. Open `<the site>/api/demo-login` while signed in to Vercel. It opens OUTCOMES as an administrator of the `demo` organisation, connected to this pretend CRM.
2. Open **Settings** and press **Run pickup now** (the page also does this by itself every minute on the work orders and dashboard pages).
3. Sort items on **Frameworks**. Wait a few minutes and watch new work orders and review items arrive.

The test sign-in only exists when the server has `DEMO_LOGIN=1`, and only ever opens the `demo` organisation.

## How to test

`npx vitest run modules/01d-mock-crm`. The tests double as examples of the feed.
