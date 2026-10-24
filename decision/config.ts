import type { Fit } from "../contracts";

// Every threshold here is illustrative: a transparent, adjustable judgment call, not a Toyota spec or a study.

/** If the top two eligible scenarios score within this, the verdict is "inconclusive". */
export const INCONCLUSIVE_MARGIN = 0.05;

/** Family metric: each fit maps to a score. The family value is the worse of passenger and cargo fit. */
export const FIT_SCORE: Record<Fit, number> = { good: 1, tight: 0.6, needs_verification: 0.5, insufficient: 0 };

/** Longevity = 1 - min(odometer at the horizon / LONGEVITY_MILES, 1). */
export const LONGEVITY_MILES = 250000;

/** Front seats (driver and passenger). Rear positions available for car seats = seats - FRONT_SEATS. */
export const FRONT_SEATS = 2;

/** Cargo volume that fully meets each cargo need. Below it the fit is tight, below the tight fraction it is insufficient. */
export const CARGO_NEED_CU_FT = { low: 12, medium: 18, high: 30 } as const;
export const CARGO_TIGHT_FRACTION = 0.8;

/** Comfort when the spec sheet has no comfortScore. */
export const DEFAULT_COMFORT = 0.5;

/** Break-even search bounds per parameter, and the method's limits. */
export const BREAK_EVEN_BOUNDS = {
  annualMiles: { lo: 5000, hi: 40000, unit: "mi/yr" },
  fuelPricePerGal: { lo: 2, hi: 8, unit: "$/gal" },
} as const;
export const BREAK_EVEN_GRID_POINTS = 25;      // coarse scan to locate a flip before bisecting
export const BREAK_EVEN_MAX_ITERATIONS = 40;
export const BREAK_EVEN_TOLERANCE_FRACTION = 0.005; // stop at 0.5% of the range

/** Sensitivity multipliers (low, base, high). Robustness tests every depreciation x fuel combination. */
export const SENSITIVITY_DEPRECIATION = [0.8, 1, 1.2] as const;
export const SENSITIVITY_FUEL = [0.8, 1, 1.2] as const;

/** Replacement to suggest per current vehicle (scope lock: two supported cars). */
export const REPLACEMENT_NAME: Record<string, string> = {
  "camry-2022-se": "RAV4 Hybrid",
  "rav4-2024-hybrid-xle": "Camry",
};

/** Months until an inconclusive result should be revisited when no break-even threshold exists. */
export const REEVALUATE_MONTHS = 12;

/**
 * Smallest spread across scenarios that counts as a full difference. Scoring is min-max when the spread is at
 * least this large. Below it, scores shrink toward 0.5 in proportion, so a $50 fuel gap cannot swing a
 * whole priority weight. This is what keeps tiny differences from producing an upsell verdict.
 */
export const MEANINGFUL_DIFFERENCE = {
  netCost: 3000,    // dollars over the horizon
  fuel: 3000,       // dollars over the horizon
  longevity: 0.25,  // = 62,500 miles of remaining life
  family: 0.5,      // fit score
  comfort: 0.25,    // comfort score
} as const;
