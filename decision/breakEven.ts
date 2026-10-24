import type { BreakEvenResult, DriverProfile, Scenario, SimContext, SimulationResult, VehicleTwin } from "../contracts";
import { applyEvents } from "../sim/events";
import { simulate } from "../sim/simulate";
import { BREAK_EVEN_BOUNDS, BREAK_EVEN_GRID_POINTS, BREAK_EVEN_MAX_ITERATIONS, BREAK_EVEN_TOLERANCE_FRACTION } from "./config";
import { evaluate } from "./evaluate";

export type BreakEvenParameter = "annualMiles" | "fuelPricePerGal";
/** "verdict": where evaluate()'s preferred scenario changes (default). "netCost": where the cheaper scenario changes. */
export type BreakEvenCriterion = "verdict" | "netCost";
export interface BreakEvenInput {
  twin: VehicleTwin; keep: Scenario; replace: Scenario; parameter: BreakEvenParameter;
  ctx: SimContext; priorities: DriverProfile["priorities"];
}
export interface BreakEvenDetails {
  result: BreakEvenResult; criterion: BreakEvenCriterion;
  currentVerdict: string; target: string; iterations: number;
}

const OVERRIDE_KEY: Record<BreakEvenParameter, string> = { annualMiles: "annualMilesOverride", fuelPricePerGal: "fuelPricePerGalOverride" };

/**
 * The scenario with `parameter` held at `value` for every month. This is the exact what-if break-even tests,
 * so a user typing a value by hand gets the same result.
 */
export const withParameter = (s: Scenario, parameter: BreakEvenParameter, value: number): Scenario =>
  ({ ...s, assumptions: { ...s.assumptions, [OVERRIDE_KEY[parameter]]: value } });

function verdictOf(a: BreakEvenInput, keep: Scenario, replace: Scenario, criterion: BreakEvenCriterion): { verdict: string; results: SimulationResult[] } {
  const results = [simulate(a.twin, keep, a.ctx), simulate(a.twin, replace, a.ctx)];
  const verdict = criterion === "netCost"
    ? (results[1].summary.netCost < results[0].summary.netCost ? replace.id : keep.id)
    : evaluate({ twin: a.twin, scenarios: [keep, replace], results, priorities: a.priorities }).preferredScenarioId;
  return { verdict, results };
}

const at = (a: BreakEvenInput, x: number, criterion: BreakEvenCriterion) =>
  verdictOf(a, withParameter(a.keep, a.parameter, x), withParameter(a.replace, a.parameter, x), criterion);

/** The parameter's modeled value today: its average over the keep scenario's 60 months (events included). */
function currentValueOf(a: BreakEvenInput): number {
  const { timeline } = applyEvents(a.twin, a.keep);
  return timeline.reduce((t, s) => t + s[a.parameter], 0) / timeline.length;
}

/**
 * One-parameter break-even by bisection between tested bounds (BREAK_EVEN_BOUNDS). Not a multidimensional
 * optimization. If today's verdict is keep, it finds where replacing becomes preferred; otherwise where keeping
 * does ("what would have to change for keeping to win"). A coarse grid locates the flip nearest today's value,
 * then bisection narrows it to 0.5% of the range or 40 iterations. No flip in bounds: found false.
 */
export function breakEvenDetailed(a: BreakEvenInput, criterion: BreakEvenCriterion = "verdict"): BreakEvenDetails {
  const { lo, hi, unit } = BREAK_EVEN_BOUNDS[a.parameter];
  const testedBounds: [number, number] = [lo, hi];
  const currentVerdict = verdictOf(a, a.keep, a.replace, criterion).verdict;
  const target = currentVerdict === a.keep.id ? a.replace.id : a.keep.id;
  const isTarget = (x: number) => at(a, x, criterion).verdict === target;
  const currentValue = currentValueOf(a);
  const notFound: BreakEvenDetails = {
    result: { found: false, parameter: a.parameter, reason: "no_threshold_within_bounds", testedBounds },
    criterion, currentVerdict, target, iterations: 0,
  };

  const xs = Array.from({ length: BREAK_EVEN_GRID_POINTS }, (_, i) => lo + (hi - lo) * i / (BREAK_EVEN_GRID_POINTS - 1));
  const hits = xs.map(isTarget);
  let bracket: [number, number] | null = null;
  for (let i = 0; i + 1 < xs.length; i++) {
    if (hits[i] === hits[i + 1]) continue;
    const mid = (xs[i] + xs[i + 1]) / 2;
    if (!bracket || Math.abs(mid - currentValue) < Math.abs((bracket[0] + bracket[1]) / 2 - currentValue)) bracket = [i, i + 1];
  }
  if (!bracket) return notFound;

  let [x0, x1] = [xs[bracket[0]], xs[bracket[1]]];
  const upperIsTarget = hits[bracket[1]];
  const tolerance = (hi - lo) * BREAK_EVEN_TOLERANCE_FRACTION;
  let iterations = 0;
  while (x1 - x0 > tolerance && iterations < BREAK_EVEN_MAX_ITERATIONS) {
    const mid = (x0 + x1) / 2;
    if (isTarget(mid) === upperIsTarget) x1 = mid; else x0 = mid;
    iterations++;
  }
  return {
    result: { found: true, parameter: a.parameter, threshold: (x0 + x1) / 2, unit, direction: upperIsTarget ? "above" : "below", currentValue, testedBounds },
    criterion, currentVerdict, target, iterations,
  };
}

export function findBreakEven(a: BreakEvenInput): BreakEvenResult {
  return breakEvenDetailed(a).result;
}

export interface ReproductionSide { value: number; preferredScenarioId: string; netCost: Record<string, number> }

/**
 * Reruns both scenarios just below and just above a found threshold (by the search tolerance), so anyone can
 * check the flip by typing those values. Null when no threshold was found.
 */
export function reproduceBreakEven(a: BreakEvenInput, be: BreakEvenResult, criterion: BreakEvenCriterion = "verdict"):
  { below: ReproductionSide; above: ReproductionSide } | null {
  if (!be.found) return null;
  const step = (be.testedBounds[1] - be.testedBounds[0]) * BREAK_EVEN_TOLERANCE_FRACTION;
  const side = (value: number): ReproductionSide => {
    const { verdict, results } = at(a, value, criterion);
    return { value, preferredScenarioId: verdict, netCost: Object.fromEntries(results.map(r => [r.scenarioId, r.summary.netCost])) };
  };
  return { below: side(be.threshold - step), above: side(be.threshold + step) };
}
