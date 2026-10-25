import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { ai, data, sim } from "@/ui/mocks";
import { resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { calendarLabel, computeImpact } from "./impact";
import { useEventImpact } from "./useEventImpact";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function startWorkspace() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

/** Alex end to end with no AI: the three confirmed events, then the keep vs replace comparison. */
async function compareAlex() {
  await startWorkspace();
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

const scenarioById = (id: string): Scenario => state().explore.scenarios.find((s) => s.id === id)!;
const keep = () => scenarioById(state().comparison!.keepId);
const replace = () => scenarioById(state().comparison!.replaceId);
const idOf = (s: Scenario, type: LifeEvent["type"]) => s.events.find((e) => e.type === type)!.id;

/** The impact worked out the long way, straight from the store's own numbers. */
function expected(scenario: Scenario, eventId: string) {
  const inputs = simulationInputs(state())!;
  return computeImpact({
    scenario,
    eventId,
    simulate: (s) => sim.simulate(inputs.twin, s, inputs.ctx),
    dateLabel: (m) => calendarLabel(state().todayISO, m),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("useEventImpact", () => {
  it("is null with no event, with no car yet, and for an event that is not anywhere", async () => {
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useEventImpact(id), { initialProps: { id: "anything" as string | null } });
    expect(result.current).toBeNull(); // no car yet
    await act(async () => {
      await compareAlex();
    });
    expect(result.current).toBeNull(); // not an event in any future
    rerender({ id: null });
    expect(result.current).toBeNull();
  });

  it("reads a life event in the future you are looking at", async () => {
    await compareAlex();
    const id = idOf(keep(), "mileage_change");
    const { result } = renderHook(() => useEventImpact(id));
    expect(state().activeScenarioId).toBe(replace().id); // comparing puts you in the switch future
    expect(result.current).toEqual(expected(replace(), id));
    expect(result.current!.changesCost).toBe(true);
  });

  it("reads it in the future you ask for, and the two futures give different answers for a driving change", async () => {
    await compareAlex();
    const id = idOf(keep(), "mileage_change");
    const inKeep = renderHook(() => useEventImpact(id, { future: "keep" })).result;
    const inSwitch = renderHook(() => useEventImpact(id, { future: "switch" })).result;
    expect(inKeep.current).toEqual(expected(keep(), id));
    expect(inSwitch.current).toEqual(expected(replace(), id));
    expect(inKeep.current!.costDelta).not.toBe(inSwitch.current!.costDelta);
  });

  it("reads the swap in the switch future, wherever you are looking", async () => {
    await compareAlex();
    const swapId = idOf(replace(), "vehicle_replacement");
    for (const future of [undefined, "keep", "switch"] as const) {
      const { result } = renderHook(() => useEventImpact(swapId, { future }));
      expect(result.current).toEqual(expected(replace(), swapId));
      expect(result.current!.carChangeMonth).toBe(replace().events.find((e) => e.id === swapId)!.month);
    }
    act(() => actions().setActiveScenario(keep().id));
    const { result } = renderHook(() => useEventImpact(swapId));
    expect(result.current).toEqual(expected(replace(), swapId));
  });

  it("works before any comparison, in the only future there is", async () => {
    await startWorkspace();
    await actions().submitDump(data.demo.brainDump);
    actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    expect(state().comparison).toBeNull();
    const active = scenarioById(state().activeScenarioId);
    const id = idOf(active, "mileage_change");
    const { result } = renderHook(() => useEventImpact(id));
    expect(result.current).toEqual(expected(active, id));
    expect(result.current!.changesCost).toBe(true);
  });

  it("never shows a result for older numbers: a change to the future gives the new answer on the next render", async () => {
    await compareAlex();
    const id = idOf(keep(), "mileage_change");
    const { result } = renderHook(() => useEventImpact(id, { future: "keep" }));
    const before = result.current!;
    const revision = state().revision;

    act(() => actions().moveEvent(keep().id, id, 36)); // the same driving, three years later
    expect(state().revision).toBeGreaterThan(revision);
    const after = result.current!;
    expect(after).toEqual(expected(keep(), id));
    expect(after.costDelta).not.toBe(before.costDelta);
    expect(Math.abs(after.costDelta)).toBeLessThan(Math.abs(before.costDelta)); // it has less time to add up
  });

  it("starts over when a price the swap depends on changes", async () => {
    await compareAlex();
    const swapId = idOf(replace(), "vehicle_replacement");
    const { result } = renderHook(() => useEventImpact(swapId));
    const before = result.current!.costDelta;
    act(() => actions().setAssumption("replacementPrice", 60000));
    expect(result.current).toEqual(expected(replace(), swapId));
    expect(result.current!.costDelta).not.toBe(before);
  });

  it("does not touch the store: reading an impact is exploring, not changing", async () => {
    await compareAlex();
    const id = idOf(keep(), "mileage_change");
    const profile = JSON.stringify(state().explore.confirmedProfile);
    const scenarios = JSON.stringify(state().explore.scenarios);
    const revision = state().revision;
    renderHook(() => useEventImpact(id));
    expect(JSON.stringify(state().explore.confirmedProfile)).toBe(profile);
    expect(JSON.stringify(state().explore.scenarios)).toBe(scenarios);
    expect(state().revision).toBe(revision);
  });
});
