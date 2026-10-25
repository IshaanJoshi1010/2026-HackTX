import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { ai, sim } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import type { Journey } from "./types";
import { RECENT_MS, useJourney, useJourneyActions } from "./useJourney";

// The real store and the real engine, read through the hook. Every figure is compared with the engine's own results.

const CAMRY = "camry-2022-se";
const RAV4 = "rav4-2024-hybrid-xle";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "status">;
const DENVER: Draft = { id: "e-denver", type: "relocation", month: 12, payload: { location: "Denver" }, source: "user", assumptions: [], quote: "moving to Denver next year", certainty: "clear" };
const MILES: Draft = { id: "e-miles", type: "mileage_change", month: 12, payload: { annualMiles: 20000 }, source: "user", assumptions: [], quote: "driving 20,000 miles annually", certainty: "clear" };
const KID: Draft = { id: "e-kid", type: "family_change", month: 32, payload: { children: 2 }, source: "user", assumptions: ["June is assumed because you gave only the year"], quote: "expecting my second child in 2029", certainty: "inferred" };

async function workspace(id = CAMRY) {
  await actions().startFromSample(id);
  actions().onRevealStage("done");
}
function confirm(...events: Draft[]) {
  for (const e of events) actions().addDraft(e);
  act(() => actions().confirmDrafts(events.map((e) => e.id)));
}
async function compare() {
  await act(async () => {
    await actions().openReplaceComparison();
  });
}
/** The simulation's own net cost for a scenario at a month. */
const engine = (scenarioId: string, month: number): number => state().results[scenarioId].points.find((p) => p.month === month)!.netEconomicCost;
const cmp = () => state().comparison!;

/** The whole demo set up: Denver and the mileage in month 12, the second child in month 32, compared with the RAV4. */
async function compared() {
  await workspace();
  confirm(DENVER, MILES);
  confirm(KID);
  await compare();
}

function numbersAndText(value: unknown, found: unknown[] = []): unknown[] {
  if (typeof value === "number" || typeof value === "string") found.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) numbersAndText(v, found);
  return found;
}
function expectNoNaN(j: Journey) {
  for (const v of numbersAndText(j)) {
    if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    else expect(v).not.toMatch(/NaN|undefined|Infinity/);
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(ai, "explain").mockResolvedValue({ text: "words", usedFallback: true });
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("before and at the start", () => {
  it("is null until there is a car and a baseline", async () => {
    const { result } = renderHook(() => useJourney());
    expect(result.current).toBeNull();
    await act(async () => {
      await actions().startFromSample(CAMRY);
    });
    expect(state().twin).not.toBeNull();
    expect(result.current).toBeNull(); // the car is still forming: no baseline yet
    act(() => actions().onRevealStage("done"));
    expect(result.current).not.toBeNull();
  });

  it("starts as keeping your car with the other car as an unpriced offer, and invents no cost for it", async () => {
    await workspace();
    const { result } = renderHook(() => useJourney());
    const j = result.current!;
    expect(j.keep).toMatchObject({ scenarioId: "base", priced: true, selected: true, title: "Keep your Camry" });
    expect(j.keep.fiveYearCost).toBe(engine("base", 60));
    expect(j.switch).toMatchObject({ scenarioId: null, priced: false, fiveYearCost: null, costThroughMonth: null, selected: false, title: "Switch to the RAV4" });
    expect(j.switch?.costSource).toBeUndefined();
    expect(j.difference).toBeNull();
    expect(j.call).toBeNull();
    expect(j.events).toEqual([]);
    expect(j.selectedFuture).toBe("keep");
    expect(j.vehicleNow.vehicleId).toBe(CAMRY);
    expect(j.monthLabel).toBe("Oct 2026");
    expect(j.revision).toBe(state().revision);
    // where the swap would land by default is the simulation's own default
    const swap = sim.makeReplaceScenario(state().explore.scenarios[0], state().twin!.vehicle).events.find((e) => e.type === "vehicle_replacement");
    expect(swap).toBeDefined();
    expect(j.switch?.splitMonth).toBe(12);
    expectNoNaN(j);
  });

  it("puts the offer's split where the simulation would put the swap for what you told Fork", async () => {
    await workspace();
    confirm({ ...KID, month: 9, id: "e-early-kid" });
    const { result } = renderHook(() => useJourney());
    expect(result.current?.switch?.priced).toBe(false);
    expect(result.current?.switch?.splitMonth).toBe(9); // the first family change
    expect(result.current?.stops).toEqual([9]);
  });
});

describe("compared, through the real engine", () => {
  it("lists the confirmed events and the swap with the engine's own numbers", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const j = result.current!;
    expect(j.events.map((e) => [e.title, e.kind, e.month, e.dateLabel])).toEqual([
      ["Move to Denver", "life", 12, "Oct 2027"],
      ["20,000 miles a year", "life", 12, "Oct 2027"],
      ["Switch to the RAV4", "swap", 12, "Oct 2027"],
      ["Second child", "life", 32, "Jun 2029"],
    ]);
    expect(j.keep.scenarioId).toBe(cmp().keepId);
    expect(j.switch?.scenarioId).toBe(cmp().replaceId);
    expect(j.keep.fiveYearCost).toBe(engine(cmp().keepId, 60));
    expect(j.switch?.fiveYearCost).toBe(engine(cmp().replaceId, 60));
    expect(j.difference?.amount).toBe(Math.round(engine(cmp().replaceId, 60)) - Math.round(engine(cmp().keepId, 60)));
    expect(j.call).toBe(state().evaluation!.preferredScenarioId === cmp().keepId ? "keep" : state().evaluation!.preferredScenarioId === cmp().replaceId ? "switch" : "close");
    expect(j.revision).toBe(state().revision);
    expect(j.stops).toEqual([12, 32]);
    expectNoNaN(j);
  });

  it("keeps the five year totals identical at every month from 0 to 60, and shows cost through the month from the same series", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const actionsBound = renderHook(() => useJourneyActions()).result.current;
    const keepTotal = engine(cmp().keepId, 60);
    const switchTotal = engine(cmp().replaceId, 60);
    const difference = result.current!.difference;
    for (let m = 0; m <= 60; m++) {
      act(() => actionsBound.scrub(m));
      const j = result.current!;
      expect(j.month).toBe(m);
      expect(j.keep.fiveYearCost).toBe(keepTotal);
      expect(j.switch?.fiveYearCost).toBe(switchTotal);
      expect(j.difference).toEqual(difference);
      expect(j.keep.costThroughMonth).toBe(m === 0 ? 0 : engine(cmp().keepId, m));
      expect(j.switch?.costThroughMonth).toBe(m === 0 ? 0 : engine(cmp().replaceId, m));
      expectNoNaN(j);
    }
    expect(result.current!.keep.costThroughMonth).toBe(keepTotal);
  });

  it("splits at the modeled swap month, and the car flips exactly there (month 11 the Camry, month 12 the RAV4)", async () => {
    await compared();
    const swap = state().explore.scenarios.find((s) => s.id === cmp().replaceId)!.events.find((e) => e.type === "vehicle_replacement")!;
    expect(swap.month).toBe(12);
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    expect(result.current!.switch?.splitMonth).toBe(swap.month);
    expect(result.current!.events.find((e) => e.kind === "swap")?.month).toBe(swap.month);
    act(() => bound.selectFuture("switch"));
    for (const [m, id] of [[0, CAMRY], [11, CAMRY], [12, RAV4], [13, RAV4], [60, RAV4]] as const) {
      act(() => bound.scrub(m));
      expect(result.current!.vehicleNow.vehicleId).toBe(id);
    }
    // and it is the car the simulation itself puts in every month
    for (const p of state().results[cmp().replaceId].points) {
      act(() => bound.scrub(p.month));
      expect(result.current!.vehicleNow.vehicleId).toBe(p.vehicleId);
    }
    // keeping, the Camry the whole way
    act(() => bound.selectFuture("keep"));
    for (const m of [0, 11, 12, 60]) {
      act(() => bound.scrub(m));
      expect(result.current!.vehicleNow.vehicleId).toBe(CAMRY);
    }
  });

  it("moves the split with the swap when the swap is moved, to wherever the store puts it", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    const swapId = result.current!.events.find((e) => e.kind === "swap")!.id;
    const swapMonth = () => state().explore.scenarios.find((s) => s.id === cmp().replaceId)!.events.find((e) => e.id === swapId)!.month;
    // later is free; earlier than where the future forks is refused by the simulation, and the road shows what the store has
    for (const [asked, expected] of [[23, 23], [40, 40], [60, 60], [14, 14], [3, 12], [12, 12]] as const) {
      act(() => actions().moveEvent(cmp().replaceId, swapId, asked));
      expect(swapMonth()).toBe(expected);
      const j = result.current!;
      expect(j.switch?.splitMonth).toBe(expected);
      expect(j.events.find((e) => e.kind === "swap")?.month).toBe(expected);
      expect(j.stops).toContain(expected);
      expect(j.revision).toBe(state().revision);
      act(() => bound.selectFuture("switch"));
      act(() => bound.scrub(expected - 1));
      expect(result.current!.vehicleNow.vehicleId).toBe(CAMRY);
      act(() => bound.scrub(expected));
      expect(result.current!.vehicleNow.vehicleId).toBe(RAV4);
      expect(result.current!.keep.fiveYearCost).toBe(engine(cmp().keepId, 60));
      expect(result.current!.switch?.fiveYearCost).toBe(engine(cmp().replaceId, 60));
    }
  });

  it.each([3, 5, 11, 12, 20])("splits in month %i when the swap is in month %i, and the car flips there", async (month) => {
    await workspace();
    confirm({ ...DENVER, month });
    await compare();
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    expect(result.current!.switch?.splitMonth).toBe(month);
    expect(result.current!.events.find((e) => e.kind === "swap")?.month).toBe(month);
    expect(result.current!.events.find((e) => e.kind === "life")?.month).toBe(month);
    act(() => bound.selectFuture("switch"));
    act(() => bound.scrub(month - 1));
    expect(result.current!.vehicleNow.vehicleId).toBe(CAMRY);
    act(() => bound.scrub(month));
    expect(result.current!.vehicleNow.vehicleId).toBe(RAV4);
    expect(result.current!.switch?.segments.map((x) => [x.vehicleId, x.fromMonth, x.toMonth])).toEqual([[CAMRY, 0, month], [RAV4, month, 60]]);
  });

  it("gives shared life events the same month in the keep list and the switch list", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const keep = state().explore.scenarios.find((s) => s.id === cmp().keepId)!;
    const replace = state().explore.scenarios.find((s) => s.id === cmp().replaceId)!;
    const life = result.current!.events.filter((e) => e.kind === "life");
    expect(life).toHaveLength(3);
    for (const e of life) {
      expect(e.futures).toEqual(["keep", "switch"]);
      expect(keep.events.find((x) => x.id === e.id)?.month).toBe(e.month);
      expect(replace.events.find((x) => x.id === e.id)?.month).toBe(e.month);
    }
    expect(result.current!.events.filter((e) => e.futures.includes("switch") && e.kind === "swap")).toHaveLength(1);
  });

  it("passes what the person said through to the event", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const kid = result.current!.events.find((e) => e.id === "e-kid")!;
    expect(kid).toMatchObject({ quote: "expecting my second child in 2029", certainty: "inferred", assumptions: ["June is assumed because you gave only the year"], payload: { children: 2 } });
  });
});

describe("selecting a future", () => {
  it("keeps the selected month and the engine's call", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.scrub(20));
    const before = result.current!;
    const evaluation = state().evaluation;
    act(() => bound.selectFuture("switch"));
    expect(result.current!.selectedFuture).toBe("switch");
    expect(state().activeScenarioId).toBe(cmp().replaceId);
    expect(result.current!.month).toBe(20);
    expect(state().activeMonth).toBe(20);
    expect(result.current!.call).toBe(before.call);
    expect(state().evaluation).toBe(evaluation);
    expect(result.current!.revision).toBe(before.revision);
    expect(result.current!.keep.fiveYearCost).toBe(before.keep.fiveYearCost);
    act(() => bound.selectFuture("keep"));
    expect(result.current!.selectedFuture).toBe("keep");
    expect(state().activeScenarioId).toBe(cmp().keepId);
    expect(result.current!.month).toBe(20);
    expect(result.current!.call).toBe(before.call);
    expect(state().evaluation).toBe(evaluation);
  });

  it("leaves a close call a close call whichever branch is selected", async () => {
    await compared();
    // The engine's verdict for a close call, as the store holds it (this scenario's own verdict is not close).
    act(() => useForkStore.setState({ evaluation: { ...state().evaluation!, preferredScenarioId: "inconclusive" } }));
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    for (const kind of ["switch", "keep", "switch", "keep"] as const) {
      act(() => bound.selectFuture(kind));
      expect(result.current!.call).toBe("close");
      expect(result.current!.keep.verdict).toBe("close");
      expect(result.current!.switch?.verdict).toBe("close");
      expect(state().evaluation!.preferredScenarioId).toBe("inconclusive");
    }
  });

  it("does nothing until there is a comparison to select from", async () => {
    await workspace();
    const bound = renderHook(() => useJourneyActions()).result.current;
    const before = state().activeScenarioId;
    act(() => bound.selectFuture("switch"));
    act(() => bound.selectFuture("keep"));
    expect(state().activeScenarioId).toBe(before);
  });

  it("never touches the car you own: its data, its VIN, or the replacement", async () => {
    await compared();
    const owned = state().twin!.vehicle;
    const snapshot = JSON.stringify(owned);
    const vin = owned.vin;
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.selectFuture("switch"));
    act(() => bound.scrub(60));
    expect(result.current!.vehicleNow.vehicleId).toBe(RAV4);
    expect(state().twin!.vehicle).toBe(owned);
    expect(JSON.stringify(state().twin!.vehicle)).toBe(snapshot);
    expect(state().twin!.vehicle.vin).toBe(vin);
    expect(state().twin!.vehicle.id).toBe(CAMRY);
    expect(result.current!.keep.segments).toHaveLength(1);
    expect(result.current!.keep.segments[0].vehicleId).toBe(CAMRY);
    expect(result.current!.switch?.segments[0].vehicleId).toBe(CAMRY);
    expect(state().replacementVehicle?.id).toBe(RAV4);
  });
});

describe("a change arriving", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("updates events, dates, costs and the revision together, and flags what is new for two seconds", async () => {
    await workspace();
    confirm(DENVER, MILES);
    await compare();
    const { result } = renderHook(() => useJourney());
    act(() => {
      vi.advanceTimersByTime(RECENT_MS + 1);
    });
    const before = result.current!;
    expect(before.events.some((e) => e.changed)).toBe(false);
    expect(before.events.map((e) => e.id)).not.toContain("e-kid");

    const FAR_MILES: Draft = { ...MILES, id: "e-far-miles", month: 40, payload: { annualMiles: 30000 } };
    confirm(KID, FAR_MILES);
    const after = result.current!;
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.revision).toBe(state().revision);
    expect(after.events.find((e) => e.id === "e-kid")).toMatchObject({ month: 32, dateLabel: "Jun 2029", whenLabel: "In 2 yr 8 mo", title: "Second child", changed: true });
    expect(after.events.find((e) => e.id === "e-far-miles")).toMatchObject({ month: 40, dateLabel: "Feb 2030", title: "30,000 miles a year", changed: true });
    expect(after.events.filter((e) => e.changed).map((e) => e.id)).toEqual(["e-kid", "e-far-miles"]);
    // the costs are the new results, in the same render
    expect(after.keep.scenarioId).toBe(cmp().keepId);
    expect(after.keep.fiveYearCost).toBe(engine(cmp().keepId, 60));
    expect(after.switch?.fiveYearCost).toBe(engine(cmp().replaceId, 60));
    expect(after.keep.fiveYearCost).not.toBe(before.keep.fiveYearCost);
    expect(after.switch?.fiveYearCost).not.toBe(before.switch?.fiveYearCost);
    expect(after.stops).toEqual([12, 32, 40]);
    expect(after.difference?.amount).toBe(Math.round(engine(cmp().replaceId, 60)) - Math.round(engine(cmp().keepId, 60)));

    act(() => {
      vi.advanceTimersByTime(RECENT_MS - 1);
    });
    expect(result.current!.events.filter((e) => e.changed)).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current!.events.some((e) => e.changed)).toBe(false);
    // the highlight going off changes nothing but the highlight
    expect(result.current!.events.map((e) => ({ ...e, changed: false }))).toEqual(after.events.map((e) => ({ ...e, changed: false })));
    expect({ ...result.current!, events: [] }).toEqual({ ...after, events: [] });
  });

  it("restarts the two seconds for each new change", async () => {
    await workspace();
    const { result } = renderHook(() => useJourney());
    confirm(DENVER);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    confirm(MILES);
    expect(result.current!.events.filter((e) => e.changed).map((e) => e.id)).toEqual(["e-miles"]);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current!.events.some((e) => e.changed)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current!.events.some((e) => e.changed)).toBe(false);
  });

  it("flags the moved event, and the swap when the swap is what moved", async () => {
    await workspace();
    confirm(DENVER);
    await compare();
    const { result } = renderHook(() => useJourney());
    act(() => {
      vi.advanceTimersByTime(RECENT_MS + 1);
    });
    const swapId = result.current!.events.find((e) => e.kind === "swap")!.id;
    act(() => actions().moveEvent(cmp().replaceId, swapId, 20));
    expect(result.current!.events.filter((e) => e.changed).map((e) => e.id)).toEqual([swapId]);
    act(() => {
      vi.advanceTimersByTime(RECENT_MS);
    });
    expect(result.current!.events.some((e) => e.changed)).toBe(false);
  });

  it("does not highlight a change that is already over when the page mounts", async () => {
    await workspace();
    confirm(DENVER);
    act(() => {
      vi.advanceTimersByTime(RECENT_MS + 500);
    });
    const { result } = renderHook(() => useJourney());
    expect(result.current!.events).toHaveLength(1);
    expect(result.current!.events.some((e) => e.changed)).toBe(false);
  });

  it("clears the timer when the page unmounts", async () => {
    await workspace();
    const { unmount } = renderHook(() => useJourney());
    confirm(DENVER);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("never stale", () => {
  it("always reflects the latest store state: every render's revision is the store's, and revisions only go up", async () => {
    await compared();
    const seen: Array<{ shown: number | undefined; store: number; cost: number | null | undefined; engine: number }> = [];
    const { result } = renderHook(() => {
      const j = useJourney();
      const s = useForkStore.getState();
      seen.push({ shown: j?.revision, store: s.revision, cost: j?.keep.fiveYearCost, engine: s.results[s.comparison!.keepId].points[59].netEconomicCost });
      return j;
    });
    const bound = renderHook(() => useJourneyActions()).result.current;
    // a run of quick changes: a move, an assumption, a priority answer, a scrub, a selection, another event
    const swapId = result.current!.events.find((e) => e.kind === "swap")!.id;
    act(() => actions().moveEvent(cmp().replaceId, swapId, 18));
    expect(result.current!.revision).toBe(state().revision);
    act(() => actions().setAssumption("insurancePerMonth", 250));
    expect(result.current!.revision).toBe(state().revision);
    expect(result.current!.keep.fiveYearCost).toBe(engine(cmp().keepId, 60));
    act(() => {
      bound.scrub(30);
      bound.selectFuture("switch");
      bound.scrub(31);
    });
    confirm({ ...MILES, id: "e-miles-2", month: 40, payload: { annualMiles: 9000 } });
    expect(result.current!.revision).toBe(state().revision);
    expect(result.current!.keep.fiveYearCost).toBe(engine(cmp().keepId, 60));
    expect(result.current!.switch?.fiveYearCost).toBe(engine(cmp().replaceId, 60));
    expect(result.current!.events.map((e) => e.id)).toContain("e-miles-2");
    expect(seen.length).toBeGreaterThan(1);
    for (const r of seen) {
      expect(r.shown).toBe(r.store);
      expect(r.cost).toBe(r.engine);
    }
    const revisions = seen.map((r) => r.shown!);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(revisions[revisions.length - 1]).toBeGreaterThan(revisions[0]);
  });

  it("says it is updating while a sentence is being read, and keeps the numbers on screen meanwhile", async () => {
    await compared();
    let release: (r: Awaited<ReturnType<typeof ai.interpret>>) => void = () => {};
    vi.spyOn(ai, "interpret").mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useJourney());
    const before = result.current!;
    expect(before.updating).toBe(false);
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = actions().submitDump("I might move");
    });
    expect(result.current!.updating).toBe(true);
    expect(result.current!.keep.fiveYearCost).toBe(before.keep.fiveYearCost);
    expect(result.current!.events).toEqual(before.events);
    await act(async () => {
      release({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
      await pending;
    });
    expect(result.current!.updating).toBe(false);
  });

  it("gives the same object back while nothing it reads has changed, in one place or two", async () => {
    await compared();
    const a = renderHook(() => useJourney());
    const b = renderHook(() => useJourney());
    expect(b.result.current).toBe(a.result.current);
    const first = a.result.current;
    a.rerender();
    expect(a.result.current).toBe(first);
    // things the journey does not read
    act(() => {
      actions().setFutureCompare(false);
      actions().setDetailsOpen(true);
      actions().addDraft({ ...MILES, id: "e-waiting", month: 50 });
      actions().openDrawer("costs");
      actions().closeDrawer();
    });
    expect(a.result.current).toBe(first);
    expect(b.result.current).toBe(first);
    // things it does
    act(() => actions().setActiveMonth(7));
    expect(a.result.current).not.toBe(first);
    expect(a.result.current!.month).toBe(7);
    expect(b.result.current).toBe(a.result.current);
  });
});

describe("the actions", () => {
  it("are the same functions on every render", () => {
    const { result, rerender } = renderHook(() => useJourneyActions());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.values(first).every((f) => typeof f === "function")).toBe(true);
  });

  it("scrub moves the one clock, and clamps it", async () => {
    await workspace();
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.scrub(33));
    expect(state().activeMonth).toBe(33);
    act(() => bound.scrub(99));
    expect(state().activeMonth).toBe(60);
    act(() => bound.scrub(-4));
    expect(state().activeMonth).toBe(0);
  });

  it("selectEvent moves the month to the event and selects it, the swap included, and null clears", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.selectEvent("e-kid"));
    expect(result.current!.selectedEventId).toBe("e-kid");
    expect(result.current!.month).toBe(32);
    expect(result.current!.monthLabel).toBe("Jun 2029");
    const swapId = result.current!.events.find((e) => e.kind === "swap")!.id;
    act(() => bound.selectEvent(swapId));
    expect(result.current!.selectedEventId).toBe(swapId);
    expect(result.current!.month).toBe(12);
    act(() => bound.selectEvent(null));
    expect(result.current!.selectedEventId).toBeNull();
    expect(result.current!.month).toBe(12);
  });

  it("selecting an event does not change the selected future", async () => {
    await compared();
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.selectFuture("keep"));
    act(() => bound.selectEvent("e-kid"));
    expect(result.current!.selectedFuture).toBe("keep");
    act(() => bound.selectFuture("switch"));
    act(() => bound.selectEvent("e-denver"));
    expect(result.current!.selectedFuture).toBe("switch");
  });

  it("compare opens the comparison from the offer", async () => {
    await workspace();
    confirm(DENVER);
    const { result } = renderHook(() => useJourney());
    const bound = renderHook(() => useJourneyActions()).result.current;
    expect(result.current!.switch?.priced).toBe(false);
    await act(async () => {
      await bound.compare();
    });
    expect(state().comparison).not.toBeNull();
    expect(result.current!.switch).toMatchObject({ priced: true, scenarioId: cmp().replaceId });
    expect(result.current!.switch?.fiveYearCost).toBe(engine(cmp().replaceId, 60));
    expect(result.current!.call).not.toBeNull();
    expect(result.current!.difference).not.toBeNull();
    expect(result.current!.events.some((e) => e.kind === "swap")).toBe(true);
    expectNoNaN(result.current!);
  });

  it("togglePlay starts and stops the player, and the drawers open and close", async () => {
    await compared();
    const bound = renderHook(() => useJourneyActions()).result.current;
    expect(state().ui.playing).toBe(false); // nothing autoplays
    act(() => bound.togglePlay());
    expect(state().ui.playing).toBe(true);
    act(() => bound.togglePlay());
    expect(state().ui.playing).toBe(false);
    act(() => bound.openDrawer("explain"));
    expect(state().ui.drawer).toBe("explain");
    act(() => bound.openDrawer("costs"));
    expect(state().ui.drawer).toBe("costs");
    act(() => bound.closeDrawer());
    expect(state().ui.drawer).toBeNull();
  });

  it("manual moves pause playback", async () => {
    await compared();
    const bound = renderHook(() => useJourneyActions()).result.current;
    act(() => bound.togglePlay());
    expect(state().ui.playing).toBe(true);
    act(() => bound.scrub(10));
    expect(state().ui.playing).toBe(false);
    act(() => bound.togglePlay());
    act(() => bound.selectFuture("switch"));
    expect(state().ui.playing).toBe(false);
  });
});
