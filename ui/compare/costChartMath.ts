/**
 * The cost chart: series, ticks and scales. Pure, no React, no store.
 *
 * One chart, plain lines: time runs left to right (0 to 60 months, ticked in years),
 * net cost runs bottom to top in dollars. Every value is a number the simulation
 * already produced; nothing here invents a point.
 */
import type { SimulationResult } from "@/contracts";
import { usd } from "@/ui/profile/format";
import { MONTH_MAX } from "@/ui/store/months";

export { MONTH_MAX };

/**
 * The month the chart, its readout and the breakdown speak about. The store keeps 0 for "not scrubbed yet", which
 * reads as the end of the five years, the same as the old details did.
 */
export const measuredMonth = (activeMonth: number): number => (activeMonth > 0 ? activeMonth : MONTH_MAX);

/** keep: the future you keep. switch: the same life in the other car. baseline: if nothing changes. */
export type LineKind = "keep" | "switch" | "baseline";

export interface ChartPoint {
  month: number;
  /** Net cost in dollars, a number from the simulation. */
  value: number;
  /** The car on the road at this month, when the simulation says. */
  vehicleId?: string;
}

export interface ChartLine {
  kind: LineKind;
  scenarioId: string;
  label: string;
  /** Sorted by month, one per month, starting at month 0. */
  points: ChartPoint[];
}

// ---------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------

/** The smallest 1, 2 or 5 times a power of ten that is at least `raw`, and never below one dollar. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

/** The next smaller 1, 2 or 5 times a power of ten (2 to 1, 5 to 2, 10 to 5). Never below one dollar. */
function finerStep(step: number): number {
  if (step <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(step));
  const mantissa = Math.round(step / pow);
  return mantissa === 1 ? pow / 2 : mantissa === 2 ? pow : pow * 2;
}

/**
 * Round dollar ticks that cover the data: evenly spaced, a step of 1, 2 or 5 times a power of ten, the first at or
 * below `min` and the last at or above `max`. Aims for about `targetCount` ticks and never uses more than one over.
 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) hi = lo + 100; // a flat line still needs a scale to sit on
  const count = Math.max(2, Math.floor(targetCount));
  const countFor = (step: number) => Math.ceil(hi / step) - Math.floor(lo / step) + 1;
  let step = niceStep((hi - lo) / (count - 1));
  // The step above only fits the range once. One finer step is better when it still stays within one tick of the target.
  const finer = finerStep(step);
  if (finer < step && countFor(finer) <= count + 1) step = finer;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(v + 0); // + 0 turns -0 into 0
  return out;
}

/** The ticks on the time axis: every year. Labeled in years from now; the axis title says so. */
export const X_TICKS: ReadonlyArray<{ month: number; label: string }> = [0, 12, 24, 36, 48, 60].map((month) => ({
  month,
  label: String(month / 12),
}));

export const X_AXIS_TITLE = "Years from now";
export const Y_AXIS_TITLE = "Net cost";

/** "$10,000", "-$5,000", "$0". */
export const yTickLabel = (v: number): string => usd(v === 0 ? 0 : v);

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * One line's points from a simulation result: months 0 to 60 in order, once each, finite numbers only. The
 * simulation reports months 1 to 60, and every future starts from nothing spent, so month 0 is $0 unless the result says
 * otherwise. No result, or no usable point, gives an empty list (never a line of zeros).
 */
export function seriesOf(result: SimulationResult | undefined): ChartPoint[] {
  if (!result) return [];
  const byMonth = new Map<number, ChartPoint>();
  for (const p of result.points) {
    if (!Number.isFinite(p.month) || !Number.isFinite(p.netEconomicCost)) continue;
    if (p.month < 0 || p.month > MONTH_MAX) continue;
    byMonth.set(p.month, { month: p.month, value: p.netEconomicCost, vehicleId: p.vehicleId });
  }
  if (byMonth.size === 0) return [];
  const points = [...byMonth.values()].sort((a, b) => a.month - b.month);
  if (points[0].month > 0) points.unshift({ month: 0, value: 0, vehicleId: points[0].vehicleId });
  return points;
}

/** The value at an exact month, or undefined when the line has no point there. */
export function valueAt(line: Pick<ChartLine, "points">, month: number): number | undefined {
  return line.points.find((p) => p.month === month)?.value;
}

/** The point at an exact month, or undefined. */
export function pointOf(line: Pick<ChartLine, "points">, month: number): ChartPoint | undefined {
  return line.points.find((p) => p.month === month);
}

export interface LineInput {
  /** Simulation results by future id. */
  results: Record<string, SimulationResult | undefined>;
  /** The open comparison, if there is one. */
  comparison: { keepId: string; replaceId: string } | null;
  /** The future you are looking at. Charted alone when there is no comparison. */
  activeScenarioId: string;
  /** The "if nothing changes" future. */
  baseId: string;
  /** The car you own now. */
  ownVehicleId: string | undefined;
  /** The car you would switch to. */
  switchVehicleId: string | undefined;
  /** A car's model name ("Camry"), or undefined if unknown. */
  modelName(vehicleId: string): string | undefined;
}

/**
 * The lines to draw. With a comparison: the future you keep, the same future in the other car, and, when the kept future
 * is not already the baseline, a quiet line for "if nothing changes". Without one: the future you are looking at, with
 * the same baseline. A line with no usable points is left out.
 */
export function buildLines(input: LineInput): ChartLine[] {
  const { results, comparison, activeScenarioId, baseId, ownVehicleId, switchVehicleId, modelName } = input;
  const keepId = comparison ? comparison.keepId : activeScenarioId;
  const lines: ChartLine[] = [];

  const keepPoints = seriesOf(results[keepId]);
  if (keepPoints.length > 0) {
    const endCar = keepPoints[keepPoints.length - 1].vehicleId;
    const endName = endCar ? modelName(endCar) : undefined;
    const switched = endCar !== undefined && endCar !== ownVehicleId;
    lines.push({
      kind: "keep",
      scenarioId: keepId,
      label: switched ? `Switch to ${endName ?? "the other car"}` : `Keep your ${(ownVehicleId && modelName(ownVehicleId)) || "car"}`,
      points: keepPoints,
    });
  }

  if (comparison) {
    const points = seriesOf(results[comparison.replaceId]);
    if (points.length > 0) {
      const carId = switchVehicleId ?? points[points.length - 1].vehicleId;
      const name = carId ? modelName(carId) : undefined;
      lines.push({ kind: "switch", scenarioId: comparison.replaceId, label: `Switch to ${name ?? "the other car"}`, points });
    }
  }

  if (keepId !== baseId && lines.length > 0) {
    const points = seriesOf(results[baseId]);
    if (points.length > 0) lines.push({ kind: "baseline", scenarioId: baseId, label: "If nothing changes", points });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export interface Frame {
  width: number;
  height: number;
  /** Room around the plot for the axes and the labels at the line ends. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Plot padding for a chart this wide. Narrow screens give up the end labels (the legend names the lines instead). */
export function chartFrame(width: number, height: number): Frame {
  return { width, height, left: 84, right: width >= 640 ? 124 : 20, top: 16, bottom: 58 };
}

export const showEndLabels = (f: Frame): boolean => f.right >= 100;

export const plotWidth = (f: Frame): number => Math.max(1, f.width - f.left - f.right);
export const plotHeight = (f: Frame): number => Math.max(1, f.height - f.top - f.bottom);

export interface Domain {
  ticks: number[];
  min: number;
  max: number;
}

/** The dollar scale: round ticks around everything drawn, and always including $0. */
export function yDomain(lines: Array<Pick<ChartLine, "points">>, targetCount = 5): Domain {
  let lo = 0;
  let hi = 0;
  for (const line of lines) {
    for (const p of line.points) {
      lo = Math.min(lo, p.value);
      hi = Math.max(hi, p.value);
    }
  }
  const ticks = niceTicks(lo, hi, targetCount);
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1] };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pixels from the left of the chart for a month. */
export const xOf = (month: number, f: Frame): number => f.left + (clamp(month, 0, MONTH_MAX) / MONTH_MAX) * plotWidth(f);

/** Pixels from the top of the chart for a dollar value. Bigger costs sit higher. */
export function yOf(value: number, d: Domain, f: Frame): number {
  const t = d.max > d.min ? (clamp(value, d.min, d.max) - d.min) / (d.max - d.min) : 0;
  return f.top + (1 - t) * plotHeight(f);
}

/** SVG path through a line's points. */
export function linePath(points: ChartPoint[], d: Domain, f: Frame): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${round2(xOf(p.month, f))} ${round2(yOf(p.value, d, f))}`).join(" ");
}

/**
 * Where to put labels at the ends of lines: as close to their line as they can be, but never closer to each other
 * than `minGap`, and always inside [lo, hi]. Keeps the order the lines end in. Returns y values in the order given.
 */
export function spreadLabels(ys: number[], minGap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  for (let k = 0; k < order.length; k++) {
    const min = k === 0 ? lo : order[k - 1].y + minGap;
    order[k].y = Math.max(order[k].y, min);
  }
  for (let k = order.length - 1; k >= 0; k--) {
    const max = k === order.length - 1 ? hi : order[k + 1].y - minGap;
    order[k].y = Math.min(order[k].y, max);
  }
  const out = new Array<number>(ys.length);
  for (const { y, i } of order) out[i] = y;
  return out;
}
