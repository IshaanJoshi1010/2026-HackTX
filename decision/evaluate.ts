import type { DecisionEvaluation, DriverProfile, Scenario, SimulationResult, VehicleTwin } from "../contracts";
import { applyEvents } from "../sim/events";
import { INCONCLUSIVE_MARGIN, LONGEVITY_MILES, MEANINGFUL_DIFFERENCE } from "./config";
import { leaseEndInHorizon } from "./lease";
import { type Metrics, keepsCurrentCar, metricsOf } from "./metrics";
import { nextAction } from "./nextAction";

type Priorities = DriverProfile["priorities"];
type Factor = keyof Priorities; // cost, family, longevity, fuel, comfort
const FACTORS: Factor[] = ["cost", "family", "longevity", "fuel", "comfort"];

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
/**
 * Recurring monthly cost (fuel, insurance, loan or lease payment): the month's cash minus maintenance.
 * Months where the car changes are skipped, since they hold one-time sale and purchase cash.
 */
function recurringByMonth(r: SimulationResult, startVehicleId: string): { amount: number; month: number }[] {
  const out: { amount: number; month: number }[] = [];
  let prevCash = 0, prevVehicle = startVehicleId;
  for (const p of r.points) {
    if (p.vehicleId === prevVehicle) out.push({ amount: p.cumulativeCash - prevCash - p.maintenanceSpend, month: p.month });
    prevCash = p.cumulativeCash; prevVehicle = p.vehicleId;
  }
  return out;
}

/**
 * The budget in force each month: the stated one, moved by the scenario's budget_change events (the same months the
 * simulation warns on). An explicit `maxMonthlyBudget` overrides all of it. Undefined when no budget was stated.
 */
function budgetFor(twin: VehicleTwin, scenario: Scenario | undefined, explicit: number | undefined): (month: number) => number | undefined {
  if (explicit !== undefined) return () => explicit;
  if (!scenario) return () => twin.driver.monthlyBudget;
  const { timeline } = applyEvents(twin, scenario); // months 1..N
  return month => timeline[month - 1]?.monthlyBudget ?? twin.driver.monthlyBudget;
}

/** Hard constraints: not enough seats for the household (or car seats), or recurring cost over the budget of that month. */
function violationsOf(r: SimulationResult, startVehicleId: string, budgetAt: (month: number) => number | undefined): string[] {
  const v: string[] = [];
  const seats = r.points.find(p => p.suitability.passengerFit === "insufficient");
  if (seats) v.push(`${seats.suitability.constraints.join(", ") || "seats_insufficient"} from month ${seats.month}`);
  let worst: { amount: number; month: number; budget: number } | undefined;
  for (const m of recurringByMonth(r, startVehicleId)) {
    const budget = budgetAt(m.month);
    if (budget !== undefined && m.amount > budget && (!worst || m.amount - budget > worst.amount - worst.budget)) worst = { ...m, budget };
  }
  if (worst) v.push(`monthly cost ${usd(worst.amount)} over the ${usd(worst.budget)} budget at month ${worst.month}`);
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
    const violations = violationsOf(r, a.twin.vehicle.id, budgetFor(a.twin, a.scenarios.find(sc => sc.id === r.scenarioId), a.maxMonthlyBudget));
    return {
      scenarioId: r.scenarioId, name: names.get(r.scenarioId) ?? r.scenarioId, metrics: metrics[i], normalized, contributions,
      total: FACTORS.reduce((t, f) => t + contributions[f], 0), violations, eligible: violations.length === 0,
    };
  });

  const ranked = scores.filter(s => s.eligible).sort((x, y) => y.total - x.total); // stable: ties keep input order
  const [top, second] = ranked;
  const rankedId = !top ? "inconclusive"
    : second && top.total - second.total < INCONCLUSIVE_MARGIN ? "inconclusive" : top.scenarioId;
  // A keep verdict on a lease that ends inside the projection rests on a car with no cost after that month.
  const leaseEnd = leaseEndInHorizon(a.twin, a.results);
  const leased = leaseEnd !== null && rankedId !== "inconclusive"
    && a.results.some(r => r.scenarioId === rankedId && keepsCurrentCar(r, a.twin.vehicle.id));
  const preferredScenarioId = leased ? "inconclusive" : rankedId;

  const rationale: string[] = [];
  if (!top) rationale.push("No scenario meets the hard constraints");
  else if (leased) rationale.push(`Inconclusive: ${top.name} leads on paper (${f2(top.total)}), but your lease ends at month ${leaseEnd} and a renewal or buyout is not modeled, so keeping the car has no cost after that`);
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

  const evaluation: DecisionEvaluation = {
    scenarioIds: a.results.map(r => r.scenarioId),
    hardConstraints: scores.flatMap(s => s.violations.map(v => `${s.name}: ${v}`)),
    preferredScenarioId, rationale,
    sensitivity: [], // filled from sensitivity() (S6); evaluate has no simulation context to rerun
    nextAction: { label: "", detail: "" },
  };
  const action = nextAction(evaluation, a.twin, undefined, a.results);
  evaluation.nextAction = action.officialLink ? { label: action.label, detail: action.detail, officialLink: action.officialLink }
    : { label: action.label, detail: action.detail };
  return { evaluation, scores };
}

export function evaluate(a: EvaluateInput): DecisionEvaluation {
  return evaluateDetailed(a).evaluation;
}
