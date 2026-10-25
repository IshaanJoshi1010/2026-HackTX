import { monthLabel } from "@/ui/profile/format";
import { HORIZON, type Journey, type JourneyBranch } from "./types";

/**
 * Pure rules for the Future page player and its scrubber. Nothing here owns a timer or reads the store: usePlayback feeds
 * it the milliseconds that passed, and the Scrubber asks it for labels and key presses. That keeps every rule testable
 * with plain numbers.
 */

/** Gliding speed: five years take about ten seconds. */
export const MS_PER_MONTH = 170;
/** How long the player rests on each stop (an event, or the split). */
export const DWELL_MS = 900;
/** Reduced motion: no gliding, one jump from stop to stop this often. */
export const REDUCED_STEP_MS = 1200;

export interface PlaybackParams {
  /** Months to rest on. Any order, duplicates and out of range values are ignored. */
  stops?: readonly number[];
  reducedMotion?: boolean;
  msPerMonth?: number;
  dwellMs?: number;
  reducedStepMs?: number;
  /** The last month. Defaults to the horizon. */
  end?: number;
}

export interface PlaybackState {
  /** The month the player is on (a whole number). */
  month: number;
  /** Milliseconds spent toward the next step: gliding to the next month, resting on a stop, or waiting to jump. */
  elapsed: number;
  /** The stop being rested on right now, or null while gliding. */
  dwellingAt: number | null;
  /** The player reached the end. It does not move again. */
  done: boolean;
}

interface Resolved {
  stops: number[];
  end: number;
  reducedMotion: boolean;
  msPerMonth: number;
  dwellMs: number;
  reducedStepMs: number;
}

const positive = (n: number | undefined, fallback: number): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : fallback);
const nonNegative = (n: number | undefined, fallback: number): number => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : fallback);

/** Whole months strictly inside the ride, sorted and unique. Month 0 (where it starts) and the end never count as stops. */
export function normalizeStops(stops: readonly number[] | undefined, end: number = HORIZON): number[] {
  const kept = new Set<number>();
  for (const s of stops ?? []) {
    if (Number.isFinite(s) && Number.isInteger(s) && s > 0 && s < end) kept.add(s);
  }
  return [...kept].sort((a, b) => a - b);
}

function resolve(params: PlaybackParams): Resolved {
  const end = Math.max(1, Math.round(positive(params.end, HORIZON)));
  return {
    stops: normalizeStops(params.stops, end),
    end,
    reducedMotion: params.reducedMotion === true,
    msPerMonth: positive(params.msPerMonth, MS_PER_MONTH),
    dwellMs: nonNegative(params.dwellMs, DWELL_MS),
    reducedStepMs: positive(params.reducedStepMs, REDUCED_STEP_MS),
  };
}

/** The next month worth landing on after `month`: the next stop, or the end. */
export function nextTarget(month: number, stops: readonly number[], end: number = HORIZON): number {
  for (const s of normalizeStops(stops, end)) if (s > month) return s;
  return end;
}

/**
 * A run begins here. It never rests on the month it starts in, and from the end it starts over at 0 (the store does the
 * same when play is pressed at 60).
 */
export function startPlayback(month: number, params: PlaybackParams = {}): PlaybackState {
  const p = resolve(params);
  const clamped = Number.isFinite(month) ? Math.min(p.end, Math.max(0, Math.round(month))) : 0;
  return { month: clamped >= p.end ? 0 : clamped, elapsed: 0, dwellingAt: null, done: false };
}

/** Someone else moved the clock while the player was running: follow it instead of fighting it. */
export function resyncPlayback(state: PlaybackState, month: number, params: PlaybackParams = {}): PlaybackState {
  if (state.month === month) return state;
  const p = resolve(params);
  const clamped = Number.isFinite(month) ? Math.min(p.end, Math.max(0, Math.round(month))) : 0;
  return { month: clamped, elapsed: 0, dwellingAt: null, done: clamped >= p.end };
}

/**
 * Move the player forward by `dtMs` of real time. Exact for any step size: ticking 5000ms once or 5ms a thousand times
 * lands on the same month with the same rest left. Gliding takes msPerMonth per month; reaching a stop starts a rest of
 * dwellMs (once per stop, since the player only moves forward); reaching the end stops it, with no rest there.
 * Reduced motion does not glide: it jumps to the next stop (or the end) every reducedStepMs.
 */
export function tickPlayback(state: PlaybackState, dtMs: number, params: PlaybackParams = {}): PlaybackState {
  const p = resolve(params);
  if (state.done) return state;
  if (state.month >= p.end) return { month: p.end, elapsed: 0, dwellingAt: null, done: true };
  let budget = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (budget === 0) return state;

  if (p.reducedMotion) {
    let { month, elapsed } = state;
    elapsed += budget;
    while (elapsed >= p.reducedStepMs) {
      elapsed -= p.reducedStepMs;
      month = nextTarget(month, p.stops, p.end);
      if (month >= p.end) return { month: p.end, elapsed: 0, dwellingAt: null, done: true };
    }
    return { month, elapsed, dwellingAt: null, done: false };
  }

  let { month, elapsed, dwellingAt } = state;
  while (budget > 0) {
    if (dwellingAt !== null) {
      const need = p.dwellMs - elapsed;
      if (budget < need) {
        elapsed += budget;
        break;
      }
      budget -= need;
      elapsed = 0;
      dwellingAt = null;
      continue;
    }
    const need = p.msPerMonth - elapsed;
    if (budget < need) {
      elapsed += budget;
      break;
    }
    budget -= need;
    elapsed = 0;
    month += 1;
    if (month >= p.end) return { month: p.end, elapsed: 0, dwellingAt: null, done: true };
    if (p.dwellMs > 0 && p.stops.includes(month)) dwellingAt = month;
  }
  return { month, elapsed, dwellingAt, done: false };
}

// ---- scrubber helpers -------------------------------------------------------------------------------------------

/** Where a month sits along the track, as a percentage of its width: month / horizon, never adjusted for drawing. */
export function monthPercent(month: number, horizon: number = HORIZON): number {
  if (!Number.isFinite(month) || horizon <= 0) return 0;
  const pct = (Math.min(horizon, Math.max(0, month)) / horizon) * 100;
  return Math.round(pct * 1000) / 1000;
}

/** "Now", "In 1 yr", "In 2 yr 8 mo": how far a month is from the start. Matches the whenLabel on events. */
export function whenLabel(month: number): string {
  return month <= 0 ? "Now" : `In ${monthLabel(month)}`;
}

/** What a screen reader says for the thumb: "Oct 2027, in 1 yr". */
export function monthValueText(dateLabel: string, month: number): string {
  const when = whenLabel(month);
  return `${dateLabel}, ${when.charAt(0).toLowerCase()}${when.slice(1)}`;
}

/** The branch the person is looking at. The switch only counts when there is one. */
export function selectedBranch(journey: Journey): JourneyBranch {
  return journey.selectedFuture === "switch" && journey.switch ? journey.switch : journey.keep;
}

export interface NextMilestone {
  id: string;
  title: string;
  month: number;
  /** Months from the selected month. */
  inMonths: number;
  /** "1 yr 8 mo" */
  inLabel: string;
}

/** The first event after the selected month in the selected future, or null at the end of the road. */
export function nextMilestone(journey: Journey): NextMilestone | null {
  const next = journey.events.find((e) => e.month > journey.month && e.futures.includes(journey.selectedFuture));
  if (!next) return null;
  const inMonths = next.month - journey.month;
  return { id: next.id, title: next.title, month: next.month, inMonths, inLabel: monthLabel(inMonths) };
}

/** True when the selected future swaps cars in exactly this month. */
export function isSwapMonth(journey: Journey): boolean {
  const branch = selectedBranch(journey);
  return branch.kind === "switch" && branch.splitMonth !== null && branch.splitMonth === journey.month;
}

/**
 * What a key does to the month on the scrubber, or null for keys it leaves alone. Arrows move one month, Page Up and
 * Page Down a year, Home and End go to the ends. Always a whole month inside 0 to horizon.
 */
export function monthForKey(key: string, month: number, horizon: number = HORIZON): number | null {
  const clamp = (m: number) => Math.min(horizon, Math.max(0, Math.round(m)));
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp(month + 1);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(month - 1);
    case "PageUp":
      return clamp(month + 12);
    case "PageDown":
      return clamp(month - 12);
    case "Home":
      return 0;
    case "End":
      return horizon;
    default:
      return null;
  }
}
