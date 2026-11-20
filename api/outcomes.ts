/**
 * outcomes.ts
 *
 * What it does: the /api/outcomes endpoint. All the logic is in handleOutcomes (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleOutcomes } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleOutcomes);
