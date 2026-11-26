# 11 Confirmation

**Purpose.** After a gift is assigned, the partner has a few days to confirm (yes) or reject (no, with a reason). A rejection sends the gift back to Assignment (DECISIONS 139, 202).

**Inputs.** An assignment (key, partner, time), the answers given so far, the days allowed (the workflow's setting, 3 if none), today.

**Outputs.** For each assignment: waiting, confirmed or rejected, the due day, and how many days late it is. New answer records, never changed in place.

**Decisions.** DECISIONS 139 (Confirm is a process between Assignment and Allocation), 202 (these rules).

**Built.** The rules and their tests; storage (`confirmations` in the saved setup, returned with every answer); the server and demo requests `cnf-confirm`, `cnf-reject` and `cnf-reset` (one pure function, `applyConfirmationAction`); on-behalf confirmation for a partner holding a parked outcome ready for the benefit (`confirmOnBehalf`, DECISIONS 231); the Confirmation page (tiles that filter, late first, Confirm and Reject for a person); the workflow's days setting (already on the workflow, Confirmation stage). Clearing assignments clears the answers.

**Not built, on purpose.** Holding Placement until a gift is confirmed (Allocate still works on any assigned gift). Moving a late gift automatically: a late answer is advised only (the page says how many days late and points to Assignment), by agreement. Skipping the rejecting partner when the automatic rule runs again: a rejected gift stays assigned until a person chooses another partner.

**How to test.** `npx vitest run modules/11-confirmation`. Tests use invented data and double as examples.
