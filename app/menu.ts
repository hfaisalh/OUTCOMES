/**
 * menu.ts
 *
 * What it does: the list of menu items in the OUTCOMES shell, and which of them a signed-in person
 * may see. Each item needs one permission, and the permissions come from the person's CRM role
 * (DECISIONS 32). The shell shows only what the permissions allow.
 * Who calls it: main.ts (the menu) and the tests.
 * Depends on: nothing (pure functions, no screen).
 *
 * Rule: no permission, no menu item. A person with no OUTCOMES permission at all sees no menu, and
 * in the live product would not have been shown the OUTCOMES button in the CRM in the first place.
 */

// The permission names OUTCOMES registers in the CRM's Roles and Permissions page (DECISIONS 32).
export const PERMISSIONS = {
  access: "outcomes.access", // may open OUTCOMES at all
  viewWorkOrders: "outcomes.view_work_orders",
  mapFrameworks: "outcomes.map_frameworks",
  dashboards: "outcomes.dashboards",
  otherSources: "outcomes.other_sources",
  settings: "outcomes.settings",
} as const;

export type PageId = "work-orders" | "categories" | "dashboard" | "sources" | "settings";

export interface MenuItem {
  id: PageId;
  label: string;
  icon: string; // a plain symbol, no icon library needed yet
  permission: string;
  section: "Work" | "Set up";
}

export const MENU: MenuItem[] = [
  { id: "work-orders", label: "Work orders", icon: "☰", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "dashboard", label: "Dashboard", icon: "◔", permission: PERMISSIONS.dashboards, section: "Work" },
  { id: "categories", label: "Categories", icon: "▦", permission: PERMISSIONS.mapFrameworks, section: "Set up" },
  { id: "sources", label: "Other sources", icon: "⇪", permission: PERMISSIONS.otherSources, section: "Set up" },
  { id: "settings", label: "Settings", icon: "⚙", permission: PERMISSIONS.settings, section: "Set up" },
];

// Rule: a person must hold the access permission, then each item needs its own permission.
export function visibleMenu(permissions: string[]): MenuItem[] {
  if (!permissions.includes(PERMISSIONS.access)) return [];
  return MENU.filter((m) => permissions.includes(m.permission));
}

// The first page a person lands on: the first item they may see, or null when they have none.
export const landingPage = (permissions: string[]): PageId | null => visibleMenu(permissions)[0]?.id ?? null;
