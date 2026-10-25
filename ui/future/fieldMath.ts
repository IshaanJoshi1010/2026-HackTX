/**
 * The future as streams of particles. Pure geometry and shaping, no React and no canvas.
 *
 * Every stream follows a real projection: how far a future's net cost has drifted from "if nothing changes", month by
 * month, the same curve the road draws. Down costs more, up saves money. Where a future first differs from the one it
 * came from, it splits off, so a decision reads as a fork. Nothing here is decorative: a stream that does not move
 * means the decision did not move the cost.
 */
import type { LifeEvent, Scenario, SimulationResult } from "@/contracts";
import { MONTH_MAX } from "@/ui/store/months";
import { decisionsOf } from "@/ui/timeline/layout";
import { deltaSeries, drawnRange, roadX, roadY, smoothSeries, type DeltaPoint, type Frame } from "@/ui/timeline/roadMath";

export type StreamKind = "baseline" | "yours" | "replace" | "other";

export interface Stream {
  id: string;
  name: string;
  kind: StreamKind;
  active: boolean;
  /** The future you are keeping in a comparison. It can be the baseline itself, when nothing has changed yet. */
  keep: boolean;
  parentId: string | null;
  /** Where its own particles start: the month it first differs from the future it came from. */
  fromMonth: number;
  /** Drift from "if nothing changes", months 0 to 60. These are the numbers. */
  series: DeltaPoint[];
  /** The same, with one-month blips removed, for drawing only. */
  drawn: DeltaPoint[];
  /** Where it ends up, raw. */
  endDelta: number;
  /** Cost at the end minus the future it came from, raw. Undefined for the baseline. */
  endVsParent: number | undefined;
  /** Its own decisions: the confirmed ones the future it came from did not already have. */
  decisions: LifeEvent[];
}

export interface FieldInput {
  scenarios: Scenario[];
  results: Record<string, SimulationResult>;
  baselineId: string;
  activeId: string;
  comparison: { keepId: string; replaceId: string } | null;
  /** Draw every future, not just the one you are looking at and the two you compared. */
  showAll: boolean;
  /** Names on the streams. */
  names: { baseline: string; keep: (s: Scenario) => string; replace: (s: Scenario) => string };
}

const valueAtMonth = (series: DeltaPoint[], month: number): number => {
  if (series.length === 0) return 0;
  if (month <= series[0].month) return series[0].delta;
  for (let i = 1; i < series.length; i++) {
    const b = series[i];
    if (month <= b.month) {
      const a = series[i - 1];
      const span = b.month - a.month;
      return span <= 0 ? b.delta : a.delta + ((b.delta - a.delta) * (month - a.month)) / span;
    }
  }
  return series[series.length - 1].delta;
};
export { valueAtMonth };

/** The month a future first differs from the one it came from, to the dollar, less one so the two join cleanly. */
function divergence(child: DeltaPoint[], parent: DeltaPoint[] | undefined, floor: number): number {
  if (!parent) return floor;
  const at = new Map(parent.map((p) => [p.month, p.delta]));
  for (const p of child) {
    if (p.month < floor) continue;
    const q = at.get(p.month);
    if (q !== undefined && Math.round(p.delta - q) !== 0) return Math.max(floor, p.month - 1);
  }
  return floor; // the same cost all the way: it rides along with its parent from where it branched
}

export function buildStreams(input: FieldInput): Stream[] {
  const { scenarios, results, baselineId, activeId, comparison, showAll, names } = input;
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const baselineResult = results[baselineId];
  if (!byId.has(baselineId)) return [];

  // Which futures to draw: the baseline, the one in view, the two compared, and the ones they came from.
  const want = new Set<string>([baselineId]);
  const add = (id: string | undefined) => {
    for (let cur = id ? byId.get(id) : undefined, guard = 0; cur && !want.has(cur.id) && guard < 50; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard++) want.add(cur.id);
  };
  if (showAll) scenarios.forEach((s) => want.add(s.id));
  add(activeId);
  if (comparison) {
    add(comparison.keepId);
    add(comparison.replaceId);
  }

  const raw = new Map(scenarios.map((s) => [s.id, deltaSeries(results[s.id], baselineResult)]));
  const streams: Stream[] = [];
  for (const s of scenarios) {
    if (!want.has(s.id) || !results[s.id]) continue;
    const series = raw.get(s.id) ?? [];
    const parent = s.parentId ? byId.get(s.parentId) : undefined;
    const kind: StreamKind =
      s.id === baselineId ? "baseline"
      : comparison?.replaceId === s.id ? "replace"
      : s.id === (comparison?.keepId ?? activeId) ? "yours"
      : "other";
    const parentSeries = parent ? raw.get(parent.id) : undefined;
    const parentIds = new Set((parent?.events ?? []).map((e) => e.id));
    const end = series.at(-1)?.delta ?? 0;
    streams.push({
      id: s.id,
      name: comparison?.keepId === s.id ? names.keep(s) : kind === "baseline" ? names.baseline : kind === "replace" ? names.replace(s) : s.name,
      kind,
      active: s.id === activeId,
      keep: comparison?.keepId === s.id,
      parentId: parent?.id ?? null,
      fromMonth: kind === "baseline" ? 0 : divergence(series, parentSeries, s.forkMonth),
      series,
      drawn: smoothSeries(series),
      endDelta: end,
      endVsParent: parentSeries ? end - (parentSeries.at(-1)?.delta ?? 0) : kind === "baseline" ? undefined : end,
      decisions: kind === "baseline" ? [] : decisionsOf(s).filter((e) => !parentIds.has(e.id)),
    });
  }
  // The baseline first, then whatever came from it, so a parent is always drawn before its children.
  return streams.sort((a, b) => Number(b.kind === "baseline") - Number(a.kind === "baseline") || a.fromMonth - b.fromMonth);
}

/** Cost against something, in words. Rounded to the dollar, so "the same" means the same. */
export function compareWords(delta: number, versus: string): string {
  const r = Math.round(delta);
  return r === 0 ? `costs the same as ${versus}` : r > 0 ? `costs more than ${versus}` : `costs less than ${versus}`;
}

/** What to say under a stream's name, with no numbers in it. */
export function streamWords(stream: Stream, streams: Stream[]): string | null {
  const keep = streams.find((s) => s.keep);
  const replace = streams.find((s) => s.kind === "replace");
  if (keep && replace) {
    if (stream.kind === "replace") return compareWords(replace.endDelta - keep.endDelta, "keeping");
    if (stream.keep) return compareWords(keep.endDelta - replace.endDelta, "switching");
  }
  if (stream.kind === "baseline") return null;
  return compareWords(stream.endDelta, "if nothing changed");
}

// ---- layout -------------------------------------------------------------------------------------------------

export interface FieldLayout {
  frame: Frame;
  plotLeft: number;
  plotWidth: number;
  range: number;
  x(month: number): number;
  y(delta: number): number;
}

/** The streams run from `plotLeft` to the start of the tag column. */
export function layoutField(streams: Stream[], size: { width: number; height: number }, opts: { tagWidth: number; padX?: number } = { tagWidth: 0 }): FieldLayout {
  const padX = opts.padX ?? 28;
  const plotLeft = padX;
  const plotWidth = Math.max(120, size.width - opts.tagWidth - padX * 2);
  const frame: Frame = { width: plotWidth, height: size.height, padTop: Math.max(44, size.height * 0.16), padBottom: Math.max(40, size.height * 0.16) };
  const range = drawnRange(streams.map((s) => s.drawn));
  return { frame, plotLeft, plotWidth, range, x: (m) => plotLeft + roadX(m, plotWidth), y: (d) => roadY(d, range, frame) };
}

/** Where a stream is at a month, in pixels. Uses the numbers, not the smoothed copy. */
export function streamPoint(layout: FieldLayout, stream: Stream, month: number): { x: number; y: number } {
  const m = Math.max(0, Math.min(MONTH_MAX, month));
  return { x: layout.x(m), y: layout.y(valueAtMonth(stream.series, m)) };
}

// ---- particles ----------------------------------------------------------------------------------------------

/** A small deterministic random source, so the same future always scatters the same way. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export interface Particle {
  /** Progress along the stream, 0 at its start and 1 at its end. */
  u: number;
  /** Progress per second. */
  speed: number;
  /** Sideways scatter, in -1 to 1, as a fraction of the stream's width. */
  off: number;
  size: number;
  /** A number in 0 to 1 that keeps each one's wobble different. */
  seed: number;
}

export function makeParticles(count: number, seed: number): Particle[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: Math.max(0, Math.round(count)) }, () => ({
    u: rnd(),
    speed: 0.035 + rnd() * 0.05,
    off: (rnd() + rnd() + rnd()) / 1.5 - 1, // bunched toward the middle of the stream
    size: 0.8 + rnd() * 1.3,
    seed: rnd(),
  }));
}

/** Moves particles along by `dt` seconds. A particle that reaches the end starts again at the beginning. */
export function advance(particles: Particle[], dt: number): void {
  for (const p of particles) {
    p.u += p.speed * dt;
    if (p.u >= 1) p.u -= Math.floor(p.u);
  }
}

const KIND_BASE: Record<StreamKind, number> = { yours: 0.85, replace: 0.85, other: 0.5, baseline: 0.42 };

/** How many particles a stream gets: more for the one you are looking at, fewer for a short one, fewer on a slow machine. */
export function particleCount(stream: Stream, lowPower = false): number {
  const base = stream.active ? 240 : stream.kind === "baseline" ? 90 : stream.kind === "other" ? 70 : 120;
  const length = Math.max(0.25, (MONTH_MAX - stream.fromMonth) / MONTH_MAX);
  return Math.round(base * length * (lowPower ? 0.4 : 1));
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Dot {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

/** One particle's place, size and brightness at a moment. Fades in at the start of its stream and out at the end. */
export function particleDot(layout: FieldLayout, stream: Stream, p: Particle, time: number, spread = 7): Dot {
  const month = stream.fromMonth + p.u * (MONTH_MAX - stream.fromMonth);
  const y = layout.y(valueAtMonth(stream.drawn, month)) + p.off * spread * (stream.active ? 1.3 : 0.8) + Math.sin(time * 0.8 + p.seed * 6.283) * 1.4;
  const dim = stream.active ? 1 : 0.62;
  return { x: layout.x(month), y, r: p.size * (stream.active ? 1.15 : 0.9), alpha: KIND_BASE[stream.kind] * dim * smooth(0, 0.05, p.u) * (1 - smooth(0.93, 1, p.u)) };
}
