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

export type PageId = "work-orders" | "attention" | "commitments" | "audit" | "categories" | "dashboard" | "sources" | "settings";

export interface MenuItem {
  id: PageId;
  label: string;
  icon: string; // a plain symbol, no icon library needed yet
  permission: string;
  section: "Work" | "Set up";
  module?: string; // the module (one menu entry with tabs) this page belongs to, if any
}

// A module is one menu entry that holds several pages as tabs (DECISIONS 54).
export interface ModuleInfo {
  id: string;
  label: string;
  icon: string;
  section: "Work" | "Set up";
  blurb: string; // one line shown above the tabs
}

export const MODULES: ModuleInfo[] = [
  { id: "intake", label: "Intake", icon: "⇩", section: "Work", blurb: "Gifts come in from the CRM, are sorted into categories, checked and tracked." },
];

export const MENU: MenuItem[] = [
  { id: "work-orders", label: "Work orders", icon: "☰", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "intake" },
  { id: "attention", label: "Needs attention", icon: "!", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "intake" },
  { id: "commitments", label: "Commitments", icon: "↻", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "intake" },
  { id: "audit", label: "Audit", icon: "✓", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "intake" },
  { id: "dashboard", label: "Dashboard", icon: "◔", permission: PERMISSIONS.dashboards, section: "Work" },
  { id: "categories", label: "Categories", icon: "▦", permission: PERMISSIONS.mapFrameworks, section: "Set up", module: "intake" },
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

// One entry in the side menu: a plain page, or a module with its pages (shown as tabs).
export interface MenuEntry {
  id: string; // the module id, or the page id for a plain page
  label: string;
  icon: string;
  section: "Work" | "Set up";
  pages: MenuItem[]; // the pages this person may see in it, first is where the entry opens
  module?: ModuleInfo;
}

// Rule: pages of a module collapse into one entry placed where its first allowed page was. A module with no allowed page does not appear.
export function menuEntries(permissions: string[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const m of visibleMenu(permissions)) {
    const mod = m.module ? MODULES.find((x) => x.id === m.module) : undefined;
    if (!mod) {
      out.push({ id: m.id, label: m.label, icon: m.icon, section: m.section, pages: [m] });
      continue;
    }
    const have = out.find((e) => e.id === mod.id);
    if (have) have.pages.push(m);
    else out.push({ id: mod.id, label: mod.label, icon: mod.icon, section: mod.section, pages: [m], module: mod });
  }
  return out;
}
