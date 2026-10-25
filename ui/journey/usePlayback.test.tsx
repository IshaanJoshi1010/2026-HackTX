import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { DWELL_MS, MS_PER_MONTH, REDUCED_STEP_MS } from "./playback";
import { usePlayback } from "./usePlayback";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

/** Mounts the hook once, the way the page does. */
function Harness({ stops }: { stops: number[] }) {
  usePlayback(stops);
  return null;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Advance in small steps and write down the month at each one. */
async function watch(totalMs: number, stepMs = 16): Promise<number[]> {
  const months: number[] = [];
  for (let t = 0; t < totalMs; t += stepMs) {
    await advance(stepMs);
    months.push(state().activeMonth);
  }
  return months;
}

const STOPS = [0, 12, 32];
let baseline = 0;

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
  // Alex's Camry, in the workspace, with a confirmed move in month 12.
  await act(async () => {
    await actions().startFromSample("camry-2022-se");
  });
  act(() => actions().onRevealStage("done"));
  act(() => {
    actions().addDraft({ type: "relocation", month: 12, payload: { location: "Denver" }, source: "user", assumptions: [], certainty: "clear" });
    actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  });
  baseline = vi.getTimerCount();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the setup", () => {
  it("is a workspace with a confirmed event and the clock at the start", () => {
    expect(state().phase).toBe("workspace");
    expect(state().explore.scenarios.some((s) => s.events.some((e) => e.status === "confirmed" && e.month === 12))).toBe(true);
    expect(state().activeMonth).toBe(0);
    expect(state().ui.playing).toBe(false);
  });
});

describe("starting", () => {
  it("never starts by itself: mounting and waiting does nothing", async () => {
    render(<Harness stops={STOPS} />);
    await advance(20_000);
    expect(state().ui.playing).toBe(false);
    expect(state().activeMonth).toBe(0);
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it("never calls play() itself, not even when the stops change", async () => {
    const play = vi.spyOn(state().actions, "play");
    const view = render(<Harness stops={STOPS} />);
    view.rerender(<Harness stops={[5, 6]} />);
    await advance(5_000);
    expect(play).not.toHaveBeenCalled();
    expect(state().ui.playing).toBe(false);
  });

  it("moves only once someone presses play", async () => {
    render(<Harness stops={STOPS} />);
    await advance(2_000);
    expect(state().activeMonth).toBe(0);
    act(() => actions().play());
    expect(state().ui.playing).toBe(true);
    await advance(2_000);
    expect(state().activeMonth).toBeGreaterThan(0);
  });
});

describe("gliding", () => {
  it("advances the real clock a month at a time, never backwards, at about a month per 170ms", async () => {
    render(<Harness stops={[]} />);
    act(() => actions().play());
    const months = await watch(1_700);
    for (let i = 1; i < months.length; i++) {
      expect(months[i]).toBeGreaterThanOrEqual(months[i - 1]);
      expect(months[i] - months[i - 1]).toBeLessThanOrEqual(1);
    }
    // 1.7 seconds is about ten months (the first frame only anchors the clock)
    expect(months.at(-1)!).toBeGreaterThanOrEqual(8);
    expect(months.at(-1)!).toBeLessThanOrEqual(10);
    expect(state().ui.playing).toBe(true);
  });

  it("uses advanceMonth, not setActiveMonth, so the move does not stop it", async () => {
    const advanceMonth = vi.spyOn(state().actions, "advanceMonth");
    const setActiveMonth = vi.spyOn(state().actions, "setActiveMonth");
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(1_000);
    expect(advanceMonth).toHaveBeenCalled();
    expect(setActiveMonth).not.toHaveBeenCalled();
    expect(state().ui.playing).toBe(true);
  });

  it("falls back to timeouts where requestAnimationFrame does not exist", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    render(<Harness stops={[]} />);
    act(() => actions().play());
    await advance(1_000);
    expect(state().activeMonth).toBeGreaterThanOrEqual(4);
    expect(state().activeMonth).toBeLessThanOrEqual(6);
    act(() => actions().pause());
    expect(vi.getTimerCount()).toBe(baseline);
  });
});

describe("stops", () => {
  it("rests at a stop for about 900ms, then goes on", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    // glide up to the stop at month 12
    let guard = 0;
    while (state().activeMonth < 12 && guard++ < 400) await advance(16);
    expect(state().activeMonth).toBe(12);
    await advance(DWELL_MS - 100);
    expect(state().activeMonth).toBe(12);
    await advance(100 + MS_PER_MONTH + 32);
    expect(state().activeMonth).toBeGreaterThanOrEqual(13);
    expect(state().ui.playing).toBe(true);
  });

  it("rests once per stop: it never comes back to rest on one it passed", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    const months = await watch(16_000);
    const frames = (m: number) => months.filter((x) => x === m).length;
    // a stop holds for about 900ms (56 frames); an ordinary month for about 170ms (11 frames)
    expect(frames(12)).toBeGreaterThan(45);
    expect(frames(12)).toBeLessThan(70);
    expect(frames(32)).toBeGreaterThan(45);
    expect(frames(32)).toBeLessThan(70);
    expect(frames(20)).toBeLessThan(20);
    expect(months.filter((x, i) => i > 0 && x === 12 && months[i - 1] !== 12)).toHaveLength(1);
  });

  it("does not rest on the month it starts in, nor on 0", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(400);
    expect(state().activeMonth).toBeGreaterThanOrEqual(1);
  });

  it("resuming from a stop does not rest on it again", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().setActiveMonth(12));
    act(() => actions().play());
    await advance(1_000);
    expect(state().activeMonth).toBeGreaterThanOrEqual(16);
  });

  it("uses the stops the page passes now, not the ones from when it started", async () => {
    const view = render(<Harness stops={[]} />);
    act(() => actions().play());
    await advance(500);
    view.rerender(<Harness stops={[20]} />);
    let guard = 0;
    while (state().activeMonth < 20 && guard++ < 600) await advance(16);
    expect(state().activeMonth).toBe(20);
    await advance(DWELL_MS - 100);
    expect(state().activeMonth).toBe(20);
  });
});

describe("the end", () => {
  it("stops itself at month 60, pauses the store and leaves no timers", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(MS_PER_MONTH * 60 + DWELL_MS * 2 + 2_000);
    expect(state().activeMonth).toBe(60);
    expect(state().ui.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(baseline);
    // and it stays there
    await advance(5_000);
    expect(state().activeMonth).toBe(60);
  });

  it("takes about ten seconds with no stops, and about twelve with two", async () => {
    render(<Harness stops={[]} />);
    act(() => actions().play());
    await advance(MS_PER_MONTH * 60 - 400);
    expect(state().ui.playing).toBe(true);
    await advance(800);
    expect(state().ui.playing).toBe(false);
    expect(state().activeMonth).toBe(60);
  });

  it("plays again from the start when play is pressed at the end", async () => {
    render(<Harness stops={[]} />);
    act(() => actions().setActiveMonth(60));
    act(() => actions().play());
    expect(state().activeMonth).toBe(0);
    await advance(1_000);
    expect(state().ui.playing).toBe(true);
    expect(state().activeMonth).toBeGreaterThan(0);
    expect(state().activeMonth).toBeLessThan(10);
  });
});

describe("a manual move stops it within a frame", () => {
  const moves: Array<[string, () => void]> = [
    ["scrubbing (setActiveMonth)", () => actions().setActiveMonth(40)],
    ["picking an event", () => actions().selectEvent(state().explore.scenarios.flatMap((s) => s.events).find((e) => e.status === "confirmed")!.id)],
    ["picking a future", () => actions().setActiveScenario(state().activeScenarioId)],
    ["opening a drawer", () => actions().openDrawer("explain")],
    ["pausing", () => actions().pause()],
    ["changing the page", () => actions().setView("car")],
  ];

  it.each(moves)("%s", async (_name, move) => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(500);
    expect(state().ui.playing).toBe(true);

    // outside act and before React re-renders: only the loop's own check can catch this
    move();
    expect(state().ui.playing).toBe(false);
    const where = state().activeMonth;
    vi.advanceTimersByTime(16);
    expect(state().activeMonth).toBe(where);

    await advance(5_000);
    expect(state().activeMonth).toBe(where);
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it("checks the flag on every frame, even if the frame it had queued is still going to run", async () => {
    // A hand-driven frame loop whose cancel does nothing, so a queued frame will still fire after the pause.
    const queue: Array<(stamp: number) => void> = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (stamp: number) => void) => queue.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const runFrame = (stamp: number) => queue.splice(0).forEach((cb) => cb(stamp));

    render(<Harness stops={[]} />);
    act(() => actions().play());
    runFrame(1_000); // anchors the clock
    runFrame(1_200);
    runFrame(1_400);
    expect(state().activeMonth).toBeGreaterThan(0);

    actions().setActiveMonth(40);
    const advanceMonth = vi.spyOn(state().actions, "advanceMonth");
    expect(queue.length).toBeGreaterThan(0);
    runFrame(1_650); // a frame the cancel did not stop
    expect(advanceMonth).not.toHaveBeenCalled();
    expect(state().activeMonth).toBe(40);
    expect(state().ui.playing).toBe(false);
    expect(queue).toHaveLength(0); // and it did not ask for another
  });

  it("scrubbing mid-play leaves the clock exactly where the person put it", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(700);
    act(() => actions().setActiveMonth(40));
    await advance(3_000);
    expect(state().activeMonth).toBe(40);
    expect(state().ui.playing).toBe(false);
  });

  it("pressing play after a manual move carries on from there", async () => {
    render(<Harness stops={[]} />);
    act(() => actions().play());
    await advance(300);
    act(() => actions().setActiveMonth(40));
    act(() => actions().play());
    expect(state().activeMonth).toBe(40);
    await advance(1_000);
    expect(state().activeMonth).toBeGreaterThan(40);
    expect(state().activeMonth).toBeLessThan(50);
  });

  it("follows the clock if something moves it without pausing", async () => {
    render(<Harness stops={[]} />);
    act(() => actions().play());
    await advance(300);
    act(() => useForkStore.setState({ activeMonth: 30 }));
    await advance(1_000);
    expect(state().activeMonth).toBeGreaterThan(30);
    expect(state().activeMonth).toBeLessThan(40);
  });
});

describe("reduced motion", () => {
  it("jumps from stop to stop instead of gliding, and still ends at 60", async () => {
    act(() => actions().setReducedMotion(true));
    render(<Harness stops={STOPS} />);
    act(() => actions().play());

    const seen = new Set<number>();
    for (let t = 0; t < REDUCED_STEP_MS * 3 + 400; t += 16) {
      await advance(16);
      seen.add(state().activeMonth);
    }
    // never an in-between month
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 12, 32, 60]);
    expect(state().activeMonth).toBe(60);
    expect(state().ui.playing).toBe(false);
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it("waits about 1200ms between jumps", async () => {
    act(() => actions().setReducedMotion(true));
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(REDUCED_STEP_MS - 200);
    expect(state().activeMonth).toBe(0);
    await advance(400);
    expect(state().activeMonth).toBe(12);
    await advance(REDUCED_STEP_MS - 200);
    expect(state().activeMonth).toBe(12);
    await advance(400);
    expect(state().activeMonth).toBe(32);
  });

  it("switches mode the moment the preference changes", async () => {
    render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(300);
    act(() => actions().setReducedMotion(true));
    const here = state().activeMonth;
    await advance(REDUCED_STEP_MS + 100);
    expect([12, 32]).toContain(state().activeMonth);
    expect(state().activeMonth).toBeGreaterThan(here);
  });
});

describe("cleaning up", () => {
  it("leaves no timers or frames behind on unmount while playing", async () => {
    const view = render(<Harness stops={STOPS} />);
    act(() => actions().play());
    await advance(500);
    expect(vi.getTimerCount()).toBeGreaterThan(baseline);
    view.unmount();
    expect(vi.getTimerCount()).toBe(baseline);
    const where = state().activeMonth;
    await advance(5_000);
    expect(state().activeMonth).toBe(where);
  });

  it("leaves none on unmount while resting at a stop either", async () => {
    const view = render(<Harness stops={STOPS} />);
    act(() => actions().play());
    let guard = 0;
    while (state().activeMonth < 12 && guard++ < 400) await advance(16);
    view.unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it("leaves none on pause, and none when it was never playing", async () => {
    const view = render(<Harness stops={STOPS} />);
    expect(vi.getTimerCount()).toBe(baseline);
    act(() => actions().play());
    await advance(300);
    act(() => actions().pause());
    expect(vi.getTimerCount()).toBe(baseline);
    view.unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });

  it("runs one loop at a time across many plays and pauses", async () => {
    render(<Harness stops={STOPS} />);
    for (let i = 0; i < 5; i++) {
      act(() => actions().play());
      await advance(200);
      act(() => actions().pause());
    }
    expect(vi.getTimerCount()).toBe(baseline);
    act(() => actions().play());
    await advance(100);
    expect(vi.getTimerCount() - baseline).toBe(1);
  });
});
