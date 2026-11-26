# 12 Progress

**Purpose.** After a gift is placed (a child enrolled for it, or an outcome made), it moves through the partner's implementation phases, then Review, Report, Complete and Feedback (DECISIONS 232). A batch of a partner's gifts closes, by a person, once every gift in it is complete.

**Inputs.** For each assigned gift: when it was placed, its workflow's phases (with days) and whether MWF reviews and the donor is asked for feedback. The steps taken so far.

**Outputs.** For each gift: every step in order, which is next, when a phase is due and how late, where the gift stands (with the partner, or the last stage taken), and whether it is complete. New step records, never changed in place. Batches: ready to close, closed.

**Decisions.** DECISIONS 232 (these rules), 203 (batches), 139 and 140 (the workflow's stages and flags).

**Rules in one place.** `progress.ts` (the steps, due and late, the requests `prg-next`, `prg-undo`, `prg-close-batch`, `prg-open-batch`, `prg-reset`), `context.ts` (builds what the rules need from assignments, placements and workflows, the same for the server and the demo; `standings` gives the pages where every gift stands).

**Built.** The rules and tests; storage (`progress` in the saved setup, returned with every answer); the Progress page (tiles that filter, the next step as a button, Undo); the stage on the Gifts list (Reviewed, Reported, Completed, Feedback, with the next step in its tooltip); the Batches card on Assignment (Complete column, Ready to close, Close batch, Open again).

**Not built, on purpose.** The partner taking the steps itself (a person takes them for now, as with Confirmation). Evidence such as photos and the phase's "needs" list. The donor report and feedback request themselves (the steps record that they happened). A late phase is advised only, by agreement, and nothing moves by itself.

**How to test.** `npx vitest run modules/12-progress app/progress-page.test.ts app/progress-flow.test.ts`. Tests use invented data and double as examples.
