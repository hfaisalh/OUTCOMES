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

## 2026-11-18 (answers from Faisal)

12. **Hosting and Salesforce link.** Developers will build OUTCOMES in the front-end CRM. Its endpoints will feed into Salesforce. So the code needs **API nodes** (a small, separate layer that talks to Salesforce) while business rules stay pure. Salesforce data will sync with OUTCOMES later; for now we work from file uploads.

13. **OUTCOMES sends the donor feedback reports**, not Salesforce. A log can be written back to Salesforce later through the API nodes.

14. **Animal Sacrifice is a Transactional project** (with Water, Rebuild/House, Masjid, Collective marriages).

15. **The OSP Sponsorship System (earlier artifact) is discarded.** Its rules and data are not carried over. OUTCOMES starts fresh.

16. **Transaction classification fields (8).** Every transaction record has these fields, always present: **Channel, Platform, Merchant, Type, Method, Mode, Frequency, Settlement.**
   - Fill each from the source file where a column fits. If nothing fits, **leave it blank**. Never block an import because one is empty.
   - Each field points to a **master list** (configurable). Master lists share common fields: code, name, description, category, status, legal entity, country, effective dates, default, display order, parent, integration reference, audit history.
   - Raw file values are mapped to master values once (drag and drop), then reused.
   - Dependency rules (e.g. Cash cannot have Merchant Stripe) are **warnings only**. OUTCOMES does not reconcile money.
   - Principle: configuration says what is possible; the transaction records what happened.
   - Frequency matters most to OUTCOMES (drives sponsorship lifecycle).
   - Source model: "Transaction Configuration Management" note (Channel, Platform, Merchant, Type, Method, Mode, Frequency, Settlement; Platform is the hub for devices, merchants and settlement).

17. **Order reference must be unique per gift.** A repeated reference is a mistake in the source file, not a normal case, so the import flags it as `duplicate_reference` (never blocks). Found on the real UK file (18 Nov 2026): 50 references of the form EVO-999-999 used twice, rows 248 to 360, all Sadqah General Aid. The source sheet owner corrects them. Also found: 82 individual donors with no Salesforce donor ID (flagged as `missing_donor`).

18. **Instalments come from the source, not from OUTCOMES.** The number of instalments is normally set in the product configuration of the platform that took the donation, and OUTCOMES must not duplicate product configuration. So the Salesforce export needs to carry the count (to be requested). Until it does, a commitment with no count shows **Indefinitely**; one-off gifts stay blank; a real count in a source overrides it. Consequence for Module 2: Project Rules should not hold duration or instalment counts (this narrows the example in decision 4). Revisit when Module 2 starts.

19. **Only the Upload file is loaded each time. The code book is configuration.** The SF META tab changes rarely, so it is loaded once and saved with the setup (in this browser for now). The page calls the daily file the "Upload file". Auto-matching is as wide as is safe (exact Salesforce names, then names and aliases from other MWF sheets, marked "by name"), and a downloadable template shows the exact format that matches everything. Where the setup and code book are stored long term is for the developers (the setup text format stays the same).

20. **Automatic feed by batch.** Admin agents add gifts to the Google Sheet in batches. Each gift carries a batch number (`GiftBatch.Name`, for example GB-000000071). A scheduled job (cron) picks up finished batches that have not been imported yet, runs the saved setup and code book, and sends problems to an exceptions list instead of stopping. Nobody uploads files by hand. Rules: a gift with no batch number is held back; a batch is imported once; a batch edited after import is flagged "changed", not imported again silently. The scheduled job and the Google Sheets connection (read-only) are API nodes for the developers (decision 12). OUTCOMES holds the pure batch planner. Manual Upload file stays for testing and one-off files.

21. **Batch audit.** Items can be added to, changed in or removed from a batch after it is finished and imported. A quick audit compares each imported batch with the sheet as it is now, gift by gift (each gift has its own fingerprint, so one changed gift is found without re-reading the whole batch). It reports: **added** (a new reference under an imported batch number), **changed** (same reference, different content), **removed** (imported but no longer in the sheet) and **moved** (now under another batch). Nothing is lost silently. The audit is a pure function in OUTCOMES; running it on a schedule is part of the developers' job (decision 20).

## Open questions

- Salesforce feedback module is not built yet, so there is no ready report export. For testing we use the "SF Upload" and "SF META" tabs of the UK upload sheet (see `DATA-SOURCES.md`).
- Who marks a batch Ready (a column on the sheet is simplest), and when is it safe to pick up a batch while several agents add to the same sheet?
- Is one batch number one upload event, and what should happen to the gifts that currently have no batch number (125 of 525 in the UK file)?
- How often should the job run, and how often the full audit (for example every pick-up for new additions, and a full audit daily)?
- What happens to audit findings: late additions imported automatically and listed for review, but changed or removed gifts always held for a person to approve (suggested, because reports or allocations may already depend on them)?
