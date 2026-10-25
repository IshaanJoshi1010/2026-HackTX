import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { sim } from "@/ui/mocks";
import { BASE_ID, resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { decisionEffects, noCostMessage } from "./effects";

// The real simulation on the Alex demo: which decisions move a dollar, and what the others say instead.

const event = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent => ({
  id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "confirmed",
});

async function effectsOf(...events: LifeEvent[]) {
  await useForkStore.getState().actions.startFromSample("camry-2022-se");
  useForkStore.getState().actions.onRevealStage("done");
  const inputs = simulationInputs(useForkStore.getState())!;
  const base = useForkStore.getState().explore.scenarios.find((s) => s.id === BASE_ID)!;
  const scenario: Scenario = { ...base, id: "hand-built", parentId: null, forkMonth: 0, events };
  const run = (s: Scenario) => sim.simulateDetailed(inputs.twin, s, inputs.ctx);
  return decisionEffects({ scenario, result: run(scenario).result, month: 60, simulate: (s) => run(s).result, states: (s) => run(s).timeline });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

describe("what the real simulation says each decision did", () => {
  it("a hand-built children-only event changes no dollar, and lists the household it changed", async () => {
    const [kid] = await effectsOf(event("kid", "family_change", 12, { childrenDelta: 1 }));
    expect(kid.changesCost).toBe(false);
    expect(Math.round(kid.costDeltaAtEnd)).toBe(0);
    const m = noCostMessage(kid)!;
    expect(m.headline.startsWith("No change to cost.")).toBe(true);
    expect(m.lines).toEqual(expect.arrayContaining([expect.stringMatching(/^Household goes from \d+ to \d+ people$/), expect.stringMatching(/^Children go from \d+ to \d+$/)]));
  });

  it("a move that only names a place says the simulation does not use it", async () => {
    const [move] = await effectsOf(event("move", "relocation", 12, { location: "Denver" }));
    expect(move.changesCost).toBe(false);
    expect(noCostMessage(move)!.lines).toEqual(["Not modeled: the new place is recorded, but the simulation does not use location."]);
  });

  it("a budget change says it only flags months over it", async () => {
    const [budget] = await effectsOf(event("b", "budget_change", 6, { monthlyBudget: 900 }));
    expect(budget.changesCost).toBe(false);
    expect(noCostMessage(budget)!.lines.join(" ")).toMatch(/A budget change does not change cost\. It only flags months that go over it/);
  });

  it("a decision that changes driving costs money, so it gets dollars and no message", async () => {
    const [miles] = await effectsOf(event("miles", "mileage_change", 12, { annualMiles: 30000 }));
    expect(miles.changesCost).toBe(true);
    expect(Math.abs(Math.round(miles.costDeltaAtEnd))).toBeGreaterThan(0);
    expect(noCostMessage(miles)).toBeNull();
  });

  it("tells them apart in one future", async () => {
    const out = await effectsOf(
      event("move", "relocation", 12, { location: "Denver" }),
      event("miles", "mileage_change", 12, { annualMiles: 30000 }),
      event("kid", "family_change", 30, { childrenDelta: 1 }),
    );
    expect(out.map((e) => [e.event.id, e.changesCost])).toEqual([["move", false], ["miles", true], ["kid", false]]);
  });
});
