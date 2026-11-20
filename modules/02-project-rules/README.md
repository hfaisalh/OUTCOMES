# Module 2: Project Rules (item to category mapping)

## Purpose
Categories (Sponsorship, Transactional, Livelihood and so on) live in OUTCOMES, not in the CRM (DECISIONS 31). The CRM says which items need feedback. This module lets staff sort those items into categories, and set each category's framework.

## Two levels (DECISIONS 40)
Many **items** sit in one **category**. The category has properties, and one of them is its **framework**: the settings that decide the flow of every order in the category.

## Inputs
- The CRM items that need feedback (from the connector, Module 1c).
- The organisation's categories, and the current item to category map.

## Outputs
- An updated map, `{ CRM item id: category id }`. The work-order planner uses it. An item not in the map is unrouted, never lost.
- Per category: name, the words that suggest it, and its framework (unit, feedback cycle, report type).

## Rules
- **Suggest first, staff correct.** A category is suggested when one of its keywords is a whole word of the item's name. A tie or no match suggests nothing. Suggestions are only applied when staff accept them.
- **Sorted once, then automatic.** The map is saved per item, so every later gift of a sorted item goes to its category at each pick-up. Only a new item needs sorting.
- **Drag and drop.** Drag an item onto a category or back to Unsorted. Tapping an item and then a category does the same on touch screens.
- **Existing work does not move.** Sorting an item routes its unrouted work orders. Work orders that already have a category keep it, and the page says how many.
- **Removing a category** sends its items back to Unsorted.
- **No duration or instalment counts here.** They come from the CRM item (DECISIONS 18).
- **How an instalment counts** is a setting of the category (DECISIONS 58): one period of the item, or a share of one whole item. It is never guessed. It gives the Units column on the Commitments page.
- A missing framework setting is a reminder ("to fill in"), never a block.

## Files
| File | What it does |
|---|---|
| `categories.ts` | All the rules above as pure functions (no database, no screen) |
| `categories.test.ts` | Tests and examples on invented names |

The screen is the Categories page in `app/` (`pages.ts`, `main.ts`). `app/main.test.ts` drives it without a browser.

## Not built yet
- What else a category's framework decides: stages, beneficiaries, allocation, renewals (Module 5).
- An optional setting to accept suggestions automatically.

## How to test
`npm test`. To try it: `npm run dev`, open `/app/`, choose Categories.
