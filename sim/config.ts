import type { DepreciationAssumptions } from "../contracts";

// Every default here is an illustrative hackathon assumption, not market data, a quote or advice.
// The simulation reports each one it uses with source "illustrative" (see simulateDetailed).

/** Months simulated after month 0. Points are emitted for months 1..HORIZON_MONTHS. */
export const HORIZON_MONTHS = 60;

/** Calendar year at month 0. Vehicle age at month 0 = SIM_START_YEAR - model year. Override with scenario.assumptions.startYear. */
export const SIM_START_YEAR = 2026;

/** Mileage baseline for the depreciation mileage adjustment. */
export const EXPECTED_MILES_PER_YEAR = 12000;

/** Retained value never drops below this fraction of MSRP. */
export const RETAINED_FLOOR = 0.1;

/** Clamp on the mileage adjustment factor so extreme mileage cannot push value negative or above MSRP. */
export const MILEAGE_FACTOR_MIN = 0.5;
export const MILEAGE_FACTOR_MAX = 1.1;

/** Used when a vehicle has no SpecSheet. */
export const DEFAULT_DEPRECIATION: DepreciationAssumptions = {
  retainedByYear: [0.85, 0.75, 0.67, 0.6, 0.54], mileageAdjPer10k: 0.02,
};

/** Monthly insurance when the user did not enter one (scenario.assumptions.insurancePerMonth). */
export const DEFAULT_INSURANCE_PER_MONTH = 130;

/** Working weeks per year when converting a commute change into annual miles. */
export const COMMUTE_WEEKS_PER_YEAR = 50;

/** Maintenance tasks with a repeat interval at least this long become timeline milestones. */
export const MILESTONE_MIN_INTERVAL_MILES = 30000;

/** Upper bound when solving for the implied APR of an existing loan. */
export const MAX_IMPLIED_APR = 0.3;

// Replacement purchase defaults. Each can be overridden per scenario through scenario.assumptions
// (replacementPrice, salesTaxRate, purchaseFees, downPayment, newLoanApr, newLoanTermMonths).

/** Sales tax on the purchase price (Texas motor vehicle rate as an illustrative default). */
export const DEFAULT_SALES_TAX_RATE = 0.0625;
/** Title, registration and dealer fees, flat. */
export const DEFAULT_PURCHASE_FEES = 450;
/** Down payment as a fraction of price. Tax and fees are paid in cash on top. */
export const DEFAULT_DOWN_PAYMENT_FRACTION = 0.1;
export const DEFAULT_NEW_LOAN_APR = 0.065;
export const DEFAULT_NEW_LOAN_TERM_MONTHS = 60;
