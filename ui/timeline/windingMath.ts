/**
 * A winding path through numbered steps, then a choice. Pure geometry, no React.
 *
 * The steps are spaced evenly, not by month: this is the story of what changes, in order, and the dates are written
 * on each step. The path swings between a high band and a low band so the labels can sit above and below it without
 * touching. Every curve leaves and arrives flat, so the path reads as one smooth line through the steps.
 *
 * The fork is not one of those steps. It is a choice, not a moment, so it sits a little further on, behind a thin
 * divider, and the two ways out of it (keep, switch) end in a matching box each.
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
  /** The extra space before the fork marker, on top of the usual step spacing. */
  forkGap?: number;
  /** How far the fork's two ways run before they stop and meet their box. */
  branchDx?: number;
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
  /** The numbered steps, in order. The fork is not in here. */
  steps: StepPoint[];
  /** The fork marker: the choice after the last step. */
  fork: StepPoint;
  /** A thin vertical line between the steps and the choice. */
  divider: { x: number; top: number; bottom: number };
  /** Where each way out of the fork ends. Its box starts just to the right (`ENDPOINT_GAP`), centred on `y`. */
  upEnd: { x: number; y: number };
  downEnd: { x: number; y: number };
  /** The path through every step and on to the fork. */
  path: string;
  /** From the fork to each end, so the two options can be styled apart. */
  upPath: string;
  downPath: string;
  /** How far the steps are apart. */
  dx: number;
}

export const NODE_R = 20;
/** The two boxes at the end of the fork are exactly this size, so neither looks like the main one. */
export const ENDPOINT_W = 256;
export const ENDPOINT_H = 96;
/** Space between where a way ends and its box. */
export const ENDPOINT_GAP = 8;
/** The shortest the path is drawn: room for a label above the high band, a box on each way, and a label below the low one. */
export const MIN_HEIGHT = 340;

const TAIL = 24; // a flat run at the end of each way, leading into its box
const DIVIDER_OFFSET = NODE_R + 14; // from the fork marker's centre to the divider
const DIVIDER_INSET = 16;

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

/** `count` is the number of numbered steps. The fork comes after them and is not counted. */
export function layoutWinding(count: number, size: Size, opts: WindingOptions = {}): WindingLayout {
  const { minDx = 192, maxDx = 300, forkGap = 40, branchDx = 120, padX = 44 } = opts;
  const n = Math.max(0, Math.round(count));
  const H = Math.max(MIN_HEIGHT, size.height);

  // Room for a label (about 68px) above the high band and below the low one, and for a box centred on each way.
  const high = Math.max(112, H * 0.3);
  const low = Math.min(H - 112, H * 0.7);
  const mid = (high + low) / 2;
  const yOf = (i: number) => (bandOf(i) === "mid" ? mid : bandOf(i) === "low" ? low : high);

  // What the fork needs to its right: its gap, the way out, then the box and the margin.
  const rightReserve = forkGap + branchDx + TAIL + ENDPOINT_GAP + ENDPOINT_W + padX;
  const natural = (size.width - padX - NODE_R - rightReserve) / Math.max(1, n);
  const dx = Math.min(maxDx, Math.max(minDx, natural));

  const point = (i: number, extra = 0): StepPoint => ({
    x: padX + NODE_R + i * dx + extra,
    y: yOf(i),
    // Labels go on the side away from the nearest band edge, the first one above.
    above: i === 0 || bandOf(i) === "high",
  });
  const steps = Array.from({ length: n }, (_, i) => point(i));
  const fork = point(n, forkGap);

  const upEnd = { x: fork.x + branchDx + TAIL, y: high };
  const downEnd = { x: fork.x + branchDx + TAIL, y: low };

  const nodes = [...steps, fork];
  let path = `M ${round(nodes[0].x)} ${round(nodes[0].y)}`;
  for (let i = 1; i < nodes.length; i++) path += ` ${curve(nodes[i - 1].x, nodes[i - 1].y, nodes[i].x, nodes[i].y)}`;

  const branch = (end: { x: number; y: number }) =>
    `M ${round(fork.x)} ${round(fork.y)} ${curve(fork.x, fork.y, fork.x + branchDx, end.y)} L ${round(end.x)} ${round(end.y)}`;

  return {
    contentWidth: Math.max(size.width, upEnd.x + ENDPOINT_GAP + ENDPOINT_W + padX),
    height: H,
    steps,
    fork,
    divider: { x: round(fork.x - DIVIDER_OFFSET), top: DIVIDER_INSET, bottom: H - DIVIDER_INSET },
    upEnd,
    downEnd,
    path,
    upPath: branch(upEnd),
    downPath: branch(downEnd),
    dx,
  };
}
