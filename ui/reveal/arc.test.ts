import { describe, expect, it } from "vitest";
import { DOCK_MS, STAGGER_MS, arcKeyframes, arcOffset, defaultLift, easeInOutCubic } from "./arc";

const arc = { dx: -800, dy: 520, lift: 120 };

describe("easing", () => {
  it("starts at 0, ends at 1, and is slow at both ends and quick in the middle", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe("the arc", () => {
  it("starts exactly at the old place and ends exactly at the new one", () => {
    expect(arcOffset(arc, 0)).toEqual({ x: -800, y: 520 });
    const end = arcOffset(arc, 1);
    expect(end.x).toBeCloseTo(0, 10);
    expect(end.y).toBeCloseTo(0, 10);
  });

  it("is the straight line between them, lifted by a parabola that is highest in the middle", () => {
    // at half way the straight line is half way along, and the chip is `lift` above it
    const mid = arcOffset(arc, 0.5);
    expect(mid.x).toBeCloseTo(-400, 6);
    expect(mid.y).toBeCloseTo(260 - 120, 6);
  });

  it("is a true parabola about the straight line: lift * 4p(1-p), symmetric, zero at both ends", () => {
    for (const t of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
      const p = easeInOutCubic(t);
      const { x, y } = arcOffset(arc, t);
      const line = { x: arc.dx * (1 - p), y: arc.dy * (1 - p) };
      expect(x).toBeCloseTo(line.x, 8);
      expect(y - line.y).toBeCloseTo(-arc.lift * 4 * p * (1 - p), 8);
    }
    // symmetric in progress: the same lift at p and at 1 - p
    const lift = (p: number) => -4 * p * (1 - p);
    expect(lift(0.2)).toBeCloseTo(lift(0.8), 12);
    expect(lift(0)).toBe(-0);
    expect(lift(1)).toBe(-0);
  });

  it("always bulges upward, whichever way it is going", () => {
    for (const a of [{ dx: -800, dy: 520 }, { dx: 800, dy: -520 }, { dx: 400, dy: 0 }, { dx: 0, dy: 300 }]) {
      const mid = arcOffset({ ...a, lift: 100 }, 0.5);
      expect(mid.y).toBeLessThan(a.dy / 2); // higher on screen (smaller y) than the straight line
    }
  });

  it("brings it in smoothly: sideways distance only ever shrinks", () => {
    let last = Infinity;
    for (let i = 0; i <= 40; i++) {
      const x = Math.abs(arcOffset(arc, i / 40).x);
      expect(x).toBeLessThanOrEqual(last + 1e-9);
      last = x;
    }
  });

  it("clamps progress outside 0 to 1", () => {
    expect(arcOffset(arc, -1)).toEqual(arcOffset(arc, 0));
    expect(arcOffset(arc, 2)).toEqual(arcOffset(arc, 1));
  });
});

describe("lift", () => {
  it("is a quarter of the way, kept between 36 and 160 px", () => {
    expect(defaultLift(0, 0)).toBe(36);
    expect(defaultLift(100, 0)).toBe(36);
    expect(defaultLift(300, 400)).toBeCloseTo(140, 8); // distance 500
    expect(defaultLift(3000, 4000)).toBe(160);
  });

  it("is used when none is given", () => {
    const a = arcOffset({ dx: 300, dy: 400 }, 0.5);
    expect(a.y).toBeCloseTo(200 - 140, 6);
  });
});

describe("keyframes", () => {
  const frames = arcKeyframes({ ...arc, steps: 20 });

  it("samples the arc evenly, from 0 to 1", () => {
    expect(frames).toHaveLength(21);
    expect(frames.map((f) => f.offset)).toEqual(Array.from({ length: 21 }, (_, i) => i / 20));
  });

  it("opens at the old place and closes at rest", () => {
    expect(frames[0].transform).toBe("translate(-800.00px, 520.00px)");
    expect(frames.at(-1)!.transform).toBe("translate(0.00px, 0.00px)");
  });

  it("is smooth enough that no frame jumps further than a few percent of the trip", () => {
    const pos = frames.map((f) => /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(f.transform)!.slice(1).map(Number));
    const trip = Math.hypot(arc.dx, arc.dy);
    for (let i = 1; i < pos.length; i++) expect(Math.hypot(pos[i][0] - pos[i - 1][0], pos[i][1] - pos[i - 1][1])).toBeLessThan(trip * 0.2);
  });

  it("defaults to 28 samples, and never fewer than 2", () => {
    expect(arcKeyframes({ dx: 10, dy: 10 })).toHaveLength(29);
    expect(arcKeyframes({ dx: 10, dy: 10, steps: 0 })).toHaveLength(3);
  });

  it("is slow enough to follow and quick enough not to drag", () => {
    expect(DOCK_MS).toBeGreaterThanOrEqual(800);
    expect(DOCK_MS).toBeLessThanOrEqual(1200);
    expect(STAGGER_MS).toBeGreaterThan(0);
    expect(STAGGER_MS * 4).toBeLessThan(DOCK_MS / 2);
  });
});
