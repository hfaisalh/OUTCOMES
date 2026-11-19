/**
 * owner-login.ts
 *
 * What it does: the /api/owner-login endpoint. All the logic is in handleOwnerLogin (modules/00-platform/handlers.ts).
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleOwnerLogin } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleOwnerLogin);
