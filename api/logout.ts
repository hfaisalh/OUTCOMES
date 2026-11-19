/**
 * logout.ts
 *
 * What it does: the /api/logout endpoint. All the logic is in handleLogout (modules/00-platform/handlers.ts).
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleLogout } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleLogout);
