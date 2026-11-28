/**
 * rules-steps.test.ts
 *
 * What it does: tests the order-of-steps control on the Automation rules page (DECISIONS 293): what is drawn, the fixed ends, the keyboard alternative to dragging, and the clicks, drags and switches that send a new order. A small stand-in for the page is used for the events.
 * Who calls it: vitest. Depends on: rules-steps.ts and the order rules.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_STEPS, type Step } from "../../modules/09-allocation/order";
import { initStepOrder, stepsHtml } from "./rules-steps";

describe("the order of steps", () => {
  it("draws the three steps between two fixed ones, each draggable with arrows and a switch", () => {
    const html = stepsHtml(DEFAULT_STEPS);
    expect(html).toContain('aria-label="Allocation order, first to last"');
    expect(html.match(/ru-fixed/g)).toHaveLength(2);
    expect(html.match(/draggable="true"/g)).toHaveLength(3);
    expect(html.indexOf("Fixed: always first")).toBeLessThan(html.indexOf('data-step="own"'));
    expect(html.indexOf('data-step="fill"')).toBeLessThan(html.indexOf("Fixed: always last"));
    expect(html).toContain('data-step-on="priority"');
    expect(html).toMatch(/aria-label="Move The partner(&#39;|')s own beneficiaries down"/); // a keyboard way to move, as well as dragging
  });
  it("disables Move up on the first and Move down on the last, and dims a step that is off", () => {
    const html = stepsHtml([{ id: "fill", on: true }, { id: "own", on: false }, { id: "priority", on: true }]);
    expect(html).toMatch(/data-step-move="up" data-step-id="fill"[^>]*disabled/);
    expect(html).toMatch(/data-step-move="down" data-step-id="priority"[^>]*disabled/);
    expect(html).toMatch(/class="ru-step ru-off" draggable="true" data-step="own"/);
  });
});

// --- The events, with a very small stand-in for the page ---
type Handler = (e: unknown) => void;
function page() {
  const handlers: Record<string, Handler[]> = {};
  (globalThis as unknown as { document: unknown }).document = {
    addEventListener: (t: string, h: Handler) => { (handlers[t] ??= []).push(h); },
    querySelectorAll: () => ({ forEach: () => undefined }),
  };
  const fire = (t: string, e: unknown) => (handlers[t] ?? []).forEach((h) => h(e));
  return fire;
}
const li = (id: string, index: number) => ({ dataset: { step: id, index: String(index) }, classList: { add: () => undefined, remove: () => undefined } });
const on = (el: unknown) => ({ target: { closest: () => el } });

describe("the events of the list", () => {
  it("sends the new order when a step is dropped on another, and nothing when it is dropped where it was", () => {
    const fire = page();
    const sent: Step[][] = [];
    initStepOrder(() => DEFAULT_STEPS, (s) => sent.push(s));
    fire("dragstart", { ...on(li("fill", 2)), dataTransfer: { setData: () => undefined } });
    fire("drop", { ...on(li("own", 0)), preventDefault: () => undefined });
    expect(sent[0]?.map((s) => s.id)).toEqual(["fill", "own", "priority"]);
    fire("dragstart", { ...on(li("own", 0)), dataTransfer: { setData: () => undefined } });
    fire("drop", { ...on(li("own", 0)), preventDefault: () => undefined });
    expect(sent).toHaveLength(1);
  });
  it("moves a step with its arrow, and sends a step switched off", () => {
    const fire = page();
    const sent: Step[][] = [];
    initStepOrder(() => DEFAULT_STEPS, (s) => sent.push(s));
    fire("click", on({ dataset: { stepMove: "down", stepId: "own" } }));
    expect(sent[0]?.map((s) => s.id)).toEqual(["priority", "own", "fill"]);
    fire("click", on({ dataset: { stepMove: "up", stepId: "own" } })); // already first: nothing to send
    expect(sent).toHaveLength(1);
    fire("change", { target: { dataset: { stepOn: "priority" }, checked: false } });
    expect(sent[1]?.find((s) => s.id === "priority")?.on).toBe(false);
  });
});
