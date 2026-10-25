import { describe, expect, it } from "vitest";
import { ENDPOINT_GAP, ENDPOINT_H, ENDPOINT_W, MIN_HEIGHT, NODE_R, bandOf, curve, layoutWinding } from "./windingMath";

const SIZE = { width: 1000, height: 340 };

describe("bands", () => {
  it("start in the middle, then low, high, low, high", () => {
    expect([0, 1, 2, 3, 4, 5].map(bandOf)).toEqual(["mid", "low", "high", "low", "high", "low"]);
  });
});

describe("curve", () => {
  it("leaves flat and arrives flat, through the middle", () => {
    expect(curve(0, 100, 200, 300)).toBe("C 100 100 100 300 200 300");
    expect(curve(10, 50, 10, 50)).toBe("C 10 50 10 50 10 50");
  });
});

describe("layoutWinding", () => {
  // three numbered steps, then the fork
  const layout = layoutWinding(3, SIZE);

  it("puts one step per event, left to right, evenly spaced, and keeps the fork out of them", () => {
    expect(layout.steps).toHaveLength(3);
    const xs = layout.steps.map((s) => s.x);
    expect(xs[0]).toBe(44 + NODE_R);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(layout.dx, 5);
    expect(layout.steps).not.toContain(layout.fork);
  });

  it("sets the fork apart: further from the last step than the steps are from each other", () => {
    const last = layout.steps[2];
    expect(layout.fork.x - last.x).toBeCloseTo(layout.dx + 40, 5);
  });

  it("draws a thin divider between the last step's label and the fork marker, top to bottom", () => {
    const last = layout.steps[2];
    const labelRight = last.x - NODE_R + (layout.dx - 24);
    expect(layout.divider.x).toBeGreaterThan(labelRight);
    expect(layout.divider.x).toBeLessThan(layout.fork.x - NODE_R);
    expect(layout.divider.top).toBeGreaterThan(0);
    expect(layout.divider.bottom).toBeLessThan(layout.height);
    expect(layout.divider.bottom).toBeGreaterThan(layout.divider.top);
  });

  it("swings between a high band and a low band, and keeps every step inside the frame with room for its label", () => {
    const ys = layout.steps.map((s) => s.y);
    expect(ys[1]).toBeGreaterThan(ys[0]); // down
    expect(ys[2]).toBeLessThan(ys[0]); // up
    for (const y of [...ys, layout.fork.y]) {
      expect(y).toBeGreaterThanOrEqual(112);
      expect(y).toBeLessThanOrEqual(340 - 112);
    }
  });

  it("puts the label above the first step and the high ones, below the low ones, and the fork's by the same rule", () => {
    expect(layout.steps.map((s) => s.above)).toEqual([true, false, true]);
    expect(bandOf(3)).toBe("low");
    expect(layout.fork.above).toBe(false);
  });

  it("the path starts at the first step, visits every other step and then the fork, with one curve for each", () => {
    expect(layout.path.startsWith(`M ${layout.steps[0].x} ${layout.steps[0].y}`)).toBe(true);
    expect(layout.path.match(/C /g)).toHaveLength(3);
    for (const s of [...layout.steps.slice(1), layout.fork]) expect(layout.path).toContain(`${s.x} ${s.y}`);
  });

  it("the two ways leave the fork marker, one up and one down, each with a flat run at the end", () => {
    expect(layout.upEnd.x).toBeGreaterThan(layout.fork.x);
    expect(layout.upEnd.y).toBeLessThan(layout.downEnd.y);
    expect(layout.upPath.startsWith(`M ${layout.fork.x} ${layout.fork.y}`)).toBe(true);
    expect(layout.downPath.startsWith(`M ${layout.fork.x} ${layout.fork.y}`)).toBe(true);
    expect(layout.upPath).toMatch(new RegExp(`L ${layout.upEnd.x} ${layout.upEnd.y}$`));
    expect(layout.downPath).toMatch(new RegExp(`L ${layout.downEnd.x} ${layout.downEnd.y}$`));
  });

  it("the two end boxes sit clear of each other, inside the frame, and inside the width the path asks for", () => {
    for (const l of [layout, layoutWinding(1, SIZE), layoutWinding(6, { width: 700, height: MIN_HEIGHT })]) {
      expect(l.downEnd.y - l.upEnd.y).toBeGreaterThanOrEqual(ENDPOINT_H + 8);
      expect(l.upEnd.y - ENDPOINT_H / 2).toBeGreaterThanOrEqual(0);
      expect(l.downEnd.y + ENDPOINT_H / 2).toBeLessThanOrEqual(l.height);
      expect(l.contentWidth).toBeGreaterThanOrEqual(l.upEnd.x + ENDPOINT_GAP + ENDPOINT_W);
    }
  });

  it("fits a wide screen without stretching the steps further apart than the maximum", () => {
    const wide = layoutWinding(2, { width: 2400, height: 340 });
    expect(wide.dx).toBe(300);
    expect(wide.contentWidth).toBeGreaterThanOrEqual(2400);
  });

  it("uses the full width of a wide screen for the path and its two boxes, not a narrow strip", () => {
    const l = layoutWinding(3, { width: 1200, height: 340 });
    expect(l.contentWidth).toBe(1200); // everything fits, nothing scrolls
    expect(l.upEnd.x + ENDPOINT_GAP + ENDPOINT_W).toBeLessThanOrEqual(1200);
    expect(l.dx).toBeGreaterThan(192);
  });

  it("grows wider than the screen, so it scrolls, rather than crowding the steps", () => {
    const many = layoutWinding(8, { width: 700, height: 340 });
    expect(many.dx).toBe(192);
    expect(many.contentWidth).toBeGreaterThan(700);
    expect(many.fork.x).toBeLessThan(many.contentWidth);
  });

  it("copes with no steps at all, and with a tiny frame", () => {
    const none = layoutWinding(0, { width: 500, height: 100 });
    expect(none.steps).toHaveLength(0);
    expect(none.path).toBe(`M ${none.fork.x} ${none.fork.y}`); // a path of one point, no curves
    expect(none.height).toBe(MIN_HEIGHT); // never shorter than a label and a box on each way need
    expect(layoutWinding(-3, SIZE).steps).toHaveLength(0);
  });

  it("is a pure function: the same input gives the same path", () => {
    expect(layoutWinding(5, SIZE)).toEqual(layoutWinding(5, SIZE));
  });

  it("swings further the taller it is, and stays centred in its frame", () => {
    const tall = layoutWinding(3, { width: 1000, height: 600 });
    const swing = (l: typeof layout) => l.steps[1].y - l.steps[2].y;
    expect(swing(tall)).toBeGreaterThan(swing(layout));
    expect((tall.steps[1].y + tall.steps[2].y) / 2).toBeCloseTo(300, 5);
    expect((layout.steps[1].y + layout.steps[2].y) / 2).toBeCloseTo(170, 5);
  });
});
