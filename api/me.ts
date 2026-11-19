/**
 * me.ts
 *
 * What it does: the /api/me endpoint. All the logic is in handleMe (modules/00-platform/handlers.ts).
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleMe } from "../modules/00-platform/handlers";
import { node } from "./_server";

export default node(handleMe);
