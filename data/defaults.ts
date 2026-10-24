import type { DriverProfile, Source } from "../contracts";
import { DriverProfileSchema } from "../contracts/schemas";

export const defaultsTable = {
  annualMiles: { value: 12000, source: "estimated", upgradeQuestion: "What is your annual mileage or weekly commute?" },
  nonCommuteMiles: { value: 4000, source: "estimated", upgradeQuestion: "How many miles do you drive outside your commute each year?" },
  cargoNeed: { value: "from household size", source: "estimated", upgradeQuestion: "How much cargo space do you need?" },
  fuelPricePerGal: { value: 3, source: "illustrative", upgradeQuestion: "What do you pay per gallon?" },
  maintenance: { value: "getSpecs(vehicleId).maintenance", source: "illustrative", upgradeQuestion: null },
  tradeInValue: { value: "getSpecs(vehicleId).depreciation", source: "illustrative", upgradeQuestion: "What is your current trade-in quote?" },
  newCarPrice: { value: "selected synthetic listing price, else vehicle MSRP", source: "illustrative", upgradeQuestion: "What is the quoted replacement price?" },
  taxRate: { value: 0.06, source: "illustrative", upgradeQuestion: "What tax rate appears on your quote?" },
  fees: { value: 500, source: "illustrative", upgradeQuestion: "What fees appear on your quote?" },
  interestApr: { value: 0.07, source: "illustrative", upgradeQuestion: "What APR were you offered?" },
  insuranceMonthly: { value: 150, source: "illustrative", upgradeQuestion: "What is your monthly insurance quote?" },
  finance: { value: "price, vehicle age, 72-month loan or 36-month lease", source: "estimated", upgradeQuestion: "What is your monthly payment?" },
  priorities: { value: "equal weights until deterministic tradeoff picks", source: "estimated", upgradeQuestion: "Which tradeoffs matter most to you?" },
} as const;

/** Fills only undefined fields. Invalid supplied values fail validation rather than being replaced. */
export function applyDefaults(p: Partial<DriverProfile>): DriverProfile {
  const base: DriverProfile = {
    location: "Not provided", annualMiles: 12000, householdSize: 1, children: 0, carSeats: 0,
    cargoNeed: "low", fuelPricePerGal: defaultsTable.fuelPricePerGal.value, financeType: "unknown",
    priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
    provenance: {},
  };
  const supplied = Object.fromEntries(Object.entries(p).filter(([key, value]) => key !== "provenance" && value !== undefined));
  const result = { ...base, ...structuredClone(supplied), provenance: { ...p.provenance } } as DriverProfile;
  if (p.cargoNeed === undefined) result.cargoNeed = result.householdSize >= 4 ? "high" : result.householdSize >= 3 ? "medium" : "low";
  for (const key of Object.keys(result).filter(key => key !== "provenance")) {
    const provided = Object.hasOwn(supplied, key);
    result.provenance[key] = provided ? p.provenance?.[key] ?? "user"
      : key === "fuelPricePerGal" ? "illustrative" : "estimated";
  }
  return DriverProfileSchema.parse(result);
}
export const defaultSourceNotes: Record<string, string> = {
  annualMiles: "Estimated 12,000 mi/year; commute-derived totals include an estimated 4,000 non-commute miles.",
  fuelPricePerGal: "Illustrative $3/gal placeholder, not a verified local fuel-price average.",
  finance: "Demo assumptions only; 20% down, 7% illustrative APR, 72-month original loan term or 36-month lease. Not an actual financing offer.",
  costs: "Tax, fees and insurance seeds are illustrative demo assumptions, not local tax rules or real quotes. Consumers must opt into these explicitly.",
};
export type DefaultSource = Extract<Source, "estimated" | "illustrative">;
