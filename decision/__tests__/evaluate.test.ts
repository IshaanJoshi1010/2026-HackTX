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

  describe("budget_change events move the budget the constraint checks", () => {
    const budgeted = (monthlyBudget: number): VehicleTwin => ({ ...twin, driver: { ...twin.driver, monthlyBudget } });
    const paidOff = (t: VehicleTwin): VehicleTwin => ({ ...t, finance: { ...t.finance, balance: 0 }, driver: { ...t.driver, financeType: "paid_off" as const } });
    const run = (t: VehicleTwin, keep: Scenario, replaceAt = 12) => {
      const replace = makeReplaceScenario(keep, rav4, replaceAt);
      const scenarios = [keep, replace];
      return evaluateDetailed({ twin: t, scenarios, results: scenarios.map(s => simulate(t, s, ctx)), priorities: equal });
    };

    it("a raised budget stops flagging both cars as over budget", () => {
      const t = budgeted(600);
      const stale = run(t, baseline);
      expect(stale.scores.every(s => !s.eligible)).toBe(true); // $600 is under what this household spends a month
      const raised = run(t, withEvents([ev("budget", "budget_change", 0, { monthlyBudget: 2000 })]));
      expect(raised.scores.map(s => s.violations)).toEqual([[], []]);
      expect(raised.evaluation.hardConstraints).toEqual([]);
    });

    it("a lowered budget flags the months after it, at that month's budget", () => {
      const t = paidOff(budgeted(3000));
      // Keeping the Camry costs about $224 a month here: fine under $3,000, over a $200 budget.
      const lowered = run(t, withEvents([ev("budget", "budget_change", 20, { monthlyBudget: 200 })]), 40);
      const keepViolation = lowered.scores[0].violations.find(v => v.startsWith("monthly cost"));
      expect(keepViolation).toMatch(/over the \$200 budget at month \d+$/);
      expect(Number(keepViolation!.match(/month (\d+)$/)![1])).toBeGreaterThanOrEqual(20); // never before the change
      const earlier = run(t, baseline, 40);
      expect(earlier.scores[0].violations).toEqual([]); // $3,000 a month is never reached
    });

    it("an explicit maxMonthlyBudget still overrides the events", () => {
      const t = budgeted(600);
      const keep = withEvents([ev("budget", "budget_change", 0, { monthlyBudget: 2000 })]);
      const replace = makeReplaceScenario(keep, rav4);
      const scenarios = [keep, replace];
      const { scores } = evaluateDetailed({ twin: t, scenarios, results: scenarios.map(s => simulate(t, s, ctx)), priorities: equal, maxMonthlyBudget: 100 });
      expect(scores.every(s => !s.eligible)).toBe(true);
      expect(scores[0].violations[0]).toMatch(/over the \$100 budget/);
    });
  });

  describe("a lease that ends inside the projection", () => {
    // Audit repro: lease $400 a month ending at month 18. After that the keep side has no modeled cost.
    const leased = (leaseEndMonth: number): VehicleTwin => ({
      ...twin,
      driver: { ...twin.driver, financeType: "lease" as const },
      finance: { financeType: "lease" as const, balance: 0, monthlyPayment: 400, remainingTermMonths: leaseEndMonth, leaseEndMonth, provenance: {} },
    });

    it("keep no longer wins for free: the verdict is inconclusive and says why", () => {
      const t = leased(18);
      const { evaluation, scores, keep } = compare(t, baseline, equal);
      expect(scores[0].total).toBeGreaterThan(scores[1].total + 0.05); // on paper keep leads by a clear margin
      expect(evaluation.preferredScenarioId).toBe("inconclusive");
      expect(evaluation.rationale[0]).toMatch(/^Inconclusive: Keep leads on paper \([\d.]+\), but your lease ends at month 18 and a renewal or buyout is not modeled/);
      expect(evaluation.nextAction.label).toBe("Get your lease-end terms before deciding");
      expect(evaluation.nextAction.detail).toMatch(/lease ends at month 18/);
      expect(evaluation.nextAction.detail).not.toMatch(/Neither option leads/);
      expect(keep.id).toBe(baseline.id);
    });

    it("a lease that runs past the projection, or any other finance, is untouched", () => {
      expect(compare(leased(60), baseline, equal).evaluation.preferredScenarioId).toBe(baseline.id);
      expect(compare(twin, baseline, equal).evaluation.preferredScenarioId).toBe(baseline.id);
    });

    it("does not overrule a verdict for replacing", () => {
      const heavy = { ...leased(18), driver: { ...leased(18).driver, annualMiles: 30000, fuelPricePerGal: 5 } };
      const { evaluation, replace } = compare(heavy, baseline, equal);
      expect(evaluation.preferredScenarioId).toBe(replace.id);
      expect(evaluation.nextAction.label).not.toMatch(/lease-end/);
    });
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
