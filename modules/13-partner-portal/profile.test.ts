/**
 * profile.test.ts
 *
 * What it does: tests that a partner changes only its own part of the one partner profile (DECISIONS 281). Invented partners.
 * Who calls it: vitest. Depends on: profile.ts.
 */
import { describe, expect, it } from "vitest";
import type { Project } from "../06-projects/projects";
import { setOwnProfile } from "./profile";

const partner = (id: string, over: Partial<Project> = {}): Project => ({ id, name: `Partner ${id}`, type: "NGO", status: "active", fundingNote: "private", ddStatus: "approved", notes: "MWF only", capacity: 40, aliases: [], levels: [], types: [], ...over }) as Project;
const two = [partner("p1", { reportVia: "email" }), partner("p2")];
const ok = (b: Record<string, unknown>, list = two) => { const r = setOwnProfile(list, "p1", b); if ("error" in r) throw new Error(r.error); return r.value; };

describe("a partner changes its own part of the profile", () => {
  it("sets contacts, how it reports, its language and media capacity, cleaned", () => {
    const [p1] = ok({ contacts: [{ name: "  Amina   Khan ", email: "amina@example.org", phone: "0300 000" }, { name: "", phone: "", email: "" }], reportVia: "WhatsApp", language: "Urdu", media: "Two cameras" });
    expect(p1).toMatchObject({ contacts: [{ name: "Amina Khan", email: "amina@example.org", phone: "0300 000" }], reportVia: "WhatsApp", language: "Urdu", media: "Two cameras" });
  });
  it("leaves everything that is MWF's as it was, even when the request names it", () => {
    const [p1] = ok({ name: "Hacked", status: "pending", fundingNote: "open", notes: "x", capacity: 9999, ddStatus: "none", reportVia: "email" });
    expect(p1).toMatchObject({ name: "Partner p1", status: "active", fundingNote: "private", notes: "MWF only", capacity: 40, ddStatus: "approved" });
  });
  it("never touches another partner", () => {
    expect(ok({ reportVia: "portal" })[1]).toEqual(two[1]);
  });
  it("keeps what the request does not mention, and clears what is sent empty", () => {
    expect(ok({ language: "Urdu" })[0]?.reportVia).toBe("email");
    expect(ok({ reportVia: "" })[0]).not.toHaveProperty("reportVia");
  });
  it("refuses a contact with no name, a bad email, and too many contacts, in plain words", () => {
    expect(setOwnProfile(two, "p1", { contacts: [{ name: "", phone: "1" }] })).toEqual({ error: "Give each contact a name." });
    expect(setOwnProfile(two, "p1", { contacts: [{ name: "A", email: "nope" }] })).toEqual({ error: "An email address is not written correctly." });
    expect(setOwnProfile(two, "p1", { contacts: Array.from({ length: 6 }, () => ({ name: "A" })) })).toEqual({ error: "Give at most 5 contacts." });
    expect(setOwnProfile(two, "p9", {})).toEqual({ error: "This partner was not found." });
  });
});
