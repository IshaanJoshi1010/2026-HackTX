import type { Source } from "../contracts";
import { DEFAULT_INSURANCE_PER_MONTH } from "./config";

/** User-entered insurance (scenario.assumptions.insurancePerMonth) wins; otherwise the illustrative default. */
export function insurancePerMonth(assumptions: Record<string, number>): { value: number; source: Source } {
  const entered = assumptions.insurancePerMonth;
  return entered !== undefined && Number.isFinite(entered) && entered >= 0
    ? { value: entered, source: "user" }
    : { value: DEFAULT_INSURANCE_PER_MONTH, source: "illustrative" };
}
