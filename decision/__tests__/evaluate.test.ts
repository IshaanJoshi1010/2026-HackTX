import { describe, expect, it } from "vitest";
import type { DriverProfile, Scenario, VehicleTwin } from "../../contracts";
import { DecisionEvaluationSchema } from "../../contracts/schemas";
import { baseline, ctx, ev, rav4, twin, withEvents } from "../../sim/__tests__/fixtures";
import { fork } from "../../sim/branch";
import { makeReplaceScenario } from "../../sim/makeReplace";
import { simulate } from "../../sim/simulate";
import { evaluate, evaluateDetailed } from "../evaluate";

type P = DriverProfile["priorities"];
const equal: P = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };
const costFirst: P = { cost: 0.6, family: 0.1, longevity: 0.1, fuel: 0.1, comfort: 0.1 };
const familyFirst: P = { cost: 0.1, family: 0.6, longevity: 0.1, fuel: 0.1, comfort: 0.1 };

function compare(t: VehicleTwin, keep: Scenario, priorities: P, maxMonthlyBudget?: number) {
  const replace = makeReplaceScenario(keep, rav4);
  const scenarios = [keep, replace];
  return { keep, replace, ...evaluateDetailed({ twin: t, scenarios, results: scenarios.map(s => simulate(t, s, ctx)), priorities, maxMonthlyBudget }) };
}
const familyGrowth = withEvents([
  ev("kids", "family_change", 12, { childrenDelta: 2, carSeats: 2 }),
  ev("cargo", "cargo_change", 12, { cargoNeed: "high" }),
]);

describe("evaluate", () => {
  it("keep wins for a low-need driver with equal weights (no upsell bias)", () => {
    const { evaluation, keep } = compare(twin, baseline, equal);
    expect(evaluation.preferredScenarioId).toBe(keep.id);
    expect(DecisionEvaluationSchema.safeParse(evaluation).success).toBe(true);
  });

  it("raising miles and fuel price flips the verdict to the RAV4", () => {
    const heavy = { ...twin, driver: { ...twin.driver, annualMiles: 30000, fuelPricePerGal: 5 } };
    const { evaluation, replace } = compare(heavy, baseline, equal);
    expect(evaluation.preferredScenarioId).toBe(replace.id);
  });

  it("changing priority from cost to family flips the verdict in a family-growth scenario", () => {
    const byCost = compare(twin, familyGrowth, costFirst), byFamily = compare(twin, familyGrowth, familyFirst);
    expect(byCost.evaluation.preferredScenarioId).toBe(byCost.keep.id);
    expect(byFamily.evaluation.preferredScenarioId).toBe(byFamily.replace.id);
  });

  it("returns inconclusive when the top two are within the margin", () => {
    const a = withEvents([]), b = { ...withEvents([]), id: "twin-copy", name: "Same thing" };
    const e = evaluate({ twin, scenarios: [a, b], results: [simulate(twin, a, ctx), simulate(twin, b, ctx)], priorities: equal });
    expect(e.preferredScenarioId).toBe("inconclusive");
    expect(e.rationale[0]).toMatch(/^Inconclusive: .* within the 0.05 margin$/);
  });

  it("a hard-constraint violation removes a scenario from contention", () => {
    // A $500 budget: the RAV4 loan pushes recurring cost over it; keeping does not.
    const tight = { ...twin, finance: { ...twin.finance, balance: 0 }, driver: { ...twin.driver, financeType: "paid_off" as const } };
    const { evaluation, scores, keep } = compare(tight, baseline, { cost: 0, family: 0, longevity: 0.5, fuel: 0.5, comfort: 0 }, 500);
    expect(scores[1].eligible).toBe(false);
    expect(evaluation.hardConstraints[0]).toMatch(/^Replace with RAV4: monthly cost \$[\d,]+ over the \$500 budget at month \d+$/);
    expect(scores[1].total).toBeGreaterThan(scores[0].total); // it would have won on these weights
    expect(evaluation.preferredScenarioId).toBe(keep.id);
  });

  it("a household too big for both cars: no scenario can be preferred", () => {
    const big = { ...twin, driver: { ...twin.driver, householdSize: 6, children: 4 } };
    const { evaluation, scores } = compare(big, baseline, equal);
    expect(scores.every(s => !s.eligible)).toBe(true);
    expect(evaluation.preferredScenarioId).toBe("inconclusive");
    expect(evaluation.rationale[0]).toBe("No scenario meets the hard constraints");
  });

  it("shows weights and per-factor contributions that add up to each score", () => {
    const { evaluation, scores } = compare(twin, baseline, equal);
    for (const s of scores) {
      expect(Object.values(s.contributions).reduce((a, b) => a + b, 0)).toBeCloseTo(s.total, 10);
      for (const v of Object.values(s.normalized)) expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(evaluation.rationale).toContain("Weights: cost 0.20, family 0.20, longevity 0.20, fuel 0.20, comfort 0.20");
    expect(evaluation.rationale.some(l => /^Keep score [\d.]+ = cost [\d.]+ \+ family/.test(l))).toBe(true);
    expect(evaluation.rationale.join(" ")).not.toMatch(/%/);
  });

  it("identical metrics normalize to 0.5 each", () => {
    const a = withEvents([]), b = { ...a, id: "b" };
    const { scores } = evaluateDetailed({ twin, scenarios: [a, b], results: [simulate(twin, a, ctx), simulate(twin, b, ctx)], priorities: equal });
    expect(scores[0].normalized).toEqual({ cost: 0.5, family: 0.5, longevity: 0.5, fuel: 0.5, comfort: 0.5 });
  });

  it("is deterministic and compares four branches at once", () => {
    const branches = [baseline, fork(baseline, 12, [ev("m", "mileage_change", 12, { annualMiles: 20000 })], "More miles"),
      makeReplaceScenario(baseline, rav4), makeReplaceScenario(baseline, rav4, 36)];
    const input = { twin, scenarios: branches, results: branches.map(s => simulate(twin, s, ctx)), priorities: equal };
    expect(JSON.stringify(evaluate(input))).toBe(JSON.stringify(evaluate(input)));
    expect(evaluate(input).scenarioIds).toHaveLength(4);
  });
});
