# 11 Confirmation

**Purpose.** After a gift is assigned, the partner has a few days to confirm (yes) or reject (no, with a reason). A rejection sends the gift back to Assignment (DECISIONS 139, 202).

**Inputs.** An assignment (key, partner, time), the answers given so far, the days allowed (the workflow's setting, 3 if none), today.

**Outputs.** For each assignment: waiting, confirmed or rejected, the due day, and how many days late it is. New answer records, never changed in place.

**Decisions.** DECISIONS 139 (Confirm is a process between Assignment and Allocation), 202 (these rules).

**Built.** The rules and their tests only. Not built yet: storage and the server, the Confirmation page (a waiting list with late partners first), the workflow's days setting, and holding Placement until a gift is confirmed.

**How to test.** `npx vitest run modules/11-confirmation`. Tests use invented data and double as examples.
