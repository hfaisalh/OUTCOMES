/**
 * partner-handler.ts
 *
 * What it does: the partner's own slice (DECISIONS 249), the one answer a partner's sign-in may get. It is served from GET /api/outcomes when the session is a partner's, because the host allows only 12 functions. It answers with that partner's own slice of the data and nothing else.
 * Who calls it: outcomes-handler.ts and the tests. Depends on: http.ts (the sign-in check), store.ts, and the pure rule in modules/13-partner-portal/scope.ts.
 * Rules: the partner is always the one named in the signed session, never one named in the request. A partner that no longer exists gets 404, not an empty or a full picture.
 */

import { migrateGiftProjects } from "../06-projects/projects.js";
import { emptyRegister } from "../07-beneficiaries/beneficiaries.js";
import { emptyEnrolments } from "../07-beneficiaries/enrolments.js";
import { emptyAssignments } from "../08-assignment/assignment.js";
import { emptyPlacements } from "../09-placement/placement.js";
import { emptyConfirmations } from "../11-confirmation/confirmation.js";
import { emptyProgress } from "../12-progress/progress.js";
import { partnerSlice, PARTNER_PERMISSION } from "../13-partner-portal/scope.js";
import { defaultConfig } from "./store.js";
import { json, need, text, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

export async function handlePartner(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  if (req.method !== "GET") return text(404, "Not found.");
  const a = need(req, d, PARTNER_PERMISSION);
  if ("response" in a) return a.response;
  const config = (await d.store.getConfig(a.claims.org)) ?? defaultConfig();
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
    placements: config.placements ?? emptyPlacements(),
  }, a.claims.partner as string);
  return slice ? json(200, slice, { "cache-control": "no-store" }) : json(404, { error: "This partner was not found." });
}
