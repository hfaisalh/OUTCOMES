/**
 * places-handler.ts
 *
 * What it does: answers GET /api/outcomes?places=<letters> with place suggestions for the Area pickers (DECISIONS 274). Open to any signed-in person, staff or partner, because both pick an Area.
 * Who calls it: outcomes-handler.ts (before the partner routing) and the tests. Depends on: http.ts (the sign-in check) and modules/14-locations/search.ts.
 * Rules: needs a signed-in session with access, nothing else. Only the typed letters leave for the search service, never a name, an ID or anything about a person. The service is free, so the search is cached and capped (search.ts).
 */

import { PERMISSIONS as P } from "../../app/menu.js";
import { searchPlaces, type Fetcher } from "../14-locations/search.js";
import { json, sessionOf, type Deps, type HttpRequest, type HttpResponse } from "./http.js";

export async function handlePlaces(req: HttpRequest, d: Deps): Promise<HttpResponse> {
  const claims = sessionOf(req, d);
  if (!claims) return json(401, { error: "Please open OUTCOMES from the CRM to sign in." });
  if (!claims.perms.includes(P.access)) return json(403, { error: "Your CRM role does not allow this." });
  const fetcher: Fetcher = d.fetch ?? ((url, init) => fetch(url, init));
  return json(200, { places: await searchPlaces(req.query["places"], fetcher, d.nowMs()) });
}
