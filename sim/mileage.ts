import { COMMUTE_WEEKS_PER_YEAR } from "./config";

export const monthlyMiles = (annualMiles: number): number => annualMiles / 12;

/** Round-trip commute miles per year. Missing fields count as no commute. */
export const commuteAnnualMiles = (oneWay = 0, daysPerWeek = 0): number =>
  oneWay * 2 * daysPerWeek * COMMUTE_WEEKS_PER_YEAR;
