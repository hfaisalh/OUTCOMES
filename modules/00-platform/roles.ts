/**
 * roles.ts
 *
 * What it does: the example roles OUTCOMES knows how to test with, and which OUTCOMES permissions each holds (DECISIONS 91). In the live product a person's
 * role and permissions come from the CRM (DECISIONS 24, 32) and OUTCOMES keeps no user list of its own. These roles exist only so that the test sign-in
 * and the demo can show what each kind of person sees, and so the CRM team has a starting list of roles to build.
 * Who calls it: the owner test sign-in (handlers.ts), the demo (app/demo-data.ts) and the sign-in screen (app/signin-page.ts).
 * Depends on: the permission names in app/menu.ts. Pure: no database, no screen.
 *
 * Rule: a role is only a named set of permissions. What a person may do is always decided by the permissions, never by the role's name.
 */

import { PERMISSIONS as P } from "../../app/menu.js";

export interface RoleInfo {
  id: string;
  name: string;
  blurb: string; // one line for the sign-in screen
  permissions: string[];
}

export const ROLES: RoleInfo[] = [
  { id: "admin", name: "Outcomes administrator", blurb: "Everything, including settings and approving releases.", permissions: Object.values(P) },
  { id: "manager", name: "Fulfilment manager", blurb: "Gifts, partners, allocation and dashboards, and may approve releasing a place.", permissions: [P.access, P.viewWorkOrders, P.mapFrameworks, P.dashboards, P.approveRelease] },
  { id: "gifts", name: "Gifts officer", blurb: "Looks after gifts and sorts items into categories. No settings.", permissions: [P.access, P.viewWorkOrders, P.mapFrameworks] },
  { id: "agent", name: "Fulfilment agent", blurb: "Sees gifts and dashboards. Cannot change setup.", permissions: [P.access, P.viewWorkOrders, P.dashboards] },
  { id: "viewer", name: "Dashboard viewer", blurb: "Dashboards only.", permissions: [P.access, P.dashboards] },
  { id: "none", name: "No OUTCOMES permission", blurb: "Sees nothing. In the CRM this person would not be shown the OUTCOMES button.", permissions: [] },
];

// Rule: an unknown role id gives the safest answer, no permissions, never the administrator.
export const roleById = (id: string): RoleInfo => ROLES.find((r) => r.id === id) ?? (ROLES[ROLES.length - 1] as RoleInfo);
