# Decisions

Newest at the bottom. Each entry: what, why.

## 2026-11-18

1. **Fresh start.** The prototype (`mwf-impact-tracker`) was built on assumptions now dropped (QuickBooks input, product catalogue). OUTCOMES starts clean, module by module. Prototype code is reused only when reviewed and approved.

2. **Salesforce is the only data source.** QuickBooks is not an input. QuickBooks product tiers (main pot, sub pot, event pot, clearing pot, one product per child) were a workaround for features QuickBooks lacks. Salesforce is more structured.

3. **Transactions are instruction tokens.** We keep what is needed to deliver and report, not to account for money.

4. **No product catalogue.** Instead a small **Project Rules** table: Salesforce **Outcome Activity** to framework (e.g. "Orphan Sponsorship Where Most Needed" to Orphan Sponsorship, 12 months, quarterly report). Expected size: under 100 rows.

5. **Routing key is Outcome Activity, not Designation.** Designation is the fund (e.g. EVENTS, GENERAL AID). Orphan sponsorships taken at events sit under the EVENTS designation; only the outcome activity says "Orphan Sponsorship".

6. **Beneficiaries live in OUTCOMES.** The 2,015 QuickBooks "child products" (IDs like N-A-0365, N-H-0885) become beneficiary records here. Allocation of sponsors to children happens in OUTCOMES.

7. **No duplicate donor profiles.** Store the Salesforce donor ID and a display name. Everything else stays in Salesforce. Later: read and write back through the Salesforce API (connected app).

8. **Centres.** Centres are locations / clusters / agent regions. They send bulk batches.
   - Every gift through a centre keeps the centre as **soft credit** (`Affiliation__c`).
   - If the gift has no individual donor, it is booked to the centre (`Type__c = Community Centre`). Then **the feedback report goes to the centre**.
   - Each line stores: `creditTo` (centre) and `reportTo` (donor, else centre). Centre-only lines are flagged "no individual donor" so staff can add one later.

9. **Every field is configurable.** Per source: map column to standard field, or drop it. Add custom fields: MANUAL (staff fill) or CALCULATED (rule). Each field has type, required flag, transform, default, privacy level.

10. **Drag and drop UI** where users match or sort: field mapping, project rules, import exceptions, allocation, approvals, report templates. Auto-suggest first; users drag only the exceptions. Bulk actions and settings stay as plain forms.

11. **Structured for handover.** See coding standards in `CLAUDE.md`.

## Open questions

- Will MWF developers rebuild inside Salesforce, or run OUTCOMES alongside via API? (Decides data model and language.)
- Salesforce feedback module is not built yet, so there is no ready report export. For testing we use the "SF Upload" and "SF META" tabs of the UK upload sheet (see `DATA-SOURCES.md`).
- Who sends donor feedback emails: Salesforce, or OUTCOMES with a log written back to Salesforce?
- Category list: Sponsorships (Orphan, Hifz, School, College/Uni, Aalim, Homestay), Transactional (Water, Rebuild/House, Masjid, Collective marriages, Animal sacrifice?), Livelihood (Rozgar, Rickshaw), Microfinance (Loans), B2B. Confirm Animal Sacrifice placement.
- OSP Sponsorship System (earlier artifact): is it in daily use, should its rules win, migrate its data or start fresh?
