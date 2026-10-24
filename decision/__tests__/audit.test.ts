// S9 audit: black-box scenarios through the public exports only, determinism, purity and number provenance.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DriverProfile, Scenario, SimContext, VehicleTwin } from "../../contracts";
import { BreakEvenResultSchema, DecisionEvaluationSchema, NextActionSchema, SensitivityResultSchema, SimulationResultSchema } from "../../contracts/schemas";
import { applyEvents, editEvent, fork, makeReplaceScenario, simulate } from "../../sim";
import { baseline, ctx, deepFreeze, ev, rav4, twin, withEvents } from "../../sim/__tests__/fixtures";
import { evaluate, evaluateDetailed, findBreakEven, metricsOf, nextAction, sensitivity, withSensitivity } from "..";

type P = DriverProfile["priorities"];
const equal: P = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The whole Dev 4 pipeline, as Dev 2 wires it. */
function pipeline(t: VehicleTwin, keep: Scenario, c: SimContext, priorities: P) {
  const replace = makeReplaceScenario(keep, rav4);
  const scenarios = [keep, replace];
  const results = scenarios.map(s => simulate(t, s, c));
  const be = findBreakEven({ twin: t, keep, replace, parameter: "annualMiles", ctx: c, priorities });
  const fuelBe = findBreakEven({ twin: t, keep, replace, parameter: "fuelPricePerGal", ctx: c, priorities });
  const sens = sensitivity({ twin: t, scenarios, ctx: c, priorities });
  const evaluation = withSensitivity(evaluate({ twin: t, scenarios, results, priorities }), sens);
  const action = nextAction(evaluation, t, be, results);
  return { scenarios, results, be, fuelBe, sens, evaluation, action };
}

const denverFamily = fork(baseline, 12, [
  ev("move", "relocation", 12, { location: "Denver, CO", annualMiles: 20000 }),
  ev("baby", "family_change", 36, { childrenDelta: 1, carSeats: 1 }),
], "Denver and a second child");

describe("S9 black-box scenarios", () => {
  it("raising annual miles 12,000 to 20,000 changes mileage, fuel and service timing", () => {
    const low = simulate(twin, baseline, ctx);
    const high = simulate({ ...twin, driver: { ...twin.driver, annualMiles: 20000 } }, baseline, ctx);
    expect(high.points[59].mileage - 48000).toBeCloseTo((low.points[59].mileage - 48000) * 20 / 12, 6);
    expect(sum(high.points.map(p => p.fuelSpend))).toBeGreaterThan(sum(low.points.map(p => p.fuelSpend)));
    const firstMajor = (r: typeof low) => Number(/^Month (\d+)/.exec(r.milestones[0])![1]);
    expect(firstMajor(high)).toBeLessThan(firstMajor(low));
  });

  it("relocation next year plus a child three years later: two scheduled events, correct projections", () => {
    const { timeline } = applyEvents(twin, denverFamily);
    expect(timeline[10]).toMatchObject({ annualMiles: 12000, householdSize: 2, children: 0 });
    expect(timeline[11]).toMatchObject({ annualMiles: 20000, householdSize: 2 });
    expect(timeline[35]).toMatchObject({ annualMiles: 20000, householdSize: 3, children: 1 });
    const r = simulate(twin, denverFamily, ctx);
    expect(r.points[10].mileage - r.points[9].mileage).toBeCloseTo(1000);
    expect(r.points[11].mileage - r.points[10].mileage).toBeCloseTo(20000 / 12);
    expect(r.points[34].suitability.passengerFit).toBe("good");
    expect(r.points[35].suitability.passengerFit).toBe("needs_verification"); // car seat fit is never guessed
  });

  it("forking a scenario twice leaves the parent and the sibling unchanged", () => {
    const parent = deepFreeze(structuredClone(denverFamily));
    const a = fork(parent, 24, [ev("x", "fuel_price_change", 24, { fuelPricePerGal: 4 })], "Pricier fuel");
    const aCopy = structuredClone(a);
    fork(parent, 30, [ev("y", "cargo_change", 30, { cargoNeed: "high" })], "More cargo");
    expect(parent).toEqual(denverFamily);
    expect(a).toEqual(aCopy);
  });

  it("raising the RAV4 price updates the economics including tax and fees", () => {
    const replace = { ...makeReplaceScenario(baseline, rav4), assumptions: { downPayment: 1e9 } }; // cash purchase
    const eventId = replace.events.find(e => e.type === "vehicle_replacement")!.id;
    const at = (price: number) => simulate(twin, editEvent(replace, eventId, { payload: { vehicleId: rav4.id, price } }), ctx);
    const a = at(33000), b = at(34000);
    expect(b.summary.totalCash - a.summary.totalCash).toBeCloseTo(1000 * 1.0625, 6);
    const dValue = b.points[59].vehicleValue - a.points[59].vehicleValue;
    expect(b.summary.netCost - a.summary.netCost).toBeCloseTo(1062.5 - dValue, 6);
  });

  it("switching priority from cost to family changes the verdict in a family-growth case", () => {
    const growth = withEvents([ev("kids", "family_change", 12, { childrenDelta: 2, carSeats: 2 }), ev("cargo", "cargo_change", 12, { cargoNeed: "high" })]);
    const byCost = pipeline(twin, growth, ctx, { cost: 0.6, family: 0.1, longevity: 0.1, fuel: 0.1, comfort: 0.1 });
    const byFamily = pipeline(twin, growth, ctx, { cost: 0.1, family: 0.6, longevity: 0.1, fuel: 0.1, comfort: 0.1 });
    expect(byCost.evaluation.preferredScenarioId).toBe(growth.id);
    expect(byFamily.evaluation.preferredScenarioId).toBe(byFamily.scenarios[1].id);
  });

  it("break-even for mileage and fuel price: a threshold or an explicit no-threshold result", () => {
    const { be, fuelBe } = pipeline(twin, denverFamily, ctx, equal);
    for (const r of [be, fuelBe]) {
      expect(BreakEvenResultSchema.safeParse(r).success).toBe(true);
      if (!r.found) expect(r.reason).toBe("no_threshold_within_bounds");
    }
    expect(be).toMatchObject({ found: true, parameter: "annualMiles" });
  });

  it("works with no network or AI at all (the sim never calls out), and a 20,000 mi/yr proposal changes nothing until confirmed", () => {
    const proposed = withEvents([{ ...ev("ai", "mileage_change", 1, { annualMiles: 20000 }), source: "ai", status: "proposed" }]);
    expect(simulate(twin, proposed, ctx).points).toEqual(simulate(twin, baseline, ctx).points);
    expect(applyEvents(twin, proposed).timeline.every(s => s.annualMiles === 12000)).toBe(true);
  });

  it("every output of the full pipeline passes its contract schema", () => {
    const out = pipeline(twin, denverFamily, ctx, equal);
    for (const r of out.results) expect(SimulationResultSchema.safeParse(r).success).toBe(true);
    expect(DecisionEvaluationSchema.safeParse(out.evaluation).success).toBe(true);
    expect(SensitivityResultSchema.safeParse(out.sens).success).toBe(true);
    expect(NextActionSchema.safeParse(out.action).success).toBe(true);
  });

  it("degrades without crashing on thin inputs", () => {
    expect(evaluate({ twin, scenarios: [], results: [], priorities: equal }).preferredScenarioId).toBe("inconclusive");
    const one = simulate(twin, baseline, ctx);
    expect(evaluate({ twin, scenarios: [baseline], results: [one], priorities: equal }).preferredScenarioId).toBe(baseline.id);
    const bare = simulate(twin, makeReplaceScenario(baseline, rav4), { vehicles: {}, specs: {} });
    expect(bare.warnings.some(w => w.includes("not in the simulation context"))).toBe(true);
    expect(simulate(twin, withEvents([ev("far", "mileage_change", 99, { annualMiles: 1 })]), ctx).warnings[0]).toContain("past the 60-month horizon");
  });
});

describe("S9 determinism and immutability", () => {
  it("100 reruns of the full pipeline are byte-identical, and frozen inputs are never mutated", () => {
    const frozen = deepFreeze(structuredClone({ twin, keep: denverFamily, ctx }));
    const first = JSON.stringify(pipeline(frozen.twin, frozen.keep, frozen.ctx, equal));
    for (let i = 0; i < 99; i++) expect(JSON.stringify(pipeline(frozen.twin, frozen.keep, frozen.ctx, equal))).toBe(first);
  });
});

describe("S9 audits", () => {
  const root = join(__dirname, "..", "..");
  const sources = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : sources(p);
    return p.endsWith(".ts") ? [p] : [];
  });
  const files = [...sources(join(root, "sim")), ...sources(join(root, "decision"))];

  it("sim and decision never import /data, /ai or /ui", () => {
    expect(files.length).toBeGreaterThan(15);
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+"([^"]+)"/g)) {
        expect(m[1], f).not.toMatch(/(^|\/|@\/)(data|ai|ui)(\/|$)/);
      }
    }
  });

  it("sim and decision have no clock, randomness, network, storage, env or LLM access", () => {
    const forbidden = /Date\.now|new Date|Math\.random|fetch\(|XMLHttpRequest|localStorage|sessionStorage|process\.env|gemini|generativeai|openai|anthropic/i;
    for (const f of files) {
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments may mention the rules
      expect(forbidden.test(code), f).toBe(false);
    }
  });

  it("every dollar figure in the rationale and next action traces to a simulated value", () => {
    for (const t of [twin, { ...twin, driver: { ...twin.driver, annualMiles: 30000, fuelPricePerGal: 5 } }]) {
      const out = pipeline(t, denverFamily, ctx, equal);
      const m = out.results.map(metricsOf);
      const allowed = new Set<number>();
      for (const x of m) for (const y of m) {
        for (const v of [x.netCost, x.fuel, x.netCost - y.netCost, x.fuel - y.fuel]) allowed.add(Math.round(Math.abs(v)));
      }
      for (const r of out.results) for (const s of r.milestones) for (const d of s.matchAll(/\$([\d,]+)/g)) allowed.add(Number(d[1].replace(/,/g, "")));
      const text = [...out.evaluation.rationale, out.action.label, out.action.detail].join("\n");
      const dollars = [...text.matchAll(/\$([\d,]+)(?!\.\d)/g)].map(d => Number(d[1].replace(/,/g, "")));
      expect(dollars.length).toBeGreaterThan(0);
      for (const d of dollars) expect(allowed.has(d), `$${d} is not a simulated value`).toBe(true);
    }
  });

  it("weights and per-factor contributions are visible, no percentages or probabilities anywhere", () => {
    const out = pipeline(twin, denverFamily, ctx, equal);
    const { scores } = evaluateDetailed({ twin, scenarios: out.scenarios, results: out.results, priorities: equal });
    for (const s of scores) expect(sum(Object.values(s.contributions))).toBeCloseTo(s.total, 10);
    const text = JSON.stringify([out.evaluation, out.action]);
    expect(text).not.toMatch(/%|probab|confiden|likel(y|ihood)|chance/i);
  });
});
