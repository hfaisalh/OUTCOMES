/**
 * work-orders.ts
 *
 * What it does: the /api/work-orders endpoint. GET lists the work orders (handleWorkOrders). POST excludes or restores
 * them (handleExclude). Both are in modules/00-platform/handlers.ts. They share one function because the Vercel Hobby
 * plan allows only 12 functions in a deployment.
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleExclude, handleWorkOrders } from "../modules/00-platform/handlers.js";
import { node } from "./_server.js";

export default node((req, d) => (req.method === "POST" ? handleExclude(req, d) : handleWorkOrders(req, d)));
