import { describe, expect, it } from "vitest";
import { NODE_R, bandOf, curve, layoutWinding } from "./windingMath";

const SIZE = { width: 1000, height: 360 };

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
  const layout = layoutWinding(4, SIZE);

  it("puts one step per decision, left to right, evenly spaced", () => {
    expect(layout.steps).toHaveLength(4);
    const xs = layout.steps.map((s) => s.x);
    expect(xs[0]).toBe(44 + NODE_R);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(layout.dx, 5);
  });

  it("swings between a high band and a low band, and keeps every step inside the frame with room for its label", () => {
    const ys = layout.steps.map((s) => s.y);
    expect(ys[1]).toBeGreaterThan(ys[0]); // down
    expect(ys[2]).toBeLessThan(ys[0]); // up
    expect(ys[3]).toBe(ys[1]);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(104);
      expect(y).toBeLessThanOrEqual(360 - 104);
    }
  });

  it("puts the label above the first step and the high ones, below the low ones", () => {
    expect(layout.steps.map((s) => s.above)).toEqual([true, false, true, false]);
  });

  it("the path starts at the first step and visits every other step, with one curve for each", () => {
    expect(layout.path.startsWith(`M ${layout.steps[0].x} ${layout.steps[0].y}`)).toBe(true);
    expect(layout.path.match(/C /g)).toHaveLength(3);
    for (const s of layout.steps.slice(1)) expect(layout.path).toContain(`${s.x} ${s.y}`);
  });

  it("the fork goes up and down from the last step, to the right of everything, with a flat tail each", () => {
    const last = layout.steps[3];
    expect(layout.upEnd.x).toBeGreaterThan(last.x);
    expect(layout.upEnd.y).toBeLessThan(layout.downEnd.y);
    expect(layout.upPath.startsWith(`M ${last.x} ${last.y}`)).toBe(true);
    expect(layout.upPath).toContain(`${layout.upEnd.x} ${layout.upEnd.y}`);
    expect(layout.upPath).toMatch(/L [\d.]+ [\d.]+$/);
    expect(layout.downPath).toContain(`${layout.downEnd.x} ${layout.downEnd.y}`);
  });

  it("fits a wide screen without stretching the steps further apart than the maximum", () => {
    const wide = layoutWinding(2, { width: 2400, height: 360 });
    expect(wide.dx).toBe(280);
    expect(wide.contentWidth).toBeGreaterThanOrEqual(2400);
  });

  it("grows wider than the screen, so it scrolls, rather than crowding the steps", () => {
    const many = layoutWinding(9, { width: 700, height: 360 });
    expect(many.dx).toBe(176);
    expect(many.contentWidth).toBeGreaterThan(700);
    expect(many.steps.at(-1)!.x + many.dx).toBeLessThan(many.contentWidth);
  });

  it("copes with one step, and with a tiny frame", () => {
    const one = layoutWinding(1, { width: 500, height: 100 });
    expect(one.steps).toHaveLength(1);
    expect(one.path).toBe(`M ${one.steps[0].x} ${one.steps[0].y}`); // a path of one point, no curves
    expect(one.height).toBe(280); // never shorter than a label above and below needs
    expect(layoutWinding(0, SIZE).steps).toHaveLength(1);
  });

  it("is a pure function: the same input gives the same path", () => {
    expect(layoutWinding(5, SIZE)).toEqual(layoutWinding(5, SIZE));
  });

  it("swings further the taller it is, and stays centred in its frame", () => {
    const tall = layoutWinding(4, { width: 1000, height: 600 });
    const swing = (l: typeof layout) => l.steps[1].y - l.steps[2].y;
    expect(swing(tall)).toBeGreaterThan(swing(layout));
    expect((tall.steps[1].y + tall.steps[2].y) / 2).toBeCloseTo(300, 5);
    expect((layout.steps[1].y + layout.steps[2].y) / 2).toBeCloseTo(180, 5);
  });
});
