/**
 * demo-login.ts
 *
 * What it does: the /api/demo-login endpoint (test sign-in). All the logic is in handleDemoLogin
 * (modules/00-platform/handlers.ts), which answers 404 unless DEMO_LOGIN=1 is set on the server.
 * Who calls it: a person opening the link on a test server. Depends on: _server.ts.
 */

import { handleDemoLogin } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node(handleDemoLogin);
