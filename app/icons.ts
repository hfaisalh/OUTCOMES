/**
 * icons.ts
 *
 * What it does: the icon set for items and outcomes (DECISIONS 107): an orphan, a student, a Hifz student, an Aalim, a university student, a small pump,
 * a large pump, a solar well, a tanker, a house, a rickshaw, a trade cart, a medical camp and a care home. One consistent line style, drawn here as
 * small SVG shapes, so nothing is loaded from outside. It also suggests an icon from an item's name.
 * Who calls it: the Gifts list and window, the outcome types card and the icons card (app/pages.ts). Depends on: nothing. Pure.
 *
 * Rule: an item's icon is the one a person chose, else the one suggested from its name, else a plain dot. The icons carry no meaning on their own, so the
 * name is always beside them or in their tooltip.
 */

export interface IconInfo { id: string; label: string; paths: string }

export const ICONS: IconInfo[] = [
  { id: "orphan", label: "Orphan", paths: '<circle cx="12" cy="7" r="3.2"/><path d="M6.5 21v-5.2a5.5 5.5 0 0 1 11 0V21"/><path d="M10 12.2c.6.4 1.3.6 2 .6s1.4-.2 2-.6"/>' },
  { id: "student", label: "Student", paths: '<circle cx="12" cy="9.5" r="3"/><path d="M6 21v-3.5a6 6 0 0 1 12 0V21"/><path d="M5 6.2 12 3l7 3.2-7 3.1z"/>' },
  { id: "hifz", label: "Hifz student", paths: '<circle cx="9.5" cy="7.5" r="2.7"/><path d="M4.5 19v-3a5 5 0 0 1 10 0v3"/><path d="M14 11.5h6.5v8H14z"/><path d="M17.2 11.5v8M15.4 14h.01M19 14h.01"/>' },
  { id: "scholar", label: "Aalim", paths: '<path d="M7 8.5a5 5 0 0 1 10 0c0 1.3-.5 2.4-1.2 3.1H8.2A4.2 4.2 0 0 1 7 8.5z"/><path d="M8.2 11.6C8.8 12.8 10.2 13.6 12 13.6s3.2-.8 3.8-2"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/><path d="M12 14v7"/>' },
  { id: "uni", label: "University", paths: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11.2V15c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-3.8"/><path d="M21.5 9v5"/>' },
  { id: "pump", label: "Small pump", paths: '<path d="M9 21v-9a3 3 0 0 1 3-3h5"/><path d="M7 21h10"/><path d="M5.5 5.5 10 7M10 4l-1 5"/><path d="M17 9v2.5c0 .8.6 1.5 1.5 1.5"/><path d="M18.5 15.5c0 1-.7 1.7-.7 2.4a.7.7 0 0 0 1.4 0c0-.7-.7-1.4-.7-2.4z"/>' },
  { id: "pump-lg", label: "Large pump", paths: '<rect x="4" y="10" width="8" height="9" rx="1.5"/><path d="M8 10V6.5a2.5 2.5 0 0 1 2.5-2.5H15"/><path d="M15 4v3"/><path d="M3 21h13"/><path d="M12 14h3.5a2 2 0 0 1 2 2v3"/><path d="M19 12.5c0 1.1-.8 1.9-.8 2.7a.8.8 0 0 0 1.6 0c0-.8-.8-1.6-.8-2.7z"/>' },
  { id: "solar", label: "Solar well", paths: '<circle cx="17" cy="6" r="2.6"/><path d="M17 1.5v1M17 9.5v1M12.5 6h1M20.5 6h1M13.8 2.8l.7.7M19.5 8.5l.7.7M20.2 2.8l-.7.7"/><path d="M4 12.5h11l-1.2 8.5H5.2z"/><path d="M6 12.5V10h7v2.5M9.5 14.5v3"/>' },
  { id: "tanker", label: "Water tanker", paths: '<rect x="2" y="9" width="12" height="7" rx="3"/><path d="M14 11h4l3 3v2h-7"/><circle cx="6.5" cy="18" r="1.7"/><circle cx="17.5" cy="18" r="1.7"/>' },
  { id: "house", label: "House", paths: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>' },
  { id: "rickshaw", label: "Rickshaw", paths: '<circle cx="6" cy="17.5" r="3"/><circle cx="19" cy="17.5" r="2.5"/><path d="M6 17.5 9 9h5l3 8.5M9 9l-1-3H5"/><path d="M14 9l2.5-2.5H20M11 13h7"/>' },
  { id: "cart", label: "Trade cart", paths: '<path d="M3 4h2.5L8 15h9.5l2-8H6.5"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>' },
  { id: "medical", label: "Medical camp", paths: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>' },
  { id: "care", label: "Care home", paths: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M12 17.5c-2-1.4-3-2.4-3-3.7a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 1.3-1 2.3-3 3.7z"/>' },
];

export const ICON_IDS = ICONS.map((i) => i.id);
export const iconLabel = (id: string): string => ICONS.find((i) => i.id === id)?.label ?? "";

// Rule: the icon for a name, from words in it. The first match wins, so the more specific words come first. Blank when nothing fits.
const HINTS: [RegExp, string][] = [
  [/hifz|quran|hafiz/i, "hifz"], [/aalim|alim|scholar of|islamic scholar|dars/i, "scholar"], [/uni(versity)?\b|college|degree/i, "uni"],
  [/solar|well/i, "solar"], [/tanker/i, "tanker"], [/large pump|big pump|deep/i, "pump-lg"], [/pump|hand ?pump|water/i, "pump"],
  [/rickshaw|rikshaw|tuk/i, "rickshaw"], [/cart|trade|start ?up|shop|livelihood/i, "cart"],
  [/care home|orphan care|children'?s home/i, "care"], [/medical|clinic|health|camp/i, "medical"], [/home|house|shelter|build/i, "house"],
  [/orphan/i, "orphan"], [/scholarship|school|student|education/i, "student"],
];
export function suggestIcon(name: string): string {
  for (const [re, id] of HINTS) if (re.test(name)) return id;
  return "";
}

// Rule: the icon an item shows: the one chosen for it, else a suggestion from its name, else its outcome type's icon, else none.
export const itemIcon = (itemId: string, name: string, chosen: Record<string, string> = {}, typeIcon = ""): string => {
  const c = chosen[itemId];
  return c && ICON_IDS.includes(c) ? c : suggestIcon(name) || (ICON_IDS.includes(typeIcon) ? typeIcon : "");
};

// The icon as a small SVG inside a rounded tile. Empty when the id is not known.
export function iconHtml(id: string, label = "", size: "sm" | "lg" = "sm"): string {
  const i = ICONS.find((x) => x.id === id);
  if (!i) return "";
  const tip = label || i.label;
  return `<span class="ico ico-${size}" title="${tip.replace(/"/g, "&quot;")}" role="img" aria-label="${tip.replace(/"/g, "&quot;")}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${i.paths}</svg></span>`;
}
