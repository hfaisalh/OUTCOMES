/**
 * locations.ts
 *
 * What it does: the rules for validated places (DECISIONS 274). A place is chosen from a free place search instead of typed, so the spelling is the same every time and reports by location and a map of impact can be built later.
 * Who calls it: the place search handler (modules/00-platform/places-handler.ts), the Area pickers on the partner and staff screens, and the tests. Depends on nothing. Pure: no network, no database, so it can be ported (CLAUDE.md rule 4).
 * Data flow: the search answer (Photon, built on OpenStreetMap, free) is read by `readPlaces` into short Place suggestions. The one a person picks is kept on the beneficiary as the Area text plus its place id.
 *
 * Rules:
 * - Rule: only the level of a village, town, district or region is suggested, never a street or a house. A household address is never held (CLAUDE.md privacy).
 * - Rule: the text sent to the search is only the place name being typed. Nothing about a person goes with it.
 * - Rule: a person may use what they typed when no place is found. That is kept as an unchecked area, so MWF can see it and correct it later.
 */

// --- Types ---
export interface Place {
  id: string; // "osm:N281396083", the source and its own id, so the same place is never made twice
  name: string; // the place's own name
  district: string; // the district or county around it, when known
  region: string; // the state or province
  country: string;
  countryCode: string; // two letters, upper case
  lat: number;
  lon: number;
}

// --- The rules ---
export const MIN_QUERY = 3; // fewer letters find too many places and waste the free service
export const MAX_SUGGESTIONS = 6;

// A search text is cleaned: spaces tidied, cut to a length no place name needs, and too short ones refused.
export const cleanQuery = (s: unknown): string => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 80) : "");
export const usableQuery = (s: unknown): boolean => cleanQuery(s).length >= MIN_QUERY;

// The kinds of OpenStreetMap place that are village level or wider. Streets, buildings and shops are not in it.
const LEVELS = new Set(["city", "town", "village", "hamlet", "suburb", "neighbourhood", "quarter", "locality", "municipality", "county", "district", "state", "region", "province", "island", "borough", "city_block"]);

// The words shown for a place: "Kasur, Kasur District, Punjab, Pakistan". A part that repeats the one before it is left out.
export function label(p: Pick<Place, "name" | "district" | "region" | "country">): string {
  const parts: string[] = [];
  for (const x of [p.name, p.district, p.region, p.country]) if (x !== "" && parts[parts.length - 1] !== x) parts.push(x);
  return parts.join(", ");
}

// The same place typed in two ways is the same place: case, spaces and accents do not matter.
export const normPlace = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

interface PhotonFeature { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Reads the search answer into places. Anything that is not village level or wider, or has no name or position, is dropped; repeats are dropped.
export function readPlaces(answer: unknown): Place[] {
  const features = (answer as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const f of features as PhotonFeature[]) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    const type = str(p["osm_value"]), kind = str(p["osm_key"]);
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number" || str(p["name"]) === "") continue;
    if (!((kind === "place" && LEVELS.has(type)) || (kind === "boundary" && type === "administrative"))) continue;
    const id = `osm:${str(p["osm_type"])}${String(p["osm_id"] ?? "")}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(p["name"]), district: str(p["county"]) || str(p["district"]) || str(p["city"]), region: str(p["state"]), country: str(p["country"]), countryCode: str(p["countrycode"]).toUpperCase(), lat: Math.round(c[1] * 1e4) / 1e4, lon: Math.round(c[0] * 1e4) / 1e4 });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

// What the typed Area already is. "" when it is only text and no place was chosen; the place id when it matches one already known (so a person who retypes a chosen place is not asked again).
export function knownPlace(known: Place[], typed: string): Place | undefined {
  const n = normPlace(typed);
  return n === "" ? undefined : known.find((p) => normPlace(label(p)) === n);
}

// --- Accepting a place sent from a screen ---
// A place id is the source and the source's own id, nothing else.
export const validPlaceId = (s: unknown): s is string => typeof s === "string" && /^osm:[NWR]\d{1,15}$/.test(s);

// Reads a place sent from a screen into a clean Place, or undefined. Every text is cut to a sensible length and the position must be a real one, so nothing odd is kept.
export function acceptPlace(raw: unknown): Place | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const lat = r["lat"], lon = r["lon"];
  if (!validPlaceId(r["id"]) || text(r["name"], 80) === "" || typeof lat !== "number" || typeof lon !== "number" || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { id: r["id"], name: text(r["name"], 80), district: text(r["district"], 80), region: text(r["region"], 80), country: text(r["country"], 80), countryCode: text(r["countryCode"], 2).toUpperCase(), lat, lon };
}

// Adds a place to the organisation's list of places in use, or replaces the one with the same id.
export const upsertPlace = (list: Place[], p: Place): Place[] => [...list.filter((x) => x.id !== p.id), p];
