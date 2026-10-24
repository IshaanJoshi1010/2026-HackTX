/**
 * The road: geometry and data shaping. Pure, no React.
 *
 * The straight line across the middle is "if nothing changes" (the baseline future).
 * A future is drawn as how far its net cost has drifted from that line, month by month.
 * A decision that costs you money bends the road down; one that saves money bends it up.
 * Everything here comes from the simulation results. Nothing is decorative.
 */
import type { SimulationResult } from "@/contracts";
import { MONTH_MAX, clampMonth, pointAt } from "./layout";

export interface DeltaPoint {
  month: number;
  /** Net cost of this future minus net cost of the baseline at that month. Positive means it costs more. */
  delta: number;
}

/**
 * How far a future has drifted from the baseline at each month. Always starts at
 * month 0 with no drift, because every future starts from the same place.
 */
export function deltaSeries(result: SimulationResult | undefined, baseline: SimulationResult | undefined): DeltaPoint[] {
  const out: DeltaPoint[] = [{ month: 0, delta: 0 }];
  if (!result || !baseline) return out;
  for (const p of [...result.points].sort((a, b) => a.month - b.month)) {
    if (p.month <= 0 || p.month > MONTH_MAX) continue;
    const b = pointAt(baseline, p.month);
    if (!b) continue;
    out.push({ month: p.month, delta: p.netEconomicCost - b.netEconomicCost });
  }
  return out;
}

/**
 * A cleaned copy for DRAWING the road. Monthly maintenance bills make one-month blips in
 * the drift, and on a thick road they look like wobble. A median filter removes those
 * blips but, unlike an average, never moves a trend or an edge: a road does not start
 * bending before the decision that bends it. The first and last points stay exactly as
 * they are, so the start is on the line and the end matches its label.
 * Never use this for a number on screen: numbers come from the unsmoothed series.
 */
export function smoothSeries(series: DeltaPoint[], radius = 3): DeltaPoint[] {
  if (radius <= 0 || series.length < 3) return series;
  return series.map((p, i) => {
    if (i === 0 || i === series.length - 1) return p;
    // The window shrinks evenly near the ends, so a straight ramp stays exactly straight.
    const r = Math.min(radius, i, series.length - 1 - i);
    const window = series.slice(i - r, i + r + 1).map((q) => q.delta).sort((a, b) => a - b);
    return { month: p.month, delta: window[r] };
  });
}

/** The drift at an exact month, or undefined if the series has no point there. */
export function deltaAt(series: DeltaPoint[], month: number): number | undefined {
  return series.find((p) => p.month === month)?.delta;
}

/**
 * Dollars from the middle line to the top or bottom edge. Never below `floor`, so a
 * tiny difference stays a gentle bend instead of being stretched to look dramatic.
 */
export const RANGE_FLOOR = 1500;
export function drawnRange(seriesList: DeltaPoint[][], floor = RANGE_FLOOR): number {
  let max = floor;
  for (const series of seriesList) for (const p of series) max = Math.max(max, Math.abs(p.delta));
  return max;
}

export interface Frame {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
}

export const roadX = (month: number, width: number): number => (clampMonth(month) / MONTH_MAX) * width;

/** Y for a drift. The middle is no drift. Costing more goes down, saving money goes up. */
export function roadY(delta: number, range: number, f: Frame): number {
  const half = (f.height - f.padTop - f.padBottom) / 2;
  const mid = f.padTop + half;
  const t = range > 0 ? Math.max(-1, Math.min(1, delta / range)) : 0;
  return mid + t * half;
}

export const roadMid = (f: Frame): number => roadY(0, 1, f);

/** SVG path through a series, in pixels. */
export function roadPath(series: DeltaPoint[], range: number, f: Frame): string {
  const pts = series.length > 0 ? series : [{ month: 0, delta: 0 }];
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${round(roadX(p.month, f.width))} ${round(roadY(p.delta, range, f))}`)
    .join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Decision labels sit above or below the road. Labels that are close together
 * sideways get different levels so they never overlap. Level 0 is just above the
 * road, 1 just below, 2 higher above, 3 lower below, and so on.
 */
export function assignLevels(items: Array<{ id: string; x: number }>, minDx: number): Map<string, number> {
  const placed: Array<{ x: number; level: number }> = [];
  const out = new Map<string, number>();
  for (const item of [...items].sort((a, b) => a.x - b.x)) {
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.x - item.x) < minDx)) level += 1;
    placed.push({ x: item.x, level });
    out.set(item.id, level);
  }
  return out;
}

/** Pixels from the road to a label's near edge. Negative is above the road. */
export function levelOffset(level: number, base = 34, step = 52): number {
  const rung = Math.floor(level / 2);
  return level % 2 === 0 ? -(base + rung * step) : base + rung * step;
}

/**
 * Keeps a column of labels from overlapping. Takes the wanted y of each label (in any
 * order) and returns the y to use for each, in the same order, at least `minGap` apart
 * and inside [min, max].
 */
export function spreadLabels(wanted: number[], minGap: number, min: number, max: number): number[] {
  const order = wanted.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const ys = order.map((o) => Math.max(min, Math.min(max, o.y)));
  for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + minGap);
  const overflow = (ys.at(-1) ?? 0) - max;
  if (overflow > 0) {
    ys[ys.length - 1] = max;
    for (let k = ys.length - 2; k >= 0; k--) ys[k] = Math.min(ys[k], ys[k + 1] - minGap);
  }
  const out: number[] = new Array(wanted.length);
  order.forEach((o, k) => {
    out[o.i] = Math.max(min, ys[k]);
  });
  return out;
}

/** Plain words for a cost difference. Under a dollar counts as no change. */
export function effectPhrase(delta: number, usd: (n: number) => string): string {
  const r = Math.round(delta);
  if (r === 0) return "No change in cost";
  return r > 0 ? `Adds ${usd(r)}` : `Saves ${usd(-r)}`;
}
