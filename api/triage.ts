/**
 * triage.ts
 *
 * What it does: the /api/triage endpoint. All the logic is in handleTriage (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleTriage } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleTriage);
