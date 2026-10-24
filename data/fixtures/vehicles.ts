import type { VehicleConfig } from "../../contracts";
import epa from "./epa.json";

const camryEpa = epa.records[0]; // 2022 FWD LE/SE; AWD is a separate record.
const rav4Epa = epa.records[2]; // 2024 Hybrid AWD, including XLE.
// Non-EPA numbers are illustrative fixture values, never verified vehicle specifications.
export const camryVehicle: VehicleConfig = {
  id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas",
  paint: "TODO: awaiting asset gate and listing", mpg: Number(camryEpa.comb08), seats: 5,
  cargoCuFt: 15, msrp: 28000, modelAsset: "", matchStatus: "representative",
  specSources: ["sourced: EPA vehicle 44348, Camry LE/SE FWD combined MPG; data/fixtures/epa.json",
    "illustrative: seats, cargoCuFt and msrp; not verified", "paint and modelAsset pending Kareem's asset gate and listing"],
};
export const rav4Vehicle: VehicleConfig = {
  id: "rav4-2024-hybrid-xle", make: "Toyota", model: "RAV4", year: 2024, trim: "Hybrid XLE", powertrain: "hybrid",
  paint: "TODO: awaiting asset gate and listing", mpg: Number(rav4Epa.comb08), seats: 5,
  cargoCuFt: 37, msrp: 33000, modelAsset: "", matchStatus: "representative",
  specSources: ["sourced: EPA vehicle 47392, RAV4 Hybrid AWD combined MPG; data/fixtures/epa.json",
    "illustrative: seats, cargoCuFt and msrp; not verified; EPA zero volumes mean unreported",
    "paint and modelAsset pending Kareem's asset gate and listing"],
};
export const vehicleFixtures = [camryVehicle, rav4Vehicle];
