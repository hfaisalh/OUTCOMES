# 20 Platform

**Purpose.** What belongs to the whole of OUTCOMES, above any one organisation (DECISIONS 332 and, as it is built, the platform admin, the organisation list and the avatar switcher). The first part is the feature switches.

**Why feature switches.** There is one deployed version of OUTCOMES for every organisation. Whatever is pushed reaches all of them, MWF included. A switch lets a new feature be built OFF for everyone, then switched on for the test organisation, then for the real one.

**Inputs.** The organisation's saved choices (`features` in its saved setup).

**Outputs.** For each registered feature, on or off. The menu, the partner screen and the scheduled run check it.

**Rules.**
- A feature with no saved choice takes its default. A feature already in use is registered with default ON, so nothing changes for anyone until a person turns it off. A new feature is registered with default OFF.
- Only a registered feature can be switched; an unknown one is off.
- Switching a feature changes no data. Off hides it; on shows what was there.

**How to add a feature.** Add it to `FEATURES` in `features.ts` with `default: false`, check `featureOn` where it shows or runs, switch it on for the test organisation on the Organisation page, and on for the real one when ready.

**How to test.** `npx vitest run modules/20-platform`; the server and the partner screen are tested in `modules/00-platform/partner-handler.test.ts`.
