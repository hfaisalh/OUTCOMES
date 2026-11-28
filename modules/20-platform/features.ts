/**
 * features.ts
 *
 * What it does: the feature switches of each organisation (DECISIONS 332). There is one deployed version of OUTCOMES for every organisation, so a new feature reaches all of them at once. A switch lets a feature be built OFF for everyone, then switched on for the test organisation first, then for the real one. A feature already in use is registered with its switch ON by default, so nothing changes for anyone until a person turns it off.
 * Who calls it: the server (the feature-set request, the scheduled run, the partner screen), the menu and the screens (app/menu.ts, app/main.ts), and the Organisation page. Depends on: nothing. Pure: no database, no screen, so it can be ported (CLAUDE.md rule 4).
 *
 * Rules:
 * - Rule: a feature with no saved choice takes its default from this list. Only a registered feature can be switched, so a request cannot invent one.
 * - Rule: a new feature is added here with default false, and its screens and jobs check the switch before they show or run. A feature that is off is not shown and does not run.
 * - Rule: switching a feature changes nothing in the saved data: switching it off hides it, and switching it on shows what was there.
 */

export interface Feature { id: string; label: string; what: string; default: boolean }

export const FEATURES: Feature[] = [
  { id: "home", label: "Home and the setup guide", what: "The Home page with its doors and the setup guide. Off: staff land on Gifts, as before.", default: true },
  { id: "partnerDashboard", label: "Partner dashboard and inbox", what: "The dashboard, quality score and bell on the partner's home screen. Off: the partner's screen is as it was before them.", default: true },
  { id: "automation", label: "The daily automatic run", what: "The scheduled run after the CRM pick-up: reminders, moving unanswered gifts, and Assign or Allocate where switched on. Off: it does not run by itself (Run now still works).", default: true },
];

export const featureById = (id: string): Feature | undefined => FEATURES.find((f) => f.id === id);

// Is a feature on? The organisation's own choice, else the default. An unknown feature is off.
export const featureOn = (saved: Record<string, boolean> | undefined, id: string): boolean => { const f = featureById(id); return f === undefined ? false : (saved?.[id] ?? f.default); };

// Every feature with its state, as the screens and the server hand it around.
export const resolvedFeatures = (saved: Record<string, boolean> | undefined): Record<string, boolean> => Object.fromEntries(FEATURES.map((f) => [f.id, featureOn(saved, f.id)]));

export function setFeature(saved: Record<string, boolean> | undefined, id: unknown, on: unknown): { value: Record<string, boolean> } | { error: string } {
  if (typeof id !== "string" || !featureById(id)) return { error: "That feature is not known." };
  if (typeof on !== "boolean") return { error: "A feature is on or off." };
  return { value: { ...(saved ?? {}), [id]: on } };
}
