/** features.test.ts: the feature switches of an organisation (decision 332). Examples of the rules in features.ts. */
import { describe, expect, it } from "vitest";
import { featureOn, FEATURES, resolvedFeatures, setFeature } from "./features";

describe("feature switches", () => {
  it("uses the default when the organisation has made no choice, and an unknown feature is off", () => {
    expect(featureOn(undefined, "home")).toBe(true); // already in use, so on until someone turns it off
    expect(featureOn({}, "automation")).toBe(true);
    expect(featureOn({ home: false }, "home")).toBe(false);
    expect(featureOn({ nothing: true }, "nothing")).toBe(false);
  });
  it("resolves every registered feature, with the organisation's choices on top", () => {
    const r = resolvedFeatures({ partnerDashboard: false });
    expect(Object.keys(r)).toEqual(FEATURES.map((f) => f.id));
    expect(r["partnerDashboard"]).toBe(false);
    expect(r["home"]).toBe(true);
  });
  it("switches only a registered feature, on or off, and keeps the other choices", () => {
    expect(setFeature({ home: false }, "automation", false)).toEqual({ value: { home: false, automation: false } });
    expect("error" in setFeature({}, "invented", true)).toBe(true);
    expect("error" in setFeature({}, "home", "yes")).toBe(true);
  });
});
