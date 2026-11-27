/**
 * partner-handler.ts
 *
 * What it does: the partner's own slice, and its answers to gifts (accept or refuse) (DECISIONS 249), the one answer a partner's sign-in may get. It is served from GET /api/outcomes when the session is a partner's, because the host allows only 12 functions. It answers with that partner's own slice of the data and nothing else.
 * Who calls it: outcomes-handler.ts and the tests. Depends on: http.ts (the sign-in check), store.ts, and the pure rule in modules/13-partner-portal/scope.ts.
 * Rules: the partner is always the one named in the signed session, never one named in the request. A partner that no longer exists gets 404, not an empty or a full picture.
 */

import { migrateGiftProjects } from "../06-projects/projects.js";
import { emptyRegister } from "../07-beneficiaries/beneficiaries.js";
import { emptyEnrolments } from "../07-beneficiaries/enrolments.js";
import { emptyAssignments } from "../08-assignment/assignment.js";
import { emptyAllocations } from "../09-allocation/allocation.js";
import { emptyConfirmations } from "../11-confirmation/confirmation.js";
import { emptyProgress } from "../12-progress/progress.js";
import { partnerAnswer } from "../13-partner-portal/answer.js";
import { partnerSlice, PARTNER_PERMISSION } from "../13-partner-portal/scope.js";
import { changesBetween } from "./change-log.js";
import { defaultConfig } from "./store.js";
import { json, need, text, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

export async function handlePartner(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "GET" && req.method !== "POST") return text(404, "Not found.");
  const a = need(req, d, PARTNER_PERMISSION);
  if ("response" in a) return a.response;
  const config = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
  // Rule (DECISIONS 254): a partner may accept or refuse its own gifts, and nothing else. The answer is saved, then the partner's fresh slice is returned with a message.
  let message = "";
  if (req.method === "POST") {
    const at = new Date(d.nowMs()).toISOString();
    const r = partnerAnswer(config.confirmations ?? emptyConfirmations(), (config.assignments ?? emptyAssignments()).records, a.claims.partner as string, (req.body ?? {}) as Record<string, unknown>, a.claims.name, at);
    if ("error" in r) return json(400, { error: r.error });
    const next = { ...config, confirmations: r.value };
    await d.store.putConfig(a.claims.org, next);
    try { await d.store.addChanges(a.claims.org, changesBetween(config, next, a.claims.name, String((req.body as { action?: unknown }).action), at)); } catch (e) { console.error("change log not written", e); }
    message = r.message;
    Object.assign(config, next);
  }
  const migrated = migrateGiftProjects(config.projects ?? [], config.giftProjects ?? []);
  // Names of the benefits, from the work orders. Only item id and name are taken, never a donor or an amount.
  const itemNames: Record<string, string> = {};
  for (const w of await d.store.listWorkOrders(a.claims.org)) if (w.itemName) itemNames[w.itemId] = w.itemName;
  const slice = partnerSlice({
    itemNames,
    partners: migrated.partners,
    giftProjects: migrated.giftProjects,
    register: config.beneficiaries ?? emptyRegister(),
    enrolments: config.enrolments ?? emptyEnrolments(),
    assignments: config.assignments ?? emptyAssignments(),
    confirmations: config.confirmations ?? emptyConfirmations(),
    progress: config.progress ?? emptyProgress(),
    allocations: config.allocations ?? emptyAllocations(),
  }, a.claims.partner as string);
  return slice ? json(200, message ? { ...slice, message } : slice, { "cache-control": "no-store" }) : json(404, { error: "This partner was not found." });
}
