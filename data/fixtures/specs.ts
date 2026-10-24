import type { SpecSheet } from "../../contracts";
import epa from "./epa.json";
import { vehicleFixtures } from "./vehicles";

// C0 integration fixtures only. C3 replaces illustrative values with sourced specifications.
export const specFixtures: Record<string, SpecSheet> = Object.fromEntries(vehicleFixtures.map((vehicle, i) => {
  const record = epa.records[i === 0 ? 0 : 2];
  return [vehicle.id, {
    vehicleId: vehicle.id, seats: vehicle.seats, cargoCuFt: vehicle.cargoCuFt,
    curbWeightLb: i === 0 ? 3300 : 3800, mpgCity: Number(record.city08), mpgHwy: Number(record.highway08),
    mpgCombined: Number(record.comb08), msrp: vehicle.msrp,
    maintenance: [{ atMiles: 5000, repeatEveryMiles: 5000, label: "Illustrative routine service", costUsd: 100 }],
    depreciation: { retainedByYear: [0.85, 0.75, 0.67, 0.6, 0.54], mileageAdjPer10k: 0.02 },
    verified: { carSeatFit: false, packingFit: false },
    sources: { seats: "illustrative", cargoCuFt: "illustrative", curbWeightLb: "illustrative",
      mpgCity: "sourced", mpgHwy: "sourced", mpgCombined: "sourced", msrp: "illustrative",
      maintenance: "illustrative", depreciation: "illustrative" },
  } satisfies SpecSheet];
}));
