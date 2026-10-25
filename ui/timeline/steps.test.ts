import { describe, expect, it } from "vitest";
import type { DecisionEvaluation, LifeEvent } from "@/contracts";
import type { DecisionEffect } from "./effects";
import { buildForkOptions, buildSteps, costWords, pad2, whenLabel } from "./steps";

const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent => ({
  id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "confirmed",
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

  it("says what a cost did, in words, to the dollar", () => {
    expect(costWords(3763)).toBe("Adds to your cost");
    expect(costWords(-40)).toBe("Lowers your cost");
    expect(costWords(0)).toBe("No change to cost");
    expect(costWords(0.4)).toBe("No change to cost");
    expect(costWords(-0.4)).toBe("No change to cost");
  });
});

describe("buildSteps", () => {
  const effects = [effect(miles, 4000), effect(move, 0), effect(kid, 0, "Passenger fit goes from good to tight")];

  it("is every decision in order, then the fork, numbered from one", () => {
    const steps = buildSteps({ decisions: [miles, move, kid], effects, startTitle: "Your 2022 Camry" });
    expect(steps.map((s) => [s.number, s.kind, s.title, s.when])).toEqual([
      [1, "decision", "20,000 miles a year", "Now"],
      [2, "decision", "Move to Denver", "In 1 yr"],
      [3, "decision", "Second child", "In 2 yr 8 mo"],
      [4, "fork", "A fork in the road", "Your choice"],
    ]);
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
      [3, "fork", "A fork in the road"],
    ]);
    expect(steps[0].when).toBe("Now");
  });

  it("with nothing said yet it is where you are, and the fork", () => {
    const steps = buildSteps({ decisions: [], effects: [], startTitle: "Your 2022 Camry" });
    expect(steps.map((s) => s.kind)).toEqual(["start", "fork"]);
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
  const evaluation = (preferredScenarioId: string): DecisionEvaluation => ({
    scenarioIds: ["k", "r"], hardConstraints: [], preferredScenarioId, rationale: [], sensitivity: [], nextAction: { label: "", detail: "" },
  });

  it("before comparing: keep is solid and untagged, the other car is a dashed offer", () => {
    const [keep, replace] = buildForkOptions({ keepVehicle, other, comparison: null, evaluation: null, keepScenarioId: "base" });
    expect(keep).toEqual({ id: "keep", title: "Keep your 2022 Camry", tag: null, dashed: false, scenarioId: "base" });
    expect(replace).toEqual({ id: "replace", title: "Explore the 2024 RAV4 Hybrid XLE", tag: null, dashed: true, scenarioId: null });
  });

  it("after comparing, the engine's pick is solid and recommended, the other is dashed and an alternative", () => {
    const keeps = buildForkOptions({ keepVehicle, other, comparison, evaluation: evaluation("k"), keepScenarioId: "k" });
    expect(keeps.map((o) => [o.tag, o.dashed])).toEqual([["Recommended", false], ["Alternative", true]]);
    expect(keeps[1].title).toBe("Switch to the 2024 RAV4");
    expect(keeps[1].scenarioId).toBe("r");
    const switches = buildForkOptions({ keepVehicle, other, comparison, evaluation: evaluation("r"), keepScenarioId: "k" });
    expect(switches.map((o) => [o.tag, o.dashed])).toEqual([["Alternative", true], ["Recommended", false]]);
  });

  it("a close call picks neither: both are solid and say so", () => {
    const out = buildForkOptions({ keepVehicle, other, comparison, evaluation: evaluation("inconclusive"), keepScenarioId: "k" });
    expect(out.map((o) => [o.tag, o.dashed])).toEqual([["Close call", false], ["Close call", false]]);
  });

  it("a comparison without an evaluation yet recommends nothing", () => {
    const out = buildForkOptions({ keepVehicle, other, comparison, evaluation: null, keepScenarioId: "k" });
    expect(out.map((o) => o.tag)).toEqual([null, null]);
  });

  it("with no other car to offer there is only keeping", () => {
    expect(buildForkOptions({ keepVehicle, other: undefined, comparison: null, evaluation: null, keepScenarioId: "base" })).toHaveLength(1);
  });
});
