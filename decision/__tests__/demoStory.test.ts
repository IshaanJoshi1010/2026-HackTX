// Pins demo story A (team decision): after the Denver brain dump, keep vs replace is a close call,
// keeping wins below about 14,400 mi/yr, and the next step is to reevaluate at that threshold.
// Inputs mirror the real demo: Dev 3's extraction of the demo sentence and Dev 3's spec values (copied, not imported).
import { describe, expect, it } from "vitest";
import type { LifeEvent, Scenario, SimContext, SpecSheet } from "../../contracts";
import { camry, camrySpec, rav4, rav4Spec, twin } from "../../sim/__tests__/fixtures";
import { fork, makeReplaceScenario, simulate } from "../../sim";
import { evaluate, findBreakEven, nextAction, reproduceBreakEven, sensitivity, withSensitivity } from "..";

const devThreeRav4: SpecSheet = {
  ...rav4Spec,
  maintenance: [
    { atMiles: 5000, repeatEveryMiles: 5000, label: "Illustrative tire rotation and inspection", costUsd: 65 },
    { atMiles: 10000, repeatEveryMiles: 10000, label: "Illustrative oil and filter change", costUsd: 100 },
    { atMiles: 30000, repeatEveryMiles: 30000, label: "Illustrative air and cabin filter service", costUsd: 190 },
    { atMiles: 60000, repeatEveryMiles: 60000, label: "Illustrative fluids and component service", costUsd: 475 },
    { atMiles: 90000, repeatEveryMiles: 90000, label: "Illustrative extended inspection", costUsd: 275 },
  ],
};
const devThreeCamry: SpecSheet = {
  ...camrySpec,
  maintenance: camrySpec.maintenance.map((t, i) => ({ ...t, label: devThreeRav4.maintenance[i].label })),
};
const ctx: SimContext = { vehicles: { [camry.id]: camry, [rav4.id]: rav4 }, specs: { [camry.id]: devThreeCamry, [rav4.id]: devThreeRav4 } };

const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent =>
  ({ id, type, month, payload, source: "ai", assumptions: [], certainty: "clear", status: "confirmed" });
// "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029."
const extracted = [
  ev("move", "relocation", 12, { location: "Denver" }),
  ev("miles", "mileage_change", 0, { annualMiles: 20000 }),
  ev("kid", "family_change", 32, { children: 2 }),
];
const baseline: Scenario = { id: "baseline", parentId: null, forkMonth: 0, name: "Keep Camry", events: [], assumptions: {} };
const keep = fork(baseline, 0, extracted, "Denver move");
const replace = makeReplaceScenario(keep, rav4);
const priorities = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 }; // no trade-off picks

for (const [who, alex] of [["Alex, household 2", twin], ["Alex, household 3 with 1 child, cargo low", { ...twin, driver: { ...twin.driver, householdSize: 3, children: 1 } }]] as const)
describe(`demo story A: ${who}`, () => {
  const twin = alex;
  const scenarios = [keep, replace];
  const results = scenarios.map(s => simulate(twin, s, ctx));
  const be = findBreakEven({ twin, keep, replace, parameter: "annualMiles", ctx, priorities });
  const evaluation = withSensitivity(evaluate({ twin, scenarios, results, priorities }), sensitivity({ twin, scenarios, ctx, priorities }));
  const action = nextAction(evaluation, twin, be, results);

  it("step 4: keep vs replace is a close call (inconclusive), with keeping cheaper", () => {
    expect(evaluation.preferredScenarioId).toBe("inconclusive");
    expect(results[0].summary.netCost).toBeLessThan(results[1].summary.netCost);
    expect(results[1].summary.totalCash - results[0].summary.totalCash).toBeGreaterThan(0);
    expect(evaluation.rationale[0]).toMatch(/^Inconclusive: /);
  });

  it("step 5: keeping wins below about 14,400 mi/yr, and the flip reproduces", () => {
    expect(be).toMatchObject({ found: true, parameter: "annualMiles", direction: "below", currentValue: 20000 });
    if (!be.found) return;
    expect(Math.round(be.threshold)).toBe(14434); // the number on stage (Dev 3 verified 14433.59375 with real data)
    const rep = reproduceBreakEven({ twin, keep, replace, parameter: "annualMiles", ctx, priorities }, be)!;
    expect(rep.below.preferredScenarioId).toBe(keep.id);
    expect(rep.above.preferredScenarioId).not.toBe(keep.id);
  });

  it("step 6: a concrete next step tied to the threshold, holding across the tested cases", () => {
    expect(action.label).toBe("Reevaluate if your driving drops below 14,434 mi/yr");
    expect(action.factors).toEqual(["break_even", "annualMiles"]);
    expect(evaluation.rationale).toContain("Held in 9 of 9 tested cases");
  });
});

it("story A needs cargoNeed low: a medium cargo default flips the verdict to the RAV4", () => {
  const medium = { ...twin, driver: { ...twin.driver, householdSize: 3, children: 1, cargoNeed: "medium" as const } };
  const scenarios = [keep, replace];
  const results = scenarios.map(s => simulate(medium, s, ctx));
  expect(evaluate({ twin: medium, scenarios, results, priorities }).preferredScenarioId).toBe(replace.id);
});
