import type { DriverProfile, Source, SpecSheet } from "@/contracts";
import { weakestSource } from "./sources";

export type MetricKey = "mileage" | "fuelSpend" | "maintenanceSpend" | "vehicleValue" | "netEconomicCost";

/**
 * Label for a projected number: the weakest source among the inputs it is built
 * from. A missing input source yields undefined, which SourceBadge shows as
 * "no source" so the gap is visible.
 *
 * The input lists mirror what the projection reads. Confirm them with Dev 4
 * when the real simulate lands.
 */
export function metricSource(
  metric: MetricKey,
  profile: DriverProfile,
  spec: SpecSheet | null,
): Source | undefined {
  const p = profile.provenance;
  const s = spec?.sources;
  const inputs: Record<MetricKey, Array<Source | undefined>> = {
    mileage: [p.mileage, p.annualMiles],
    fuelSpend: [p.annualMiles, s?.mpgCombined, p.fuelPricePerGal],
    maintenanceSpend: [p.mileage, p.annualMiles, s?.maintenance],
    vehicleValue: [s?.msrp, s?.depreciation],
    netEconomicCost: [
      p.annualMiles,
      s?.mpgCombined,
      p.fuelPricePerGal,
      s?.maintenance,
      s?.msrp,
      s?.depreciation,
    ],
  };
  return weakestSource(inputs[metric]);
}
