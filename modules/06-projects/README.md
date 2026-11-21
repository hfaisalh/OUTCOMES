# Module 6: Partners (the code calls them Projects)

## Purpose
On screen this is **Partners** (DECISIONS 68): whoever implements the job of a gift, an institute, a contractor or another charity. The code and folder still say Project.

Where gifts can go (DECISIONS 65). A project is somewhere that sponsors people or things, such as an orphan home. Each project defines its own structure, says who lives at each level and how they are sponsored, and holds the beneficiaries. The beneficiaries are the outcomes of Module 5, each tied to a place in the structure.

## Inputs
Framework templates (Module 2), outcomes and allocations (Module 5), commitments (Module 4b), and the person's requests.

## Outputs
- Projects with their levels and types of beneficiary, and the places (nodes) in them.
- Numbered beneficiaries added to a place.
- A roll-up for every place and project: beneficiaries, units, and how many are sponsored.

## Rules
- A partner defines its own levels (up to 8). The first is the place (a branch or site, and there may be many). The others sit under a level as ways of grouping people inside it (Class, House, School) and are not a chain (DECISIONS 71). A level can be moved while it has no places, and cannot be removed while it is in use.
- A place or group sits at one level, inside a place of the level above (or at the top for the first level). Its profile fields, such as a branch's Location, are free text for now.
- A type of beneficiary (child, teacher, warden) belongs to one level, is grouped by some levels under it, and has one framework. Two types in one partner sharing a framework give a warning, because a gift could land on either.
- Beneficiaries are added with only a name, a number and how they are sponsored (the name is the kind). The place and groups are optional and can come later (DECISIONS 72). When a place is given they are added to a place of the level their type belongs to, in the groups they are in (at most one of each kind, inside that place), as numbered test records (profile fields come later). They take the type's framework.
- A gift's project name is matched to a project by its name or an alias. No match means a general gift.
- A partner's profile is one record with the groups of decision 69. Only the name and the type are required. Types and extra fields are the organisation's own lists. A partner can be active only while its due diligence is approved and in date, and only active partners that deliver a gift's item are offered the gift.
- Nothing is removed while it is in use: a place with places or beneficiaries, a type with beneficiaries.

- A gift's project (the CRM's Project on the line) decides where it can go: a match makes it directed, anything else is general. Projects (what a donor chooses) are separate from partners: a project carries CRM names and the partners that deliver it, and a gift goes to the partners of its project (DECISIONS 76). A name the CRM uses is in one project only. A suggestion is offered for a name that shares a whole word with a project (DECISIONS 67).
- General gifts are spread across places, and a directed gift whose project is full waits for a person (DECISIONS 66).
- The summary per project (beneficiaries, units, sponsored, free, in buffer, waiting, surplus or deficit), suggestions, and placing a gift by hand into a place are pure functions here too.

## Not built yet
- Activities (one-offs with stages and reports), profile fields, vendor updates and the vendor portal.

## Files
| File | What it does |
|---|---|
| `projects.ts` | All the rules above as pure functions, and `applyProjectAction`, which the server and the demo both use |
| `projects.test.ts` | Tests and examples on invented data |

The screens are `app/projects-page.ts` and `app/project-form.ts` (Projects), `app/partners-page.ts`, `app/partner-window.ts` and `app/partner-form.ts` (Partners: profile and structure), `app/beneficiaries-page.ts` (Beneficiaries) and `app/allocation-page.ts` (Allocation, Place gifts). The server actions are on `/api/outcomes` (Vercel's Hobby plan allows only 12 functions).

## How to test
`npm test`. To try it: Partners, New partner (name and type), Save. Then on its Structure tab add the levels (Branch, then Class and House under it), a type (Child, belongs to Branch, grouped by Class and House, sponsored as shared parts) and a place (Branch 1) with its groups (Class 5A, Rose House). Then on its Beneficiaries tab add 20 to Branch 1 in Class 5A and Rose House.
