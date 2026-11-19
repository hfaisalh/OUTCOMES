/**
 * config.ts
 *
 * What it does: the /api/config endpoint. All the logic is in handleConfig (modules/00-platform/handlers.ts).
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleConfig } from "../modules/00-platform/handlers";
import { node } from "./_server";

export default node(handleConfig);
