import { describe, expect, it } from "vitest";
import { journeyCompared, journeyOffer } from "./fixtures";
import {
  DEFAULT_SIZE,
  MARKER_SIZE,
  TICK_MONTHS,
  VERTICAL_BELOW,
  buildRoad,
  calendarLabeler,
  estimateLabelSize,
  forkHalf,
  makeFrame,
  monthAt,
  monthFromX,
  orientationFor,
  placeLabels,
  pointOnRoad,
  rectsIntersect,
  roadBend,
  timePos,
  xOfMonth,
  type PlacedLabel,
  type Rect,
  type Road,
  type RoadEvent,
} from "./roadGeometry";
import { HORIZON } from "./types";

const EM_DASH = String.fromCharCode(0x2014);

const roadEvent = (e: { id: string; month: number; kind: "life" | "swap"; futures: Array<"keep" | "switch">; title: string; dateLabel: string }): RoadEvent => e;
const compared: RoadEvent[] = journeyCompared.events.map(roadEvent);

/** Eight events inside five months, two of them in the same month, like a long brain dump. */
const TITLES = ["Move to Denver", "20,000 miles a year", "Second child", "New job", "Fuel $4.50 a gallon", "High cargo need", "Budget $900 a month", "First child"];
const MONTHS = [0, 1, 1, 2, 3, 3, 4, 5];
const cluster: RoadEvent[] = MONTHS.map((month, i) => ({ id: `e${i}`, month, kind: "life", futures: ["keep", "switch"], title: TITLES[i], dateLabel: "Oct 2026" }));

const WIDTHS = [1100, 800, 360];

/** Numbers out of an SVG path string, in order. */
const parsePath = (d: string): Array<{ x: number; y: number }> => {
  const out: Array<{ x: number; y: number }> = [];
  const re = /[ML] (-?[\d.]+) (-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
};

const toScreen = (road: Road, p: { t: number; c: number }) => (road.orientation === "horizontal" ? { x: p.t, y: p.c } : { x: p.c, y: p.t });

/** The distance from a point to a polyline. */
function distanceToLine(pts: Array<{ x: number; y: number }>, p: { x: number; y: number }): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)));
  }
  return best;
}

const inflate = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by });

/** Whether a polyline passes through a rectangle (the lines are sampled every pixel, which is finer than any label). */
function lineThrough(pts: Array<{ x: number; y: number }>, r: Rect): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
    }
  }
  return false;
}

const labelsOf = (road: Road): PlacedLabel[] => Object.values(road.labels).filter((l): l is PlacedLabel => l !== null);

describe("the time axis is linear and honest", () => {
  const f = makeFrame(1100, true);

  it("is x(month) = padLeft + month / 60 * plotWidth, evenly spaced", () => {
    expect(xOfMonth(f, 0)).toBe(f.t0);
    expect(xOfMonth(f, HORIZON)).toBe(f.t1);
    for (const m of [1, 12, 30, 59]) expect(xOfMonth(f, m)).toBeCloseTo(f.t0 + (m / 60) * (f.t1 - f.t0), 9);
    const step = xOfMonth(f, 1) - xOfMonth(f, 0);
    for (let m = 1; m <= HORIZON; m++) expect(xOfMonth(f, m) - xOfMonth(f, m - 1)).toBeCloseTo(step, 9);
  });

  it("has year ticks 0 to 5", () => {
    expect(TICK_MONTHS).toEqual([0, 12, 24, 36, 48, 60]);
    const road = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
    expect(road.axis.ticks.map((t) => t.month)).toEqual([0, 12, 24, 36, 48, 60]);
    for (const t of road.axis.ticks) expect(t.x1).toBeCloseTo(xOfMonth(road.frame, t.month), 9);
  });

  it("monthFromX is the inverse of x for all 61 months, and a little off still lands on the month", () => {
    for (const width of [1100, 800, 641]) {
      const frame = makeFrame(width, true);
      for (let m = 0; m <= HORIZON; m++) {
        expect(monthFromX(frame, xOfMonth(frame, m))).toBe(m);
        expect(monthAt(frame, xOfMonth(frame, m))).toBeCloseTo(m, 9);
        const half = (frame.t1 - frame.t0) / HORIZON / 2;
        expect(monthFromX(frame, xOfMonth(frame, m) + half * 0.9)).toBe(m);
        expect(monthFromX(frame, xOfMonth(frame, m) - half * 0.9)).toBe(m);
      }
    }
  });

  it("rounds to a whole month and keeps it within 0 to 60", () => {
    const frame = makeFrame(1100, false);
    expect(monthFromX(frame, -500)).toBe(0);
    expect(monthFromX(frame, 99999)).toBe(HORIZON);
    expect(Number.isInteger(monthFromX(frame, 400.37))).toBe(true);
  });

  it("runs the same on the vertical road, down the page", () => {
    const frame = makeFrame(360, true);
    expect(frame.orientation).toBe("vertical");
    expect(timePos(frame, 30)).toBeGreaterThan(timePos(frame, 29));
    for (let m = 0; m <= HORIZON; m++) expect(monthFromX(frame, timePos(frame, m))).toBe(m);
  });
});

describe("the bends are decoration", () => {
  it("are a function of the month alone, zero at both ends, and never more than one", () => {
    expect(roadBend.length).toBe(1);
    expect(roadBend(0)).toBeCloseTo(0, 9);
    expect(roadBend(HORIZON)).toBeCloseTo(0, 9);
    for (let m = 0; m <= HORIZON; m++) expect(Math.abs(roadBend(m))).toBeLessThanOrEqual(1);
    expect(roadBend(17)).toBe(roadBend(17));
  });

  it("do not move when anything but events, split, selection or size changes", () => {
    const base = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
    // the same inputs are the same road, however many times it is drawn
    expect(buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" }).paths).toEqual(base.paths);
    // events, split, selection and size each change it
    expect(buildRoad({ width: 1100, events: compared.slice(0, 2), splitMonth: 12, selectedFuture: "keep" }).markers).not.toEqual(base.markers);
    expect(buildRoad({ width: 1100, events: compared, splitMonth: 24, selectedFuture: "keep" }).paths.switch).not.toBe(base.paths.switch);
    expect(buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "switch" }).paths.scrub).not.toBe(base.paths.scrub);
    expect(buildRoad({ width: 900, events: compared, splitMonth: 12, selectedFuture: "keep" }).paths.keep).not.toBe(base.paths.keep);
  });

  it("take no cost: the road input has no money in it", () => {
    const input = { width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" as const };
    const withCosts = { ...input, fiveYearCost: 99999, costThroughMonth: 123 } as typeof input;
    expect(buildRoad(withCosts).paths).toEqual(buildRoad(input).paths);
    expect(buildRoad(withCosts).labels).toEqual(buildRoad(input).labels);
  });
});

describe("the branches", () => {
  it("leave the trunk at x(splitMonth) exactly, for every split month", () => {
    for (let split = 0; split <= HORIZON; split++) {
      const road = buildRoad({ width: 1100, events: [], splitMonth: split, selectedFuture: "keep" });
      const x = xOfMonth(road.frame, split);
      expect(parsePath(road.paths.switch ?? "")[0].x).toBeCloseTo(x, 1);
      expect(parsePath(road.paths.keep)[0].x).toBeCloseTo(x, 1);
      if (road.paths.trunk) {
        const trunk = parsePath(road.paths.trunk);
        expect(trunk[0].x).toBeCloseTo(road.frame.t0, 1);
        expect(trunk[trunk.length - 1].x).toBeCloseTo(x, 1);
      }
      expect(road.split?.x).toBe(x);
    }
  });

  it("draws one shared trunk from month 0 to the split, and the swap in month 12 splits at x(12)", () => {
    const road = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
    const trunk = parsePath(road.paths.trunk ?? "");
    expect(trunk[0].x).toBeCloseTo(xOfMonth(road.frame, 0), 1);
    expect(trunk[trunk.length - 1].x).toBeCloseTo(xOfMonth(road.frame, 12), 1);
    const sw = parsePath(road.paths.switch ?? "");
    expect(sw[0].x).toBeCloseTo(xOfMonth(road.frame, 12), 1);
    // it starts where the trunk ends and goes nowhere before
    expect(sw[0].y).toBeCloseTo(trunk[trunk.length - 1].y, 1);
    expect(Math.min(...sw.map((p) => p.x))).toBeCloseTo(xOfMonth(road.frame, 12), 1);
  });

  it("both end at x(60), each at its destination", () => {
    for (const split of [0, 12, 40, 59, 60]) {
      const road = buildRoad({ width: 1100, events: [], splitMonth: split, selectedFuture: "keep" });
      const keepEnd = parsePath(road.paths.keep).at(-1)!;
      const switchEnd = parsePath(road.paths.switch ?? "").at(-1)!;
      expect(keepEnd.x).toBeCloseTo(road.frame.t1, 1);
      expect(switchEnd.x).toBeCloseTo(road.frame.t1, 1);
      const dk = road.destinations.keep;
      const ds = road.destinations.switch!;
      expect(keepEnd.y).toBeCloseTo(dk.y + dk.h / 2, 1);
      expect(switchEnd.y).toBeCloseTo(ds.y + ds.h / 2, 1);
      // the destination sits just beyond the end, and the two never touch
      expect(dk.x).toBeGreaterThan(road.frame.t1);
      expect(dk.x - road.frame.t1).toBeLessThan(24);
      expect(rectsIntersect(dk, ds)).toBe(false);
      for (const p of [...parsePath(road.paths.keep), ...parsePath(road.paths.switch ?? "")]) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it("keeps the keep branch above (left of) the switch branch, apart by the destinations", () => {
    const road = buildRoad({ width: 1100, events: [], splitMonth: 12, selectedFuture: "keep" });
    expect(pointOnRoad(road, "keep", 40).y).toBeLessThan(pointOnRoad(road, "switch", 40).y);
    expect(pointOnRoad(road, "keep", 6)).toEqual(pointOnRoad(road, "switch", 6)); // still one road
    expect(pointOnRoad(road, "keep", 12)).toEqual(pointOnRoad(road, "switch", 12)); // together at the split
    expect(forkHalf(road.frame, 12, 12)).toBe(0);
    expect(forkHalf(road.frame, 60, 12)).toBe(road.frame.halfSep);
  });

  it("draws only keep when there is no switch", () => {
    const road = buildRoad({ width: 1100, events: cluster, splitMonth: null, selectedFuture: "switch" });
    expect(road.paths.switch).toBeNull();
    expect(road.paths.trunk).toBeNull();
    expect(road.paths.other).toBeNull();
    expect(road.destinations.switch).toBeNull();
    expect(road.selectedFuture).toBe("keep");
    const keep = parsePath(road.paths.keep);
    expect(keep[0].x).toBeCloseTo(road.frame.t0, 1);
    expect(keep.at(-1)!.x).toBeCloseTo(road.frame.t1, 1);
    // every event is one dot on the road
    for (const m of road.markers) expect(m.shape).toBe("single");
  });

  it("scrubs along the trunk and the selected branch from month 0 to month 60", () => {
    for (const future of ["keep", "switch"] as const) {
      const road = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: future });
      const scrub = parsePath(road.paths.scrub);
      expect(scrub[0].x).toBeCloseTo(road.frame.t0, 1);
      expect(scrub.at(-1)!.x).toBeCloseTo(road.frame.t1, 1);
      for (let m = 0; m <= HORIZON; m++) {
        const p = pointOnRoad(road, future, m);
        expect(distanceToLine(scrub, p)).toBeLessThan(0.6);
      }
    }
  });
});

describe("events and their markers", () => {
  const road = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
  const marker = (id: string) => road.markers.find((m) => m.id === id)!;

  it("sit at x(event.month) exactly, whatever else is going on", () => {
    for (const w of WIDTHS) {
      const r = buildRoad({ width: w, events: compared, splitMonth: 12, selectedFuture: "keep" });
      for (const m of r.markers) {
        const at = timePos(r.frame, m.month);
        expect(m.t).toBe(at);
        for (const d of m.dots) expect(r.orientation === "horizontal" ? d.x : d.y).toBe(at);
      }
    }
    for (const m of buildRoad({ width: 800, events: cluster, splitMonth: 12, selectedFuture: "keep" }).markers) {
      const frame = makeFrame(800, true);
      for (const d of m.dots) expect(d.x).toBe(timePos(frame, m.month));
    }
  });

  it("puts a life event on the trunk before the split and on both branches after it", () => {
    expect(marker("miles").on).toBe("trunk");
    expect(marker("miles").shape).toBe("single");
    expect(marker("kid").on).toBe("both");
    expect(marker("kid").shape).toBe("pair");
    const [up, down] = marker("kid").dots;
    expect(up.x).toBe(down.x);
    expect(up.y).toBeCloseTo(pointOnRoad(road, "keep", 32).y, 6);
    expect(down.y).toBeCloseTo(pointOnRoad(road, "switch", 32).y, 6);
    // one button for the pair, tall enough to hold both dots
    expect(marker("kid").rect.h).toBeGreaterThan(down.y - up.y);
  });

  it("puts the swap at the split, on the switch side, and the move it shares a month with beside it", () => {
    const swap = marker("swap");
    const move = marker("move");
    expect(swap.on).toBe("switch");
    expect(move.on).toBe("trunk");
    expect(swap.dots[0].x).toBe(xOfMonth(road.frame, 12));
    expect(move.dots[0].x).toBe(xOfMonth(road.frame, 12));
    expect(swap.dots[0].y).toBeGreaterThan(move.dots[0].y);
    expect(rectsIntersect(swap.rect, move.rect)).toBe(false);
  });

  it("sits single dots on the road itself", () => {
    expect(distanceToLine(parsePath(road.paths.trunk ?? ""), marker("miles").dots[0])).toBeLessThan(0.6);
    const [up, down] = marker("kid").dots;
    expect(distanceToLine(parsePath(road.paths.keep), up)).toBeLessThan(0.6);
    expect(distanceToLine(parsePath(road.paths.switch ?? ""), down)).toBeLessThan(0.6);
  });

  it("never lets two buttons cover each other, even for events in the same month", () => {
    for (const events of [compared, cluster]) {
      for (const split of [12, null] as const) {
        const r = buildRoad({ width: 1100, events, splitMonth: split, selectedFuture: "keep" });
        for (let i = 0; i < r.markers.length; i++) {
          for (let j = i + 1; j < r.markers.length; j++) {
            const a = r.markers[i];
            const b = r.markers[j];
            // dots never overlap; a pair's button is a tall box that may hold a smaller one beside its line
            for (const da of a.dots) for (const db of b.dots) expect(Math.hypot(da.x - db.x, da.y - db.y)).toBeGreaterThan(8);
          }
        }
      }
    }
  });

  it("keeps every button on the canvas", () => {
    for (const w of WIDTHS) {
      for (const events of [compared, cluster]) {
        const r = buildRoad({ width: w, events, splitMonth: 12, selectedFuture: "keep" });
        for (const m of r.markers) {
          expect(m.rect.x).toBeGreaterThanOrEqual(0);
          expect(m.rect.y).toBeGreaterThanOrEqual(0);
          expect(m.rect.x + m.rect.w).toBeLessThanOrEqual(r.frame.width);
          expect(m.rect.y + m.rect.h).toBeLessThanOrEqual(r.frame.height);
        }
      }
    }
  });

  it("makes a button at least 24px each way", () => {
    for (const m of road.markers) {
      expect(m.rect.w).toBeGreaterThanOrEqual(MARKER_SIZE);
      expect(m.rect.h).toBeGreaterThanOrEqual(MARKER_SIZE);
    }
  });
});

function assertLabelsAreSound(road: Road, expectAll: boolean) {
  const rects = labelsOf(road);
  if (expectAll) expect(rects, `placed ${rects.length} of ${road.markers.length} at ${road.frame.width} split ${road.splitMonth} ${road.selectedFuture}`).toHaveLength(road.markers.length);
  const canvas: Rect = { x: 0, y: 0, w: road.frame.width, h: road.frame.height };
  const lines = [road.lines.trunk, road.lines.keep, road.lines.switch].filter((l): l is NonNullable<typeof l> => l !== null).map((l) => l.map((p) => toScreen(road, p)));
  const blocks: Rect[] = [road.destinations.keep, ...(road.destinations.switch ? [road.destinations.switch] : [])];
  const horizontal = road.orientation === "horizontal";
  const axis: Rect = horizontal ? { x: 0, y: road.frame.axisC - 12, w: road.frame.width, h: road.frame.height } : { x: 0, y: 0, w: road.frame.axisC + 8, h: road.frame.height };

  for (const a of rects) {
    // never leaves the canvas
    expect(a.rect.x).toBeGreaterThanOrEqual(0);
    expect(a.rect.y).toBeGreaterThanOrEqual(0);
    expect(a.rect.x + a.rect.w).toBeLessThanOrEqual(canvas.w);
    expect(a.rect.y + a.rect.h).toBeLessThanOrEqual(canvas.h);
    // not on a marker, a destination, the axis or a path
    for (const m of road.markers) expect(rectsIntersect(a.rect, m.rect), `${a.id} sits on the marker of ${m.id}`).toBe(false);
    for (const d of blocks) expect(rectsIntersect(a.rect, d), `${a.id} sits on a destination`).toBe(false);
    expect(rectsIntersect(a.rect, axis), `${a.id} sits on the axis`).toBe(false);
    for (const l of lines) expect(lineThrough(l, inflate(a.rect, 6)), `${a.id} touches a path`).toBe(false);
  }
  // no two labels overlap
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(rectsIntersect(rects[i].rect, rects[j].rect), `${rects[i].id} overlaps ${rects[j].id}`).toBe(false);
}

describe("labels never collide", () => {
  it("on the compared journey, where the move and the swap share month 12, at 1100, 800 and 360", () => {
    for (const width of WIDTHS) {
      const road = buildRoad({ width, events: compared, splitMonth: 12, selectedFuture: "keep" });
      assertLabelsAreSound(road, true);
      // the two that share a month sit apart, not on top of each other
      expect(rectsIntersect(road.labels.move!.rect, road.labels.swap!.rect)).toBe(false);
    }
  });

  it("with 8 events inside 5 months, at 1100, 800 and 360, with and without a switch, on either branch", () => {
    for (const width of WIDTHS) {
      for (const [split, selected] of [[12, "keep"], [12, "switch"], [null, "keep"], [3, "keep"], [57, "switch"]] as const) {
        const road = buildRoad({ width, events: cluster, splitMonth: split, selectedFuture: selected });
        assertLabelsAreSound(road, true);
      }
    }
  });

  it("with 8 events and a swap sharing a month with life events (a label with no room is left out, never overlapped)", () => {
    const events: RoadEvent[] = [...cluster, roadEvent({ id: "swap", month: 12, kind: "swap", futures: ["switch"], title: "Switch to the RAV4", dateLabel: "Oct 2027" })];
    for (const width of WIDTHS) assertLabelsAreSound(buildRoad({ width, events, splitMonth: 12, selectedFuture: "keep" }), true);
    // the hardest one: the fork itself lands in the middle of the crowd, on a phone
    const crowded = buildRoad({ width: 360, events: [...cluster, roadEvent({ id: "swap", month: 3, kind: "swap", futures: ["switch"], title: "Switch to the RAV4", dateLabel: "Jan 2027" })], splitMonth: 3, selectedFuture: "keep" });
    assertLabelsAreSound(crowded, false);
    expect(labelsOf(crowded).length).toBeGreaterThanOrEqual(6);
  });

  it("does not depend on the selected month or the selected event: labels hold still while you scrub", () => {
    const a = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
    const b = buildRoad({ width: 1100, events: compared, splitMonth: 12, selectedFuture: "keep" });
    expect(a.labels).toEqual(b.labels);
  });

  it("does not run a leader through another label on the compared journey", () => {
    for (const width of WIDTHS) {
      const road = buildRoad({ width, events: compared, splitMonth: 12, selectedFuture: "keep" });
      for (const a of labelsOf(road)) {
        if (!a.leader) continue;
        const line = [{ x: a.leader.x1, y: a.leader.y1 }, { x: a.leader.x2, y: a.leader.y2 }];
        for (const b of labelsOf(road)) if (b.id !== a.id) expect(lineThrough(line, b.rect), `${a.id} leader through ${b.id}`).toBe(false);
      }
    }
  });

  it("uses a label size that holds the text", () => {
    const small = estimateLabelSize({ title: "Move", dateLabel: "Oct 2027" }, 160);
    expect(small.full.height).toBe(16 + 18);
    const long = estimateLabelSize({ title: "A very long title that has to wrap onto a second line", dateLabel: "Oct 2027" }, 120);
    expect(long.full.width).toBe(120);
    expect(long.full.height).toBe(16 + 36);
    expect(long.compact.height).toBe(20);
    expect(long.compact.width).toBeLessThanOrEqual(120);
  });
});

describe("placeLabels on its own", () => {
  const base = { orientation: "horizontal" as const, width: 600, height: 300, paths: [], blocks: [] as Rect[], markers: [] as Array<{ id: string; rect: Rect }> };
  const size = { width: 100, height: 34 };
  const request = (id: string, t: number, prefer: -1 | 1) => ({ id, t, cMin: 150, cMax: 150, full: size, compact: { width: 100, height: 20 }, prefer });
  const marker = (id: string, t: number) => ({ id, rect: { x: t - 12, y: 138, w: 24, h: 24 } });

  it("gives labels at the same time opposite sides", () => {
    const out = placeLabels({ ...base, requests: [request("a", 300, -1), request("b", 300, 1)], markers: [marker("a", 300), marker("b", 300)] });
    expect(out.a!.rect.y).toBeLessThan(150);
    expect(out.b!.rect.y).toBeGreaterThan(150);
    expect(rectsIntersect(out.a!.rect, out.b!.rect)).toBe(false);
  });

  it("bumps a crowd into further lanes and ties each back to its marker, with nothing overlapping", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const out = placeLabels({ ...base, requests: ids.map((id, i) => request(id, 300 + i * 4, i % 2 === 0 ? -1 : 1)), markers: ids.map((id, i) => marker(id, 300 + i * 4)) });
    const rects = ids.map((id) => out[id]!);
    expect(rects.every((r) => r !== null)).toBe(true);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(rectsIntersect(rects[i].rect, rects[j].rect)).toBe(false);
    expect(rects.some((r) => r.offset > 0 && r.leader !== null)).toBe(true);
  });

  it("keeps a label off a destination and off the canvas edge", () => {
    const block: Rect = { x: 380, y: 100, w: 200, h: 100 };
    const out = placeLabels({ ...base, requests: [request("a", 340, -1)], blocks: [block], markers: [marker("a", 340)] });
    expect(rectsIntersect(out.a!.rect, block)).toBe(false);
    expect(out.a!.rect.x + out.a!.rect.w).toBeLessThanOrEqual(600);
    const edge = placeLabels({ ...base, requests: [request("z", 596, -1)], markers: [marker("z", 596)] });
    expect(edge.z!.rect.x + edge.z!.rect.w).toBeLessThanOrEqual(600);
  });

  it("keeps a label off a path", () => {
    const flat = Array.from({ length: 121 }, (_, i) => ({ t: i * 5, c: 150 }));
    const out = placeLabels({ ...base, requests: [request("a", 300, 1)], paths: [flat], markers: [marker("a", 300)] });
    const r = out.a!.rect;
    expect(r.y > 150 + 10 || r.y + r.h < 150 - 10).toBe(true);
  });

  it("returns null for a label that has nowhere to go, and still never overlaps", () => {
    const tiny = { ...base, width: 120, height: 60 };
    const out = placeLabels({ ...tiny, requests: [request("a", 60, -1), request("b", 60, 1)], markers: [{ id: "a", rect: { x: 48, y: 18, w: 24, h: 24 } }, { id: "b", rect: { x: 48, y: 18, w: 24, h: 24 } }] });
    const placed = Object.values(out).filter((l): l is PlacedLabel => l !== null);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(rectsIntersect(placed[i].rect, placed[j].rect)).toBe(false);
    for (const l of placed) expect(l.rect.x + l.rect.w <= 120 && l.rect.y + l.rect.h <= 60).toBe(true);
  });

  it("works the same on a vertical road, with labels beside it", () => {
    const vertical = { ...base, orientation: "vertical" as const, width: 360, height: 700 };
    const out = placeLabels({
      ...vertical,
      requests: [
        { id: "a", t: 100, cMin: 180, cMax: 180, full: { width: 110, height: 52 }, compact: { width: 110, height: 20 }, prefer: -1 },
        { id: "b", t: 104, cMin: 180, cMax: 180, full: { width: 110, height: 52 }, compact: { width: 110, height: 20 }, prefer: 1 },
      ],
      markers: [{ id: "a", rect: { x: 168, y: 88, w: 24, h: 24 } }, { id: "b", rect: { x: 168, y: 92, w: 24, h: 24 } }],
    });
    expect(out.a!.rect.x + out.a!.rect.w).toBeLessThanOrEqual(168);
    expect(out.b!.rect.x).toBeGreaterThanOrEqual(192);
    expect(out.a!.align).toBe("end");
    expect(out.b!.align).toBe("start");
  });
});

describe("the road turns on narrow screens", () => {
  it("is horizontal from 640px and vertical under it", () => {
    expect(VERTICAL_BELOW).toBe(640);
    expect(orientationFor(640)).toBe("horizontal");
    expect(orientationFor(639)).toBe("vertical");
    expect(orientationFor(1280)).toBe("horizontal");
    expect(orientationFor(360)).toBe("vertical");
  });

  it("at 360px runs time top to bottom, branches split sideways, labels sit beside, and nothing is wider than the screen", () => {
    const road = buildRoad({ width: 360, events: compared, splitMonth: 12, selectedFuture: "keep" });
    expect(road.orientation).toBe("vertical");
    expect(road.frame.width).toBe(360);
    expect(road.frame.height).toBeGreaterThan(360);
    const sw = parsePath(road.paths.switch ?? "");
    const keep = parsePath(road.paths.keep);
    // it leaves at y(12), and ends on the same y(60) with the two a screen apart across the page
    expect(sw[0].y).toBeCloseTo(timePos(road.frame, 12), 1);
    expect(sw.at(-1)!.y).toBeCloseTo(road.frame.t1, 1);
    expect(sw.at(-1)!.x).toBeGreaterThan(keep.at(-1)!.x);
    for (const p of [...sw, ...keep, ...parsePath(road.paths.trunk ?? "")]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(360);
    }
    for (const d of [road.destinations.keep, road.destinations.switch!]) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(360);
      expect(d.y).toBeGreaterThan(road.frame.t1);
    }
    expect(rectsIntersect(road.destinations.keep, road.destinations.switch!)).toBe(false);
    assertLabelsAreSound(road, true);
  });

  it("uses the same defaults when there is no layout to read", () => {
    expect(DEFAULT_SIZE).toEqual({ width: 1120, height: 380 });
  });
});

describe("dates", () => {
  it("names every month of the road from the selected one", () => {
    const label = calendarLabeler("Jun 2029", 32)!;
    expect(label(0)).toBe("Oct 2026");
    expect(label(12)).toBe("Oct 2027");
    expect(label(32)).toBe("Jun 2029");
    expect(label(60)).toBe("Oct 2031");
    expect(calendarLabeler("Oct 2026", 0)!(24)).toBe("Oct 2028");
  });

  it("says nothing it cannot work out", () => {
    expect(calendarLabeler("later", 3)).toBeNull();
    expect(calendarLabeler("Foo 2029", 3)).toBeNull();
  });
});

describe("the offer", () => {
  it("is drawn from its default split like any other branch", () => {
    const road = buildRoad({ width: 1100, events: journeyOffer.events.map(roadEvent), splitMonth: 12, selectedFuture: "keep" });
    expect(road.paths.switch).not.toBeNull();
    expect(road.paths.other).toBe(road.paths.switch);
  });
});

describe("writing", () => {
  it("has no em dash in this file's own fixtures", () => {
    for (const e of [...compared, ...cluster]) expect(`${e.title}${e.dateLabel}`).not.toContain(EM_DASH);
  });
});
