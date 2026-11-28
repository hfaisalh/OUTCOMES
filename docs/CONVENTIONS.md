# Conventions: where things live and what they are called

For the developers who take OUTCOMES over. Read with `CLAUDE.md` (the coding standards) and `docs/ROADMAP.md`.

## The shape of the repository

| Folder | What it holds |
|---|---|
| `modules/<nn>-<name>/` | The business rules, one folder for each part of the product, numbered in the order a gift travels. Pure TypeScript: no database, no screen, so each can be ported (to Apex or another stack). Each has a `README.md`. |
| `modules/00-platform/` | The server side: sign-in, the shared request and response shapes, the handlers, the stores (memory and Postgres). The only folder that knows about a database. |
| `app/` | The screens. `main.ts` draws and listens; the folders group the screens by what a person does there (below). Pure functions that return HTML strings, so they are tested without a browser. |
| `api/` | The serverless endpoints. Thin: they turn a request into the plain shapes of `modules/00-platform` and back. At most 12 on the free host. |
| `public/` | Files served as they are: the logo and icons (`brand/`) and the app manifest. |
| `sql/` | The database scripts, numbered, run in order, never edited once run. |
| `samples/` | Invented sample files. Never real donor data. |
| `real-data/` | Git-ignored. Real exports for testing on one machine only. |
| `docs/` | Decisions (numbered, dated), the data dictionary, specs. |
| `scripts/` | One-off command line tools. |

## Inside `app/`

| Folder | What it holds |
|---|---|
| (root) | `main.ts` (the shell and the events), `menu.ts` (the pages and who may open them), `signin-page.ts`, `demo-data.ts`, `theme.css`, `index.html`. |
| `shared/` | Pieces every screen uses: the server calls (`api.ts`), the `View` type and common pages (`pages.ts`), dates, icons, the on/off switch (`switch.ts`), pop-over lists, table tools, the place picker. |
| `gifts/` | The Gifts list, a gift's window, the actions on a gift. |
| `beneficiaries/` | The register of persons and households, its form, the Outcomes list. |
| `allocation/` | Assignment, Confirmation, Allocate, Progress. |
| `partners/` and `projects/` | The staff pages for partners, projects and clusters. |
| `portal/` | What a partner sees and does when it signs in: batches, beneficiaries, CSV upload, costs, profile. |
| `setup/` | Workflows, Benefits, Automation rules, the data mapping pages. |
| `dashboard/` | The Dashboard cards: where beneficiaries are, the map, partner costs. |

## Names

- **Files:** lower case words joined by hyphens, named for what they hold: `partner-costs.ts`, `rules-steps.ts`. A page is `<thing>-page.ts`, a pop-up window `<thing>-window.ts` or `<thing>-form.ts`, the code that reacts to its buttons `<thing>-session.ts`. A test sits beside what it tests and ends `.test.ts`.
- **Modules:** `modules/<nn>-<kebab-name>/`. The number is the order in the journey, not a priority. Numbers are not reused.
- **Words in the product:** use the generic terms in the core (Transaction, Line, Supporter, Fund, Outcome, Group, Commitment; see `DATA-DICTIONARY.md`). In screens say Allocate (never "place" except a location), beneficiaries (not children), clusters (not groups). Salesforce and MWF words live only in the Salesforce preset and in MWF's own wording.
- **Dates:** DD/MM/YY on screen, YYYY-MM-DD in data.
- **Never** use the em dash in anything written.

## Every file

1. Starts with a header comment: what it does, who calls it, what it depends on, and the data flow where there is one.
2. Has plain-English comments on each section and on every business rule (`// Rule: ...`), with the decision number when there is one.
3. Keeps its business rules in pure functions, apart from the screen and the database.
4. Is short. The target is under 200 lines. The files over it (`app/main.ts`, `modules/06-projects/projects.ts`, `app/gifts/gifts-page.ts`) are the next to split; split by what a person does, not by size alone.

## Tests

- Tests are examples: they use invented people and places only.
- A rule has a test that names its decision. A screen has a test of the HTML it returns (labels, escaping, the data attributes its handler reads).
- Before every push: `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- `npm run a11y` (see `scripts/a11y.mjs`) runs the automated accessibility check on every screen.

## The database

- The setup is one versioned document per organisation; the big lists (register, enrolments, assignments, allocations, confirmations, progress) are rows in their own tables (`docs/DATABASE-REVIEW.md`).
- Every change is logged (who, what, when). Every save checks the version it was read at, so two people never overwrite each other silently.
- A new table is a new numbered script in `sql/`. Scripts are never edited after they have run anywhere.
