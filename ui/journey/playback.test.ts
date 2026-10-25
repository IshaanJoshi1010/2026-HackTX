import { describe, expect, it } from "vitest";
import { fixtureEvents, journeyCompared, journeyOffer, journeySwitchSelected } from "./fixtures";
import {
  DWELL_MS,
  MS_PER_MONTH,
  REDUCED_STEP_MS,
  isSwapMonth,
  monthForKey,
  monthPercent,
  monthValueText,
  nextMilestone,
  nextTarget,
  normalizeStops,
  resyncPlayback,
  selectedBranch,
  startPlayback,
  tickPlayback,
  whenLabel,
  type PlaybackParams,
  type PlaybackState,
} from "./playback";

interface Trace {
  /** Every month the player landed on, with the time it got there and how long it rested there. */
  landed: Array<{ month: number; at: number; rested: number }>;
  end: number;
  final: PlaybackState;
}

/** Run a player from `from` to its end in `step` ms frames, writing down where it went. */
function run(from: number, params: PlaybackParams, step = 10): Trace {
  let s = startPlayback(from, params);
  let t = 0;
  const landed: Trace["landed"] = [{ month: s.month, at: 0, rested: 0 }];
  let guard = 0;
  while (!s.done && guard++ < 200_000) {
    const before = s;
    s = tickPlayback(s, step, params);
    t += step;
    if (s.month !== before.month) landed.push({ month: s.month, at: t, rested: 0 });
    if (s.dwellingAt !== null) landed[landed.length - 1].rested += step;
    // resting is only ever on the month the player is standing on
    if (s.dwellingAt !== null) expect(s.dwellingAt).toBe(s.month);
  }
  expect(s.done).toBe(true);
  return { landed, end: t, final: s };
}

const monthsVisited = (tr: Trace) => tr.landed.map((l) => l.month);

describe("defaults", () => {
  it("glide a month per 170ms, rest 900ms at each stop, jump every 1200ms in reduced motion", () => {
    expect(MS_PER_MONTH).toBe(170);
    expect(DWELL_MS).toBe(900);
    expect(REDUCED_STEP_MS).toBe(1200);
  });
});

describe("normalizeStops", () => {
  it("sorts, drops duplicates, and keeps only whole months strictly inside the ride", () => {
    expect(normalizeStops([32, 12, 12, 0, 60, 61, -3, 5.5, Number.NaN, Infinity, 1])).toEqual([1, 12, 32]);
    expect(normalizeStops(undefined)).toEqual([]);
    expect(normalizeStops([5, 10], 8)).toEqual([5]);
  });
});

describe("gliding", () => {
  it("with no stops goes 0 to 60 a month at a time and ends at 60 in about ten seconds", () => {
    const tr = run(0, { stops: [] });
    expect(monthsVisited(tr)).toEqual(Array.from({ length: 61 }, (_, i) => i));
    expect(tr.end).toBe(60 * MS_PER_MONTH);
    expect(tr.final.month).toBe(60);
    expect(tr.end).toBeGreaterThan(9_000);
    expect(tr.end).toBeLessThan(11_000);
  });

  it("does nothing for no time, negative time, or garbage", () => {
    const s = startPlayback(3, { stops: [] });
    expect(tickPlayback(s, 0)).toBe(s);
    expect(tickPlayback(s, -50)).toBe(s);
    expect(tickPlayback(s, Number.NaN)).toBe(s);
    expect(tickPlayback(s, Infinity)).toBe(s);
  });

  it("holds the month until a whole month has passed", () => {
    let s = startPlayback(0, { stops: [] });
    s = tickPlayback(s, MS_PER_MONTH - 1);
    expect(s.month).toBe(0);
    s = tickPlayback(s, 1);
    expect(s.month).toBe(1);
    expect(s.elapsed).toBe(0);
  });

  it("only ever moves forward, one month at a time", () => {
    const tr = run(0, { stops: [1, 12, 32] }, 7);
    const months = monthsVisited(tr);
    for (let i = 1; i < months.length; i++) expect(months[i] - months[i - 1]).toBe(1);
  });
});

describe("resting at stops", () => {
  const stops = [12, 32];

  it("visits every stop exactly once and rests 900ms on each", () => {
    const tr = run(0, { stops }, 10);
    const months = monthsVisited(tr);
    for (const stop of stops) {
      expect(months.filter((m) => m === stop)).toHaveLength(1);
      expect(tr.landed.find((l) => l.month === stop)!.rested).toBe(DWELL_MS);
    }
  });

  it("rests nowhere else, never at the start and never at 60", () => {
    const tr = run(0, { stops: [0, 12, 32, 60] }, 10);
    for (const l of tr.landed) {
      if (l.month === 12 || l.month === 32) continue;
      expect(l.rested, `month ${l.month}`).toBe(0);
    }
    expect(tr.landed[0].rested).toBe(0);
    expect(tr.landed.at(-1)!.month).toBe(60);
    expect(tr.landed.at(-1)!.rested).toBe(0);
  });

  it("takes the glide plus one rest per stop in total", () => {
    const tr = run(0, { stops }, 10);
    expect(tr.end).toBe(60 * MS_PER_MONTH + stops.length * DWELL_MS);
  });

  it("is exact for any frame size: the same time always lands in the same place", () => {
    const total = 6_000;
    const params: PlaybackParams = { stops: [1, 12, 32] };
    const at = (step: number) => {
      let s = startPlayback(0, params);
      for (let t = 0; t < total; t += step) s = tickPlayback(s, Math.min(step, total - t), params);
      return s;
    };
    const reference = at(1);
    for (const step of [3, 7, 16, 33, 100, 170, 1000, 6000]) expect(at(step), `frame ${step}ms`).toEqual(reference);
  });

  it("rests on a stop at month 1", () => {
    const tr = run(0, { stops: [1] }, 10);
    expect(tr.landed[1]).toMatchObject({ month: 1, rested: DWELL_MS });
    expect(tr.end).toBe(60 * MS_PER_MONTH + DWELL_MS);
  });

  it("with a stop at month 1, one tick of exactly a month lands on it and rests", () => {
    let s = startPlayback(0, { stops: [1] });
    s = tickPlayback(s, MS_PER_MONTH, { stops: [1] });
    expect(s).toMatchObject({ month: 1, dwellingAt: 1, elapsed: 0 });
    s = tickPlayback(s, DWELL_MS - 1, { stops: [1] });
    expect(s).toMatchObject({ month: 1, dwellingAt: 1 });
    s = tickPlayback(s, 1, { stops: [1] });
    expect(s).toMatchObject({ month: 1, dwellingAt: null, elapsed: 0 });
  });

  it("copes with a long frame that spans several months and a rest", () => {
    const params = { stops: [3] };
    const s = tickPlayback(startPlayback(0, params), 3 * MS_PER_MONTH + DWELL_MS + MS_PER_MONTH + 5, params);
    expect(s).toMatchObject({ month: 4, dwellingAt: null, elapsed: 5, done: false });
  });

  it("with no stops, or only unusable ones, glides straight through", () => {
    for (const bad of [[], [0], [60], [99], [-1], [2.5]]) {
      const tr = run(0, { stops: bad });
      expect(tr.end, JSON.stringify(bad)).toBe(60 * MS_PER_MONTH);
    }
  });

  it("rests nowhere when the rest is zero long", () => {
    const tr = run(0, { stops, dwellMs: 0 });
    expect(tr.end).toBe(60 * MS_PER_MONTH);
  });
});

describe("resuming", () => {
  it("from the middle does not rest on the stop it started on, but does on the next", () => {
    const tr = run(12, { stops: [12, 32] }, 10);
    expect(tr.landed[0]).toMatchObject({ month: 12, rested: 0 });
    expect(monthsVisited(tr).filter((m) => m === 12)).toHaveLength(1);
    expect(tr.landed.find((l) => l.month === 32)!.rested).toBe(DWELL_MS);
    expect(tr.end).toBe(48 * MS_PER_MONTH + DWELL_MS);
  });

  it("from between stops skips the ones already behind it", () => {
    const tr = run(20, { stops: [12, 32] }, 10);
    expect(monthsVisited(tr)).not.toContain(12);
    expect(tr.landed.find((l) => l.month === 32)!.rested).toBe(DWELL_MS);
  });

  it("from 60 starts again at 0 (the store restarts play at the end)", () => {
    expect(startPlayback(60, { stops: [12] })).toEqual({ month: 0, elapsed: 0, dwellingAt: null, done: false });
    const tr = run(60, { stops: [12] });
    expect(tr.landed[0].month).toBe(0);
    expect(tr.final.month).toBe(60);
    expect(tr.end).toBe(60 * MS_PER_MONTH + DWELL_MS);
  });

  it("clamps and rounds where it starts", () => {
    expect(startPlayback(-4).month).toBe(0);
    expect(startPlayback(99).month).toBe(0);
    expect(startPlayback(7.6).month).toBe(8);
    expect(startPlayback(Number.NaN).month).toBe(0);
  });

  it("follows the clock when someone else moves it", () => {
    const s = tickPlayback(startPlayback(0, { stops: [12] }), 100);
    expect(resyncPlayback(s, s.month)).toBe(s);
    const moved = resyncPlayback(s, 40);
    expect(moved).toEqual({ month: 40, elapsed: 0, dwellingAt: null, done: false });
    expect(resyncPlayback(s, 60).done).toBe(true);
  });
});

describe("the end", () => {
  it("is month 60 and stays there", () => {
    const end = run(0, { stops: [30] }).final;
    expect(end).toEqual({ month: 60, elapsed: 0, dwellingAt: null, done: true });
    expect(tickPlayback(end, 5_000, { stops: [30] })).toBe(end);
  });

  it("is never skipped by a huge frame", () => {
    const s = tickPlayback(startPlayback(0, { stops: [12, 32] }), 10 ** 9, { stops: [12, 32] });
    expect(s.month).toBe(60);
    expect(s.done).toBe(true);
  });

  it("a player that is somehow past the end is done", () => {
    const s = tickPlayback({ month: 61, elapsed: 0, dwellingAt: null, done: false }, 10, {});
    expect(s).toMatchObject({ month: 60, done: true });
  });
});

describe("reduced motion", () => {
  const params: PlaybackParams = { stops: [12, 32], reducedMotion: true };

  it("jumps from stop to stop every 1200ms and ends at 60", () => {
    const tr = run(0, params, 10);
    expect(monthsVisited(tr)).toEqual([0, 12, 32, 60]);
    expect(tr.landed.map((l) => l.at)).toEqual([0, REDUCED_STEP_MS, 2 * REDUCED_STEP_MS, 3 * REDUCED_STEP_MS]);
  });

  it("never glides: nothing moves between jumps", () => {
    let s = startPlayback(0, params);
    s = tickPlayback(s, REDUCED_STEP_MS - 1, params);
    expect(s.month).toBe(0);
    s = tickPlayback(s, 1, params);
    expect(s.month).toBe(12);
    s = tickPlayback(s, REDUCED_STEP_MS - 1, params);
    expect(s.month).toBe(12);
    expect(s.dwellingAt).toBeNull();
  });

  it("with no stops goes straight to the end", () => {
    const tr = run(0, { reducedMotion: true, stops: [] });
    expect(monthsVisited(tr)).toEqual([0, 60]);
    expect(tr.end).toBe(REDUCED_STEP_MS);
  });

  it("resuming on a stop moves on to the next one", () => {
    const tr = run(12, params);
    expect(monthsVisited(tr)).toEqual([12, 32, 60]);
  });

  it("from 60 starts over at 0", () => {
    expect(monthsVisited(run(60, params))).toEqual([0, 12, 32, 60]);
  });

  it("lands on every stop and ends at 60 for any frame up to one jump long (the hook caps a frame at 250ms)", () => {
    for (const step of [1, 16, 250, 1200]) expect(monthsVisited(run(0, params, step)), `frame ${step}ms`).toEqual([0, 12, 32, 60]);
  });

  it("a stop at month 1 is the first jump", () => {
    expect(monthsVisited(run(0, { reducedMotion: true, stops: [1, 12] }))).toEqual([0, 1, 12, 60]);
  });

  it("nextTarget is the next stop, or the end", () => {
    expect(nextTarget(0, [12, 32])).toBe(12);
    expect(nextTarget(12, [12, 32])).toBe(32);
    expect(nextTarget(32, [12, 32])).toBe(60);
    expect(nextTarget(5, [])).toBe(60);
  });
});

describe("scrubber labels", () => {
  it("monthPercent is month over the horizon, exactly", () => {
    expect(monthPercent(0)).toBe(0);
    expect(monthPercent(12)).toBe(20);
    expect(monthPercent(30)).toBe(50);
    expect(monthPercent(60)).toBe(100);
    expect(monthPercent(32)).toBeCloseTo((32 / 60) * 100, 2);
    expect(monthPercent(-5)).toBe(0);
    expect(monthPercent(75)).toBe(100);
    expect(monthPercent(Number.NaN)).toBe(0);
  });

  it("whenLabel matches the event labels", () => {
    expect(whenLabel(0)).toBe("Now");
    for (const e of fixtureEvents) expect(whenLabel(e.month), e.id).toBe(e.whenLabel);
  });

  it("monthValueText reads like 'Oct 2027, in 1 yr'", () => {
    expect(monthValueText("Oct 2027", 12)).toBe("Oct 2027, in 1 yr");
    expect(monthValueText("Jun 2029", 32)).toBe("Jun 2029, in 2 yr 8 mo");
    expect(monthValueText("Oct 2026", 0)).toBe("Oct 2026, now");
    expect(monthValueText("Nov 2026", 1)).toBe("Nov 2026, in 1 mo");
  });

  it("monthForKey: arrows a month, pages a year, home and end the ends, always inside 0 to 60", () => {
    expect(monthForKey("ArrowRight", 10)).toBe(11);
    expect(monthForKey("ArrowUp", 10)).toBe(11);
    expect(monthForKey("ArrowLeft", 10)).toBe(9);
    expect(monthForKey("ArrowDown", 10)).toBe(9);
    expect(monthForKey("PageUp", 10)).toBe(22);
    expect(monthForKey("PageDown", 30)).toBe(18);
    expect(monthForKey("Home", 30)).toBe(0);
    expect(monthForKey("End", 30)).toBe(60);
    expect(monthForKey("ArrowLeft", 0)).toBe(0);
    expect(monthForKey("ArrowRight", 60)).toBe(60);
    expect(monthForKey("PageUp", 55)).toBe(60);
    expect(monthForKey("PageDown", 5)).toBe(0);
    expect(monthForKey("a", 5)).toBeNull();
    expect(monthForKey("Tab", 5)).toBeNull();
  });
});

describe("what the readout reads from a journey", () => {
  it("selectedBranch follows the selected future, and keeps when there is no switch", () => {
    expect(selectedBranch(journeyCompared).kind).toBe("keep");
    expect(selectedBranch(journeySwitchSelected).kind).toBe("switch");
    expect(selectedBranch({ ...journeySwitchSelected, switch: null }).kind).toBe("keep");
  });

  it("nextMilestone is the first event after the month, in the selected future, with months from the month", () => {
    expect(nextMilestone(journeyCompared)).toMatchObject({ id: "move", month: 12, inMonths: 12, inLabel: "1 yr" });
    expect(nextMilestone({ ...journeyCompared, month: 12 })).toMatchObject({ id: "kid", inMonths: 20, inLabel: "1 yr 8 mo" });
    expect(nextMilestone({ ...journeyCompared, month: 31 })).toMatchObject({ id: "kid", inMonths: 1, inLabel: "1 mo" });
    expect(nextMilestone({ ...journeyCompared, month: 32 })).toBeNull();
    expect(nextMilestone({ ...journeyCompared, month: 60 })).toBeNull();
  });

  it("the swap is only a milestone in the switch future", () => {
    const onlySwap = { ...journeyCompared, month: 5, events: fixtureEvents.filter((e) => e.kind === "swap") };
    expect(nextMilestone({ ...onlySwap, selectedFuture: "keep" })).toBeNull();
    expect(nextMilestone({ ...onlySwap, selectedFuture: "switch" })).toMatchObject({ id: "swap", inMonths: 7 });
  });

  it("works on an offer with no switch priced", () => {
    expect(nextMilestone(journeyOffer)?.id).toBe("move");
  });

  it("isSwapMonth is true only in the switch future, at its split month", () => {
    const at = (month: number, future: "keep" | "switch") => isSwapMonth({ ...journeyCompared, month, selectedFuture: future });
    expect(at(12, "switch")).toBe(true);
    expect(at(11, "switch")).toBe(false);
    expect(at(13, "switch")).toBe(false);
    expect(at(12, "keep")).toBe(false);
  });
});
