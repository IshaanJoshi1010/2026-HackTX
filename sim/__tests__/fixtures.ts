import type { LifeEvent, Scenario, SimContext, SpecSheet, VehicleConfig, VehicleTwin } from "../../contracts";

// Local test fixtures. Shapes mirror Dev 3's data so /sim never imports /data.
export const camry: VehicleConfig = {
  id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "test",
  mpg: 32, seats: 5, cargoCuFt: 15, msrp: 28000, modelAsset: "", matchStatus: "representative", specSources: ["test"],
};

export const camrySpec: SpecSheet = {
  vehicleId: "camry-2022-se", seats: 5, cargoCuFt: 15, curbWeightLb: 3300, mpgCity: 28, mpgHwy: 39, mpgCombined: 32,
  msrp: 28000,
  maintenance: [
    { atMiles: 5000, repeatEveryMiles: 5000, label: "Tire rotation", costUsd: 60 },
    { atMiles: 10000, repeatEveryMiles: 10000, label: "Oil change", costUsd: 95 },
    { atMiles: 30000, repeatEveryMiles: 30000, label: "Filter service", costUsd: 180 },
    { atMiles: 60000, repeatEveryMiles: 60000, label: "Fluids service", costUsd: 450 },
    { atMiles: 90000, repeatEveryMiles: 90000, label: "Extended inspection", costUsd: 250 },
  ],
  depreciation: { retainedByYear: [0.85, 0.75, 0.67, 0.6, 0.54], mileageAdjPer10k: 0.02 },
  verified: { carSeatFit: false, packingFit: false },
  sources: { seats: "synthetic", cargoCuFt: "synthetic", curbWeightLb: "synthetic", mpgCity: "sourced", mpgHwy: "sourced",
    mpgCombined: "sourced", msrp: "synthetic", maintenance: "illustrative", depreciation: "illustrative" },
};

export const rav4: VehicleConfig = {
  ...camry, id: "rav4-2024-hybrid-xle", model: "RAV4", year: 2024, trim: "Hybrid XLE", powertrain: "hybrid",
  mpg: 39, cargoCuFt: 37, msrp: 33000,
};

export const rav4Spec: SpecSheet = {
  ...camrySpec, vehicleId: rav4.id, cargoCuFt: 37, curbWeightLb: 3800, mpgCity: 41, mpgHwy: 38, mpgCombined: 39, msrp: 33000,
  maintenance: camrySpec.maintenance.map(t => ({ ...t, costUsd: t.costUsd + 5 })),
  depreciation: { retainedByYear: [0.88, 0.79, 0.72, 0.66, 0.61], mileageAdjPer10k: 0.018 },
};

export const ctx: SimContext = {
  vehicles: { [camry.id]: camry, [rav4.id]: rav4 },
  specs: { [camry.id]: camrySpec, [rav4.id]: rav4Spec },
};

export const twin: VehicleTwin = {
  vehicle: camry, mileage: 48000, history: [],
  driver: {
    location: "Austin, TX", annualMiles: 12000, householdSize: 2, children: 0, carSeats: 0, cargoNeed: "low",
    fuelPricePerGal: 3, financeType: "loan", priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
    provenance: { annualMiles: "synthetic", fuelPricePerGal: "synthetic" },
  },
  finance: { financeType: "loan", balance: 15000, monthlyPayment: 450, remainingTermMonths: 36,
    provenance: { balance: "synthetic", monthlyPayment: "synthetic", remainingTermMonths: "synthetic" } },
};

export const paidOffTwin: VehicleTwin = {
  ...twin,
  driver: { ...twin.driver, financeType: "paid_off" },
  finance: { financeType: "paid_off", balance: 0, monthlyPayment: 0, remainingTermMonths: 0, provenance: {} },
};

export const baseline: Scenario = { id: "baseline", parentId: null, forkMonth: 0, name: "Keep", events: [], assumptions: {} };

export const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"],
  status: LifeEvent["status"] = "confirmed"): LifeEvent =>
  ({ id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status });

export const withEvents = (events: LifeEvent[], assumptions: Record<string, number> = {}): Scenario =>
  ({ ...baseline, id: "s", events, assumptions });

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
