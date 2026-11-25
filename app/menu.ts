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
  approveRelease: "outcomes.approve_release", // a manager may approve releasing a sponsor's place after a missed payment (DECISIONS 74)
} as const;

export type PageId = "workflows" | "benefits" | "data-feed" | "data-files" | "work-orders" | "attention" | "outcomes" | "projects" | "partners" | "beneficiaries" | "outcome-records" | "outcome-list" | "assignment" | "placement" | "allocation" | "audit" | "categories" | "dashboard" | "sources" | "settings";

// Rule: the pages a link or a reload may open. Anything else (a mistyped or old address) is ignored and the usual first page is used.
export const PAGE_IDS: readonly PageId[] = ["workflows", "benefits", "data-feed", "data-files", "work-orders", "attention", "outcomes", "projects", "partners", "beneficiaries", "outcome-records", "outcome-list", "assignment", "placement", "allocation", "audit", "categories", "dashboard", "sources", "settings"];
export const isPageId = (x: string): x is PageId => (PAGE_IDS as readonly string[]).includes(x);

export interface MenuItem {
  id: PageId;
  label: string;
  icon: string; // a plain symbol, no icon library needed yet
  permission: string;
  section: "Work" | "Data" | "Set up";
  module?: string; // the module (one menu entry with tabs) this page belongs to, if any
}

// A module is one menu entry that holds several pages as tabs (DECISIONS 54).
export interface ModuleInfo {
  id: string;
  label: string;
  icon: string;
  section: "Work" | "Data" | "Set up";
  blurb: string; // one line shown above the tabs
}

export const MODULES: ModuleInfo[] = [
  { id: "allocation", label: "Allocation", icon: "⇄", section: "Work", blurb: "Allocate gifts to beneficiaries, and see every beneficiary month by month." },
  { id: "data", label: "Data", icon: "⇅", section: "Data", blurb: "Gifts come in from the CRM, are checked here, and then appear in Gifts." },
  { id: "setup", label: "Settings", icon: "⚙", section: "Set up", blurb: "What needs a person, workflows, benefits and the organisation." },
];

// Rule (DECISIONS 66, 76): the side menu has the gifts, then the three registers (Projects, Partners, Beneficiaries), then Allocation, which matches gifts to beneficiaries. Everything about setting up and checking
// sits behind the Settings gear. Gifts holds both the payments and the commitments (a switch on the page), since they are one thing seen two ways.
export const MENU: MenuItem[] = [
  { id: "work-orders", label: "Gifts", icon: "☰", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "projects", label: "Projects", icon: "▥", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "partners", label: "Partners", icon: "▤", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "beneficiaries", label: "Beneficiaries", icon: "☺", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "outcome-records", label: "Outcomes", icon: "◎", permission: PERMISSIONS.viewWorkOrders, section: "Work" },
  { id: "assignment", label: "Assignment", icon: "⇉", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "allocation" },
  { id: "placement", label: "Allocate", icon: "⇄", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "allocation" },
  { id: "allocation", label: "Allocate (older)", icon: "⇄", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "allocation" },
  { id: "outcomes", label: "Month by month", icon: "◎", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "allocation" },
  // Rule (DECISIONS 165): the older list of what gifts are placed on is not a main menu entry. Outcomes are made by the workflow, so it sits under Allocation until Allocation is rewired onto outcomes in clusters, then it goes.
  { id: "outcome-list", label: "Outcome records (older)", icon: "◍", permission: PERMISSIONS.viewWorkOrders, section: "Work", module: "allocation" },
  { id: "dashboard", label: "Dashboard", icon: "◔", permission: PERMISSIONS.dashboards, section: "Work" },
  // Data (DECISIONS 92): everything about getting gifts in sits in its own area, as in a CRM's data integration. Gifts only shows the result.
  { id: "data-feed", label: "CRM connection", icon: "⇅", permission: PERMISSIONS.settings, section: "Data", module: "data" },
  { id: "data-files", label: "Upload files", icon: "⇪", permission: PERMISSIONS.settings, section: "Data", module: "data" },
  { id: "audit", label: "Audit", icon: "✓", permission: PERMISSIONS.viewWorkOrders, section: "Data", module: "data" },
  { id: "sources", label: "Other sources", icon: "⇪", permission: PERMISSIONS.otherSources, section: "Data", module: "data" },
  { id: "attention", label: "Needs attention", icon: "!", permission: PERMISSIONS.viewWorkOrders, section: "Set up", module: "setup" },
  { id: "workflows", label: "Workflows", icon: "◈", permission: PERMISSIONS.mapFrameworks, section: "Set up", module: "setup" },
  { id: "benefits", label: "Benefits", icon: "◉", permission: PERMISSIONS.mapFrameworks, section: "Set up", module: "setup" },
  { id: "settings", label: "Organisation", icon: "⚙", permission: PERMISSIONS.settings, section: "Set up", module: "setup" },
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
  section: "Work" | "Data" | "Set up";
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
