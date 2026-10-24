import type { DriverProfile, Fit, SpecSheet, SuitabilityResult, VehicleConfig } from "../contracts";
import { CARGO_NEED_CU_FT, CARGO_TIGHT_FRACTION, FRONT_SEATS } from "./config";

/**
 * Life-stage fit of one vehicle for one profile at one month. Deterministic and explanation-ready:
 * tradeoffs, constraints and notes are short keys (notes are key=value) that explain() turns into prose.
 * Never assumes more kids means an SUV: fit only follows seats, car seats and stated cargo need.
 * Car seat fit is never guessed: if the spec does not verify it, any car seat need is "needs_verification".
 */
export function assessSuitability(p: DriverProfile, v: VehicleConfig, s: SpecSheet, month: number): SuitabilityResult {
  const seats = s.seats ?? v.seats;
  const rear = Math.max(0, seats - FRONT_SEATS);
  const cargo = s.cargoCuFt;
  const need = CARGO_NEED_CU_FT[p.cargoNeed];
  const tradeoffs: string[] = [], constraints: string[] = [];
  const notes = [`vehicle=${v.id}`, `month=${month}`, `household=${p.householdSize}`, `seats=${seats}`,
    `car_seats=${p.carSeats}`, `rear_positions=${rear}`, `cargo_need=${p.cargoNeed}`, `cargo_cu_ft=${cargo}`, `cargo_needed_cu_ft=${need}`];

  let passengerFit: Fit;
  if (p.householdSize > seats) { passengerFit = "insufficient"; constraints.push("seats_below_household"); }
  else if (p.carSeats > rear) { passengerFit = "insufficient"; constraints.push("car_seats_exceed_rear_positions"); }
  else if (p.carSeats > 0 && !s.verified.carSeatFit) { passengerFit = "needs_verification"; notes.push("car_seat_fit=unverified"); }
  else if (p.householdSize === seats) { passengerFit = "tight"; tradeoffs.push("every_seat_used"); }
  else if (p.carSeats >= 2 && p.carSeats === rear) { passengerFit = "tight"; tradeoffs.push("car_seats_fill_rear_row"); }
  else passengerFit = "good";

  let cargoFit: Fit;
  if (!(cargo > 0)) { cargoFit = "needs_verification"; notes.push("cargo_volume=unreported"); }
  else if (cargo >= need) cargoFit = "good";
  else if (cargo >= need * CARGO_TIGHT_FRACTION) { cargoFit = "tight"; tradeoffs.push("cargo_below_need"); }
  else { cargoFit = "insufficient"; tradeoffs.push("cargo_well_below_need"); }
  if (p.cargoNeed !== "low" && !s.verified.packingFit) notes.push("packing_fit=unverified");

  if (s.comfortScore !== undefined) notes.push(`comfort_score=${s.comfortScore}`);
  return { passengerFit, cargoFit, tradeoffs, constraints, notes };
}

/** Used when a vehicle has no spec sheet: nothing is guessed. */
export const unverifiedSuitability = (v: VehicleConfig, month: number): SuitabilityResult => ({
  passengerFit: "needs_verification", cargoFit: "needs_verification", tradeoffs: [], constraints: [],
  notes: [`vehicle=${v.id}`, `month=${month}`, "spec_sheet=missing"],
});

/** Comparative tradeoff keys for `other` relative to `current`, such as "more_cargo_but_lower_mpg". */
export function compareVehicles(current: SpecSheet, other: SpecSheet): string[] {
  const cargo = Math.sign(other.cargoCuFt - current.cargoCuFt), mpg = Math.sign(other.mpgCombined - current.mpgCombined);
  const word = (n: number, more: string, less: string) => (n > 0 ? more : less);
  if (cargo === 0 && mpg === 0) return ["same_cargo_and_mpg"];
  if (cargo === 0) return [word(mpg, "higher_mpg", "lower_mpg")];
  if (mpg === 0) return [word(cargo, "more_cargo", "less_cargo")];
  if (cargo === mpg) return [`${word(cargo, "more", "less")}_cargo_and_${word(mpg, "higher", "lower")}_mpg`];
  return [`${word(cargo, "more", "less")}_cargo_but_${word(mpg, "higher", "lower")}_mpg`];
}
