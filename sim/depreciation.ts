import type { DepreciationAssumptions } from "../contracts";
import { EXPECTED_MILES_PER_YEAR, MILEAGE_FACTOR_MAX, MILEAGE_FACTOR_MIN, RETAINED_FLOOR } from "./config";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Fraction of MSRP retained at an age in years. retainedByYear[0] is after year 1; age 0 is 1.
 * Linear between years. Past the curve, it continues at the last year's drop, floored at RETAINED_FLOOR.
 * scale multiplies the value lost (sensitivity: 0.8 = gentler, 1.2 = steeper).
 */
export function retainedFraction(dep: DepreciationAssumptions, ageYears: number, scale = 1): number {
  const curve = [1, ...dep.retainedByYear];
  const last = curve.length - 1;
  const age = Math.max(0, ageYears);
  let r: number;
  if (age >= last) {
    const drop = curve[last - 1] - curve[last];
    r = curve[last] - drop * (age - last);
  } else {
    const i = Math.floor(age);
    r = curve[i] + (curve[i + 1] - curve[i]) * (age - i);
  }
  return clamp(1 - (1 - r) * scale, RETAINED_FLOOR, 1);
}

/** Mileage adjustment: each 10k miles over (under) the expected odometer lowers (raises) value by mileageAdjPer10k. */
export function mileageFactor(dep: DepreciationAssumptions, ageYears: number, odometer: number): number {
  const excess = odometer - EXPECTED_MILES_PER_YEAR * Math.max(0, ageYears);
  return clamp(1 - dep.mileageAdjPer10k * excess / 10000, MILEAGE_FACTOR_MIN, MILEAGE_FACTOR_MAX);
}

export function vehicleValue(msrp: number, dep: DepreciationAssumptions, ageYears: number, odometer: number, scale = 1): number {
  return msrp * retainedFraction(dep, ageYears, scale) * mileageFactor(dep, ageYears, odometer);
}
