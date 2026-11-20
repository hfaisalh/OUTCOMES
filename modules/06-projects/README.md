# Module 6: Projects

## Purpose
Where gifts can go (DECISIONS 65). A project is somewhere that sponsors people or things, such as an orphan home. Each project defines its own structure, says who lives at each level and how they are sponsored, and holds the beneficiaries. The beneficiaries are the outcomes of Module 5, each tied to a place in the structure.

## Inputs
Framework templates (Module 2), outcomes and allocations (Module 5), commitments (Module 4b), and the person's requests.

## Outputs
- Projects with their levels and types of beneficiary, and the places (nodes) in them.
- Numbered beneficiaries added to a place.
- A roll-up for every place and project: beneficiaries, units, and how many are sponsored.

## Rules
- A project defines its own levels as one chain from the top down (for example Branch, Block, Class). Names and depth are the project's own, up to 8 levels. A level that is in use cannot be removed.
- A place sits at one level, under a place of the level above (or directly under the project for the first level). Its profile fields, such as a branch's Location, are free text for now.
- A type of beneficiary (child, teacher, warden) lives at one level and has one framework. Two types in one project sharing a framework give a warning, because a gift could land on either.
- Beneficiaries are added in numbers to a place of the level their type lives at, as numbered test records (profile fields come later). They take the type's framework.
- A gift's project name is matched to a project by its name or an alias. No match means a general gift.
- Nothing is removed while it is in use: a place with places or beneficiaries, a type with beneficiaries.

## Not built yet
- Directed and general allocation across projects, spread order, and the Allocation screen (next).
- Activities (one-offs with stages and reports), profile fields, vendor updates and the vendor portal.

## Files
| File | What it does |
|---|---|
| `projects.ts` | All the rules above as pure functions, and `applyProjectAction`, which the server and the demo both use |
| `projects.test.ts` | Tests and examples on invented data |

The screen is `app/projects-page.ts` (the Projects tab in Intake). The server actions are on `/api/outcomes` (Vercel's Hobby plan allows only 12 functions).

## How to test
`npm test`. To try it: Intake, Projects, create a project from the school template, add a type (Child, at Class, sponsored as shared parts), add places (Branch 1, then Block A, then Class 5A), then add 20 beneficiaries to Class 5A.
