import { describe, expect, it } from "vitest";
import type { BreakEvenResult, DriverProfile, NextAction, Scenario, VehicleTwin } from "../../contracts";
import { NextActionSchema } from "../../contracts/schemas";
import { baseline, ctx, ev, rav4, twin, withEvents } from "../../sim/__tests__/fixtures";
import { fork } from "../../sim/branch";
import { makeReplaceScenario } from "../../sim/makeReplace";
import { simulate } from "../../sim/simulate";
import { evaluate } from "../evaluate";
import { nextAction } from "../nextAction";

const equal = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };
const seen: NextAction[] = [];

function act(t: VehicleTwin, keep: Scenario, be?: BreakEvenResult) {
  const scenarios = [keep, makeReplaceScenario(keep, rav4)];
  const results = scenarios.map(s => simulate(t, s, ctx));
  const e = evaluate({ twin: t, scenarios, results, priorities: equal });
  const a = nextAction(e, t, be, results);
  expect(NextActionSchema.safeParse(a).success).toBe(true);
  expect(a.factors.length).toBeGreaterThan(0);
  seen.push(a, { ...e.nextAction, factors: [] });
  return { e, a, scenarios };
}
const driver = (d: Partial<DriverProfile>): VehicleTwin => ({ ...twin, driver: { ...twin.driver, ...d } });
const heavy = { annualMiles: 30000, fuelPricePerGal: 5 };
const denver = fork(baseline, 12, [ev("move", "relocation", 12, { location: "Denver, CO", annualMiles: 20000 })], "Denver");

describe("nextAction", () => {
  it("keep: cites the next major service mileage from the simulation", () => {
    const { e, a } = act(twin, baseline);
    expect(e.preferredScenarioId).toBe(baseline.id);
    expect(a.label).toBe("Keep your Camry and review the service at 60,000 mi");
    expect(a.detail).toContain("Fluids service around month 12");
    expect(a.factors).toEqual(["net_cost", "maintenance_milestone"]);
    expect(e.nextAction.label).toBe(a.label); // evaluate fills the same action
  });

  it("current car breaks a hard constraint: investigate the replacement, citing it", () => {
    const { a } = act(driver({ householdSize: 6, children: 4 }), baseline);
    expect(a.label).toBe("Investigate a RAV4 Hybrid");
    expect(a.factors).toEqual(["hard_constraint:seats_below_household"]);
    const later = act(twin, withEvents([ev("big", "family_change", 24, { householdSize: 6, children: 4 })])).a;
    expect(later.detail).toContain("from month 24");
  });

  it("replace with unknown finance: get a payoff or trade-in quote first", () => {
    const { a } = act(driver({ ...heavy, financeType: "unknown" }), baseline);
    expect(a.label).toBe("Get a payoff or trade-in quote before deciding");
    expect(a.factors[0]).toBe("finance_unknown");
  });

  it("replace: investigate the RAV4 Hybrid with the modeled factors", () => {
    const { e, a, scenarios } = act(driver(heavy), baseline);
    expect(e.preferredScenarioId).toBe(scenarios[1].id);
    expect(a.label).toBe("Investigate a RAV4 Hybrid");
    expect(a.factors).toContain("fuel");
    expect(a.detail).toMatch(/less fuel/);
  });

  it("inconclusive: reevaluate at the break-even threshold when one exists", () => {
    const be: BreakEvenResult = { found: true, parameter: "annualMiles", threshold: 14433.6, unit: "mi/yr", direction: "below", currentValue: 18533, testedBounds: [5000, 40000] };
    const { e, a } = act(twin, denver, be);
    expect(e.preferredScenarioId).toBe("inconclusive");
    expect(a.label).toBe("Reevaluate if your driving drops below 14,434 mi/yr");
    expect(a.factors).toEqual(["break_even", "annualMiles"]);
  });

  it("inconclusive without a threshold: reevaluate at a mileage or in 12 months, and only claim what was tested", () => {
    expect(act(twin, denver).a).toMatchObject({ label: "Reevaluate at 60,667 mi or in 12 months", detail: "Neither option leads by a clear margin on your priorities." });
    const none: BreakEvenResult = { found: false, parameter: "fuelPricePerGal", reason: "no_threshold_within_bounds", testedBounds: [2, 8] };
    expect(act(twin, denver, none).a.detail).toContain("no fuel price between 2 and 8");
  });

  it("never says anything was booked, approved or completed, and has no unverified links", () => {
    expect(seen.length).toBeGreaterThan(10);
    for (const a of seen) {
      expect(`${a.label} ${a.detail}`).not.toMatch(/book|approv|schedul|appl(y|ied)|reserv|confirm|complet/i);
      expect(a.officialLink).toBeUndefined();
    }
  });
});
