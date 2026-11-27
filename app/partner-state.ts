/**
 * partner-state.ts
 *
 * What it does: the one small state of the partner's screen (DECISIONS 254, 260, 271): which batches and gift details are open, the refusal and beneficiary forms, the CSV window, and the last message or error.
 * Who calls it: app/partner-session.ts and app/partner-csv-session.ts (which change it), and app/main.ts (which draws from it). Depends on: the state type in app/partner-outcomes.ts. It is its own file so the two session files can share it without importing each other.
 */

import type { PartnerUi } from "./partner-outcomes";

export const partnerUi: PartnerUi = { open: [], details: [], lastOpened: "", refusing: null, form: null, csv: null, message: "", error: "" };
