import type { DecisionEvaluation, DriverProfile, ProjectionPoint, Scenario, SimulationResult, VehicleTwin } from "../contracts";
import { DEFAULT_COMFORT, FIT_SCORE, INCONCLUSIVE_MARGIN, LONGEVITY_MILES, MEANINGFUL_DIFFERENCE } from "./config";

type Priorities = DriverProfile["priorities"];
type Factor = keyof Priorities; // cost, family, longevity, fuel, comfort
const FACTORS: Factor[] = ["cost", "family", "longevity", "fuel", "comfort"];

export interface Metrics { netCost: number; fuel: number; longevity: number; family: number; comfort: number }
export interface ScenarioScore {
  scenarioId: string; name: string; metrics: Metrics;
  normalized: Record<Factor, number>; contributions: Record<Factor, number>; total: number;
  violations: string[]; eligible: boolean;
}
export interface EvaluateInput {
  twin: VehicleTwin; scenarios: Scenario[]; results: SimulationResult[]; priorities: Priorities; maxMonthlyBudget?: number;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const f2 = (n: number) => n.toFixed(2);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function comfortOf(p: ProjectionPoint): number {
  const note = p.suitability.notes.find(n => n.startsWith("comfort_score="));
  const v = note ? Number(note.slice("comfort_score=".length)) : NaN;
  return Number.isFinite(v) ? v : DEFAULT_COMFORT;
}

/** Objective metrics from a simulation result. Family and comfort average every month of the horizon. */
export function metricsOf(r: SimulationResult): Metrics {
  const last = r.points[r.points.length - 1];
  return {
    netCost: r.summary.netCost,
    fuel: r.points.reduce((a, p) => a + p.fuelSpend, 0),
    longevity: 1 - Math.min((last?.mileage ?? 0) / LONGEVITY_MILES, 1),
    family: mean(r.points.map(p => Math.min(FIT_SCORE[p.suitability.passengerFit], FIT_SCORE[p.suitability.cargoFit]))),
    comfort: mean(r.points.map(comfortOf)),
  };
}

/**
 * Recurring monthly cost (fuel, insurance, loan or lease payment): the month's cash minus maintenance.
 * Months where the car changes are skipped, since they hold one-time sale and purchase cash.
 */
function maxRecurringMonthly(r: SimulationResult, startVehicleId: string): { amount: number; month: number } {
  let best = { amount: 0, month: 0 }, prevCash = 0, prevVehicle = startVehicleId;
  for (const p of r.points) {
    const monthly = p.cumulativeCash - prevCash - p.maintenanceSpend;
    if (p.vehicleId === prevVehicle && monthly > best.amount) best = { amount: monthly, month: p.month };
    prevCash = p.cumulativeCash; prevVehicle = p.vehicleId;
  }
  return best;
}

/** Hard constraints: not enough seats for the household (or car seats), or recurring cost over a stated budget. */
function violationsOf(r: SimulationResult, startVehicleId: string, budget: number | undefined): string[] {
  const v: string[] = [];
  const seats = r.points.find(p => p.suitability.passengerFit === "insufficient");
  if (seats) v.push(`${seats.suitability.constraints.join(", ") || "seats_insufficient"} from month ${seats.month}`);
  if (budget !== undefined) {
    const worst = maxRecurringMonthly(r, startVehicleId);
    if (worst.amount > budget) v.push(`monthly cost ${usd(worst.amount)} over the ${usd(budget)} budget at month ${worst.month}`);
  }
  return v;
}

/**
 * Min-max normalization with a floor on the spread: score = 0.5 +/- (distance from the midpoint) / D, where
 * D = max(spread, meaningful difference). Exactly min-max when the spread is meaningful; all equal gives 0.5.
 */
function normalize(values: number[], higherIsBetter: boolean, meaningful: number): number[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const mid = (lo + hi) / 2, d = Math.max(hi - lo, meaningful);
  return values.map(x => Math.min(1, Math.max(0, 0.5 + (higherIsBetter ? x - mid : mid - x) / d)));
}

/**
 * Transparent decision framework. Deterministic, no LLM scores, weights visible in the output.
 * 1. Hard constraints: a violating scenario cannot be preferred.
 * 2. Objective metrics per scenario: net cost, fuel, longevity, family fit, comfort.
 * 3. Normalize across the compared scenarios and weight by the user's priorities. Per-factor contributions returned.
 * 4. Verdict: the top eligible scenario, or "inconclusive" when the top two are within INCONCLUSIVE_MARGIN.
 */
export function evaluateDetailed(a: EvaluateInput): { evaluation: DecisionEvaluation; scores: ScenarioScore[] } {
  const names = new Map(a.scenarios.map(s => [s.id, s.name]));
  const budget = a.maxMonthlyBudget ?? a.twin.driver.monthlyBudget;
  const metrics = a.results.map(metricsOf);
  const pick = (k: keyof Metrics) => metrics.map(m => m[k]);
  const norm: Record<Factor, number[]> = {
    cost: normalize(pick("netCost"), false, MEANINGFUL_DIFFERENCE.netCost),
    fuel: normalize(pick("fuel"), false, MEANINGFUL_DIFFERENCE.fuel),
    longevity: normalize(pick("longevity"), true, MEANINGFUL_DIFFERENCE.longevity),
    family: normalize(pick("family"), true, MEANINGFUL_DIFFERENCE.family),
    comfort: normalize(pick("comfort"), true, MEANINGFUL_DIFFERENCE.comfort),
  };

  const scores: ScenarioScore[] = a.results.map((r, i) => {
    const normalized = Object.fromEntries(FACTORS.map(f => [f, norm[f][i]])) as Record<Factor, number>;
    const contributions = Object.fromEntries(FACTORS.map(f => [f, a.priorities[f] * normalized[f]])) as Record<Factor, number>;
    const violations = violationsOf(r, a.twin.vehicle.id, budget);
    return {
      scenarioId: r.scenarioId, name: names.get(r.scenarioId) ?? r.scenarioId, metrics: metrics[i], normalized, contributions,
      total: FACTORS.reduce((t, f) => t + contributions[f], 0), violations, eligible: violations.length === 0,
    };
  });

  const ranked = scores.filter(s => s.eligible).sort((x, y) => y.total - x.total); // stable: ties keep input order
  const [top, second] = ranked;
  const preferredScenarioId = !top ? "inconclusive"
    : second && top.total - second.total < INCONCLUSIVE_MARGIN ? "inconclusive" : top.scenarioId;

  const rationale: string[] = [];
  if (!top) rationale.push("No scenario meets the hard constraints");
  else if (preferredScenarioId === "inconclusive") rationale.push(`Inconclusive: ${top.name} ${f2(top.total)} vs ${second.name} ${f2(second.total)}, within the ${f2(INCONCLUSIVE_MARGIN)} margin`);
  else rationale.push(`Preferred: ${top.name} scores ${f2(top.total)}${second ? ` vs ${f2(second.total)} for ${second.name}` : ""}`);
  for (const s of scores) for (const v of s.violations) rationale.push(`Hard constraint, ${s.name}: ${v}`);
  const list = (fmt: (s: ScenarioScore) => string) => scores.map(s => `${s.name} ${fmt(s)}`).join(", ");
  const months = a.results[0]?.points.length ?? 0;
  rationale.push(
    `Net economic cost over ${months} months: ${list(s => usd(s.metrics.netCost))}`,
    `Fuel spend over ${months} months: ${list(s => usd(s.metrics.fuel))}`,
    `Longevity (miles left of ${LONGEVITY_MILES.toLocaleString("en-US")}): ${list(s => f2(s.metrics.longevity))}`,
    `Family fit: ${list(s => f2(s.metrics.family))}`,
    `Comfort: ${list(s => f2(s.metrics.comfort))}`,
    `Weights: ${FACTORS.map(f => `${f} ${f2(a.priorities[f])}`).join(", ")}`,
    ...scores.map(s => `${s.name} score ${f2(s.total)} = ${FACTORS.map(f => `${f} ${f2(s.contributions[f])}`).join(" + ")}`),
  );

  return {
    evaluation: {
      scenarioIds: a.results.map(r => r.scenarioId),
      hardConstraints: scores.flatMap(s => s.violations.map(v => `${s.name}: ${v}`)),
      preferredScenarioId, rationale,
      sensitivity: [], // filled from sensitivity() (S6); evaluate has no simulation context to rerun
      nextAction: provisionalAction(preferredScenarioId, a.results, a.twin),
    },
    scores,
  };
}

/** Basic action until nextAction (S7) lands. Never implies a booking or approval. */
function provisionalAction(preferred: string, results: SimulationResult[], twin: VehicleTwin) {
  if (preferred === "inconclusive") return { label: "Revisit the comparison later", detail: "No option leads by a clear margin on your priorities." };
  const r = results.find(x => x.scenarioId === preferred);
  const endsWith = r?.points[r.points.length - 1]?.vehicleId ?? twin.vehicle.id;
  return endsWith === twin.vehicle.id
    ? { label: `Keep your ${twin.vehicle.model}`, detail: "Keeping leads on your weighted priorities." }
    : { label: "Look into the replacement", detail: `Replacing with ${endsWith} leads on your weighted priorities.` };
}

export function evaluate(a: EvaluateInput): DecisionEvaluation {
  return evaluateDetailed(a).evaluation;
}
