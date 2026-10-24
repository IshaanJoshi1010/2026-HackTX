import type { Source, SpecSheet, VehicleConfig } from "../contracts";
import { SpecSheetSchema } from "../contracts/schemas";
import epa from "./fixtures/epa.json";
import type { SpecEntry } from "./decode";

export interface NumericSource { label: Source; source: string }
export interface VehicleSpecDetails {
  sheet: SpecSheet;
  powertrain: VehicleConfig["powertrain"];
  drive: "FWD" | "AWD";
  numericSources: Record<string, NumericSource>;
  fitStatus: { carSeatFit: "needs_verification"; packingFit: "needs_verification" };
  officialResources: { label: string; url: string }[];
  notes: string[];
}

/** Shared fields available to simulation and suitability consumers. No imports from /sim or /decision. */
export const requiredFields = Object.freeze([
  "vehicleId", "seats", "cargoCuFt", "curbWeightLb", "mpgCity", "mpgHwy", "mpgCombined",
  "msrp", "maintenance", "depreciation", "verified", "sources",
] as const satisfies readonly (keyof SpecSheet)[]);

const definitions = [
  { id: "camry-2022-se", epaId: "44348", powertrain: "gas", drive: "FWD", seats: 5,
    cargoCuFt: 15, curbWeightLb: 3300, rearSeatWidthIn: 54, msrp: 28000, costs: [60, 95, 180, 450, 250],
    retained: [0.85, 0.75, 0.67, 0.6, 0.54], mileageAdjPer10k: 0.02 },
  { id: "rav4-2024-hybrid-xle", epaId: "47392", powertrain: "hybrid", drive: "AWD", seats: 5,
    cargoCuFt: 37, curbWeightLb: 3800, rearSeatWidthIn: 55, msrp: 33000, costs: [65, 100, 190, 475, 275],
    retained: [0.88, 0.79, 0.72, 0.66, 0.61], mileageAdjPer10k: 0.018 },
] as const;

function createDetails(def: typeof definitions[number]): VehicleSpecDetails {
  const record = epa.records.find(r => r.id === def.epaId);
  if (!record) throw new Error(`Missing EPA fixture record ${def.epaId}`);
  const epaSource = `EPA/DOE fueleconomy.gov vehicle ${def.epaId}; https://www.fueleconomy.gov/ws/rest/vehicle/${def.epaId}; saved data/fixtures/epa.json, fetched ${epa._meta.fetchedOn}`;
  const syntheticSource = `Paarth-approved synthetic ${def.id} demo assumptions, 2026-10-24; data/SYNTHETIC-DATA.md and data/specs.ts; not verified Toyota specifications`;
  const maintenanceSource = `Illustrative ${def.id} independent service-task schedule and costs in data/specs.ts; hackathon simulation assumptions, not Toyota maintenance guidance or a service quote`;
  const depreciationSource = `Illustrative ${def.id} retained-value curve in data/specs.ts; fractions of original MSRP after years 1-5, with a retained-value fraction adjustment per 10,000 miles; not a valuation or market forecast`;
  const schedule = [
    { atMiles: 5000, repeatEveryMiles: 5000, label: "Illustrative tire rotation and inspection", costUsd: def.costs[0] },
    { atMiles: 10000, repeatEveryMiles: 10000, label: "Illustrative oil and filter change", costUsd: def.costs[1] },
    { atMiles: 30000, repeatEveryMiles: 30000, label: "Illustrative air and cabin filter service", costUsd: def.costs[2] },
    { atMiles: 60000, repeatEveryMiles: 60000, label: "Illustrative fluids and component service", costUsd: def.costs[3] },
    { atMiles: 90000, repeatEveryMiles: 90000, label: "Illustrative extended inspection", costUsd: def.costs[4] },
  ];
  const sheet = SpecSheetSchema.parse({
    vehicleId: def.id, seats: def.seats, rearSeatWidthIn: def.rearSeatWidthIn,
    cargoCuFt: def.cargoCuFt, curbWeightLb: def.curbWeightLb,
    mpgCity: Number(record.city08), mpgHwy: Number(record.highway08), mpgCombined: Number(record.comb08),
    msrp: def.msrp, maintenance: schedule,
    depreciation: { retainedByYear: [...def.retained], mileageAdjPer10k: def.mileageAdjPer10k },
    verified: { carSeatFit: false, packingFit: false },
    sources: {
      seats: "synthetic", rearSeatWidthIn: "synthetic", cargoCuFt: "synthetic", curbWeightLb: "synthetic", msrp: "synthetic",
      mpgCity: "sourced", mpgHwy: "sourced", mpgCombined: "sourced", maintenance: "illustrative", depreciation: "illustrative",
    },
  });
  const numericSources: Record<string, NumericSource> = {};
  for (const key of ["seats", "rearSeatWidthIn", "cargoCuFt", "curbWeightLb", "msrp"] as const) {
    numericSources[key] = { label: "synthetic", source: syntheticSource };
  }
  for (const key of ["mpgCity", "mpgHwy", "mpgCombined"] as const) {
    numericSources[key] = { label: "sourced", source: epaSource };
  }
  sheet.maintenance.forEach((task, index) => {
    for (const key of ["atMiles", "repeatEveryMiles", "costUsd"] as const) {
      if (task[key] !== undefined) numericSources[`maintenance.${index}.${key}`] = { label: "illustrative", source: maintenanceSource };
    }
  });
  sheet.depreciation.retainedByYear.forEach((_, index) => {
    numericSources[`depreciation.retainedByYear.${index}`] = { label: "illustrative", source: depreciationSource };
  });
  numericSources["depreciation.mileageAdjPer10k"] = { label: "illustrative", source: depreciationSource };
  return {
    sheet, powertrain: def.powertrain, drive: def.drive, numericSources,
    fitStatus: { carSeatFit: "needs_verification", packingFit: "needs_verification" },
    // Only user-confirmed official Toyota resource URLs may be added. None supplied yet.
    officialResources: [],
    notes: [
      "Fictional vehicle assumptions support the approved demo use case; only the EPA MPG fields are externally sourced.",
      "Rear-seat width is a synthetic comparison input, not measured child-seat compatibility. Both fit checks remain unverified.",
      "EPA zero luggage volumes mean unreported; cargo volume here is synthetic, never inferred from EPA zero values.",
      "Maintenance milestones are separate tasks with incremental costs, not overlapping service packages. Repeat tasks at their intervals without treating atMiles as elapsed ownership mileage.",
      "Retained value starts from original MSRP: retainedByYear[0] means after year 1. These are illustrative assumptions; Dev 4 owns calculations and mileage-adjustment semantics.",
      "No official Toyota resource links have been user-confirmed. No EPA default fuel-cost or youSaveSpend fields are exported.",
    ],
  };
}
const catalog = Object.fromEntries(definitions.map(def => [def.id, createDetails(def)]));
export const supportedSpecIds: readonly string[] = Object.freeze(definitions.map(def => def.id));

export function getSpecDetails(vehicleId: string): VehicleSpecDetails {
  if (!Object.hasOwn(catalog, vehicleId)) throw new Error(`No spec sheet for vehicle ${vehicleId}`);
  return structuredClone(catalog[vehicleId]);
}
/** Canonical integration signature; labels live in sources, full citations in getSpecDetails. */
export function getSpecs(vehicleId: string): SpecSheet {
  return getSpecDetails(vehicleId).sheet;
}

/** Strict model/year/trim/drivetrain descriptors used by the decoder's spec merge. */
export function getSpecEntries(): SpecEntry[] {
  return definitions.map(def => ({
    make: "Toyota", model: def.id === "camry-2022-se" ? "Camry" : "RAV4", year: def.id === "camry-2022-se" ? 2022 : 2024,
    trim: def.id === "camry-2022-se" ? "SE" : "XLE", powertrain: def.powertrain,
    driveType: def.drive === "FWD" ? "FWD/Front-Wheel Drive" : "AWD/All-Wheel Drive",
    sheet: getSpecs(def.id),
    source: `data/specs.ts (${def.id}); EPA record ${def.epaId} for MPG; approved synthetic assumptions for seats/cargo/MSRP; leaf citations via getSpecDetails`,
  }));
}
