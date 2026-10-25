import { describe, expect, it } from "vitest";
import type { ProjectionPoint, SimulationResult } from "@/contracts";
import {
  MONTH_MAX,
  X_TICKS,
  buildLines,
  chartFrame,
  linePath,
  measuredMonth,
  niceStep,
  niceTicks,
  plotHeight,
  seriesOf,
  spreadLabels,
  valueAt,
  xOf,
  yDomain,
  yOf,
  yTickLabel,
} from "./costChartMath";

const point = (month: number, netEconomicCost: number, vehicleId = "camry"): ProjectionPoint =>
  ({ month, vehicleId, netEconomicCost, mileage: 0, fuelSpend: 0, maintenanceSpend: 0, vehicleValue: 0, loanBalance: 0, cumulativeCash: 0 }) as ProjectionPoint;

const result = (scenarioId: string, points: ProjectionPoint[]): SimulationResult =>
  ({ scenarioId, points, milestones: [], warnings: [], summary: { totalCash: 0, netCost: 0 } }) as SimulationResult;

/** Months 1 to 60 growing by `perMonth`. */
const ramp = (scenarioId: string, perMonth: number, vehicleId = "camry") =>
  result(scenarioId, Array.from({ length: 60 }, (_, i) => point(i + 1, (i + 1) * perMonth, vehicleId)));

describe("niceStep", () => {
  it("is 1, 2 or 5 times a power of ten, never smaller than the raw step", () => {
    for (const raw of [1.2, 3, 7, 12, 99, 101, 1234, 7821.75, 19999, 20001, 48000, 123456]) {
      const step = niceStep(raw);
      expect(step).toBeGreaterThanOrEqual(raw);
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1e6) / 1e6);
    }
  });

  it("never goes under a dollar, and survives nonsense", () => {
    expect(niceStep(0.3)).toBe(1);
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
    expect(niceStep(Infinity)).toBe(1);
  });
});

describe("niceTicks", () => {
  it("gives round dollars that cover the data", () => {
    expect(niceTicks(0, 31287, 5)).toEqual([0, 10000, 20000, 30000, 40000]);
    expect(niceTicks(0, 35639, 5)).toEqual([0, 10000, 20000, 30000, 40000]);
    expect(niceTicks(0, 9500, 5)).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
    expect(niceTicks(0, 100000, 5)).toEqual([0, 20000, 40000, 60000, 80000, 100000]);
  });

  it("covers the range, is evenly spaced, and uses a 1, 2 or 5 step, for a spread of ranges", () => {
    const ranges: Array<[number, number]> = [
      [0, 1], [0, 7], [0, 99], [0, 430], [0, 2500], [0, 31287], [0, 35639], [0, 88888], [0, 1_250_000],
      [-3200, 0], [-3200, 41000], [500, 9100], [12000, 12400],
    ];
    for (const [lo, hi] of ranges) {
      for (const target of [3, 4, 5, 6, 8]) {
        const ticks = niceTicks(lo, hi, target);
        expect(ticks[0], `${lo}..${hi} x${target} first`).toBeLessThanOrEqual(lo);
        expect(ticks[ticks.length - 1], `${lo}..${hi} x${target} last`).toBeGreaterThanOrEqual(hi);
        const step = ticks[1] - ticks[0];
        expect(step).toBeGreaterThanOrEqual(1);
        const mantissa = step / 10 ** Math.floor(Math.log10(step));
        expect([1, 2, 5]).toContain(mantissa);
        for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBe(step);
        expect(ticks.length).toBeLessThanOrEqual(target + 1);
        expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
      }
    }
  });

  it("puts $0 on the scale when the data starts at zero, and never prints negative zero", () => {
    const ticks = niceTicks(0, 31287);
    expect(ticks[0]).toBe(0);
    expect(Object.is(ticks[0], -0)).toBe(false);
    expect(niceTicks(-3200, 0).map(yTickLabel)).toContain("$0");
    expect(niceTicks(-3200, 0).map(yTickLabel).join(" ")).not.toContain("-$0");
  });

  it("still gives a scale for a flat or empty range, and for nonsense", () => {
    expect(niceTicks(0, 0).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(5000, 5000).length).toBeGreaterThanOrEqual(2);
    expect(niceTicks(Number.NaN, Number.NaN).every(Number.isFinite)).toBe(true);
    expect(niceTicks(10, 0)).toEqual(niceTicks(0, 10));
  });

  it("labels ticks the way the chart prints them", () => {
    expect(yTickLabel(0)).toBe("$0");
    expect(yTickLabel(10000)).toBe("$10,000");
    expect(yTickLabel(-5000)).toBe("-$5,000");
  });
});

describe("the time axis", () => {
  it("ticks every year from 0 to 5, in order", () => {
    expect(X_TICKS.map((t) => t.label)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(X_TICKS.map((t) => t.month)).toEqual([0, 12, 24, 36, 48, 60]);
  });

  it("measures month 0 as the end of the five years, any other month as itself", () => {
    expect(measuredMonth(0)).toBe(MONTH_MAX);
    expect(measuredMonth(27)).toBe(27);
    expect(measuredMonth(60)).toBe(60);
  });
});

describe("seriesOf", () => {
  it("adds month 0 at $0 to the simulation's months 1 to 60, in order", () => {
    const s = seriesOf(ramp("a", 100));
    expect(s).toHaveLength(61);
    expect(s[0]).toMatchObject({ month: 0, value: 0 });
    expect(s.map((p) => p.month)).toEqual(Array.from({ length: 61 }, (_, i) => i));
    expect(s[60].value).toBe(6000);
  });

  it("uses the simulation's own month 0 when it has one", () => {
    const s = seriesOf(result("a", [point(0, 250), point(1, 300)]));
    expect(s.map((p) => p.value)).toEqual([250, 300]);
  });

  it("sorts, keeps one point per month, and drops anything that is not a finite number or not in range", () => {
    const s = seriesOf(result("a", [point(3, 30), point(1, 10), point(2, Number.NaN), point(61, 999), point(-1, 5), point(1, 11), point(4, Infinity)]));
    expect(s.map((p) => [p.month, p.value])).toEqual([[0, 0], [1, 11], [3, 30]]);
  });

  it("gives nothing, not a line of zeros, when there is no result or no usable point", () => {
    expect(seriesOf(undefined)).toEqual([]);
    expect(seriesOf(result("a", []))).toEqual([]);
    expect(seriesOf(result("a", [point(1, Number.NaN)]))).toEqual([]);
  });

  it("finds a value by month", () => {
    const line = { points: seriesOf(ramp("a", 100)) };
    expect(valueAt(line, 12)).toBe(1200);
    expect(valueAt(line, 0)).toBe(0);
    expect(valueAt(line, 99)).toBeUndefined();
  });
});

describe("buildLines", () => {
  const results = {
    base: ramp("base", 400),
    life: ramp("life", 450),
    swap: ramp("swap", 500, "rav4"),
  };
  const shared = {
    results,
    baseId: "base",
    ownVehicleId: "camry",
    switchVehicleId: "rav4",
    modelName: (id: string) => ({ camry: "Camry", rav4: "RAV4" })[id],
  };

  it("with a comparison: keep, switch and the baseline, named for the cars", () => {
    const lines = buildLines({ ...shared, comparison: { keepId: "life", replaceId: "swap" }, activeScenarioId: "swap" });
    expect(lines.map((l) => [l.kind, l.scenarioId, l.label])).toEqual([
      ["keep", "life", "Keep your Camry"],
      ["switch", "swap", "Switch to RAV4"],
      ["baseline", "base", "If nothing changes"],
    ]);
  });

  it("leaves the baseline out when the kept future is the baseline", () => {
    const lines = buildLines({ ...shared, comparison: { keepId: "base", replaceId: "swap" }, activeScenarioId: "swap" });
    expect(lines.map((l) => l.kind)).toEqual(["keep", "switch"]);
  });

  it("without a comparison: the future you are looking at, plus the baseline when it is not the baseline", () => {
    expect(buildLines({ ...shared, comparison: null, activeScenarioId: "base" }).map((l) => l.kind)).toEqual(["keep"]);
    const lines = buildLines({ ...shared, comparison: null, activeScenarioId: "life" });
    expect(lines.map((l) => [l.kind, l.scenarioId])).toEqual([["keep", "life"], ["baseline", "base"]]);
  });

  it("names a future that ends in the other car for that car", () => {
    const lines = buildLines({ ...shared, comparison: null, activeScenarioId: "swap" });
    expect(lines[0]).toMatchObject({ kind: "keep", label: "Switch to RAV4" });
  });

  it("skips a line whose result is missing, and gives nothing when there is nothing to draw", () => {
    const partial = { ...shared, results: { base: results.base, life: results.life } };
    const lines = buildLines({ ...partial, comparison: { keepId: "life", replaceId: "swap" }, activeScenarioId: "swap" });
    expect(lines.map((l) => l.kind)).toEqual(["keep", "baseline"]);
    expect(buildLines({ ...shared, results: {}, comparison: { keepId: "life", replaceId: "swap" }, activeScenarioId: "life" })).toEqual([]);
    expect(buildLines({ ...shared, results: {}, comparison: null, activeScenarioId: "nope" })).toEqual([]);
  });

  it("falls back to plain words when a car's name is unknown", () => {
    const lines = buildLines({ ...shared, modelName: () => undefined, ownVehicleId: undefined, switchVehicleId: undefined, comparison: { keepId: "life", replaceId: "swap" }, activeScenarioId: "life" });
    expect(lines.every((l) => !/undefined|NaN/.test(l.label))).toBe(true);
  });
});

describe("scales", () => {
  const lines = [{ points: seriesOf(ramp("a", 520)) }, { points: seriesOf(ramp("b", 594)) }];
  const frame = chartFrame(960, 340);
  const domain = yDomain(lines);

  it("covers every point and starts at $0", () => {
    expect(domain.min).toBe(0);
    expect(domain.max).toBeGreaterThanOrEqual(35640);
    expect(domain.ticks[0]).toBe(0);
  });

  it("puts month 0 at the left of the plot and month 60 at the right, in order", () => {
    expect(xOf(0, frame)).toBe(frame.left);
    expect(xOf(60, frame)).toBe(frame.width - frame.right);
    expect(xOf(12, frame)).toBeLessThan(xOf(24, frame));
    expect(xOf(-5, frame)).toBe(frame.left);
    expect(xOf(900, frame)).toBe(frame.width - frame.right);
  });

  it("puts $0 at the bottom of the plot and the top tick at the top, bigger costs higher", () => {
    expect(yOf(0, domain, frame)).toBe(frame.top + plotHeight(frame));
    expect(yOf(domain.max, domain, frame)).toBe(frame.top);
    expect(yOf(20000, domain, frame)).toBeLessThan(yOf(10000, domain, frame));
  });

  it("draws a path whose last point is the last value, and that has no NaN", () => {
    const d = linePath(lines[1].points, domain, frame);
    expect(d.startsWith(`M ${frame.left} ${frame.top + plotHeight(frame)}`)).toBe(true);
    expect(d).not.toMatch(/NaN|undefined|Infinity/);
    const last = d.split(" L ").pop()!.split(" ").map(Number);
    expect(last[0]).toBeCloseTo(xOf(60, frame), 2);
    expect(last[1]).toBeCloseTo(yOf(35640, domain, frame), 2);
  });

  it("gives narrow charts less room on the right, and wide ones room for end labels", () => {
    expect(chartFrame(960, 340).right).toBeGreaterThan(chartFrame(360, 280).right);
  });

  it("still has a scale when nothing is spent", () => {
    const flat = yDomain([{ points: [{ month: 0, value: 0 }, { month: 60, value: 0 }] }]);
    expect(flat.max).toBeGreaterThan(flat.min);
    expect(yOf(0, flat, frame)).not.toBeNaN();
  });
});

describe("spreadLabels", () => {
  it("leaves labels that are far enough apart where they are", () => {
    expect(spreadLabels([40, 120, 200], 16, 10, 300)).toEqual([40, 120, 200]);
  });

  it("pushes close labels apart, keeps their order, and returns them in the order given", () => {
    const out = spreadLabels([100, 104, 102], 16, 10, 300);
    const sorted = [...out].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(16 - 1e-9);
    expect(out[0]).toBeLessThan(out[2]);
    expect(out[2]).toBeLessThan(out[1]);
  });

  it("keeps every label inside the bounds", () => {
    const out = spreadLabels([2, 3, 298, 299], 16, 10, 300);
    for (const y of out) {
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(300);
    }
  });

  it("handles no labels", () => {
    expect(spreadLabels([], 16, 0, 100)).toEqual([]);
  });
});
