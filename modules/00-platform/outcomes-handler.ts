/**
 * outcomes-handler.ts
 *
 * What it does: the /api/outcomes endpoint (DECISIONS 233), split out of handlers.ts because it is the largest: it reads and changes outcomes, projects, partners, the Beneficiary register, enrolments, assignment, confirmation, progress and allocation, and answers every request with the whole picture (one `reply`).
 * Who calls it: api/outcomes.ts, through handlers.ts, and the tests. Depends on: http.ts (the shared pieces), store.ts, and the pure rules of each module it hands requests to.
 * Rules: the organisation always comes from the signed session; a read needs to view work orders, a change needs to map frameworks; the rules themselves are the pure functions the demo uses too.
 */

import { prioritySet, setManyPriority } from "../08-assignment/priority-gifts.js";
import { normaliseSteps, orderText } from "../09-allocation/order.js";
import { PERMISSIONS as P } from "../../app/menu.js";
import { applyOutcomeTypeAction, starterOutcomeTypes } from "../05-outcomes/outcome-types.js";
import { ensureRefs, withPrefixes } from "../05-outcomes/refs.js";
import { linkStarterTypes } from "../02-project-rules/workflows.js";
import { ICON_IDS } from "../../app/shared/icons.js";
import { allocatable } from "../04b-commitments/commitments.js";
import { adoptLegacy, allocOptions, migrateGiftProjects, applyProjectAction, clearLegacy, allocateInNode, allocateInPartner } from "../06-projects/projects.js";
import { addOutcomes, autoAllocate, DEFAULT_GRACE_DAYS, releaseApprovals, perPeriodRule, moveAllocation, releaseAllocation, removeOutcome, removeUnused, setActive } from "../05-outcomes/outcomes.js";
import { defaultConfig, setupOf, type OrgConfig } from "./store.js";
import { setItemKind, setItemUnits } from "../02-project-rules/benefits.js";
import { setItemTimeline } from "../02-project-rules/timeline.js";
import { applyKindAction, type SavedFeatures } from "../02-project-rules/kind-features.js";
import { applyBeneficiaryAction, emptyRegister } from "../07-beneficiaries/beneficiaries.js";
import { applyAllocationAction, emptyAllocations, allocateContext } from "../09-allocation/allocation.js";
import { applyAssignmentAction, assignables, contextFrom, demandByItem, emptyAssignments, runAssignment } from "../08-assignment/assignment.js";
import { applyConfirmationAction, confirmOnBehalf, emptyConfirmations, refusedBy } from "../11-confirmation/confirmation.js";
import { applyProgressAction, emptyProgress } from "../12-progress/progress.js";
import { applyErasure } from "../07-beneficiaries/erasure.js";
import { changesBetween } from "./change-log.js";
import { progressContext } from "../12-progress/context.js";
import { batchSizeOf } from "../08-assignment/batches.js";
import { hasSample, loadSampleSetup, realProjectsFor, wholeByItem, type SampleState, removeSampleSetup, sampleSummaryText, removedSummaryText } from "../07-beneficiaries/sample-setup.js";
import { poolMessage, settlePool } from "../07-beneficiaries/waiting.js";
import { applyEnrolmentAction, emptyEnrolments, heldByBeneficiary, heldInCluster, itemRulesOf } from "../07-beneficiaries/enrolments.js";
import { handlePartner } from "./partner-handler.js";
import { autoRulesOf, setAutoRule } from "../18-automation/rules.js";
import { addMessages } from "../18-automation/messages.js";
import { newBatchMessages, sentBackFor } from "../18-automation/input.js";
import { sweepRecords } from "../18-automation/run.js";
import { standings, stepsFor } from "../12-progress/context.js";
import { buildScenario, SCENARIO_AUTO, SCENARIO_TIMELINES, scenarioWorkflows } from "../07-beneficiaries/sample-scenario.js";
import { handlePlaces } from "./places-handler.js";
import { acceptPlace, upsertPlace } from "../14-locations/locations.js";
import { resolveArea } from "../14-locations/areas.js";
import { json, need, sessionOf, text, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

// GET /api/outcomes   The outcomes and what is allocated to them.
// POST /api/outcomes  { action, ... }  add (name, count, type, cohort, frameworkId), active (id, active), remove (id), auto, move (commitmentKey, outcomeId), release (commitmentKey).
// Needs permission to map items to change anything. Rule (DECISIONS 61): the server works out the commitments itself from the saved work orders, so a request cannot invent one.
export const MAX_OUTCOMES = 5000;
export async function handleOutcomes(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const write = req.method === "POST";
  if (req.method !== "GET" && !write) return text(404, "Not found.");
  // Rule (DECISIONS 274): place suggestions for the Area pickers, for staff and partners alike.
  if (!write && req.query["places"] !== undefined) return handlePlaces(req, d);
  // Rule (DECISIONS 249): a partner's sign-in gets its own slice from this same address (the host allows only 12 functions), and can do nothing else here.
  if (sessionOf(req, d)?.partner !== undefined) return handlePartner(req, d);
  const a = need(req, d, write ? P.mapFrameworks : P.viewWorkOrders);
  if ("response" in a) return a.response;
  const org = a.claims.org;
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  let outcomes = config.outcomes ?? [];
  let outcomeAllocations = config.outcomeAllocations ?? [];
  // A setup from before projects existed has CRM names on its partners. They become projects, once (DECISIONS 76).
  const migrated = migrateGiftProjects(config.projects ?? [], config.giftProjects ?? []);
  let projects = migrated.partners;
  let giftProjects = migrated.giftProjects;
  let nodes = config.nodes ?? [];
  let graceDays = config.graceDays ?? DEFAULT_GRACE_DAYS;
  let releaseLog = config.releaseLog ?? [];
  let requireRef = config.requireRef === true;
  let partnerTypes = config.partnerTypes ?? [];
  let partnerFields = config.partnerFields ?? [];
  let outcomeTypes = withPrefixes(config.outcomeTypes ?? starterOutcomeTypes());
  let idCounters = config.idCounters ?? {};
  let beneficiaries = config.beneficiaries ?? emptyRegister(); // the Beneficiary register (DECISIONS 163)
  let enrolments = config.enrolments ?? emptyEnrolments(); // who is enrolled where (DECISIONS 167)
  let allocations = config.allocations ?? emptyAllocations(); // which place each assigned gift fills (DECISIONS 175)
  let assignments = config.assignments ?? emptyAssignments(); // which partner each gift was assigned to (DECISIONS 170)
  let confirmations = config.confirmations ?? emptyConfirmations(); // the partners' answers to those assignments (DECISIONS 231)
  let progress = config.progress ?? emptyProgress(); // the steps taken after allocation, and the batches closed (DECISIONS 232)
  // Rule: every answer carries the whole picture (all the records the page draws from), so a page never has to ask twice. The few things an answer changes are passed in `over`.
  const reply = (over: Record<string, unknown> = {}) => json(200, { outcomes, outcomeAllocations, projects, giftProjects, nodes, graceDays, requireRef, partnerTypes, partnerFields, outcomeTypes, idCounters, beneficiaries, enrolments, assignments, confirmations, progress, allocations, locations: config.locations ?? [], priorityGifts: config.priorityGifts ?? [], allocationSteps: normaliseSteps(config.allocationSteps), partnerCosts: config.partnerCosts?.records ?? [], itemIcons: config.itemIcons ?? {}, itemKinds: config.itemKinds ?? {}, itemUnits: config.itemUnits ?? {}, itemTimelines: config.itemTimelines ?? {}, autoRules: config.autoRules ?? {}, ...(config.autoLast ? { autoLast: config.autoLast } : {}), kindFeatures: config.kindFeatures ?? {}, ...over });
  // Rule (DECISIONS 105): every outcome and allocation has an ID. Any without one are given one here, so older ones get theirs too.
  const settle = (): boolean => {
    const r = ensureRefs({ outcomes, outcomeAllocations, counters: idCounters }, outcomeTypes, config.allocationPrefix);
    ({ outcomes, outcomeAllocations, counters: idCounters } = r);
    return r.changed;
  };
  let extra: Record<string, unknown> = {};

  if (write) {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
    const fw = setupOf(config).frameworks;
    const commitments = () => d.store.listWorkOrders(org).then((w) => allocatable(w, perPeriodRule(fw), new Date(d.nowMs()).toISOString().slice(0, 10)));
    const at = new Date(d.nowMs()).toISOString();
    const fail = (error: string) => json(400, { error });
    // Rule (DECISIONS 235): every save is also written to the change log, with who and which request. A log that cannot be written is reported to the server log but never undoes the save, because the person's change is already kept.
    const save = async (next: OrgConfig): Promise<void> => {
      await d.store.putConfig(org, next);
      try {
        await d.store.addChanges(org, changesBetween(config, next, a.claims.name, str("action"), at));
      } catch (e) {
        console.error("change log not written", e);
      }
    };
    // Rule (DECISIONS 231): a partner holding a parked outcome ready for the gift's benefit is confirmed for. Run after anything that changes assignments or stock.
    const settleConfirmations = (): void => { confirmations = confirmOnBehalf(confirmations, assignments.records, allocations.stock ?? [], allocations.records, at).value; };

    // Rule (DECISIONS 246): after any change to the register, enrolments or a project, admission is decided for complete records and the waiting list is enrolled while there is room. Returns the line to show, or "".
    let poolTouched = false; // true once the pool rule changed anything, so a project save that did not touch it leaves the register's saved shape alone
    const settlePoolNow = async (): Promise<string> => {
      const names = new Map((await d.store.listWorkOrders(org)).map((w) => [w.itemId, w.itemName]));
      const r = settlePool({ giftProjects, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, names.get(itemId) ?? ""), today: at.slice(0, 10) }, beneficiaries, enrolments);
      poolTouched = poolTouched || r.register !== beneficiaries || r.enrolments !== enrolments;
      beneficiaries = r.register; enrolments = r.enrolments;
      return poolMessage(r);
    };

    // The icon chosen for an item (DECISIONS 107). An empty icon takes the choice back, so the name's suggestion shows again.
    if (b["action"] === "item-icon") {
      const itemId = str("itemId");
      const icon = str("icon");
      if (itemId === "" || itemId.length > 200 || (icon !== "" && !ICON_IDS.includes(icon))) return fail("That icon was not found.");
      const next = { ...(config.itemIcons ?? {}) };
      if (icon === "") delete next[itemId]; else next[itemId] = icon;
      await save({ ...config, itemIcons: next, itemKinds: config.itemKinds ?? {}, itemUnits: config.itemUnits ?? {}, kindFeatures: config.kindFeatures ?? {} });
      return reply({ itemIcons: next });
    }
    // The kind of benefit chosen for an item (DECISIONS 143). An empty kind takes the choice back, so the name's suggestion shows again.
    if (b["action"] === "item-kind") {
      const r = setItemKind(config.itemKinds ?? {}, str("itemId"), str("kind"));
      if ("error" in r) return fail(r.error);
      await save({ ...config, itemKinds: r.value, kindFeatures: config.kindFeatures ?? {} });
      return reply({ itemKinds: r.value });
    }
    // Assignment (DECISIONS 170): the same pure rule the demo uses. The workflow decides automatic or suggested, and whether a person may reassign. Results are separate records, so they can be reset.
    if (typeof b["action"] === "string" && b["action"].startsWith("asg-")) {
      const wosA = await d.store.listWorkOrders(org);
      const namesA = new Map(wosA.map((w) => [w.itemId, w.itemName]));
      const ctx = contextFrom({ urgent: prioritySet(config.priorityGifts), refused: refusedBy(confirmations.records), workOrders: wosA, partners: projects, giftProjects, frameworks: fw, outcomeTypes, today: at.slice(0, 10), now: at, enrolments: enrolments.records, beneficiaries: beneficiaries.records, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, namesA.get(itemId) ?? ""), itemUnits: config.itemUnits, stock: allocations.stock });
      const r = applyAssignmentAction(ctx, assignments, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      const beforeAsg = assignments.records;
      assignments = r.value;
      if (b["action"] === "asg-reset") { confirmations = emptyConfirmations(); progress = emptyProgress(); } // no assignments, so no answers and no steps
      settleConfirmations();
      // Rule (DECISIONS 326): a partner is told when gifts are assigned to it.
      const told = addMessages(config.partnerMessages ?? [], newBatchMessages(beforeAsg, assignments.records, at)).value;
      await save({ ...config, assignments, confirmations, progress, partnerMessages: told });
      return reply({ ...(r.message ? { warning: r.message } : {}) });
    }
    // Allocation, the rewired Allocation (DECISIONS 175): the same pure rule the demo uses. An assigned gift fills an open place (an enrolment) or creates an outcome. Results are separate records, so they can be reset.
    if (typeof b["action"] === "string" && b["action"].startsWith("alc-")) {
      const wos = await d.store.listWorkOrders(org);
      const names = new Map(wos.map((w) => [w.itemId, w.itemName]));
      const actx = contextFrom({ urgent: prioritySet(config.priorityGifts), workOrders: wos, partners: projects, giftProjects, frameworks: fw, outcomeTypes, today: at.slice(0, 10), now: at, enrolments: enrolments.records, beneficiaries: beneficiaries.records, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, names.get(itemId) ?? ""), itemUnits: config.itemUnits, stock: allocations.stock });
      const ctx = allocateContext({ steps: normaliseSteps(config.allocationSteps), urgent: prioritySet(config.priorityGifts), assignments: assignments.records, assignables: assignables(actx), workOrders: wos, enrolments: enrolments.records, beneficiaries: beneficiaries.records, giftProjects, frameworks: fw, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, names.get(itemId) ?? ""), now: at, ...(config.itemUnits ? { itemUnits: config.itemUnits } : {}) });
      const r = applyAllocationAction(ctx, allocations, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      allocations = r.value;
      settleConfirmations(); // new parked outcomes can confirm waiting assignments
      await save({ ...config, allocations, confirmations });
      return reply({ ...(r.message ? { warning: r.message } : {}) });
    }
    // Progress after allocation (DECISIONS 232): a person takes the next step of a gift, takes one back, or closes a batch. The same pure rule the demo uses.
    if (typeof b["action"] === "string" && b["action"].startsWith("prg-")) {
      const wosP = await d.store.listWorkOrders(org);
      const namesP = new Map(wosP.map((w) => [w.itemId, w.itemName]));
      const actxP = contextFrom({ urgent: prioritySet(config.priorityGifts), workOrders: wosP, partners: projects, giftProjects, frameworks: fw, outcomeTypes, today: at.slice(0, 10), now: at, enrolments: enrolments.records, beneficiaries: beneficiaries.records, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, namesP.get(itemId) ?? ""), itemUnits: config.itemUnits, stock: allocations.stock });
      const fwOf = new Map(assignables(actxP).map((u) => [u.key, u.w.frameworkId ?? ""]));
      const pctx = progressContext({ assignments: assignments.records, allocations: allocations.records, frameworkOf: (k) => fwOf.get(k) ?? "", frameworks: fw, sizeOf: (id) => batchSizeOf(projects.find((x) => x.id === id)), today: at.slice(0, 10) });
      const r = applyProgressAction(pctx, progress, b, a.claims.name, at);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      progress = r.value;
      // Rule (DECISIONS 326): work sent back is told to the partner, with the reason and the last day.
      let toldP = config.partnerMessages ?? [];
      if (b["action"] === "prg-reject") {
        const st = standings({ assignments: assignments.records, allocations: allocations.records, frameworkOf: (k) => fwOf.get(k) ?? "", frameworks: fw, sizeOf: (id) => batchSizeOf(projects.find((x) => x.id === id)), today: at.slice(0, 10) }, progress.records).find((x) => x.key === str("key"));
        const m = sentBackFor(assignments.records.find((x) => x.key === str("key")), st, assignables(actxP).find((u) => u.key === str("key"))?.w.itemName ?? "your gift", at);
        if (m) toldP = addMessages(toldP, [m]).value;
      }
      await save({ ...config, progress, partnerMessages: toldP });
      return reply({ ...(r.message ? { warning: r.message } : {}) });
    }
    // Confirmation (DECISIONS 231): a person answers for the partner, confirming or rejecting an assigned gift. The same pure rule the demo uses.
    if (typeof b["action"] === "string" && b["action"].startsWith("cnf-")) {
      const r = applyConfirmationAction(confirmations, assignments.records, b, a.claims.name, at);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      confirmations = r.value;
      await save({ ...config, confirmations });
      return reply({ ...(r.message ? { warning: r.message } : {}) });
    }
    // The sample scenario (DECISIONS 329): the records of a working organisation on top of the sample world and the sample setup, dated back from today. It uses the same engines the buttons use. sample-scenario-remove clears those records.
    if (b["action"] === "sample-scenario-remove") {
      assignments = emptyAssignments(); confirmations = emptyConfirmations(); allocations = { ...emptyAllocations(), ...(allocations.stock ? { stock: allocations.stock } : {}) }; progress = emptyProgress();
      await save({ ...config, assignments, confirmations, allocations, progress, partnerMessages: [], priorityGifts: [] });
      return reply({ warning: "The sample scenario was removed: assignments, answers, allocations, steps and messages are cleared." });
    }
    if (b["action"] === "sample-scenario-load") {
      if (!hasSample({ giftProjects, register: beneficiaries })) return fail("Load the sample setup first.");
      const wosS = await d.store.listWorkOrders(org);
      if (fw.length === 0 || !wosS.some((w) => (w.frameworkId ?? "") !== "")) return fail("Set up the workflows first: on Workflows, add the standard workflows, suggest them from the item names, and apply them to the gifts.");
      const today = at.slice(0, 10);
      const namesS = new Map(wosS.map((w) => [w.itemId, w.itemName]));
      const frameworksS = scenarioWorkflows(fw);
      const ctxAt = (now: string, over: Record<string, unknown> = {}) => contextFrom({ urgent: new Set<string>(), workOrders: wosS, partners: projects, giftProjects, frameworks: frameworksS, outcomeTypes, today: now.slice(0, 10), now, enrolments: enrolments.records, beneficiaries: beneficiaries.records, rulesOf: (itemId: string) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, namesS.get(itemId) ?? ""), itemUnits: config.itemUnits, ...over });
      const units = assignables(ctxAt(at));
      const made = buildScenario({
        today, units: units.map((u) => ({ key: u.key, itemName: u.w.itemName, frameworkId: u.w.frameworkId ?? "" })),
        assign: (now) => runAssignment(ctxAt(now), emptyAssignments()).value,
        allocate: (given, now) => {
          const actxA = ctxAt(now);
          const ctx = allocateContext({ steps: normaliseSteps(config.allocationSteps), urgent: new Set<string>(), assignments: given.records, assignables: assignables(actxA), workOrders: wosS, enrolments: enrolments.records, beneficiaries: beneficiaries.records, giftProjects, frameworks: frameworksS, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, namesS.get(itemId) ?? ""), now, ...(config.itemUnits ? { itemUnits: config.itemUnits } : {}) });
          const r = applyAllocationAction(ctx, emptyAllocations(), { action: "alc-run" });
          return r && "value" in r ? r.value : emptyAllocations();
        },
        stepsOf: (id) => { const s = stepsFor(frameworksS.find((f) => f.id === id)); return { phases: s.phases.map((p) => ({ id: p.id, days: p.days })), review: s.review }; },
      });
      assignments = made.assignments; confirmations = made.confirmations; allocations = made.allocations; progress = made.progress;
      const next = { ...config, frameworks: frameworksS, itemTimelines: { ...(config.itemTimelines ?? {}), ...SCENARIO_TIMELINES }, autoRules: { ...SCENARIO_AUTO }, assignments, confirmations, allocations, progress, partnerMessages: made.partnerMessages, priorityGifts: made.priorityGifts };
      await save(next);
      Object.assign(config, next);
      return reply({ warning: `Sample scenario loaded: ${assignments.records.length} gifts assigned, ${confirmations.records.length} answers, ${allocations.records.length} allocations, ${progress.records.length} steps, ${made.partnerMessages.length} messages. The loop, moving and days to fulfil are set on the sample workflows.` });
    }
    // The sample setup (DECISIONS 168): invented partners, projects, clusters, beneficiaries and enrolments, loaded and removed as one.
    if (b["action"] === "sample-load" || b["action"] === "sample-remove") {
      const state = { partners: projects, giftProjects, partnerTypes, register: beneficiaries, enrolments, assignments, allocations };
      let message = "";
      let next: SampleState = state;
      if (b["action"] === "sample-load") {
        const wos = await d.store.listWorkOrders(org);
        const seen = new Map(wos.map((w) => [w.itemId, w.itemName]));
        const r = loadSampleSetup({ items: [...seen.entries()].map(([id, name]) => ({ id, name })), realProjects: realProjectsFor(giftProjects, wos), demand: demandByItem(contextFrom({ urgent: prioritySet(config.priorityGifts), workOrders: wos, partners: projects, giftProjects, frameworks: fw, outcomeTypes, today: at.slice(0, 10), now: at })), whole: wholeByItem(wos, fw, config.itemUnits), itemKinds: config.itemKinds ?? {}, kindFeatures: (config.kindFeatures ?? {}) as SavedFeatures, ...state, today: at.slice(0, 10) });
        if ("error" in r) return fail(r.error);
        next = r.value; message = sampleSummaryText(r.summary);
      } else {
        const r = removeSampleSetup(state);
        next = r.value; message = removedSummaryText(r);
      }
      ({ partners: projects, giftProjects, partnerTypes, register: beneficiaries, enrolments } = next);
      if (next.assignments) assignments = next.assignments;
      if (next.allocations) allocations = next.allocations;
      await save({ ...config, projects, giftProjects, partnerTypes, beneficiaries, enrolments, assignments, allocations });
      return reply({ warning: message });
    }
    // Erasing one beneficiary for good (DECISIONS 240): the record, the enrolments and the places they held, and what the change log says about them.
    if (b["action"] === "ben-erase") {
      const r = applyErasure(beneficiaries, enrolments, allocations, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      await save({ ...config, beneficiaries: r.register, enrolments: r.enrolments, allocations: r.allocations });
      await d.store.redactChanges(org, str("id"), r.enrolmentIds); // not in the try of save: a log that still holds the child's data must be reported
      beneficiaries = r.register; enrolments = r.enrolments; allocations = r.allocations;
      return reply({ warning: r.message });
    }
    // The Beneficiary register (DECISIONS 163) and enrolments (DECISIONS 167): the same pure rules the demo uses. A beneficiary that is enrolled cannot be removed.
    // Rule (DECISIONS 293): the order a gift looks for a place in, as the organisation set it. A list that is damaged is repaired, never refused.
    if (b["action"] === "alloc-steps") {
      const next = normaliseSteps(b["steps"]);
      await save({ ...config, allocationSteps: next });
      config.allocationSteps = next;
      return reply({ warning: `Allocation order saved: ${orderText(next)}.` });
    }
    // Rule (DECISIONS 284): a gift is marked Priority, or the mark is taken away. It only changes the order of assignment and allocation.
    if (b["action"] === "gift-priority") {
      // One gift (key) or several at once (keys, from the bulk bar).
      const keys = (Array.isArray(b["keys"]) ? (b["keys"] as unknown[]) : [str("key")]).filter((k): k is string => typeof k === "string" && k !== "").slice(0, 500);
      if (keys.length === 0) return fail("Choose a gift.");
      const next = setManyPriority(config.priorityGifts, keys, b["on"] === true);
      await save({ ...config, priorityGifts: next });
      config.priorityGifts = next;
      const one = keys.length === 1;
      return reply({ warning: b["on"] === true ? (one ? "Marked as priority: assigned and allocated first." : `Marked ${keys.length} gifts as priority: assigned and allocated first.`) : (one ? "Priority taken away." : `Priority taken away from ${keys.length} gifts.`) });
    }
    // Rule (DECISIONS 275): one typed area is given a checked place for everyone who typed it.
    if (b["action"] === "ben-area") {
      const place = acceptPlace(b["location"]);
      if (!place || typeof b["area"] !== "string") return fail("Choose a place from the list.");
      const r = resolveArea(beneficiaries, b["area"], place);
      beneficiaries = r.register;
      await save({ ...config, beneficiaries, locations: upsertPlace(config.locations ?? [], place) });
      config.locations = upsertPlace(config.locations ?? [], place);
      return reply({ warning: `${r.changed} ${r.changed === 1 ? "record now has" : "records now have"} the place ${place.name}.` });
    }
    if (typeof b["action"] === "string" && b["action"].startsWith("ben-")) {
      const r = applyBeneficiaryAction(beneficiaries, b, (id) => heldByBeneficiary(enrolments, id), at.slice(0, 10));
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      beneficiaries = r.value;
      const pooled = await settlePoolNow();
      // Rule (DECISIONS 274): a place chosen from the search is kept in the organisation's list, once.
      const place = acceptPlace(b["location"]);
      const keep = place && place.id === b["locationId"] ? { locations: upsertPlace(config.locations ?? [], place) } : {};
      await save({ ...config, beneficiaries, enrolments, ...keep });
      Object.assign(config, keep);
      const say = [r.message, pooled].filter((x) => x).join(" ");
      return reply(say ? { warning: say } : {});
    }
    if (typeof b["action"] === "string" && b["action"].startsWith("enr-")) {
      const names = new Map((await d.store.listWorkOrders(org)).map((w) => [w.itemId, w.itemName]));
      const r = applyEnrolmentAction({ beneficiaries, giftProjects, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, names.get(itemId) ?? ""), today: at.slice(0, 10) }, enrolments, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      enrolments = r.value;
      const pooled = await settlePoolNow(); // an enrolment that ended may have opened room
      await save({ ...config, beneficiaries, enrolments });
      return reply(pooled ? { warning: pooled } : {});
    }
    // The automatic work (DECISIONS 326). auto-rule sets one setting. auto-sweep reminds partners and moves unanswered gifts. auto-note keeps what the last run did. auto-run does all of it (see runAutomation below).
    if (b["action"] === "auto-rule") {
      const r = setAutoRule(config.autoRules, b["key"], b["value"]);
      if ("error" in r) return fail(r.error);
      await save({ ...config, autoRules: r.value });
      return reply({ autoRules: r.value });
    }
    if (b["action"] === "auto-note") {
      await save({ ...config, autoLast: { at, by: a.claims.name, text: str("text").slice(0, 400) } });
      return reply({ autoLast: { at, by: a.claims.name, text: str("text").slice(0, 400) } });
    }
    if (b["action"] === "auto-sweep") {
      const r = sweepRecords({ workOrders: await d.store.listWorkOrders(org), partners: projects, giftProjects, frameworks: fw, outcomeTypes, assignments, confirmations, allocations, progress, messages: config.partnerMessages ?? [], ...(config.priorityGifts ? { priorityGifts: config.priorityGifts } : {}), ...(config.autoRules ? { rules: config.autoRules } : {}) }, at);
      confirmations = r.confirmations; assignments = r.assignments;
      await save({ ...config, confirmations, assignments, partnerMessages: r.messages });
      return reply({ warning: `${r.reminded} reminder${r.reminded === 1 ? "" : "s"} left, ${r.moved} gift${r.moved === 1 ? "" : "s"} moved` });
    }
    if (b["action"] === "auto-run") return runAutomation(req, d, org, a.claims.name);
    // The units that make one whole beneficiary of an item (DECISIONS 188). An empty number takes the item's own back, so its workflow's applies.
    if (b["action"] === "item-units") {
      const r = setItemUnits(config.itemUnits ?? {}, str("itemId"), b["units"]);
      if ("error" in r) return fail(r.error);
      await save({ ...config, itemUnits: r.value });
      return reply({ itemUnits: r.value });
    }
    // The timeline of an item (DECISIONS 314): when its journey starts and how long its outcome lives. An empty value takes the item's own choice back, so its workflow's default applies.
    if (b["action"] === "item-timeline") {
      const r = setItemTimeline(config.itemTimelines ?? {}, str("itemId"), b["part"], b["value"]);
      if ("error" in r) return fail(r.error);
      await save({ ...config, itemTimelines: r.value });
      return reply({ itemTimelines: r.value });
    }
    // The features of a kind of benefit (DECISIONS 146): the same pure rule the demo uses.
    if (typeof b["action"] === "string" && b["action"].startsWith("kf-")) {
      const r = applyKindAction((config.kindFeatures ?? {}) as SavedFeatures, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      await save({ ...config, kindFeatures: r.value });
      return reply({ kindFeatures: r.value });
    }
    // Outcome types (DECISIONS 103): the same pure rule the demo uses. A type that outcomes already use cannot be removed.
    // The outcome types the starting workflows need, linked to those workflows that exist (DECISIONS 130).
    if (b["action"] === "ot-starters") {
      outcomeTypes = withPrefixes(linkStarterTypes(outcomeTypes, fw.map((f) => f.id)));
      await save({ ...config, outcomeTypes });
      return reply();
    }
    if (typeof b["action"] === "string" && b["action"].startsWith("ot-")) {
      const used = [...new Set(outcomes.map((o) => o.outcomeTypeId ?? "").filter((x) => x !== ""))];
      const r = applyOutcomeTypeAction(outcomeTypes, fw.map((f) => f.id), used, b);
      if (!r) return fail("That request is not understood.");
      if ("error" in r) return fail(r.error);
      outcomeTypes = r.types;
      await save({ ...config, outcomeTypes });
      return reply();
    }
    switch (b["action"]) {
      case "add": {
        if (!fw.some((f) => f.id === str("frameworkId"))) return fail("Choose a framework for the outcome.");
        const r = addOutcomes(outcomes, { name: str("name").slice(0, 100), count: Number(b["count"] ?? 1), type: str("type").slice(0, 60), cohort: str("cohort").slice(0, 100), frameworkId: str("frameworkId") });
        if (r.error) return fail(r.error);
        if (r.value.length > MAX_OUTCOMES) return fail(`There can be at most ${MAX_OUTCOMES} outcomes.`);
        outcomes = r.value;
        break;
      }
      case "active":
        if (!outcomes.some((o) => o.id === str("id")) || typeof b["active"] !== "boolean") return fail("That outcome was not found.");
        outcomes = setActive(outcomes, str("id"), b["active"]);
        break;
      case "remove-many": {
        const ids = Array.isArray(b["ids"]) ? (b["ids"] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_OUTCOMES) : [];
        if (ids.length === 0) return fail("Nothing to remove.");
        const r = removeUnused(outcomes, outcomeAllocations, ids);
        outcomes = r.value;
        extra = { removed: r.removed, kept: r.kept };
        break;
      }
      case "remove": {
        const r = removeOutcome(outcomes, outcomeAllocations, str("id"));
        if (r.error) return fail(r.error);
        outcomes = r.value;
        break;
      }
      case "auto": {
        const r = autoAllocate(await commitments(), outcomes, fw, outcomeAllocations, at, allocOptions(projects, graceDays, at.slice(0, 10), requireRef, giftProjects));
        outcomeAllocations = r.outcomeAllocations;
        extra = { allocated: r.allocated, released: r.released, unallocated: r.unallocated };
        break;
      }
      case "move": {
        const r = moveAllocation(outcomeAllocations, await commitments(), outcomes, fw, str("commitmentKey"), str("outcomeId"), at, allocOptions(projects, graceDays, at.slice(0, 10), requireRef, giftProjects).policy);
        if (r.error) return fail(r.error);
        outcomeAllocations = r.value;
        break;
      }
      case "allocate-in-node": {
        const r = allocateInNode(outcomeAllocations, await commitments(), outcomes, nodes, fw, str("commitmentKey"), str("nodeId"), at, allocOptions(projects, graceDays, at.slice(0, 10), requireRef, giftProjects).policy);
        if (r.error) return fail(r.error);
        outcomeAllocations = r.value;
        break;
      }
      case "allocate-in-partner": {
        const r = allocateInPartner(outcomeAllocations, await commitments(), outcomes, projects, fw, str("commitmentKey"), str("projectId"), at, allocOptions(projects, graceDays, at.slice(0, 10), requireRef, giftProjects).policy);
        if (r.error) return fail(r.error);
        outcomeAllocations = r.value;
        break;
      }
      case "adopt-legacy": {
        const r = adoptLegacy(outcomes, projects, str("projectId"));
        if (r.error) return fail(r.error);
        outcomes = r.value;
        extra = { moved: r.moved };
        break;
      }
      case "clear-legacy": {
        const r = clearLegacy(outcomes, outcomeAllocations);
        outcomes = r.outcomes;
        outcomeAllocations = r.outcomeAllocations;
        extra = { removed: r.removed, released: r.released };
        break;
      }
      case "set-require-ref":
        requireRef = b["on"] === true;
        break;
      case "set-grace": {
        const n = Number(b["days"]);
        if (!Number.isInteger(n) || n < 0 || n > 90) return fail("The grace period is a whole number of days, from 0 to 90.");
        graceDays = n;
        break;
      }
      // Rule (DECISIONS 74): a place is released only when a manager approves it, and only if it is really due. The server checks, and keeps a record of who approved.
      case "approve-release": {
        if (!a.claims.perms.includes(P.approveRelease)) return json(403, { error: "Only a manager can approve releasing a sponsorship." });
        const policy = allocOptions(projects, graceDays, at.slice(0, 10), requireRef, giftProjects).policy;
        const due = releaseApprovals(outcomeAllocations, await commitments(), fw, policy).find((x) => x.commitmentKey === str("commitmentKey"));
        if (!due) return fail("That release is not due.");
        outcomeAllocations = releaseAllocation(outcomeAllocations, due.commitmentKey);
        releaseLog = [...releaseLog, { commitmentKey: due.commitmentKey, outcomeId: due.outcomeId, by: a.claims.name, at, daysOverdue: due.daysOverdue }].slice(-2000);
        break;
      }
      case "release":
        outcomeAllocations = releaseAllocation(outcomeAllocations, str("commitmentKey"));
        break;
      default: {
        // Projects (DECISIONS 65): the structure each project defines, and the beneficiaries in it.
        const r = applyProjectAction({ projects, nodes, outcomes, partnerTypes, partnerFields, giftProjects }, fw, b, at.slice(0, 10), new Set(outcomeAllocations.map((x) => x.outcomeId)), (gpId, clusterId) => heldInCluster(enrolments, gpId, clusterId));
        if (!r) return fail("That request is not understood.");
        if (r.error) return fail(r.error);
        ({ projects, nodes, outcomes, partnerTypes, partnerFields, giftProjects } = r.state);
        if (r.warning) extra = { warning: r.warning };
        // Rule (DECISIONS 277): a place chosen for a cluster is kept in the organisation's list, once.
        const chosen = acceptPlace(b["location"]);
        if (chosen && chosen.id === b["locationId"]) config.locations = upsertPlace(config.locations ?? [], chosen);
        const pooled = await settlePoolNow(); // a bigger capacity, a new cluster or "Enrol automatically" may have opened room
        if (pooled) extra = { ...extra, warning: [extra["warning"], pooled].filter((x) => x).join(" ") };
      }
    }
    settle();
    await save({ ...config, outcomes, outcomeAllocations, projects, giftProjects, nodes, graceDays, releaseLog, requireRef, partnerTypes, partnerFields, outcomeTypes, idCounters, ...(poolTouched ? { beneficiaries, enrolments } : {}) });
  } else if (settle()) {
    await d.store.putConfig(org, { ...config, outcomes, outcomeAllocations, outcomeTypes, idCounters }); // a read that only gives older records their IDs: not one of the logged parts
  }
  return reply({ ...extra });
}


// --- The automatic work, run as a whole (DECISIONS 326) ---
// Does, in order: the sweep (reminders, and moving unanswered gifts), Assign, Allocate, each only if its setting is on, then notes what was done. Each step is the same request a person's button makes, sent with the same session (or the system's, for the scheduled job), so every change is logged and permission-checked as usual. Returns the full picture, like a read.
export async function runAutomation(req: HttpRequest, d: Deps, org: string, who: string): Promise<HttpResponse> {
  const config = (await d.store.getConfig(org)) ?? defaultConfig();
  const rules = autoRulesOf(config.autoRules);
  const anyMove = (setupOf(config).frameworks ?? []).some((f) => f.moveAfterDays !== undefined);
  const post = (body: Record<string, unknown>): Promise<HttpResponse> => handleOutcomes({ method: "POST", query: {}, headers: req.headers, body }, d);
  const did: string[] = [];
  const note = (label: string, r: HttpResponse): void => { const w = (r.body as { warning?: unknown; error?: unknown } | undefined); did.push(r.status === 200 ? `${label}${typeof w?.warning === "string" && w.warning ? `: ${w.warning}` : ""}` : `${label} failed${typeof w?.error === "string" ? `: ${w.error}` : ""}`); };
  if (rules.remind || anyMove) note("Reminders and moves", await post({ action: "auto-sweep" }));
  if (rules.assign) note("Assign", await post({ action: "asg-run" }));
  if (rules.allocate) note("Allocate", await post({ action: "alc-run" }));
  if (did.length === 0) did.push("Nothing to do: reminders, Assign and Allocate are all off.");
  const text = `${did.join(". ")}.`;
  await post({ action: "auto-note", text });
  const picture = await handleOutcomes({ method: "GET", query: {}, headers: req.headers }, d);
  return { ...picture, body: { ...(picture.body as object), warning: text } };
}
