/**
 * owner-login.ts
 *
 * What it does: the /api/owner-login endpoint. All the logic is in handleSignIn (modules/00-platform/signin-handler.ts): email and password sign-in, the accounts, and the owner's passphrase.
 * Who calls it: the browser. Depends on: _server.ts.
 */

import { handleSignIn } from "../modules/00-platform/signin-handler.js";
import { node } from "./_server.js";

export default node(handleSignIn);
