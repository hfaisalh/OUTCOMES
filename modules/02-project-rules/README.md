# Module 2: Project Rules (item to framework mapping)

## Purpose
Frameworks (Orphan Sponsorship, Hifz, Water and so on) live in OUTCOMES, not in the CRM (DECISIONS 31). The CRM says which items need feedback. This module lets staff sort those items into frameworks, and set each framework's feedback rules.

## Inputs
- The CRM items that need feedback (from the connector, Module 1c).
- The organisation's frameworks, and the current item to framework map.

## Outputs
- An updated map, `{ CRM item id: framework id }`. The work-order planner uses it. An item not in the map is unrouted, never lost.
- Per framework: unit (what one delivery is), feedback cycle, report type, and the words that suggest it.

## Rules
- **Suggest first, staff correct.** A framework is suggested when one of its keywords is a whole word of the item's name. A tie or no match suggests nothing. Suggestions are only applied when staff accept them.
- **Drag and drop.** Drag an item onto a framework or back to Unsorted. Tapping an item and then a framework does the same on touch screens.
- **Existing work does not move.** Sorting an item routes its unrouted work orders. Work orders that already have a framework keep it, and the page says how many.
- **Removing a framework** sends its items back to Unsorted.
- **No duration or instalment counts here.** They come from the CRM item (DECISIONS 18).
- Missing rules are a reminder ("to fill in"), never a block.

## Files
| File | What it does |
|---|---|
| `frameworks.ts` | All the rules above as pure functions (no database, no screen) |
| `frameworks.test.ts` | Tests and examples on invented names |

The screen is the Frameworks page in `app/` (`pages.ts`, `main.ts`). `app/main.test.ts` drives it without a browser.

## Not built yet
- Saving frameworks and the map on the server (needs the storage decision).
- Which role may sort items (the permission `outcomes.map_frameworks` exists in the menu rules).
- Stages and lifecycle per framework (Module 5).

## How to test
`npm test`. To try it: `npm run dev`, open `/app/`, choose Frameworks.
