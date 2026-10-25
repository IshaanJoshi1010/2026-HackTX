/**
 * The path a chip takes from where it was to where it is now: a parabola, like something thrown. Pure, so the shape
 * can be tested without a browser.
 *
 * It is played back (FLIP): the chip is already at its new place, so each frame is an offset from there that starts at
 * the old place and shrinks to nothing. The offset is the straight line between the two, minus a parabola that is zero at
 * both ends and highest in the middle, so the chip rises, peaks and settles.
 */

export interface Arc {
  /** Old position minus new position, in px. */
  dx: number;
  dy: number;
  /** How high the middle of the arc is, in px. Defaults to a quarter of the distance, kept between 36 and 160. */
  lift?: number;
  /** How many frames to sample. More is smoother. */
  steps?: number;
}

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const defaultLift = (dx: number, dy: number): number => Math.max(36, Math.min(160, Math.hypot(dx, dy) * 0.28));

/** Where the chip is at progress `t` (0 at the old place, 1 at the new one), as an offset from the new place. */
export function arcOffset({ dx, dy, lift }: Arc, t: number): { x: number; y: number } {
  const p = easeInOutCubic(Math.max(0, Math.min(1, t)));
  const h = lift ?? defaultLift(dx, dy);
  return { x: dx * (1 - p), y: dy * (1 - p) - h * 4 * p * (1 - p) };
}

export function arcKeyframes(arc: Arc): Array<{ transform: string; offset: number }> {
  const steps = Math.max(2, Math.round(arc.steps ?? 28));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const { x, y } = arcOffset(arc, t);
    return { transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, offset: t };
  });
}

/** How long the move takes, and how far apart the chips set off. */
export const DOCK_MS = 950;
export const STAGGER_MS = 70;
/**
 * How long to wait before the first chip sets off. The workspace mounts in the same moment the reveal ends, and that
 * React commit is the heaviest thing the page does, so the flight starts just after it. The animation fills backwards,
 * so each chip is held at its starting place while it waits and nothing jumps.
 */
export const DOCK_START_MS = 120;

/** When chip number `i` (the question counts as the first) sets off, counted from the moment the layout changes. */
export const flightDelay = (i: number): number => DOCK_START_MS + i * STAGGER_MS;

/** When the last of `count` chips has landed. */
export const flightEnd = (count: number): number => flightDelay(Math.max(0, count - 1)) + DOCK_MS;
