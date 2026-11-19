/**
 * import.ts
 *
 * What it does: the /api/import endpoint. All the logic is in handleImport (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleImport } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleImport);
