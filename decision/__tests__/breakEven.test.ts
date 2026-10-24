import { describe, expect, it } from "vitest";
import type { SimContext, SpecSheet } from "../../contracts";
import { BreakEvenResultSchema, DecisionEvaluationSchema, SensitivityResultSchema } from "../../contracts/schemas";
import { baseline, camry, camrySpec, ctx, ev, paidOffTwin, rav4, rav4Spec, twin, withEvents } from "../../sim/__tests__/fixtures";
import { fork } from "../../sim/branch";
import { makeReplaceScenario } from "../../sim/makeReplace";
import { simulate } from "../../sim/simulate";
import { breakEvenDetailed, findBreakEven, reproduceBreakEven, withParameter } from "../breakEven";
import { evaluate } from "../evaluate";
import { robustnessLine, sensitivity, withSensitivity } from "../sensitivity";

const equal = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };

// Hand-calculable world: values never change, no maintenance or insurance, 0% APR.
// Replacing at month 12 costs F = $30,000 x 5% + $500 = $2,000 once, and saves (x/12)(3/25 - 3/40) a month for
// 49 months. Net cost breaks even at x* = 2000 x 12 / (49 x 0.045) = 10,884.35 mi/yr.
const flat = (s: SpecSheet, mpg: number): SpecSheet =>
  ({ ...s, mpgCombined: mpg, maintenance: [], depreciation: { retainedByYear: [1, 1, 1, 1, 1], mileageAdjPer10k: 0 } });
const flatCtx: SimContext = { ...ctx, specs: { [camry.id]: flat(camrySpec, 25), [rav4.id]: flat(rav4Spec, 40) } };
const terms = { insurancePerMonth: 0, replacementPrice: 30000, salesTaxRate: 0.05, purchaseFees: 500, downPayment: 5000, newLoanApr: 0, newLoanTermMonths: 60 };
const keepFlat = withEvents([], terms);
const handInput = { twin: paidOffTwin, keep: keepFlat, replace: makeReplaceScenario(keepFlat, rav4), parameter: "annualMiles" as const, ctx: flatCtx, priorities: equal };

describe("findBreakEven", () => {
  it("matches the hand-computed net-cost break-even within tolerance", () => {
    const d = breakEvenDetailed(handInput, "netCost");
    expect(d.result.found).toBe(true);
    if (!d.result.found) return;
    expect(Math.abs(d.result.threshold - 10884.35)).toBeLessThanOrEqual(35000 * 0.005);
    // At 12,000 mi/yr replacing is cheaper, so the question is where keeping wins: below the threshold.
    expect(d.currentVerdict).toBe(handInput.replace.id);
    expect(d.result).toMatchObject({ direction: "below", unit: "mi/yr", currentValue: 12000, testedBounds: [5000, 40000] });
    expect(d.iterations).toBeLessThanOrEqual(40);
    expect(BreakEvenResultSchema.safeParse(d.result).success).toBe(true);
  });

  it("reproduction reruns both scenarios just below and above and shows the flip", () => {
    const be = breakEvenDetailed(handInput, "netCost").result;
    const rep = reproduceBreakEven(handInput, be, "netCost")!;
    expect(rep.below.preferredScenarioId).toBe(handInput.keep.id);
    expect(rep.above.preferredScenarioId).toBe(handInput.replace.id);
    expect(rep.below.netCost[handInput.keep.id]).toBeLessThan(rep.below.netCost[handInput.replace.id]);
    // Typing the value by hand gives the same numbers.
    const byHand = simulate(paidOffTwin, withParameter(handInput.keep, "annualMiles", rep.above.value), flatCtx);
    expect(byHand.summary.netCost).toBe(rep.above.netCost[handInput.keep.id]);
  });

  it("returns found false when no threshold exists within the bounds", () => {
    const pricey = withEvents([], { ...terms, purchaseFees: 50000 });
    const input = { ...handInput, keep: pricey, replace: makeReplaceScenario(pricey, rav4), parameter: "fuelPricePerGal" as const };
    const be = breakEvenDetailed(input, "netCost").result;
    expect(be).toEqual({ found: false, parameter: "fuelPricePerGal", reason: "no_threshold_within_bounds", testedBounds: [2, 8] });
    expect(reproduceBreakEven(input, be, "netCost")).toBeNull();
  });

  it("by verdict: a keep driver learns the mileage where replacing would win", () => {
    const input = { twin, keep: baseline, replace: makeReplaceScenario(baseline, rav4), parameter: "annualMiles" as const, ctx, priorities: equal };
    const be = findBreakEven(input);
    expect(be).toMatchObject({ found: true, direction: "above", currentValue: 12000 });
    const rep = reproduceBreakEven(input, be)!;
    expect(rep.above.preferredScenarioId).toBe(input.replace.id);
    expect(rep.below.preferredScenarioId).not.toBe(input.replace.id);
  });

  it("demo question: what would have to change for keeping the Camry to win after the Denver move", () => {
    const denver = fork(baseline, 12, [ev("move", "relocation", 12, { location: "Denver, CO", annualMiles: 20000 })], "Denver");
    const input = { twin, keep: denver, replace: makeReplaceScenario(denver, rav4), parameter: "annualMiles" as const, ctx, priorities: equal };
    const d = breakEvenDetailed(input);
    expect(d.target).toBe(denver.id);
    expect(d.result).toMatchObject({ found: true, direction: "below" });
    expect(reproduceBreakEven(input, d.result)!.below.preferredScenarioId).toBe(denver.id);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(breakEvenDetailed(handInput, "netCost"))).toBe(JSON.stringify(breakEvenDetailed(handInput, "netCost")));
  });
});

describe("sensitivity", () => {
  const scenarios = [baseline, makeReplaceScenario(baseline, rav4)];
  const input = { twin, scenarios, ctx, priorities: equal };

  it("runs low, base and high, and net cost rises with depreciation and fuel", () => {
    const s = sensitivity(input);
    expect(SensitivityResultSchema.safeParse(s).success).toBe(true);
    expect(s.runs.map(r => r.label)).toEqual(["low", "base", "high"]);
    s.runs.forEach((r, i) => expect(r.fuelPrice).toBeCloseTo([2.4, 3, 3.6][i], 10));
    for (const sc of scenarios) {
      const [low, base, high] = s.runs.map(r => r.netCost[sc.id]);
      expect(low).toBeLessThan(base);
      expect(base).toBeLessThan(high);
    }
    expect(s.runs[1].netCost[baseline.id]).toBeCloseTo(simulate(twin, baseline, ctx).summary.netCost, 6);
  });

  it("reports robustness as a deterministic count, never a percentage", () => {
    const a = sensitivity(input), b = sensitivity(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.totalCount).toBe(9);
    expect(a.heldCount).toBeGreaterThan(0);
    expect(a.heldCount).toBeLessThanOrEqual(9);
    expect(a.heldScenarioId).toBe(baseline.id);
    expect(robustnessLine(a)).toMatch(/^Held in \d of 9 tested cases$/);
  });

  it("withSensitivity fills the evaluation's sensitivity and rationale", () => {
    const e = evaluate({ twin, scenarios, results: scenarios.map(s => simulate(twin, s, ctx)), priorities: equal });
    const s = sensitivity(input);
    const full = withSensitivity(e, s);
    expect(full.sensitivity).toHaveLength(2);
    expect(full.sensitivity[0].base).toBeCloseTo(s.runs[1].netCost[baseline.id], 6);
    expect(full.rationale[full.rationale.length - 1]).toBe(robustnessLine(s));
    expect(withSensitivity(full, s).rationale.filter(l => l.startsWith("Held in"))).toHaveLength(1);
    expect(DecisionEvaluationSchema.safeParse(full).success).toBe(true);
    expect(full.rationale.join(" ")).not.toMatch(/%|probab|confiden/i);
  });
});
