# Module 7: Beneficiary register

## Purpose
The people and households that receive what a gift delivers (DECISIONS 163). One record per person or household, with one permanent ID and a duplicate check, so the same child is never entered twice, even when sponsored in several projects.

A beneficiary is a recipient only. What is delivered (a house, a pump, a tent, a food drive, a medical camp, a mosque, a child's sponsorship) is an **outcome**, placed in a cluster of a project. A beneficiary is enrolled in an outcome. A community outcome such as a mosque has no beneficiary.

## Inputs
What a person types in the Beneficiaries window: a name, and for a person a date of birth, gender, guardian and area, for a household an area, the persons in it or a size.

## Outputs
- The register: records with an ID (`PRS-0001`, `HH-0001`), kind, status and details, and a counter per prefix so a number is never used twice.
- A duplicate answer for any new or changed record: an exact match (refused), a possible match (refused until a person says it is different), or none.

## Rules
- Two kinds: person and household. Pumps, houses and the like are outcomes, not beneficiaries.
- The same name and date of birth is the same person. A household is the same name and area. Names are compared ignoring case, punctuation and extra spaces.
- The same name with another or missing date of birth is a possible match, saved only after a person ticks that it is a different one.
- A person who is in a household cannot be removed until taken out. A record that is enrolled cannot be removed (make it inactive). IDs are never reused.
- A person also holds what an admission needs (DECISIONS 164): place of birth, national ID or B-form number (the same number is the same person), which parent has died, the guardian and relation, and the admission decision with its reason. A record can name the partner that gave it and the partner's own ID.
- Contact details are not held (they stay in the CRM). Child data is sensitive, so health records, fingerprints, documents and the adverse conditions list wait for the partner portal and a restricted role.

## Enrolment (DECISIONS 167)
A beneficiary is enrolled in a cluster of a project for a benefit, in a role if the cluster lists one. The type of the benefit (set on the Benefits page: who receives, who comes first) decides who it takes and whether approval comes first. Capacity is the master cluster's total. A role holder does not use up a place. A beneficiary or cluster that is enrolled cannot be removed.

## Not built yet
- The open places that Allocation fills, the sample setup, Assignment, and Allocation rewired onto them (DECISIONS 165).
- The partner portal: partners share updates and prerequisites there, and it becomes the beneficiary's profile lifecycle (DECISIONS 164). Siblings and parents as linked persons.
- Role based access (for now anyone who can view work orders sees the register), importing a list, merging two records found to be the same.

## Files
| File | What it does |
|---|---|
| `beneficiaries.ts` | The rules as pure functions (add, change, remove, duplicate check, filter, age) and `applyBeneficiaryAction`, which the server and the demo both use |
| `beneficiaries.test.ts` | Tests and examples on invented people |
| `enrolments.ts` | Enrolment rules as pure functions (enrol, end, move, capacity, who a type allows) and `applyEnrolmentAction`, used by the server and the demo |
| `enrolments.test.ts` | Tests and examples: an orphan home with classes, a water project |

The screens are `app/register-page.ts` (the table and filters), `app/register-form.ts` (the window) and `app/cluster-people.ts` (the Beneficiaries tab of a cluster). Saved on the organisation's setup as `beneficiaries`.

## How to test
`npm test`. To try it: open Beneficiaries, New person (a name and date of birth), Save. Add the same name and date again and see it refused with the ID. Add the same name with another date and see the possible match tick box. New household, tick the person, Save.
