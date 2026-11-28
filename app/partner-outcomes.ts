/**
 * partner-outcomes.ts
 *
 * What it does: the journey strip of the partner's screen ("How outcomes work", DECISIONS 251) and the small pieces the batch list shares with it: the screen state type, the status colours and the escaping.
 * Who calls it: app/partner-home.ts (the strip) and app/partner-batches.ts (the shared pieces). Depends on: modules/13-partner-portal/outcomes.ts (the rule). Pure: it takes the rows and returns HTML.
 * Data flow: rows come from the partner's own slice, so no donor details can appear.
 */

import type { CostForm } from "./partner-costs";
import type { CsvState } from "./partner-csv";
import type { EntryForm } from "./partner-entry-form";
import { pipeline, STANDING_LABEL, type PartnerOutcome, type Standing } from "../modules/13-partner-portal/outcomes";

// --- Shared types and helpers ---
// The small state of the screen: the batches and the gift details that are open, the beneficiary form that is open, the gifts a refusal form is open for, and the last message or error.
export interface PartnerUi { open: string[]; details: string[]; lastOpened: string; refusing: string[] | null; form: EntryForm | null; csv: CsvState | null; cost?: CostForm | null; message: string; error: string }
export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// The colour of each point: amber when it waits on the partner, blue while in hand, green when done, red when refused. The word is always shown too, so colour is never the only signal.
export const PILL: Record<Standing, string> = { "to-answer": "unrouted", confirmed: "blue", allocated: "blue", complete: "ready", refused: "review" };

// What happens at each point, in the partner's own words. Refused is shown apart, since it leaves the journey.
const STEPS: { id: Standing; says: string }[] = [
  { id: "to-answer", says: "A gift is assigned to you. Accept or refuse it within the days set." },
  { id: "confirmed", says: "You accepted. It is allocated to a beneficiary who needs funding, or made into an outcome." },
  { id: "allocated", says: "It funds a beneficiary or an outcome. You deliver in phases and send what is asked." },
  { id: "complete", says: "Delivered, reviewed and reported. The donor is told." },
];

// --- The journey strip ---
export function journeyHtml(rows: PartnerOutcome[]): string {
  const n = pipeline(rows);
  return `<section class="card pj" aria-label="How outcomes work"><h2>How outcomes work</h2>
    <ol class="pj-steps">${STEPS.map((s) => `<li class="pj-step${n[s.id] > 0 ? " has" : ""}"><b class="pj-n">${n[s.id]}</b><span class="pj-t">${esc(STANDING_LABEL[s.id])}</span><span class="muted pj-s">${esc(s.says)}</span></li>`).join("")}</ol>
    ${n.refused > 0 ? `<p class="muted pj-refused">${plural(n.refused, "refused gift", "refused gifts")} went back to MWF to be given to someone else.</p>` : ""}</section>`;
}
