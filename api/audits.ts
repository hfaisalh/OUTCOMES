/**
 * audits.ts
 *
 * What it does: the /api/audits endpoint. All the logic is in handleAudits (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleAudits } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleAudits);
