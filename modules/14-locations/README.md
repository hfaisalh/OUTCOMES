# 14 Locations

**Purpose.** Validated places. A person picks a village, town or district from a free place search instead of typing it, so the spelling is the same every time. Later: reports by location and a map of impact.

**Inputs.** Letters typed in an Area field. Only the place name is sent to the search service (Photon, built on OpenStreetMap, free). Nothing about a person is sent.

**Outputs.** A `Place` (id like `osm:N281396083`, name, district, region, country, position to 4 decimals). The organisation keeps the places in use in `config.locations`; a beneficiary keeps `locationId` beside its `area` text.

**Rules (pure, in `locations.ts`).**
- Only village level or wider is suggested, never streets or houses. No household address is held.
- A text under 3 letters is not searched. Answers are kept a day (`search.ts`) so the free service is not hammered; a failure gives an empty list and the person can keep what they typed (an unchecked area).
- A place sent from a screen is cleaned and checked (`acceptPlace`) before it is kept.

**Areas page (DECISIONS 275).** `areas.ts` lists typed areas still to check, gives one chosen place to everyone who typed it (`ben-area`), counts by place and country, and lays the places out for a plain map. Shown as a Dashboard card with a "Fix anomalies" window (DECISIONS 276): `app/dashboard/areas-page.ts`, `app/dashboard/areas-session.ts`.

**Files.** `locations.ts` (rules), `search.ts` (the search, with an injected fetch), `modules/00-platform/places-handler.ts` (`GET /api/outcomes?places=`, any signed-in person), `app/shared/place-picker.ts` (the Area field).

**Decisions.** DECISIONS 274.

**How to test.** `npx vitest run modules/14-locations modules/00-platform/partner-handler.test.ts app/shared/place-picker.test.ts`. The tests use a fake fetch and never reach the internet.
