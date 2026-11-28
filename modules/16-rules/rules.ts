/**
 * rules.ts
 *
 * What it does: the plain-English list of the rules OUTCOMES follows when it works by itself (DECISIONS 283): how a gift is assigned to a partner, how a partner confirms, how a gift finds its beneficiary or outcome, how a person gets off the waiting list, and when a place is released. Each rule says where it comes from, and the numbers in it are the ones in use now, so the list cannot drift from what the system does.
 * Who calls it: the Automation rules page (app/rules-page.ts) and the tests. Depends on the default values the rules themselves use. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 * Data flow: the live settings come in (grace days, whether an ID is needed, the default batch size); the sections come out, in the order a gift travels. The page adds the controls for the settings that can be changed.
 *
 * Rules: this file only describes. The behaviour itself stays in modules 07, 08, 09 and 11, and each line here names its decision so a developer can find the code. When a rule changes there, its line here changes with it, and the test below that names each decision is the reminder.
 */

import { DEFAULT_STEPS, orderText, type Step } from "../09-allocation/order.js";
import { DEFAULT_BATCH_SIZE } from "../08-assignment/batches.js";
import { DEFAULT_CONFIRM_DAYS } from "../11-confirmation/confirmation.js";
import { DEFAULT_GRACE_DAYS } from "../05-outcomes/outcomes.js";

// --- Types ---
export interface Rule { text: string; decision: string } // decision: where the rule comes from, for example "DECISIONS 183"
export interface RuleSection { id: "assign" | "confirm" | "allocate" | "waiting" | "release"; title: string; intro: string; rules: Rule[] }
export interface LiveSettings { graceDays: number; requireRef: boolean; batchSize?: number; steps?: Step[] }

// --- The rules, in the order a gift travels ---
export function automationRules(s: LiveSettings): RuleSection[] {
  const batch = s.batchSize ?? DEFAULT_BATCH_SIZE;
  return [
    { id: "assign", title: "Assigning a gift to a partner", intro: "A released gift is handed to a partner. A workflow set to Automatic does it at once; one set to Suggest only shows the suggestion and a person confirms it.", rules: [
      { text: "Which gifts: those routed to a workflow, not excluded, not a custom amount (those are done by hand) and not assigned already. A recurring gift is one assignment however many payments it has, and all its payments go to the same partner.", decision: "DECISIONS 172" },
      { text: "A plan that is paused, cancelled or completed is parked: it is not assigned, and an assignment it had stops using the partner's room until the plan runs again.", decision: "DECISIONS 185" },
      { text: "Which partners: a gift for a project goes to that project's partners, in the project's order, and the project must offer the benefit. A gift with no project goes to any partner that delivers the item.", decision: "DECISIONS 154" },
      { text: "A partner is eligible when it is active, its due diligence is approved and in date, it delivers the item, and its capacity for the item is not 0.", decision: "DECISIONS 154" },
      { text: "Room for a sponsorship (beneficiary first): the units that make one whole beneficiary, for each beneficiary the partner gave that is enrolled for the benefit, less what is already assigned to it. A partner with none of its own has no room. A capacity typed on the partner is only a ceiling.", decision: "DECISIONS 183" },
      { text: "Room for any other type: the partner's typed capacity for the item. If a gift's units do not fit, the next partner is tried. A partner with no capacity set has no limit.", decision: "DECISIONS 183" },
      { text: "Order: gifts marked Priority first (when the workflow lets an urgent gift jump ahead), then the oldest payment first, so the order is the same every time. A person marks a gift Priority in the gift's window. It changes the order only: a gift with no partner room still waits.", decision: "DECISIONS 138, 284" },
      { text: "A gift already assigned can be moved to another eligible partner only when its workflow allows reassigning. A gift with no one to go to waits, with the reason, for a person.", decision: "DECISIONS 138" },
      { text: `A partner's gifts come in batches of ${batch} (a partner can have its own batch size).`, decision: "DECISIONS 203" },
    ] },
    { id: "confirm", title: "Confirmation by the partner", intro: "The partner accepts or refuses each batch it is given.", rules: [
      { text: `The partner has ${DEFAULT_CONFIRM_DAYS} days to accept or refuse a batch unless its workflow says otherwise (0 to 60).`, decision: "DECISIONS 139" },
      { text: "A refused batch goes back to Assignment with the partner's reason, so another partner can be chosen.", decision: "DECISIONS 254" },
      { text: "A partner that holds a parked outcome ready for the gift's benefit is confirmed for it automatically.", decision: "DECISIONS 231" },
    ] },
    { id: "allocate", title: "Allocating a gift to a beneficiary or an outcome", intro: "Once a gift has a confirmed partner it is allocated: it fills a place of a beneficiary, or it creates an outcome.", rules: [
      { text: "A gift for a type where the beneficiary comes first (sponsorship) fills an open place: an enrolled, approved beneficiary in a cluster of the gift's project, for that benefit. A person must be Ready.", decision: "DECISIONS 175" },
      { text: "Which project: a gift that carries a project fills that project's places only. A gift with no project goes to any project that offers the benefit and has the gift's partner among its partners.", decision: "DECISIONS 175" },
      { text: `Which place, in this order: the previous beneficiary of a plan that runs again; then ${orderText(s.steps ?? DEFAULT_STEPS)}; then the earliest enrolled. The steps in the middle can be put in another order or switched off on this page.`, decision: "DECISIONS 183, 186, 282, 293" },
      { text: "Gifts are looked after in this order: those marked Priority first, then the oldest payment first, so a Priority gift gets the place or outcome before the others.", decision: "DECISIONS 284" },
      { text: "A gift goes whole into one place. If none can take all of it, it is spread over the places that have room, the lowest fill first, if together they can take all of it.", decision: "DECISIONS 181" },
      { text: "A gift for a type where the gift comes first (a pump, a camp), or with no beneficiary (a mosque), creates an outcome. The partner's own parked outcome for the benefit is taken first, one marked Priority before an older one.", decision: "DECISIONS 209, 282" },
      { text: s.requireRef ? "A gift is allocated only to a beneficiary that has an ID. This is switched on." : "A gift may be allocated to a beneficiary without an ID. A setting can require an ID.", decision: "DECISIONS 75" },
      { text: "A gift with no one to fund waits, with the reason: no one is enrolled for the benefit, every beneficiary is already fully funded, or the item has no type yet.", decision: "DECISIONS 178" },
      { text: "Nothing is deleted. An allocation ends with a reason (plan paused, cancelled or completed, the beneficiary left, taken back) and is kept as history.", decision: "DECISIONS 186" },
    ] },
    { id: "waiting", title: "The waiting list and enrolment", intro: "How a person becomes ready, and who is next when a vacancy opens.", rules: [
      { text: "A person with a target project is marked Ready when the date of birth, the guardian and the ID number are all given, and Needs review (with what is missing) when not. A decision a person made is never changed by the system.", decision: "DECISIONS 246" },
      { text: "The waiting list of a project is the Ready persons who have that project as their target and have never been enrolled in it. Priority first, then first come first served by the date registered.", decision: "DECISIONS 246, 247" },
      { text: "A project with Enrol automatically on enrols the next in line whenever it has room, into the top cluster with the most vacancies, for the first benefit that takes a person. Room opens when an enrolment ends or a cluster is added or made bigger.", decision: "DECISIONS 246" },
    ] },
    { id: "release", title: "Releasing a place after a missed payment", intro: "What happens when a sponsor stops paying.", rules: [
      { text: `A payment may be unpaid for ${s.graceDays} days after it was due before the place may be released. A manager approves each release.`, decision: "DECISIONS 74" },
    ] },
  ];
}

export { DEFAULT_GRACE_DAYS };
