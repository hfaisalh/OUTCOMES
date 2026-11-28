/**
 * partner-handler.ts
 *
 * What it does: the partner's own slice, its answers to gifts (accept or refuse) (DECISIONS 254), and its own beneficiaries (add and complete, DECISIONS 260) (DECISIONS 249), the one answer a partner's sign-in may get. It is served from GET /api/outcomes when the session is a partner's, because the host allows only 12 functions. It answers with that partner's own slice of the data and nothing else.
 * Who calls it: outcomes-handler.ts and the tests. Depends on: http.ts (the sign-in check), store.ts, and the pure rule in modules/13-partner-portal/scope.ts.
 * Rules: the partner is always the one named in the signed session, never one named in the request. A partner that no longer exists gets 404, not an empty or a full picture.
 */

import { migrateGiftProjects } from "../06-projects/projects.js";
import { emptyRegister, type Register } from "../07-beneficiaries/beneficiaries.js";
import { emptyEnrolments, itemRulesOf } from "../07-beneficiaries/enrolments.js";
import { settlePool } from "../07-beneficiaries/waiting.js";
import type { SavedFeatures } from "../02-project-rules/kind-features.js";
import { emptyAssignments } from "../08-assignment/assignment.js";
import { emptyAllocations } from "../09-allocation/allocation.js";
import { emptyConfirmations } from "../11-confirmation/confirmation.js";
import { emptyProgress } from "../12-progress/progress.js";
import { partnerAnswer } from "../13-partner-portal/answer.js";
import { entryMessage, partnerEntry } from "../13-partner-portal/entry.js";
import { addMany, MAX_ROWS } from "../13-partner-portal/import.js";
import { giftDetails } from "../13-partner-portal/gift-details.js";
import { partnerSlice, PARTNER_PERMISSION } from "../13-partner-portal/scope.js";
import { acceptPlace, upsertPlace } from "../14-locations/locations.js";
import { setOwnProfile } from "../13-partner-portal/profile.js";
import { applyCostAction, COST_CATEGORIES, emptyCosts } from "../15-partner-costs/costs.js";
import { changesBetween } from "./change-log.js";
import { defaultConfig, setupOf } from "./store.js";
import { json, need, text, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

export async function handlePartner(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "GET" && req.method !== "POST") return text(404, "Not found.");
  const a = need(req, d, PARTNER_PERMISSION);
  if ("response" in a) return a.response;
  const config = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
  // Rule (DECISIONS 254): a partner may accept or refuse its own gifts, and nothing else. The answer is saved, then the partner's fresh slice is returned with a message.
  let message = "";
  let upload: { added: number; addedLines: number[]; skipped: { line: number; name: string; error: string }[] } | undefined; // the result of a CSV upload, listing the rows not added
  const workOrders = await d.store.listWorkOrders(a.claims.org);
  const migrated = migrateGiftProjects(config.projects ?? [], config.giftProjects ?? []);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const at = new Date(d.nowMs()).toISOString();
  if (req.method === "POST" && typeof body["action"] === "string" && body["action"].startsWith("ben-")) {
    // Rule (DECISIONS 260): a partner adds and completes its own beneficiaries. Then admission is decided by completeness and the waiting list enrols by itself, as for any record.
    const mineProjects = migrated.giftProjects.filter((g) => g.partnerIds.includes(a.claims.partner as string));
    const names = new Map(workOrders.map((w) => [w.itemId, w.itemName]));
    const pool = (register: Register) => settlePool({ giftProjects: migrated.giftProjects, rulesOf: (itemId) => itemRulesOf(config.itemKinds ?? {}, (config.kindFeatures ?? {}) as SavedFeatures, itemId, names.get(itemId) ?? ""), today: at.slice(0, 10) }, register, config.enrolments ?? emptyEnrolments());
    let r: Exclude<ReturnType<typeof partnerEntry>, null | { error: string; similar: boolean }> | undefined;
    if (body["action"] === "ben-add-many") {
      // Rule (DECISIONS 271): many at once, each row added with the one-by-one rule; the rows that fail are listed, the others are kept, and the waiting list runs once.
      const rows = Array.isArray(body["rows"]) ? (body["rows"] as unknown[]).filter((x): x is { line: number; values: Record<string, string> } => typeof x === "object" && x !== null && typeof (x as { line?: unknown }).line === "number" && typeof (x as { values?: unknown }).values === "object" && (x as { values: Record<string, unknown> }).values !== null && Object.values((x as { values: Record<string, unknown> }).values).every((v) => typeof v === "string")) : [];
      if (rows.length === 0 || rows.length > MAX_ROWS) return json(400, { error: `Send between 1 and ${MAX_ROWS} rows.` });
      const many = addMany(config.beneficiaries ?? emptyRegister(), a.claims.partner as string, mineProjects.map((g) => g.id), rows, typeof body["targetProjectId"] === "string" ? body["targetProjectId"] : "", body["allowSimilar"] === true, at.slice(0, 10));
      const settledMany = pool(many.register);
      const next = { ...config, beneficiaries: settledMany.register, enrolments: settledMany.enrolments };
      if (many.added.length > 0) {
        await d.store.putConfig(a.claims.org, next);
        try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, "ben-add-many", at)); } catch (e) { console.error("change log not written", e); }
        Object.assign(config, next);
      }
      const ids = new Set(many.added.map((x) => x.id));
      const mine = settledMany.register.records.filter((b) => ids.has(b.id));
      const enrolled = mine.filter((b) => settledMany.enrolments.records.some((e) => e.beneficiaryId === b.id && e.status === "active")).length;
      const waiting = mine.filter((b) => b.eligibility === "ready").length - enrolled, review = mine.filter((b) => b.eligibility === "review").length;
      message = many.added.length === 0 ? "Nothing was added." : `Added ${many.added.length} beneficiar${many.added.length === 1 ? "y" : "ies"}: ${enrolled} enrolled, ${Math.max(0, waiting)} on the waiting list, ${review} needing details.${many.skipped.length > 0 ? ` ${many.skipped.length} not added.` : ""}`;
      upload = { added: many.added.length, addedLines: many.added.map((x) => x.line), skipped: many.skipped };
    } else {
      const one = partnerEntry(config.beneficiaries ?? emptyRegister(), a.claims.partner as string, mineProjects.map((g) => g.id), body, at.slice(0, 10));
      if (!one) return json(400, { error: "That request is not open to a partner." });
      if ("error" in one) return json(400, { error: one.error, similar: one.similar });
      r = one;
    }
    const settled = r ? pool(r.register) : undefined;
    if (r && settled) {
      // Rule (DECISIONS 274): a place chosen from the search is kept in the organisation's list of places, once.
      const place = acceptPlace(body["location"]);
      const next = { ...config, beneficiaries: settled.register, enrolments: settled.enrolments, ...(place && place.id === body["locationId"] ? { locations: upsertPlace(config.locations ?? [], place) } : {}) };
      await d.store.putConfig(a.claims.org, next);
      try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, String(body["action"]), at)); } catch (e) { console.error("change log not written", e); }
      message = entryMessage(settled.register, settled.enrolments, migrated.giftProjects, r.id, r.added);
      Object.assign(config, next);
    }
  } else if (req.method === "POST" && body["action"] === "profile-set") {
    // Rule (DECISIONS 281): the one partner profile; a partner changes only its own part of it.
    const r = setOwnProfile(migrated.partners, a.claims.partner as string, body);
    if ("error" in r) return json(400, { error: r.error });
    const next = { ...config, projects: r.value };
    await d.store.putConfig(a.claims.org, next);
    try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, "profile-set", at)); } catch (e) { console.error("change log not written", e); }
    message = "Profile saved.";
    Object.assign(config, next);
    migrated.partners = r.value;
  } else if (req.method === "POST" && typeof body["action"] === "string" && body["action"].startsWith("cost-")) {
    // Rule (DECISIONS 280): a partner records, corrects and removes its own costs. Record only: nothing is paid or approved.
    const mineProjects = migrated.giftProjects.filter((g) => g.partnerIds.includes(a.claims.partner as string)).map((g) => g.id);
    // The benefits a partner has activated on its profile, and those its projects offer.
    const me = migrated.partners.find((x) => x.id === a.claims.partner);
    const benefitIds = [...new Set([...(me?.itemIds ?? []), ...migrated.giftProjects.filter((g) => g.partnerIds.includes(a.claims.partner as string)).flatMap((g) => g.itemIds ?? [])])];
    const r = applyCostAction(config.partnerCosts ?? emptyCosts(), a.claims.partner as string, body, COST_CATEGORIES, mineProjects, benefitIds, `${a.claims.name}`, at);
    if (!r) return json(400, { error: "That request is not open to a partner." });
    if ("error" in r) return json(400, { error: r.error });
    const next = { ...config, partnerCosts: r.value };
    await d.store.putConfig(a.claims.org, next);
    try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, String(body["action"]), at)); } catch (e) { console.error("change log not written", e); }
    message = r.message ?? "";
    Object.assign(config, next);
  } else if (req.method === "POST") {
    const r = partnerAnswer(config.confirmations ?? emptyConfirmations(), (config.assignments ?? emptyAssignments()).records, a.claims.partner as string, body, a.claims.name, at);
    if ("error" in r) return json(400, { error: r.error });
    const next = { ...config, confirmations: r.value };
    await d.store.putConfig(a.claims.org, next);
    try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, String(body["action"]), at)); } catch (e) { console.error("change log not written", e); }
    message = r.message;
    Object.assign(config, next);
  }
  // Names of the benefits, from the work orders. Only item id and name are taken, never a donor or an amount.
  const itemNames: Record<string, string> = {};
  for (const w of workOrders) if (w.itemName) itemNames[w.itemId] = w.itemName;
  // What the partner may know about each gift assigned to it (DECISIONS 259): no donor and no money. Only this partner's own gifts are looked at.
  const mineAssigned = (config.assignments ?? emptyAssignments()).records.filter((x) => x.partnerId === a.claims.partner);
  const details = giftDetails({ assignments: mineAssigned, workOrders, frameworks: setupOf(config).frameworks, allocations: (config.allocations ?? emptyAllocations()).records });
  const slice = partnerSlice({
    itemNames,
    giftDetails: details,
    partners: migrated.partners,
    giftProjects: migrated.giftProjects,
    register: config.beneficiaries ?? emptyRegister(),
    enrolments: config.enrolments ?? emptyEnrolments(),
    assignments: config.assignments ?? emptyAssignments(),
    confirmations: config.confirmations ?? emptyConfirmations(),
    progress: config.progress ?? emptyProgress(),
    allocations: config.allocations ?? emptyAllocations(),
    costs: config.partnerCosts?.records ?? [],
  }, a.claims.partner as string);
  return slice ? json(200, message ? { ...slice, message, ...(upload ? { upload } : {}) } : slice, { "cache-control": "no-store" }) : json(404, { error: "This partner was not found." });
}
