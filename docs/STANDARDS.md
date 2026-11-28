# How OUTCOMES lines up with common standards

An honest map: what is met, what is partly met, and what is open. Reviewed 28/11/26. "Met" means built and checked in this repository; it is not a certification, which only an assessor can give.

| Standard | What it asks | Where OUTCOMES stands |
|---|---|---|
| **WCAG 2.2 level AA** (accessibility) | Perceivable, operable, understandable, robust: contrast, names and labels, keyboard use, target size, headings and landmarks, no colour-only meaning. | **Met on every staff screen and window checked**, automatically (axe-core, `npm run a11y`): zero findings. Partner screens are checked by hand and in the same tool during development. Open: a manual screen-reader pass, and a formal accessibility statement. |
| **OWASP ASVS level 1** (application security) | Sound sessions, access control, input and output handling, error handling, configuration, logging. | **Largely met**: see `docs/SECURITY.md`. Open: a database-backed sign-in limit, a third-party test, row-level security. |
| **UK and EU GDPR** (privacy) | Lawful basis, data minimisation, security, rights of access and erasure, records of processing. | **Designed for**: minimal personal data, no donor contact details, sensitive child data role-limited, an export and an erase of one beneficiary's data, a change log. Open: the organisation's own policies, retention periods and data processing agreements. |
| **Charity Commission and fundraising rules** (UK) | Know where gifts go; report truthfully to donors. | The gift-to-outcome trail and the donor feedback are the product. OUTCOMES records and reports; it does not move money. |
| **Salesforce Nonprofit Cloud and NPSP** (CRM fit) | Gifts, commitments, designations, outcomes. | Aligned names live in the Salesforce preset; the core uses generic words so another CRM fits (DECISIONS 23 to 26). The feed contract is `docs/CRM-FEED-SPEC.md`. |
| **IATI and the 360Giving style of publishing** | Open data on what was funded and delivered. | **Not built.** The data model (outcome, place, partner, cost) holds what a publisher needs; an export is a candidate for later. |
| **Safeguarding (Keeping Children Safe, the CHS)** | Care with children's data and with those who deliver. | Beneficiary data is limited and role-restricted; partners carry a safeguarding lead on their profile; no contact details, photos or documents are held. Open: the organisation's policy and training. |
| **12-factor and cloud-native practice** | Config in the environment, stateless processes, logs, disposable. | Config is in environment variables; functions are stateless; state is in the database; every change is logged. |
| **Semantic versioning and a changelog** | Say what changed. | `docs/DECISIONS.md` is the dated, numbered changelog of why. The version and build are shown on screen. |
| **Testing pyramid** | Many fast rule tests, fewer screen tests, a few end-to-end checks. | Over 1,300 tests: the business rules, the screens as HTML, the handlers, plus the accessibility run. Open: a scripted end-to-end run against a real database. |

## What would make it easier to sell

- A **hosted demo** with invented data (it exists, behind a sign-in) and a short recorded tour.
- A **published accessibility statement** and a **security summary** for a procurement form (this document and `SECURITY.md` are the start).
- A **data processing agreement** template and a stated **retention policy**.
- The **IATI export** above, and a **CRM connector kit** for Salesforce Nonprofit Cloud and one other CRM.
