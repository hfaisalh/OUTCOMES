/**
 * exclude.ts
 *
 * What it does: the /api/exclude endpoint. All the logic is in handleExclude (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleExclude } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleExclude);
