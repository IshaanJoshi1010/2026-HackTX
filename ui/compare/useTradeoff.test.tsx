import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai, data } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { useTradeoff } from "./useTradeoff";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function startWorkspace() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

/** Alex end to end with no AI, then the keep vs replace comparison. */
async function compareAlex() {
  await startWorkspace();
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("useTradeoff", () => {
  it("is null with no car, and null with a car but no comparison", async () => {
    const { result } = renderHook(() => useTradeoff());
    expect(result.current).toBeNull();
    await act(async () => {
      await startWorkspace();
    });
    expect(state().comparison).toBeNull();
    expect(result.current).toBeNull();
  });

  it("appears when you compare, in the engine's words and with the car names from the store", async () => {
    await startWorkspace();
    const { result } = renderHook(() => useTradeoff());
    expect(result.current).toBeNull();

    await act(async () => {
      await actions().openReplaceComparison();
    });
    expect(state().evaluation).not.toBeNull();
    const t = result.current!;
    expect(t.rows.map((r) => r.key)).toEqual(["cost", "fuel", "longevity", "family", "comfort"]);
    expect(t.closeCall).toBe(state().evaluation!.preferredScenarioId === "inconclusive");
    expect(t.sentence).toContain("Keeping the Camry");
    expect(t.sentence).toContain("RAV4");
  });

  it("follows the engine: a close call for Alex, then the RAV4 once cost matters less", async () => {
    await compareAlex();
    const { result } = renderHook(() => useTradeoff());
    expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
    expect(result.current?.closeCall).toBe(true);
    expect(result.current?.sentence).toMatch(/neither car clearly leads\.$/);

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" }));
    expect(state().evaluation?.preferredScenarioId).toBe(state().comparison!.replaceId);
    expect(result.current?.closeCall).toBe(false);
    expect(result.current?.sentence).toMatch(/so the RAV4 comes out ahead by more than Fork's margin\.$/);

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" }));
    expect(result.current?.sentence).toMatch(/so keeping the Camry comes out ahead by more than Fork's margin\.$/);
  });

  it("gives the same object back until the comparison itself changes", async () => {
    await compareAlex();
    const { result, rerender } = renderHook(() => useTradeoff());
    const first = result.current;
    expect(first).not.toBeNull();

    rerender();
    expect(result.current).toBe(first);

    // scrubbing time is not a new comparison
    act(() => actions().setActiveMonth(30));
    expect(result.current).toBe(first);

    // a new set of priorities is
    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" }));
    expect(result.current).not.toBe(first);
  });

  it("goes back to null when the comparison is gone", async () => {
    await compareAlex();
    const { result } = renderHook(() => useTradeoff());
    expect(result.current).not.toBeNull();
    act(() => useForkStore.setState({ comparison: null, evaluation: null, scores: [] }));
    expect(result.current).toBeNull();
  });

  it("is null when the engine has no score for the futures, instead of guessing", async () => {
    await compareAlex();
    const { result } = renderHook(() => useTradeoff());
    expect(result.current).not.toBeNull();
    act(() => useForkStore.setState({ scores: [] }));
    expect(result.current).toBeNull();
  });
});
