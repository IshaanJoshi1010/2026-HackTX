/**
 * A winding path through numbered steps, then a fork. Pure geometry, no React.
 *
 * The steps are spaced evenly, not by month: this is the story of what changes, in order, and the months are written
 * on each step. The path swings between a high band and a low band so the labels can sit above and below it without
 * touching. Every curve leaves and arrives flat, so the path reads as one smooth line through the steps.
 */

export interface Size {
  width: number;
  height: number;
}

export interface WindingOptions {
  /** The closest two steps may sit. Under this the path grows wider than the screen and scrolls. */
  minDx?: number;
  /** The furthest apart they may sit, so two steps are not stretched across a wide screen. */
  maxDx?: number;
  /** Room at the right for the fork's two labels. */
  endWidth?: number;
  padX?: number;
}

export interface StepPoint {
  x: number;
  y: number;
  /** The label sits above the step (true) or below it. */
  above: boolean;
}

export interface WindingLayout {
  /** The width the path needs. More than `size.width` means it scrolls. */
  contentWidth: number;
  height: number;
  steps: StepPoint[];
  /** The two ends of the fork: the one that goes up, and the one that goes down. */
  upEnd: { x: number; y: number };
  downEnd: { x: number; y: number };
  /** The path through every step. */
  path: string;
  /** From the last step to each end, so the two options can be styled apart. */
  upPath: string;
  downPath: string;
  /** How far the steps are apart. */
  dx: number;
}

export const NODE_R = 20;

const round = (n: number) => Math.round(n * 100) / 100;

/** A smooth S from one point to the next: it leaves flat and arrives flat. */
export const curve = (x0: number, y0: number, x1: number, y1: number): string => {
  const mid = (x0 + x1) / 2;
  return `C ${round(mid)} ${round(y0)} ${round(mid)} ${round(y1)} ${round(x1)} ${round(y1)}`;
};

/** Which band a step sits in. The first is in the middle, then low, high, low, high. */
export function bandOf(index: number): "mid" | "low" | "high" {
  if (index === 0) return "mid";
  return index % 2 === 1 ? "low" : "high";
}

export function layoutWinding(count: number, size: Size, opts: WindingOptions = {}): WindingLayout {
  const { minDx = 176, maxDx = 280, endWidth = 232, padX = 44 } = opts;
  const n = Math.max(1, Math.round(count));
  const H = Math.max(280, size.height);

  // Room for a label (about 76px) above the high band and below the low one.
  const high = Math.max(104, H * 0.28);
  const low = Math.min(H - 104, H * 0.72);
  const mid = (high + low) / 2;
  const yOf = (i: number) => (bandOf(i) === "mid" ? mid : bandOf(i) === "low" ? low : high);

  // n steps and then the fork's end: n gaps.
  const natural = (size.width - padX * 2 - endWidth) / n;
  const dx = Math.min(maxDx, Math.max(minDx, natural));

  const steps: StepPoint[] = Array.from({ length: n }, (_, i) => ({
    x: padX + NODE_R + i * dx,
    y: yOf(i),
    // Labels go on the side away from the nearest band edge, the first one above.
    above: i === 0 || bandOf(i) === "high",
  }));

  const last = steps[n - 1];
  const endX = last.x + dx;
  const upEnd = { x: endX, y: high };
  const downEnd = { x: endX, y: low };
  const tail = 64; // a flat run after each end, where its label sits

  let path = `M ${round(steps[0].x)} ${round(steps[0].y)}`;
  for (let i = 1; i < n; i++) path += ` ${curve(steps[i - 1].x, steps[i - 1].y, steps[i].x, steps[i].y)}`;

  const branch = (end: { x: number; y: number }) => `M ${round(last.x)} ${round(last.y)} ${curve(last.x, last.y, end.x, end.y)} L ${round(end.x + tail)} ${round(end.y)}`;

  return {
    contentWidth: Math.max(size.width, endX + tail + padX + (endWidth - tail - 32)),
    height: H,
    steps,
    upEnd,
    downEnd,
    path,
    upPath: branch(upEnd),
    downPath: branch(downEnd),
    dx,
  };
}
