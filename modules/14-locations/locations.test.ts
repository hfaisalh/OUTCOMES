/**
 * locations.test.ts
 *
 * What it does: tests the place rules and the place search (DECISIONS 274) with an invented search answer and a fake fetch, so nothing reaches the internet.
 * Who calls it: vitest. Depends on: locations.ts, search.ts. Doubles as an example of what the search service answers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cleanQuery, knownPlace, label, normPlace, readPlaces, usableQuery } from "./locations";
import { forgetSearches, searchPlaces, type Fetcher } from "./search";

const feature = (props: Record<string, unknown>, coordinates: unknown = [74.44783, 31.11751]) => ({ type: "Feature", properties: props, geometry: { coordinates } });
const city = feature({ osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "city", name: "Kasur", county: "Kasur District", state: "Punjab", country: "Pakistan", countrycode: "pk" });
const answer = { features: [city, feature({ osm_type: "W", osm_id: 2, osm_key: "highway", osm_value: "residential", name: "Kasur Road" }), feature({ osm_type: "N", osm_id: 1, osm_key: "place", osm_value: "city", name: "Kasur" }), feature({ osm_type: "N", osm_id: 3, osm_key: "place", osm_value: "village", name: "Chunian" }, "bad")] };

describe("reading the search answer", () => {
  it("keeps village level and wider places, with a short position, and drops streets, repeats and ones with no position", () => {
    const places = readPlaces(answer);
    expect(places).toEqual([{ id: "osm:N1", name: "Kasur", district: "Kasur District", region: "Punjab", country: "Pakistan", countryCode: "PK", lat: 31.1175, lon: 74.4478 }]);
  });
  it("gives nothing for an answer it does not understand", () => {
    expect(readPlaces(null)).toEqual([]);
    expect(readPlaces({ features: "x" })).toEqual([]);
  });
  it("reads a district boundary", () => {
    expect(readPlaces({ features: [feature({ osm_type: "R", osm_id: 9, osm_key: "boundary", osm_value: "administrative", name: "Kasur District" })] })).toHaveLength(1);
  });
});

describe("the words for a place", () => {
  it("joins the parts and leaves out one that repeats", () => {
    expect(label({ name: "Kasur", district: "Kasur", region: "Punjab", country: "Pakistan" })).toBe("Kasur, Punjab, Pakistan");
    expect(label({ name: "Chunian", district: "", region: "", country: "Pakistan" })).toBe("Chunian, Pakistan");
  });
  it("treats case, accents and spaces as the same", () => {
    expect(normPlace("  Kasúr,  PUNJAB ")).toBe("kasur punjab");
    const p = readPlaces(answer);
    expect(knownPlace(p, "kasur, kasur district, punjab, pakistan")?.id).toBe("osm:N1");
    expect(knownPlace(p, "Lahore")).toBeUndefined();
    expect(knownPlace(p, "  ")).toBeUndefined();
  });
  it("cleans and checks a search text", () => {
    expect(cleanQuery("  Kas   ur ")).toBe("Kas ur");
    expect(usableQuery("Ka")).toBe(false);
    expect(usableQuery("Kas")).toBe(true);
    expect(usableQuery(42)).toBe(false);
  });
});

describe("the place search", () => {
  let calls: string[];
  const fetcher = (ok = true, body: unknown = answer): Fetcher => async (url) => { calls.push(url); return { ok, json: async () => body }; };
  beforeEach(() => { calls = []; forgetSearches(); });

  it("sends only the typed place name, and returns the places", async () => {
    const places = await searchPlaces("Kasur", fetcher(), 1000);
    expect(places).toHaveLength(1);
    expect(calls[0]).toBe("https://photon.komoot.io/api/?q=Kasur&limit=15&lang=en");
  });
  it("does not ask for a text that is too short", async () => {
    expect(await searchPlaces("Ka", fetcher(), 1000)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
  it("keeps an answer for a day, then asks again", async () => {
    await searchPlaces("Kasur", fetcher(), 1000);
    await searchPlaces("kasur", fetcher(), 2000);
    expect(calls).toHaveLength(1);
    await searchPlaces("Kasur", fetcher(), 1000 + 25 * 3600 * 1000);
    expect(calls).toHaveLength(2);
  });
  it("gives an empty list, not an error, when the service fails", async () => {
    expect(await searchPlaces("Kasur", fetcher(false), 1000)).toEqual([]);
    expect(await searchPlaces("Lahore", async () => { throw new Error("offline"); }, 1000)).toEqual([]);
  });
});

describe("a place sent from a screen", () => {
  const sent = { id: "osm:N1", name: " Kasur ", district: "Kasur District", region: "Punjab", country: "Pakistan", countryCode: "pk", lat: 31.1, lon: 74.4 };
  it("is cleaned and accepted, or refused when it is not a real place", async () => {
    const { acceptPlace, upsertPlace } = await import("./locations");
    expect(acceptPlace(sent)).toMatchObject({ id: "osm:N1", name: "Kasur", countryCode: "PK" });
    expect(acceptPlace({ ...sent, id: "x:1" })).toBeUndefined();
    expect(acceptPlace({ ...sent, lat: 95 })).toBeUndefined();
    expect(acceptPlace({ ...sent, name: "" })).toBeUndefined();
    expect(acceptPlace("Kasur")).toBeUndefined();
    const once = upsertPlace([], acceptPlace(sent)!);
    expect(upsertPlace(once, acceptPlace({ ...sent, region: "Punjab Province" })!)).toHaveLength(1);
  });
});
