/**
 * setup-card.test.ts
 *
 * What it does: tests the Getting started card (DECISIONS 296): steps are ticked by what is really in the system, the next one is marked, the card disappears when all are done, and every step is a link. Invented data.
 * Who calls it: vitest. Depends on: setup-card.ts.
 */
import { describe, expect, it } from "vitest";
import { setupCard, setupSteps, withSetupCard } from "./setup-card";
import type { View } from "../shared/pages";

const empty = { workOrders: [], frameworks: [], projects: [], giftProjects: [], beneficiaries: { records: [], counters: {} }, assignments: { records: [], counter: 0 } } as unknown as View;
const full = { workOrders: [{ key: "a", categoryId: "wf" }], frameworks: [{ id: "wf" }], projects: [{ id: "p1" }], giftProjects: [{ id: "g1", partnerIds: ["p1"] }], beneficiaries: { records: [{ id: "PRS-1" }], counters: {} }, assignments: { records: [{ key: "a" }], counter: 1 } } as unknown as View;

describe("the Getting started card", () => {
  it("starts with nothing done and marks the first step as next, each step a link to its page", () => {
    const html = setupCard(empty);
    expect(html).toContain("0 of 6 steps done");
    expect(html).toContain('data-page="data-feed">Bring gifts in</a>');
    expect(html.match(/su-next/g)).toHaveLength(1);
    expect(html).toContain('aria-valuenow="0"');
    expect(setupSteps(empty).every((s) => !s.done)).toBe(true);
  });
  it("ticks a step when the work is really there, and moves Next on", () => {
    const html = setupCard({ ...empty, workOrders: [{ key: "a" }], projects: [{ id: "p1" }] } as unknown as View);
    expect(html).toContain("2 of 6 steps done");
    expect(html).toMatch(/su-step su-done[^>]*>.*?Bring gifts in/s);
    expect(html).toMatch(/su-step su-next[^>]*>.*?Say what happens to each kind of gift/s); // the first step not done
  });
  it("a project with no partner does not count as set up", () => {
    expect(setupSteps({ ...full, giftProjects: [{ id: "g1", partnerIds: [] }] } as unknown as View).find((s) => s.id === "projects")?.done).toBe(false);
  });
  it("says Done in words (not colour alone) and disappears when everything is done", () => {
    expect(setupCard({ ...empty, workOrders: [{ key: "a" }] } as unknown as View)).toContain(">Done<");
    expect(setupCard(full)).toBe("");
  });
});

describe("where the card sits", () => {
  it("goes under the page's title and introduction, and leaves the page alone when everything is done", () => {
    const page = '<h1>Dashboard</h1><p class="sub">Intro.</p><div class="metrics"></div>';
    const out = withSetupCard(page, empty);
    expect(out.indexOf("<h1>Dashboard</h1>")).toBeLessThan(out.indexOf("Getting started"));
    expect(out.indexOf("Getting started")).toBeLessThan(out.indexOf('<div class="metrics">'));
    expect(withSetupCard(page, full)).toBe(page);
  });
});
