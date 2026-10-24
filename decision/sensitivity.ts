import type { DecisionEvaluation, DriverProfile, Scenario, SensitivityResult, SimContext, VehicleTwin } from "../contracts";
import { simulate } from "../sim/simulate";
import { SENSITIVITY_DEPRECIATION, SENSITIVITY_FUEL } from "./config";
import { evaluate } from "./evaluate";

export interface SensitivityInput { twin: VehicleTwin; scenarios: Scenario[]; ctx: SimContext; priorities: DriverProfile["priorities"] }

const LABELS = ["low", "base", "high"] as const;

function scaled(s: Scenario, dep: number, fuel: number): Scenario {
  const a = s.assumptions;
  return { ...s, assumptions: { ...a, depreciationScale: (a.depreciationScale ?? 1) * dep, fuelPriceScale: (a.fuelPriceScale ?? 1) * fuel } };
}

function run(a: SensitivityInput, dep: number, fuel: number) {
  const scenarios = a.scenarios.map(s => scaled(s, dep, fuel));
  const results = scenarios.map(s => simulate(a.twin, s, a.ctx));
  return {
    netCost: Object.fromEntries(results.map(r => [r.scenarioId, r.summary.netCost])),
    preferred: evaluate({ twin: a.twin, scenarios, results, priorities: a.priorities }).preferredScenarioId,
  };
}

/**
 * Low / base / high runs for depreciation and fuel price (moved together), with each scenario's net cost.
 * Robustness tests every depreciation x fuel combination and counts how many keep the base verdict:
 * "held in X of Y tested cases". A count, never a probability or a confidence percentage.
 */
export function sensitivity(a: SensitivityInput): SensitivityResult {
  const runs = LABELS.map((label, i) => {
    const dep = SENSITIVITY_DEPRECIATION[i], fuel = SENSITIVITY_FUEL[i];
    return { label, depreciation: dep, fuelPrice: a.twin.driver.fuelPricePerGal * fuel, netCost: run(a, dep, fuel).netCost };
  });
  const heldScenarioId = run(a, 1, 1).preferred;
  let heldCount = 0, totalCount = 0;
  for (const dep of SENSITIVITY_DEPRECIATION) {
    for (const fuel of SENSITIVITY_FUEL) {
      totalCount++;
      if (run(a, dep, fuel).preferred === heldScenarioId) heldCount++;
    }
  }
  return { runs, heldCount, totalCount, heldScenarioId };
}

export const robustnessLine = (s: SensitivityResult): string => `Held in ${s.heldCount} of ${s.totalCount} tested cases`;

/** Copies sensitivity into an evaluation: low/base/high net cost per scenario, plus the robustness line. */
export function withSensitivity(e: DecisionEvaluation, s: SensitivityResult): DecisionEvaluation {
  return {
    ...e,
    sensitivity: e.scenarioIds.map(id => {
      const [low, base, high] = s.runs.map(r => r.netCost[id] ?? 0);
      return { low, base, high };
    }),
    rationale: [...e.rationale.filter(l => !l.startsWith("Held in ")), robustnessLine(s)],
  };
}
