/**
 * setup-steps.ts
 *
 * What it does: the steps of the setup guide (DECISIONS 328): from an empty organisation to gifts reaching beneficiaries, each with why it matters, what to do, how we know it is done, and the page where it is done. The words are the organisation's own (Allocate, beneficiaries, clusters).
 * Who calls it: app/home/setup-guide.ts and app/home/home-page.ts (the progress on the door). Depends on: the View type and the saved setup. Pure: it takes a View and returns the steps. Nothing is stored: a step is done when the work is really there, and is undone if it is removed.
 */

import { assignOf } from "../../modules/02-project-rules/workflows";
import type { View } from "../shared/pages";

export interface GuideStep {
  id: string;
  title: string;
  why: string; // why it matters, one short paragraph
  todo: string[]; // what the person does, in a few lines
  page: string; // the page where it is done
  open: string; // the label of the button that goes there
  done: boolean;
  found: string; // what is in the system now, in words
}

const n = (x: number, one: string, many: string): string => `${x} ${x === 1 ? one : many}`;

export function guideSteps(v: View): GuideStep[] {
  const fws = v.frameworks ?? [];
  const gps = v.giftProjects ?? [];
  const partners = v.projects ?? [];
  const matched = v.workOrders.filter((w) => (w.categoryId ?? "") !== "").length;
  const people = v.beneficiaries?.records.length ?? 0;
  const auto = fws.filter((f) => assignOf(f, undefined) === "auto").length;
  const typed = Object.keys(v.itemKinds ?? {}).length;
  const assigned = v.assignments?.records.length ?? 0;
  const allocated = (v.allocations?.records ?? []).filter((r) => r.to === undefined).length;
  return [
    { id: "gifts", title: "Bring gifts in", page: "data-feed", open: "Open the CRM connection", done: v.workOrders.length > 0, found: v.workOrders.length ? `${n(v.workOrders.length, "gift line is", "gift lines are")} in.` : "No gifts yet.",
      why: "Everything starts with a gift. OUTCOMES reads the gifts that need feedback from your CRM, or from the CRM's export files, and keeps its own copy to work on. It never changes the CRM.",
      todo: ["Connect the CRM, or open Upload files and add its exports.", "Check the Audit page: it shows what arrived and what was left out.", "Gifts that do not need feedback are left out on purpose."] },
    { id: "workflows", title: "Say what happens to each kind of gift", page: "workflows", open: "Open Workflows", done: fws.length > 0 && matched > 0, found: fws.length ? `${n(fws.length, "workflow", "workflows")}, ${n(matched, "gift", "gifts")} matched to one.` : "No workflow yet.",
      why: "A workflow is the road a gift travels after it is paid: how it is assigned, how long a partner has to answer, what the partner delivers, whether MWF reviews it, and how the donor hears back.",
      todo: ["Choose Add the standard workflows, then match each benefit to one.", "Open a workflow to see its flow chart and set its days and decisions.", "For a sponsorship, set how often its report repeats and for how long."] },
    { id: "benefits", title: "Describe each benefit", page: "benefits", open: "Open Benefits", done: typed > 0, found: typed ? `${n(typed, "benefit has", "benefits have")} a type chosen.` : "No type chosen yet.",
      why: "A benefit is the item a donor chose. Its type says who receives it, what a beneficiary's record holds, and who comes first, the beneficiary or the gift. You can also give a benefit its own days to fulfil.",
      todo: ["Check the type suggested for each item, and change it if it is wrong.", "Set the days to fulfil where a benefit differs from the usual 90.", "A benefit is Ready when it is connected end to end: a workflow, a type and a partner."] },
    { id: "partners", title: "Add your delivery partners", page: "partners", open: "Open Partners", done: partners.length > 0, found: partners.length ? `${n(partners.length, "partner", "partners")}.` : "No partner yet.",
      why: "A partner is whoever delivers: an institute, a charity, a contractor. A gift can only be assigned to a partner that is active, approved, and delivers that benefit with room to spare.",
      todo: ["Add each partner and the benefits it delivers.", "Set its capacity for each benefit and its batch size.", "Record its due diligence, so it can be approved."] },
    { id: "projects", title: "Set up your projects", page: "projects", open: "Open Projects", done: gps.some((g) => g.partnerIds.length > 0), found: gps.length ? `${n(gps.length, "project", "projects")}, ${n(gps.filter((g) => g.partnerIds.length > 0).length, "has a partner", "have partners")}.` : "No project yet.",
      why: "A project is what a donor chooses on the website, such as Aghosh. Say which partners deliver it, in order, and set up its clusters, the homes, classes or villages where beneficiaries are.",
      todo: ["Open a project and choose its benefits and its partners.", "Add its clusters, and say how many places each has.", "Switch on Enrol automatically if beneficiaries should fill places as they become ready."] },
    { id: "beneficiaries", title: "Add beneficiaries", page: "beneficiaries", open: "Open Beneficiaries", done: people > 0, found: people ? `${n(people, "beneficiary", "beneficiaries")} in the register.` : "No beneficiary yet.",
      why: "These are the people who receive. A beneficiary joins the waiting list when their record is complete, then fills a place as one opens. Partners can add their own, or you can.",
      todo: ["Add beneficiaries one by one, or let partners add them, even from a CSV file.", "Complete each record: date of birth, guardian and ID.", "Check the places on the map, so each is in the right area."] },
    { id: "rules", title: "Set the rules", page: "rules", open: "Open Rules", done: auto > 0 || Object.keys(v.autoRules ?? {}).length > 0, found: auto ? `${n(auto, "workflow assigns", "workflows assign")} gifts by itself.` : "Nothing is automatic yet.",
      why: "The Rules page lists every rule OUTCOMES follows, in the order a gift travels, with the settings beside it. This is where you decide how much it does by itself: assigning, reminders, moving unanswered gifts, and the daily run.",
      todo: ["Read the rules in order and change what does not suit you.", "Decide which workflows assign gifts automatically.", "Choose the reminders, and whether it runs by itself once a day."] },
    { id: "try", title: "Try the whole journey", page: "assignment", open: "Open Assignment", done: assigned > 0 && allocated > 0, found: assigned ? `${n(assigned, "gift is", "gifts are")} assigned, ${n(allocated, "is", "are")} allocated.` : "No gift assigned yet.",
      why: "Now a gift can travel. Assign it to a partner, the partner confirms, Allocate gives it a beneficiary or an outcome, and Progress follows the partner's work through review and the report.",
      todo: ["On Assignment, run it, or confirm the suggestions.", "On Confirmation, answer for a partner to try it.", "On Allocate and Progress, follow a gift to Complete."] },
  ];
}
