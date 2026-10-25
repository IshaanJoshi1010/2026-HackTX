import { describe, expect, it } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import type { DecisionEffect } from "./effects";
import { buildForkOptions, buildSteps, keepTiming, numberedCount, pad2, swapOf, swapTiming, whenLabel } from "./steps";

const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"], over: Partial<LifeEvent> = {}): LifeEvent => ({
  id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "confirmed", ...over,
});
const effect = (event: LifeEvent, costDelta: number, fitNote: string | null = null): DecisionEffect => ({ event, title: "x", month: event.month, costDelta, fitNote });

const miles = ev("miles", "mileage_change", 0, { annualMiles: 20000 });
const move = ev("move", "relocation", 12, { location: "Denver" });
const kid = ev("kid", "family_change", 32, { children: 2 });

describe("words", () => {
  it("says when, and pads the number", () => {
    expect(whenLabel(0)).toBe("Now");
    expect(whenLabel(12)).toBe("In 1 yr");
    expect(whenLabel(32)).toBe("In 2 yr 8 mo");
    expect(pad2(2)).toBe("02");
    expect(pad2(12)).toBe("12");
  });

  it("says how long the keep end is modeled, and when the swap happens at the switch end", () => {
    expect(keepTiming()).toBe("Through year 5");
    expect(keepTiming(36)).toBe("Through year 3");
    expect(swapTiming(12)).toBe("Swap in 1 yr");
    expect(swapTiming(32)).toBe("Swap in 2 yr 8 mo");
    expect(swapTiming(8)).toBe("Swap in 8 mo");
    expect(swapTiming(0)).toBe("Swap now");
  });

  it("says nothing about the swap when its month is not known", () => {
    expect(swapTiming(null)).toBeNull();
    expect(swapTiming(undefined)).toBeNull();
    expect(swapTiming(Number.NaN)).toBeNull();
  });
});

describe("swapOf", () => {
  const replace = (event: LifeEvent): Scenario => ({ id: "r", parentId: "k", forkMonth: event.month, name: "r", events: [move, event], assumptions: {} });
  const swap = (over: Partial<LifeEvent> = {}) => ev("swap", "vehicle_replacement", 20, { vehicleId: "rav4" }, { source: "fixture", ...over });

  it("is the month of the replacement in that future, labeled as a default unless you moved it", () => {
    expect(swapOf(replace(swap()))).toEqual({ month: 20, source: "estimated" });
    expect(swapOf(replace(swap({ source: "user" })))).toEqual({ month: 20, source: "user" });
  });

  it("is null for a future with no swap, a proposed swap, or no future", () => {
    expect(swapOf({ id: "k", parentId: null, forkMonth: 0, name: "k", events: [move], assumptions: {} })).toBeNull();
    expect(swapOf(replace(swap({ status: "proposed" })))).toBeNull();
    expect(swapOf(undefined)).toBeNull();
  });
});

describe("buildSteps", () => {
  const effects = [effect(miles, 4000), effect(move, 0), effect(kid, 0, "Passenger fit goes from good to tight")];

  it("is every decision in order, then the fork, numbered from one, and the fork has no number", () => {
    const steps = buildSteps({ decisions: [miles, move, kid], effects, startTitle: "Your 2022 Camry" });
    expect(steps.map((s) => [s.number, s.kind, s.title, s.when])).toEqual([
      [1, "decision", "20,000 miles a year", "Now"],
      [2, "decision", "Move to Denver", "In 1 yr"],
      [3, "decision", "Second child", "In 2 yr 8 mo"],
      [null, "fork", "A fork in the road", "Your choice"],
    ]);
    expect(steps.at(-1)!.key).toBe("fork");
    expect(numberedCount(steps)).toBe(3);
  });

  it("carries each decision's own effect, found by id, not by position", () => {
    const steps = buildSteps({ decisions: [miles, move, kid], effects: [...effects].reverse(), startTitle: "x" });
    expect(steps[0].effect?.costDelta).toBe(4000);
    expect(steps[2].effect?.fitNote).toBe("Passenger fit goes from good to tight");
    expect(steps[3].effect).toBeUndefined();
  });

  it("starts with where you are when nothing happens right now", () => {
    const steps = buildSteps({ decisions: [move], effects: [effect(move, 0)], startTitle: "Your 2022 Camry" });
    expect(steps.map((s) => [s.number, s.kind, s.title])).toEqual([
      [1, "start", "Your 2022 Camry"],
      [2, "decision", "Move to Denver"],
      [null, "fork", "A fork in the road"],
    ]);
    expect(steps[0].when).toBe("Now");
  });

  it("with nothing said yet it is where you are, and the fork", () => {
    const steps = buildSteps({ decisions: [], effects: [], startTitle: "Your 2022 Camry" });
    expect(steps.map((s) => s.kind)).toEqual(["start", "fork"]);
    expect(numberedCount(steps)).toBe(1);
  });

  it("a decision with no effect worked out is still a step", () => {
    const steps = buildSteps({ decisions: [miles], effects: [], startTitle: "x" });
    expect(steps[0].effect).toBeUndefined();
    expect(steps).toHaveLength(2);
  });
});

describe("buildForkOptions", () => {
  const keepVehicle = { year: 2022, model: "Camry" };
  const other = { year: 2024, model: "RAV4", trim: "Hybrid XLE" };
  const comparison = { keepId: "k", replaceId: "r" };

  it("before comparing: keep is solid, the other car is a dashed offer nobody has priced, each with its own timing", () => {
    const [keep, replace] = buildForkOptions({ keepVehicle, other, comparison: null, keepScenarioId: "base", swapMonth: 12 });
    expect(keep).toEqual({ id: "keep", title: "Keep your 2022 Camry", timing: "Through year 5", dashed: false, scenarioId: "base" });
    expect(replace).toEqual({ id: "replace", title: "Explore the 2024 RAV4 Hybrid XLE", timing: "Swap in 1 yr", dashed: true, scenarioId: null });
  });

  it("after comparing, both are solid and priced, and neither carries a verdict", () => {
    const out = buildForkOptions({ keepVehicle, other, comparison, keepScenarioId: "k", swapMonth: 32 });
    expect(out.map((o) => [o.id, o.dashed, o.scenarioId])).toEqual([["keep", false, "k"], ["replace", false, "r"]]);
    expect(out[1].title).toBe("Switch to the 2024 RAV4");
    expect(out[1].timing).toBe("Swap in 2 yr 8 mo");
    expect(Object.keys(out[0]).sort()).toEqual(["dashed", "id", "scenarioId", "timing", "title"]); // no tag, no ranking
  });

  it("with no swap month known the switch end has no timing line", () => {
    const [, replace] = buildForkOptions({ keepVehicle, other, comparison: null, keepScenarioId: "base" });
    expect(replace.timing).toBeNull();
  });

  it("with no other car to offer there is only keeping", () => {
    expect(buildForkOptions({ keepVehicle, other: undefined, comparison: null, keepScenarioId: "base" })).toHaveLength(1);
  });
});
