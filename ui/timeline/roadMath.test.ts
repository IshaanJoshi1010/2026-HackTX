import { describe, expect, it } from "vitest";
import type { ProjectionPoint, SimulationResult } from "@/contracts";
import {
  RANGE_FLOOR,
  assignLevels,
  deltaAt,
  deltaSeries,
  drawnRange,
  effectPhrase,
  levelOffset,
  roadMid,
  roadPath,
  roadX,
  roadY,
  smoothSeries,
  spreadLabels,
  type Frame,
} from "./roadMath";

const point = (month: number, net: number): ProjectionPoint => ({
  month,
  vehicleId: "v",
  mileage: 0,
  fuelSpend: 0,
  maintenanceSpend: 0,
  vehicleValue: 0,
  loanBalance: 0,
  cumulativeCash: 0,
  netEconomicCost: net,
  suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
});

const result = (id: string, points: ProjectionPoint[]): SimulationResult => ({
  scenarioId: id,
  points,
  milestones: [],
  warnings: [],
  summary: { totalCash: 0, netCost: 0 },
});

/** Net cost grows 100 a month for the baseline; a future adds `extra` a month from month `from`. */
const baseline = result("base", Array.from({ length: 60 }, (_, i) => point(i + 1, (i + 1) * 100)));
const future = (extra: number, from: number) =>
  result("f", Array.from({ length: 60 }, (_, i) => point(i + 1, (i + 1) * 100 + extra * Math.max(0, i + 1 - from + 1))));

const FRAME: Frame = { width: 600, height: 400, padTop: 100, padBottom: 100 }; // mid y 200, half 100

describe("deltaSeries", () => {
  it("starts at month 0 with no drift, because every future starts in the same place", () => {
    expect(deltaSeries(future(10, 12), baseline)[0]).toEqual({ month: 0, delta: 0 });
  });

  it("is zero everywhere for the baseline against itself", () => {
    expect(deltaSeries(baseline, baseline).every((p) => p.delta === 0)).toBe(true);
  });

  it("drift is net cost minus the baseline's, so a costly decision is positive", () => {
    const s = deltaSeries(future(10, 12), baseline);
    expect(deltaAt(s, 11)).toBe(0); // before the decision
    expect(deltaAt(s, 12)).toBe(10); // month 12 is the first month of drift
    expect(deltaAt(s, 60)).toBe(490);
  });

  it("a saving is negative", () => {
    expect(deltaAt(deltaSeries(future(-5, 1), baseline), 10)).toBe(-50);
  });

  it("handles points that start at month 1, and ones that start at 0", () => {
    const from0 = result("z", [point(0, 0), ...baseline.points]);
    expect(deltaSeries(from0, baseline)).toHaveLength(61);
    expect(deltaSeries(from0, baseline).filter((p) => p.month === 0)).toHaveLength(1);
  });

  it("sorts unsorted points and skips months the baseline does not have", () => {
    const messy = result("m", [point(3, 330), point(1, 100), point(99, 1), point(2, 200)]);
    expect(deltaSeries(messy, baseline).map((p) => p.month)).toEqual([0, 1, 2, 3]);
  });

  it("is just the starting point when there is nothing to compare", () => {
    expect(deltaSeries(undefined, baseline)).toEqual([{ month: 0, delta: 0 }]);
    expect(deltaSeries(baseline, undefined)).toEqual([{ month: 0, delta: 0 }]);
  });

  it("deltaAt is undefined where there is no point", () => {
    expect(deltaAt(deltaSeries(baseline, baseline), 99)).toBeUndefined();
    expect(deltaAt(deltaSeries(baseline, baseline), 0)).toBe(0);
  });
});

describe("smoothSeries", () => {
  const line = (deltas: number[]) => deltas.map((delta, month) => ({ month, delta }));

  it("removes a one month blip, which is what makes a thick road look wobbly", () => {
    const blip = line([0, 0, 0, 0, 300, 0, 0, 0, 0]);
    expect(smoothSeries(blip).map((p) => p.delta)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("removes a blip on a rising road, which stays a rising road close to where it was", () => {
    const rising = line([0, 10, 20, 30, 140, 50, 60, 70, 80]); // 140 is a blip on the line 0, 10, 20 ...
    const out = smoothSeries(rising).map((p) => p.delta);
    expect(Math.max(...out)).toBeLessThanOrEqual(80); // the spike is gone
    out.forEach((v, i) => {
      if (i > 0) expect(v).toBeGreaterThanOrEqual(out[i - 1]); // still only rising
      expect(Math.abs(v - i * 10)).toBeLessThanOrEqual(20); // within two steps of the true line
    });
  });

  it("never bends the road before the decision that bends it", () => {
    // flat until month 4, then it rises: nothing before month 4 may move
    const out = smoothSeries(line([0, 0, 0, 0, 10, 20, 30, 40, 50, 60]));
    expect(out.slice(0, 4).map((p) => p.delta)).toEqual([0, 0, 0, 0]);
    expect(out.at(-1)?.delta).toBe(60);
  });

  it("keeps a step edge exactly where it is", () => {
    const step = line([0, 0, 0, 0, 100, 100, 100, 100, 100]);
    expect(smoothSeries(step).map((p) => p.delta)).toEqual(step.map((p) => p.delta));
  });

  it("keeps the start and the end exactly, so the road meets its label", () => {
    const s = line([0, 50, 400, 120, 90, 700]);
    const out = smoothSeries(s);
    expect(out[0]).toEqual(s[0]);
    expect(out.at(-1)).toEqual(s.at(-1));
  });

  it("leaves a straight ramp exactly alone, in either direction", () => {
    const up = line([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(smoothSeries(up)).toEqual(up);
    const down = line([0, -10, -20, -30, -40, -50]);
    expect(smoothSeries(down)).toEqual(down);
  });

  it("keeps every month and its order, and does not change what it was given", () => {
    const s = line([0, 5, 1, 8, 2, 9]);
    const copy = JSON.stringify(s);
    const out = smoothSeries(s, 1);
    expect(out.map((p) => p.month)).toEqual(s.map((p) => p.month));
    expect(JSON.stringify(s)).toBe(copy);
  });

  it("does nothing with no radius or too few points", () => {
    const s = line([0, 9, 0]);
    expect(smoothSeries(s, 0)).toBe(s);
    expect(smoothSeries(line([0, 5]))).toEqual(line([0, 5]));
    expect(smoothSeries([])).toEqual([]);
  });
});

describe("drawnRange", () => {
  it("never goes below the floor, so a small difference stays a gentle bend", () => {
    expect(drawnRange([deltaSeries(future(1, 1), baseline)])).toBe(RANGE_FLOOR);
    expect(drawnRange([])).toBe(RANGE_FLOOR);
  });

  it("grows to fit the biggest drift in any road, in either direction", () => {
    expect(drawnRange([deltaSeries(future(100, 1), baseline)])).toBe(6000);
    expect(drawnRange([deltaSeries(future(-100, 1), baseline), deltaSeries(future(10, 1), baseline)])).toBe(6000);
  });
});

describe("roadY", () => {
  it("no drift is the middle line", () => {
    expect(roadY(0, 1000, FRAME)).toBe(200);
    expect(roadMid(FRAME)).toBe(200);
  });

  it("costing more goes down and saving goes up", () => {
    expect(roadY(500, 1000, FRAME)).toBe(250);
    expect(roadY(-500, 1000, FRAME)).toBe(150);
    expect(roadY(1000, 1000, FRAME)).toBe(300);
    expect(roadY(-1000, 1000, FRAME)).toBe(100);
  });

  it("never leaves the frame", () => {
    expect(roadY(99999, 1000, FRAME)).toBe(300);
    expect(roadY(-99999, 1000, FRAME)).toBe(100);
  });

  it("a zero range stays on the middle instead of dividing by zero", () => {
    expect(roadY(50, 0, FRAME)).toBe(200);
  });
});

describe("roadPath", () => {
  it("starts at the left on the middle line and ends at the right edge", () => {
    const d = roadPath(deltaSeries(future(10, 12), baseline), 1500, FRAME);
    expect(d.startsWith("M 0 200")).toBe(true);
    expect(d).toMatch(/L 600 [\d.]+$/);
  });

  it("is a straight line for the baseline", () => {
    const d = roadPath(deltaSeries(baseline, baseline), 1500, FRAME);
    expect([...d.matchAll(/ (\d+(?:\.\d+)?)(?= L| ?$)/g)].every((m) => Number(m[1]) === 200)).toBe(true);
  });

  it("never draws nothing", () => {
    expect(roadPath([], 1500, FRAME)).toBe("M 0 200");
  });

  it("x follows the month", () => {
    expect(roadX(0, 600)).toBe(0);
    expect(roadX(30, 600)).toBe(300);
    expect(roadX(90, 600)).toBe(600);
  });
});

describe("assignLevels", () => {
  it("labels far apart all sit on the first level", () => {
    const lv = assignLevels([{ id: "a", x: 0 }, { id: "b", x: 300 }, { id: "c", x: 600 }], 150);
    expect([...lv.values()]).toEqual([0, 0, 0]);
  });

  it("labels that would collide take the next level", () => {
    const lv = assignLevels([{ id: "a", x: 100 }, { id: "b", x: 180 }, { id: "c", x: 260 }], 150);
    // b is 80px from a, so it moves to level 1. c is 160px from a, so it is clear of a and can use level 0.
    expect([lv.get("a"), lv.get("b"), lv.get("c")]).toEqual([0, 1, 0]);
  });

  it("decisions in the very same spot stack on different levels", () => {
    const lv = assignLevels([{ id: "a", x: 200 }, { id: "b", x: 200 }, { id: "c", x: 200 }], 150);
    expect(new Set(lv.values()).size).toBe(3);
  });

  it("gives the same answer whatever order they come in", () => {
    const items = [{ id: "a", x: 100 }, { id: "b", x: 140 }, { id: "c", x: 400 }];
    expect([...assignLevels(items, 150).entries()].sort()).toEqual([...assignLevels([...items].reverse(), 150).entries()].sort());
  });

  it("handles no labels", () => {
    expect(assignLevels([], 150).size).toBe(0);
  });
});

describe("levelOffset", () => {
  it("alternates above and below, moving further out each pair", () => {
    expect([0, 1, 2, 3, 4, 5].map((l) => levelOffset(l))).toEqual([-34, 34, -86, 86, -138, 138]);
  });
});

describe("spreadLabels", () => {
  it("leaves labels that already have room alone", () => {
    expect(spreadLabels([20, 120, 220], 40, 0, 300)).toEqual([20, 120, 220]);
  });

  it("pushes crowded labels apart, keeping their order", () => {
    const out = spreadLabels([100, 105, 110], 40, 0, 400);
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(40);
    expect(out[2] - out[1]).toBeGreaterThanOrEqual(40);
  });

  it("returns results in the order it was given, not sorted order", () => {
    const out = spreadLabels([300, 100, 200], 40, 0, 400);
    expect(out).toEqual([300, 100, 200]);
    const crowded = spreadLabels([210, 100, 200], 40, 0, 400);
    expect(crowded[1]).toBe(100);
    expect(crowded[2]).toBeLessThan(crowded[0]);
  });

  it("keeps everything inside the bounds, even when it all wants the bottom", () => {
    const out = spreadLabels([390, 395, 400], 40, 0, 400);
    expect(Math.max(...out)).toBeLessThanOrEqual(400);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(40);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(40);
  });

  it("handles one label and none", () => {
    expect(spreadLabels([50], 40, 0, 100)).toEqual([50]);
    expect(spreadLabels([], 40, 0, 100)).toEqual([]);
  });
});

describe("effectPhrase", () => {
  const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
  it("says it in plain words", () => {
    expect(effectPhrase(4310, usd)).toBe("Adds $4,310");
    expect(effectPhrase(-800, usd)).toBe("Saves $800");
    expect(effectPhrase(0, usd)).toBe("No change in cost");
  });

  it("under a dollar counts as no change", () => {
    expect(effectPhrase(0.4, usd)).toBe("No change in cost");
    expect(effectPhrase(-0.4, usd)).toBe("No change in cost");
  });
});
