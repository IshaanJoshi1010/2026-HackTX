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
