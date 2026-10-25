import { HORIZON, type FutureKind } from "./types";

/**
 * The geometry of the Future road. Pure numbers, no React, no layout reads, so every rule here can be tested.
 *
 * Two coordinates describe a point on the road:
 *   t  how far along time it is (pixels). Month 0 is `frame.t0`, month 60 is `frame.t1`, and the spacing is LINEAR.
 *   c  how far across the road it is (pixels).
 * Horizontal: x = t, y = c (time runs left to right). Vertical (narrow screens): x = c, y = t (time runs top to bottom).
 * All the placement code works in (t, c) once and is turned into screen x/y at the edges, so the vertical road gets the
 * same rules and the same guarantees as the horizontal one.
 *
 * Honesty rules:
 *  - t is a straight line in months. Events and the split sit at timePos(month) exactly.
 *  - The bends of the road (`roadBend`) are decoration. They are a function of the month ONLY: no cost, no result and no
 *    selection ever feeds them, so a bend never means "more" or "less" of anything.
 *  - Nothing here knows a dollar figure. Costs cannot move a path.
 */

export type Orientation = "horizontal" | "vertical";
export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
/** Screen space: x/y from the top left of the road canvas. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Under this width the road turns to run top to bottom instead of shrinking. */
export const VERTICAL_BELOW = 640;
/** What jsdom and the first paint use when there is no layout to read. */
export const DEFAULT_SIZE: Size = { width: 1120, height: 380 };
/** The year ticks: 0 to 5 years. */
export const TICK_MONTHS: readonly number[] = [0, 12, 24, 36, 48, 60];
/** The side of a marker's button. 24px is the smallest comfortable touch target. */
export const MARKER_SIZE = 24;
/** How wide the invisible strip along the road is that takes the scrubbing. */
export const HIT_WIDTH = 24;

export const orientationFor = (width: number): Orientation => (width < VERTICAL_BELOW ? "vertical" : "horizontal");

// ---- layout constants (pixels) ----
const H_PAD_LEFT = 40; // x of month 0: room for the first tick label
const H_PAD_RIGHT = 12;
const H_TOP = 12;
const H_MIN_HEIGHT = 340;
const H_MAX_HEIGHT = 460;
const DEST_GAP = 14; // between where a path ends and its destination
const H_DEST_H = 116;
const V_AXIS_X = 66;
const V_ROAD_LEFT = 84;
const V_PAD_RIGHT = 12;
const V_TOP = 28;
const V_PX_PER_MONTH = 11;
const V_DEST_H = 124;
const V_BOTTOM = 16;
const V_GAP = 8; // between the two destinations side by side
/** The two branches finish pulling apart this many months after the split (less if the split is late). */
const RAMP_MONTHS = 9;
/** A sample every few pixels along time, and at every month, so the polyline is smooth and passes through every month. */
const SAMPLE_PX = 4;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const r1 = (n: number): number => Math.round(n * 10) / 10;
const smootherstep = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10));

/** True when the two rectangles share area. Touching edges do not count. */
export const rectsIntersect = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------------------------------------------------------------------------------------------------------------
// The frame: where the time axis sits on the canvas
// ---------------------------------------------------------------------------------------------------------------

export interface Frame {
  orientation: Orientation;
  width: number;
  height: number;
  /** t of month 0 and of month 60. */
  t0: number;
  t1: number;
  /** c of the road's centre line (the trunk). */
  cMid: number;
  /** How far each branch ends from the centre line: the two destinations sit 2 * halfSep apart. 0 with no switch. */
  halfSep: number;
  /** The most the decorative bend moves the road. */
  bendAmp: number;
  /** A destination box. */
  destW: number;
  destH: number;
  /** c of the axis line. */
  axisC: number;
  hasSwitch: boolean;
}

export function makeFrame(width: number, hasSwitch: boolean, height: number = DEFAULT_SIZE.height): Frame {
  const w = Math.max(240, Math.round(width));
  if (orientationFor(w) === "horizontal") {
    const h = clamp(Math.round(height), H_MIN_HEIGHT, H_MAX_HEIGHT);
    const destW = clamp(Math.round(w * 0.2), 168, 232);
    const axisC = h - 46;
    const regionBottom = axisC - 24;
    return {
      orientation: "horizontal",
      width: w,
      height: h,
      t0: H_PAD_LEFT,
      t1: w - H_PAD_RIGHT - DEST_GAP - destW,
      cMid: (H_TOP + regionBottom) / 2,
      halfSep: hasSwitch ? (H_DEST_H + DEST_GAP) / 2 : 0,
      bendAmp: clamp(Math.round(h * 0.045), 8, 20),
      destW,
      destH: H_DEST_H,
      axisC,
      hasSwitch,
    };
  }
  const span = w - V_PAD_RIGHT - V_ROAD_LEFT;
  const destW = hasSwitch ? clamp(Math.floor((span - V_GAP) / 2), 88, 168) : clamp(span, 88, 240);
  const t1 = V_TOP + HORIZON * V_PX_PER_MONTH;
  return {
    orientation: "vertical",
    width: w,
    height: t1 + DEST_GAP + V_DEST_H + V_BOTTOM,
    t0: V_TOP,
    t1,
    cMid: hasSwitch ? V_ROAD_LEFT + (2 * destW + V_GAP) / 2 : V_ROAD_LEFT + span / 2,
    halfSep: hasSwitch ? (destW + V_GAP) / 2 : 0,
    bendAmp: clamp(Math.round(w * 0.04), 6, 14),
    destW,
    destH: V_DEST_H,
    axisC: V_AXIS_X,
    hasSwitch,
  };
}

const pxPerMonth = (f: Frame): number => (f.t1 - f.t0) / HORIZON;

/** Where a month is along time: x on a horizontal road, y on a vertical one. Linear: padLeft + month / 60 * plotWidth. */
export const timePos = (f: Frame, month: number): number => f.t0 + (month / HORIZON) * (f.t1 - f.t0);
/** `timePos`, named for the horizontal road where it is the x. */
export const xOfMonth = timePos;
/** The inverse of `timePos`, not rounded or limited. */
export const monthAt = (f: Frame, pos: number): number => ((pos - f.t0) / (f.t1 - f.t0)) * HORIZON;
/** The month under a pointer: the inverse of `timePos`, rounded to a whole month and kept within 0 to 60. */
export const monthFromX = (f: Frame, pos: number): number => clamp(Math.round(monthAt(f, pos)), 0, HORIZON);

/**
 * The road's decorative wander, from -1 to 1, and zero at month 0 and month 60. A function of the MONTH ONLY. It is not
 * a scale: no cost, result or selection ever feeds it, so a bend up or down says nothing about money.
 */
export const roadBend = (month: number): number => 0.75 * Math.sin((3 * Math.PI * month) / HORIZON) + 0.25 * Math.sin((7 * Math.PI * month) / HORIZON);

/** How far each branch has pulled away from the centre line by `month`: 0 up to the split, `halfSep` once it has finished. */
export function forkHalf(f: Frame, month: number, split: number | null): number {
  if (split === null || !f.hasSwitch || month <= split) return 0;
  const ts = timePos(f, split);
  const length = Math.max(1, Math.min(RAMP_MONTHS * pxPerMonth(f), f.t1 - ts));
  return f.halfSep * smootherstep((timePos(f, month) - ts) / length);
}

const centreC = (f: Frame, month: number): number => f.cMid + f.bendAmp * roadBend(month);

/** c of a future's path at a month. Keep is the upper (or left) branch, switch the lower (or right). */
function pathC(f: Frame, future: FutureKind, month: number, split: number | null): number {
  const half = forkHalf(f, month, split);
  return future === "keep" ? centreC(f, month) - half : centreC(f, month) + half;
}

export interface TC {
  t: number;
  c: number;
}
const toScreen = (f: Frame, p: TC): Point => (f.orientation === "horizontal" ? { x: p.t, y: p.c } : { x: p.c, y: p.t });

/** Where a future's path is at a month, in screen space. The time marker sits here. */
export function pointOnRoad(road: { frame: Frame; splitMonth: number | null }, future: FutureKind, month: number): Point {
  const f = road.frame;
  const m = clamp(month, 0, HORIZON);
  return toScreen(f, { t: timePos(f, m), c: pathC(f, f.hasSwitch ? future : "keep", m, road.splitMonth) });
}

// ---------------------------------------------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------------------------------------------

function sampleMonths(f: Frame, from: number, to: number): number[] {
  const per = Math.max(1, Math.ceil(pxPerMonth(f) / SAMPLE_PX));
  const out: number[] = [];
  for (let m = from; m < to; m++) for (let k = 0; k < per; k++) out.push(m + k / per);
  out.push(to);
  return out;
}

function sampleLine(f: Frame, future: FutureKind, from: number, to: number, split: number | null): TC[] {
  const pts = sampleMonths(f, from, to).map((m) => ({ t: timePos(f, m), c: pathC(f, future, m, split) }));
  // A split at the very end has no time left to pull apart in, so the branch is a straight step to its destination.
  if (split !== null && split >= HORIZON && from >= HORIZON) pts.push({ t: f.t1, c: centreC(f, HORIZON) + (future === "keep" ? -f.halfSep : f.halfSep) });
  return pts;
}

export function pathData(f: Frame, pts: TC[]): string {
  return pts
    .map((p, i) => {
      const s = toScreen(f, p);
      return `${i === 0 ? "M" : "L"} ${r1(s.x)} ${r1(s.y)}`;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------------------------------------------

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A way to name any month of the road from one known pair: the label of the selected month ("Jun 2029") and which month
 * that is (32). Returns null when the label is not a month and a year, so the caller can say "2 yr" instead.
 */
export function calendarLabeler(label: string, month: number): ((m: number) => string) | null {
  const hit = /^([A-Za-z]{3}) (\d{4})$/.exec(label.trim());
  if (!hit) return null;
  const index = MONTH_NAMES.findIndex((n) => n.toLowerCase() === hit[1].toLowerCase());
  if (index < 0) return null;
  const start = Number(hit[2]) * 12 + index - Math.round(month);
  return (m) => {
    const n = start + Math.round(m);
    return `${MONTH_NAMES[((n % 12) + 12) % 12]} ${Math.floor(n / 12)}`;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Label sizes
// ---------------------------------------------------------------------------------------------------------------

const TITLE_CHAR = 7.6; // a generous 14px average, so the box is never too small for its text
const DATE_CHAR = 6.6; // 12px
const DATE_LINE = 16;
const TITLE_LINE = 18;
const COMPACT_LINE = 20;
const MIN_LABEL_W = 56;
const TIGHT_W = 76;

/** The most a label may be wide. Narrower on the vertical road, where labels sit beside it. */
export function maxLabelWidth(f: Frame): number {
  if (f.orientation === "horizontal") return clamp(Math.round((f.t1 - f.t0) * 0.2), 120, 190);
  return clamp(Math.floor((f.width - V_ROAD_LEFT - V_PAD_RIGHT) / 2) - 24, 88, 168);
}

/**
 * How much room a label needs: `full` is the date over the title (the title may take two lines), `compact` is both on
 * one line. Estimated from the text, and the label box is then fixed to this size so text can only clip, never spill.
 */
export function estimateLabelSize(label: { title: string; dateLabel: string }, maxWidth: number): { full: Size; compact: Size; tight: Size } {
  const titleW = label.title.length * TITLE_CHAR;
  const dateW = label.dateLabel.length * DATE_CHAR;
  const width = clamp(Math.ceil(Math.max(titleW, dateW)) + 4, MIN_LABEL_W, maxWidth);
  const lines = Math.min(2, Math.max(1, Math.ceil(titleW / (width - 4))));
  const compactW = clamp(Math.ceil(dateW + 8 + titleW) + 4, MIN_LABEL_W, maxWidth);
  return {
    full: { width, height: DATE_LINE + lines * TITLE_LINE },
    compact: { width: compactW, height: COMPACT_LINE },
    // for a gap that is narrow: the same single line, cut short
    tight: { width: Math.min(compactW, TIGHT_W), height: COMPACT_LINE },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Label placement
// ---------------------------------------------------------------------------------------------------------------

interface TCRect {
  t0: number;
  t1: number;
  c0: number;
  c1: number;
}
const inflate = (r: TCRect, by: number): TCRect => ({ t0: r.t0 - by, t1: r.t1 + by, c0: r.c0 - by, c1: r.c1 + by });
const overlaps = (a: TCRect, b: TCRect): boolean => a.t0 < b.t1 && b.t0 < a.t1 && a.c0 < b.c1 && b.c0 < a.c1;

/** Whether the segment a to b passes through the rectangle (Liang-Barsky). */
function segmentHits(a: TC, b: TC, r: TCRect): boolean {
  let u0 = 0;
  let u1 = 1;
  const dt = b.t - a.t;
  const dc = b.c - a.c;
  const edges: Array<[number, number]> = [
    [-dt, a.t - r.t0],
    [dt, r.t1 - a.t],
    [-dc, a.c - r.c0],
    [dc, r.c1 - a.c],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const u = q / p;
      if (p < 0) {
        if (u > u1) return false;
        if (u > u0) u0 = u;
      } else {
        if (u < u0) return false;
        if (u < u1) u1 = u;
      }
    }
  }
  return true;
}

/** Whether a polyline (sorted by t) passes through the rectangle. */
function lineHits(pts: TC[], r: TCRect): boolean {
  if (pts.length === 0) return false;
  // first index whose t is at or past the rectangle's left edge
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < r.t0) lo = mid + 1;
    else hi = mid;
  }
  const start = Math.max(0, lo - 1);
  if (pts.length === 1) return pts[0].t >= r.t0 && pts[0].t <= r.t1 && pts[0].c >= r.c0 && pts[0].c <= r.c1;
  for (let i = start; i < pts.length - 1; i++) {
    if (pts[i].t > r.t1) break;
    if (segmentHits(pts[i], pts[i + 1], r)) return true;
  }
  return false;
}

export interface LabelRequest {
  id: string;
  /** t of the marker. */
  t: number;
  /** c of the marker's first and last dot (a stack that sits on both branches spans two). */
  cMin: number;
  cMax: number;
  full: Size;
  compact: Size;
  /** The one-line label cut short, for the last resort. Falls back to `compact`. */
  tight?: Size;
  /** -1: above (horizontal) or left (vertical). 1: below or right. Where to try first. */
  prefer: -1 | 1;
}

export interface PlaceInput {
  orientation: Orientation;
  width: number;
  height: number;
  /** In the order they should be placed (by time). */
  requests: LabelRequest[];
  /** The visible paths, as polylines in (t, c). A label keeps clear of every one. */
  paths: Array<Array<{ t: number; c: number }>>;
  /** Boxes a label must not touch: the destinations and the axis. Screen space. */
  blocks: Rect[];
  /** Every marker's button, own included. Screen space. */
  markers: Array<{ id: string; rect: Rect }>;
}

export interface PlacedLabel {
  id: string;
  /** Screen space. Fixed size: the text is clipped to it. */
  rect: Rect;
  /** One line (date and title side by side) because the roomier label did not fit. */
  compact: boolean;
  /** -1 above (or left of) the marker, 1 below (or right of) it, 0 between the two dots of a stack. */
  side: -1 | 0 | 1;
  /** How far past the marker the label was bumped (0 sits right beside it). */
  offset: number;
  /** A thin line from the marker to the label, when the label is not beside it. */
  leader: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Which edge of the label the text hugs. */
  align: "start" | "end";
}

interface Found {
  rect: TCRect;
  compact: boolean;
  side: -1 | 0 | 1;
  offset: number;
  leader: TCRect | null;
  line: PlacedLabel["leader"];
  /** Found by the last-resort search, not beside its marker. */
  far: boolean;
}

const PATH_MARGIN = 10;
const LABEL_GAP = 6;
const OFFSET_STEP = 6;
const NEAR_GAP = 4; // between a marker's button and the label

/**
 * Where each label goes. Greedy over the requests in time order: each tries its preferred side (the sides alternate), as
 * close to its marker as it can, then the other side, then bumps further out to the next lane, until a spot clears
 *  - every label already placed (and the thin line each one hangs from),
 *  - every marker, every destination and the axis,
 *  - every visible path, with a margin,
 *  - the edge of the canvas.
 * If the two-line label has no spot the one-line label gets the same search, and as a last resort any free spot on the
 * canvas. A label with no free spot at all comes back null (its marker is still a button). The result never contains
 * two rectangles that overlap, or one that leaves the canvas.
 */
export function placeLabels(input: PlaceInput): Record<string, PlacedLabel | null> {
  const horizontal = input.orientation === "horizontal";
  const T = horizontal ? input.width : input.height;
  const C = horizontal ? input.height : input.width;
  const toTC = (r: Rect): TCRect => (horizontal ? { t0: r.x, t1: r.x + r.w, c0: r.y, c1: r.y + r.h } : { t0: r.y, t1: r.y + r.h, c0: r.x, c1: r.x + r.w });
  const toRect = (r: TCRect): Rect => (horizontal ? { x: r.t0, y: r.c0, w: r.t1 - r.t0, h: r.c1 - r.c0 } : { x: r.c0, y: r.t0, w: r.c1 - r.c0, h: r.t1 - r.t0 });
  const sizeTC = (s: Size) => (horizontal ? { ts: s.width, cs: s.height } : { ts: s.height, cs: s.width });
  const pointOf = (t: number, c: number): Point => (horizontal ? { x: t, y: c } : { x: c, y: t });

  const blocks = input.blocks.map((b) => inflate(toTC(b), LABEL_GAP));
  const markers = input.markers.map((m) => ({ id: m.id, rect: toTC(m.rect) }));
  let labels: TCRect[] = [];
  let leaders: TCRect[] = [];

  /** Whether a label rectangle (and the line it hangs from) can go here. */
  const clear = (rect: TCRect, own: string, leader: TCRect | null): boolean => {
    if (rect.t0 < 2 || rect.c0 < 2 || rect.t1 > T - 2 || rect.c1 > C - 2) return false;
    for (const b of blocks) if (overlaps(rect, b)) return false;
    for (const m of markers) if (overlaps(rect, inflate(m.rect, 2))) return false;
    for (const l of labels) if (overlaps(rect, inflate(l, LABEL_GAP))) return false;
    for (const l of leaders) if (overlaps(rect, inflate(l, 2))) return false;
    const padded = inflate(rect, PATH_MARGIN);
    for (const p of input.paths) if (lineHits(p, padded)) return false;
    if (leader) {
      for (const l of labels) if (overlaps(leader, inflate(l, 2))) return false;
      for (const m of markers) if (m.id !== own && overlaps(leader, m.rect)) return false;
      for (const b of blocks) if (overlaps(leader, b)) return false;
      for (const p of input.paths) if (lineHits(p, inflate(leader, 2))) return false;
    }
    return true;
  };

  /** Near its marker: the preferred side first, then the other, then the next lane out. */
  const near = (q: LabelRequest): Found | null => {
    for (const compact of [false, true]) {
      const { ts, cs } = sizeTC(compact ? q.compact : q.full);
      // where along time the label starts: hanging right from the marker, then ending at it, then in between
      const starts: number[] = [q.t - 6, q.t - ts + 6];
      for (let s = q.t - 6 - 8; s > q.t - ts + 6; s -= 8) starts.push(s);
      // a stack on both branches has room between them: beside its connecting line, with nothing to tie it to
      if (q.cMax > q.cMin) {
        const c0 = (q.cMin + q.cMax) / 2 - cs / 2;
        for (const t0 of [q.t + 16, q.t - 16 - ts]) {
          const rect: TCRect = { t0, t1: t0 + ts, c0, c1: c0 + cs };
          if (clear(rect, q.id, null)) return { rect, compact, side: 0, offset: 0, leader: null, line: null, far: false };
        }
      }
      const maxOffset = (compact ? 5 : 3) * (cs + LABEL_GAP);
      for (let offset = 0; offset <= maxOffset; offset += OFFSET_STEP) {
        for (const side of [q.prefer, (q.prefer === 1 ? -1 : 1) as -1 | 1]) {
          const c0 = side < 0 ? q.cMin - MARKER_SIZE / 2 - NEAR_GAP - offset - cs : q.cMax + MARKER_SIZE / 2 + NEAR_GAP + offset;
          for (const t0 of starts) {
            const rect: TCRect = { t0, t1: t0 + ts, c0, c1: c0 + cs };
            const reach = side < 0 ? { c0: rect.c1, c1: q.cMin - 6 } : { c0: q.cMax + 6, c1: rect.c0 };
            const leader: TCRect | null = offset > 0 ? { t0: q.t - 1, t1: q.t + 1, ...reach } : null;
            if (!clear(rect, q.id, leader)) continue;
            const from = pointOf(q.t, side < 0 ? q.cMin - 6 : q.cMax + 6);
            const to = pointOf(q.t, side < 0 ? rect.c1 : rect.c0);
            return { rect, compact, side, offset, leader, line: leader ? { x1: from.x, y1: from.y, x2: to.x, y2: to.y } : null, far: false };
          }
        }
      }
    }
    return null;
  };

  /** Last resort: any free spot on the canvas, nearest the marker first, tied to it by a line. */
  const anywhere = (q: LabelRequest): Found | null => {
    const middle = (q.cMin + q.cMax) / 2;
    for (const size of [q.compact, q.tight ?? q.compact]) {
      const { ts, cs } = sizeTC(size);
      const spots: Array<{ t0: number; c0: number; d: number }> = [];
      for (let t0 = 2; t0 + ts <= T - 2; t0 += 8) {
        for (let c0 = 2; c0 + cs <= C - 2; c0 += 4) {
          const dt = t0 + ts / 2 - q.t;
          const dc = c0 + cs / 2 - middle;
          spots.push({ t0, c0, d: dt * dt + dc * dc });
        }
      }
      spots.sort((a, b) => a.d - b.d);
      for (const s of spots) {
        const rect: TCRect = { t0: s.t0, t1: s.t0 + ts, c0: s.c0, c1: s.c0 + cs };
        if (!clear(rect, q.id, null)) continue;
        // the line back to the marker must not run through another label
        const a = { t: q.t, c: middle };
        const b = { t: clamp(q.t, rect.t0, rect.t1), c: clamp(middle, rect.c0, rect.c1) };
        if (labels.some((l) => segmentHits(a, b, inflate(l, 1)))) continue;
        const from = pointOf(a.t, a.c);
        const to = pointOf(b.t, b.c);
        const side: -1 | 1 = s.c0 + cs / 2 < middle ? -1 : 1;
        return { rect, compact: true, side, offset: Math.round(Math.sqrt(s.d)), leader: null, line: { x1: from.x, y1: from.y, x2: to.x, y2: to.y }, far: true };
      }
    }
    return null;
  };

  /** Place every label in this order. The score is lower for labels that sit close, and large for ones that did not fit. */
  const solve = (order: LabelRequest[]): { out: Record<string, PlacedLabel | null>; score: number } => {
    labels = [];
    leaders = [];
    const out: Record<string, PlacedLabel | null> = {};
    let score = 0;
    for (const q of order) {
      const found = near(q) ?? anywhere(q);
      if (!found) {
        out[q.id] = null;
        score += 100000;
        continue;
      }
      score += found.offset + (found.compact ? 40 : 0) + (found.far ? 1000 : 0);
      labels.push(found.rect);
      if (found.leader) leaders.push(found.leader);
      const mid = (found.rect.t0 + found.rect.t1) / 2;
      const align: "start" | "end" = horizontal ? (mid < q.t ? "end" : "start") : found.side < 0 ? "end" : "start";
      out[q.id] = { id: q.id, rect: toRect(found.rect), compact: found.compact, side: found.side, offset: found.offset, leader: found.line, align };
    }
    return { out, score };
  };

  // Earliest first reads best. A tight cluster only stacks cleanly the other way round (the last one nearest the road, each
  // earlier one a lane further out, so no line crosses a label), so that order is tried too and the better result is kept.
  const forward = solve(input.requests);
  if (input.requests.length < 2 || forward.score < 100) return forward.out;
  const backward = solve([...input.requests].reverse());
  return backward.score < forward.score ? backward.out : forward.out;
}

// ---------------------------------------------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------------------------------------------

export interface RoadEvent {
  id: string;
  month: number;
  kind: "life" | "swap";
  futures: FutureKind[];
  title: string;
  dateLabel: string;
}

export interface MarkerLayout {
  id: string;
  kind: "life" | "swap";
  /** One dot, or a pair joined by a line: a life event after the split sits on both branches. */
  shape: "single" | "pair";
  /** Where it sits: the shared trunk, the keep branch, the switch branch, or both branches. */
  on: "trunk" | "keep" | "switch" | "both";
  month: number;
  /** Position along time: always timePos(month). Never nudged. */
  t: number;
  /** The dots' centres, screen space. One for a single, two for a pair (keep first). */
  dots: Point[];
  /** The button's box, screen space. */
  rect: Rect;
}

const STACK = 24; // how far events that would crowd each other are pushed apart across the road
const NEAR = 20; // closer than this (both ways) and two dots crowd

interface Placed {
  t: number;
  cs: number[];
  pair: boolean;
}
function crowds(a: Placed, b: Placed): boolean {
  const dotDot = a.cs.some((ca) => b.cs.some((cb) => Math.abs(a.t - b.t) < NEAR && Math.abs(ca - cb) < NEAR));
  if (dotDot) return true;
  const hitsLine = (p: Placed, q: Placed) => p.pair && q.cs.some((c) => Math.abs(q.t - p.t) < 14 && c > p.cs[0] - 10 && c < p.cs[1] + 10);
  return hitsLine(a, b) || hitsLine(b, a);
}

function layoutMarkers(f: Frame, events: RoadEvent[], split: number | null): MarkerLayout[] {
  const hasSwitch = f.hasSwitch;
  const monthOf = (e: RoadEvent): number => clamp(e.month, 0, HORIZON);
  const zoneOf = (e: RoadEvent): MarkerLayout["on"] => {
    if (!hasSwitch) return "keep";
    const keep = e.futures.includes("keep");
    const sw = e.futures.includes("switch");
    if (e.kind === "swap" || (sw && !keep)) return "switch";
    if (keep && !sw) return "keep";
    return split !== null && monthOf(e) <= split ? "trunk" : "both";
  };
  const base = (e: RoadEvent, zone: MarkerLayout["on"]): number[] => {
    const m = monthOf(e);
    if (zone === "both") return [pathC(f, "keep", m, split), pathC(f, "switch", m, split)];
    if (zone === "switch") return [pathC(f, "switch", m, split)];
    if (zone === "keep") return [pathC(f, "keep", m, split)];
    return [centreC(f, m)];
  };

  const order = events.map((e, i) => ({ e, i, zone: zoneOf(e) })).sort((a, b) => monthOf(a.e) - monthOf(b.e) || a.i - b.i);
  const result = new Map<string, { zone: MarkerLayout["on"]; cs: number[] }>();
  const placed: Placed[] = [];
  const room = (cs: number[]) => cs.every((c) => c - MARKER_SIZE / 2 >= 2 && c + MARKER_SIZE / 2 <= (f.orientation === "horizontal" ? f.height : f.width) - 2);

  // Everything that lands on the split itself: the life events on the trunk's end and the swap, one stack centred on it.
  const atSplit = split === null ? [] : order.filter((o) => monthOf(o.e) === split && (o.zone === "trunk" || (o.zone === "switch" && o.e.kind === "swap")));
  if (atSplit.length >= 2) {
    const sorted = [...atSplit.filter((o) => o.zone === "trunk"), ...atSplit.filter((o) => o.zone !== "trunk")];
    sorted.forEach((o, j) => {
      const cs = [centreC(f, monthOf(o.e)) + (j - (sorted.length - 1) / 2) * STACK];
      result.set(o.e.id, { zone: o.zone, cs });
      placed.push({ t: timePos(f, monthOf(o.e)), cs, pair: false });
    });
  }

  for (const o of order) {
    if (result.has(o.e.id)) continue;
    const m = monthOf(o.e);
    const t = timePos(f, m);
    const centre = base(o.e, o.zone);
    const pair = o.zone === "both";
    const steps = pair ? [0, 1, 2, 3, 4] : o.e.kind === "swap" ? [0, 1, -1, 2, -2, 3, -3] : [0, -1, 1, -2, 2, -3, 3];
    const trial = (k: number): number[] => (pair ? [centre[0] - k * STACK, centre[1] + k * STACK] : [centre[0] + k * STACK]);
    const pick = steps.map(trial).find((cs) => room(cs) && !placed.some((p) => crowds(p, { t, cs, pair }))) ?? trial(0);
    result.set(o.e.id, { zone: o.zone, cs: pick });
    placed.push({ t, cs: pick, pair });
  }

  const half = MARKER_SIZE / 2;
  return order.map(({ e }) => {
    const { zone, cs } = result.get(e.id)!;
    const m = monthOf(e);
    const t = timePos(f, m);
    const pair = cs.length === 2;
    const lo = Math.min(...cs);
    const hi = Math.max(...cs);
    const a = toScreen(f, { t: t - half, c: lo - half });
    const b = toScreen(f, { t: t + half, c: hi + half });
    return {
      id: e.id,
      kind: e.kind,
      shape: pair ? "pair" : "single",
      on: zone,
      month: m,
      t,
      dots: cs.map((c) => toScreen(f, { t, c })),
      rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The road
// ---------------------------------------------------------------------------------------------------------------

export interface RoadInput {
  width: number;
  height?: number;
  events: RoadEvent[];
  /** The month the switch leaves the keep path (also for the dashed offer). Null: there is no switch to draw. */
  splitMonth: number | null;
  selectedFuture: FutureKind;
}

export interface AxisTick {
  month: number;
  /** The tick mark. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Two lines of text under (or beside) it, and which side of that point they hang from. */
  text: { x: number; y1: number; y2: number; anchor: "middle" | "end" };
}

export interface Road {
  frame: Frame;
  orientation: Orientation;
  splitMonth: number | null;
  selectedFuture: FutureKind;
  /** SVG path strings. `trunk` is the shared part up to the split; null when there is none or no switch. */
  paths: { trunk: string | null; keep: string; switch: string | null; scrub: string; other: string | null };
  /** The same paths as polylines in road space, for the checks. */
  lines: { trunk: TC[] | null; keep: TC[]; switch: TC[] | null; scrub: TC[] };
  /** Where the switch leaves, screen space. `x` (or `y` on a vertical road) is always timePos(splitMonth). */
  split: { month: number; x: number; y: number } | null;
  axis: { line: { x1: number; y1: number; x2: number; y2: number }; ticks: AxisTick[] };
  destinations: { keep: Rect; switch: Rect | null };
  markers: MarkerLayout[];
  labels: Record<string, PlacedLabel | null>;
}

export function buildRoad(input: RoadInput): Road {
  const split = input.splitMonth === null ? null : clamp(input.splitMonth, 0, HORIZON);
  const hasSwitch = split !== null;
  const f = makeFrame(input.width, hasSwitch, input.height);
  const selected: FutureKind = hasSwitch ? input.selectedFuture : "keep";

  // paths
  let trunk: TC[] | null = null;
  let keep: TC[];
  let sw: TC[] | null = null;
  if (split === null) {
    keep = sampleLine(f, "keep", 0, HORIZON, null);
  } else {
    if (split > 0) trunk = sampleLine(f, "keep", 0, split, split);
    keep = sampleLine(f, "keep", split, HORIZON, split);
    sw = sampleLine(f, "switch", split, HORIZON, split);
  }
  const branch = selected === "keep" ? keep : (sw ?? keep);
  const scrub = trunk ? [...trunk, ...branch.slice(1)] : branch;
  const other = hasSwitch ? (selected === "keep" ? sw : keep) : null;

  // axis
  const horizontal = f.orientation === "horizontal";
  const axisLine = horizontal ? { x1: f.t0, y1: f.axisC, x2: f.t1, y2: f.axisC } : { x1: f.axisC, y1: f.t0, x2: f.axisC, y2: f.t1 };
  const ticks: AxisTick[] = TICK_MONTHS.map((month) => {
    const t = timePos(f, month);
    return horizontal
      ? { month, x1: t, y1: f.axisC, x2: t, y2: f.axisC + 6, text: { x: t, y1: f.axisC + 22, y2: f.axisC + 38, anchor: "middle" as const } }
      : { month, x1: f.axisC - 6, y1: t, x2: f.axisC, y2: t, text: { x: f.axisC - 12, y1: t + 4, y2: t + 20, anchor: "end" as const } };
  });

  // destinations
  const destAt = (future: FutureKind): Rect => {
    // Where the path finishes pulling apart, even when a split at the very end left no time to do it.
    const c = centreC(f, HORIZON) + (hasSwitch ? (future === "keep" ? -f.halfSep : f.halfSep) : 0);
    return horizontal
      ? { x: f.t1 + DEST_GAP, y: c - f.destH / 2, w: f.destW, h: f.destH }
      : { x: c - f.destW / 2, y: f.t1 + DEST_GAP, w: f.destW, h: f.destH };
  };
  const destinations = { keep: destAt("keep"), switch: hasSwitch ? destAt("switch") : null };

  // markers and labels
  const markers = layoutMarkers(f, input.events, split);
  const axisBlock: Rect = horizontal ? { x: 0, y: f.axisC - 12, w: f.width, h: f.height - (f.axisC - 12) } : { x: 0, y: 0, w: f.axisC + 8, h: f.height };
  const blocks = [axisBlock, destinations.keep, ...(destinations.switch ? [destinations.switch] : [])];
  const maxW = maxLabelWidth(f);
  const byId = new Map(input.events.map((e) => [e.id, e]));
  let flip: -1 | 1 = -1;
  const swapMonths = new Set(input.events.filter((e) => e.kind === "swap").map((e) => clamp(e.month, 0, HORIZON)));
  const requests: LabelRequest[] = markers.map((m) => {
    const e = byId.get(m.id)!;
    const cs = m.dots.map((d) => (horizontal ? d.y : d.x));
    // The swap hangs below (or right of) the road, the life event it shares a month with above it, the rest alternate.
    let prefer: -1 | 1;
    if (m.kind === "swap") prefer = 1;
    else if (swapMonths.has(m.month)) prefer = -1;
    else {
      prefer = flip;
      flip = flip === -1 ? 1 : -1;
    }
    return { id: m.id, t: m.t, cMin: Math.min(...cs), cMax: Math.max(...cs), ...estimateLabelSize(e, maxW), prefer };
  });
  const paths = [trunk, keep, sw].filter((p): p is TC[] => p !== null);
  const labels = placeLabels({ orientation: f.orientation, width: f.width, height: f.height, requests, paths, blocks, markers: markers.map((m) => ({ id: m.id, rect: m.rect })) });

  return {
    frame: f,
    orientation: f.orientation,
    splitMonth: split,
    selectedFuture: selected,
    paths: {
      trunk: trunk && trunk.length > 1 ? pathData(f, trunk) : null,
      keep: pathData(f, keep),
      switch: sw ? pathData(f, sw) : null,
      scrub: pathData(f, scrub),
      other: other ? pathData(f, other) : null,
    },
    lines: { trunk, keep, switch: sw, scrub },
    split: split === null ? null : { month: split, ...toScreen(f, { t: timePos(f, split), c: centreC(f, split) }) },
    axis: { line: axisLine, ticks },
    destinations,
    markers,
    labels,
  };
}
