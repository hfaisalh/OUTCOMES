/**
 * launch.ts
 *
 * What it does: the /api/launch endpoint. All the logic is in handleLaunch (modules/00-platform/handlers.ts).
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleLaunch } from "../modules/00-platform/handlers";
import { node } from "./_server";

export default node(handleLaunch);
