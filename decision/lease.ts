import type { SimulationResult, VehicleTwin } from "../contracts";

/**
 * The month the current lease ends, when that falls inside the projection. The simulation models no cost for the
 * leased car after that (no renewal, no buyout), so a scenario that keeps it looks nearly free from then on and a
 * "keep" verdict would rest on a cost that is not real. Null for any other kind of finance, or a lease that runs
 * past the horizon.
 */
export function leaseEndInHorizon(twin: VehicleTwin, results: SimulationResult[]): number | null {
  if (twin.driver.financeType !== "lease") return null;
  const horizon = Math.max(0, ...results.map(r => r.points.length));
  const end = twin.finance.leaseEndMonth ?? twin.finance.remainingTermMonths;
  return Number.isFinite(end) && end < horizon ? Math.max(0, end) : null;
}
