/**
 * work-orders.ts
 *
 * What it does: the /api/work-orders endpoint. All the logic is in handleWorkOrders (modules/00-platform/handlers.ts).
 * Who calls it: the browser and, for the sign-in, the CRM. Depends on: _server.ts.
 */

import { handleWorkOrders } from "../modules/00-platform/handlers";
import { node } from "./_server";

export default node(handleWorkOrders);
