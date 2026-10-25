import { MAX_INPUT_NUMBER } from "../data/inputLimits";
import { z } from "zod";
import { TradeoffPickSchema } from "../contracts/schemas";
import { normalizeOnboarding } from "../data/normalize";
import { applyDefaults } from "../data/defaults";
const number = z.number().finite().nonnegative().max(MAX_INPUT_NUMBER);
export const ManualProfileSchema = z.object({
  mileage: number.optional(), tradeoffPicks: z.array(TradeoffPickSchema).max(3).optional(),
  location: z.string().trim().min(1).optional(), annualMiles: number.optional(),
  commuteMilesOneWay: number.optional(), commuteDaysPerWeek: number.max(7).optional(),
  householdSize: number.int().min(1).optional(), children: number.int().optional(), carSeats: number.int().optional(),
  cargoNeed: z.enum(["low", "medium", "high"]).optional(), monthlyBudget: number.optional(), fuelPricePerGal: number.optional(),
  financeType: z.enum(["paid_off", "loan", "lease", "unknown"]).optional(), financePayment: number.optional(), financeEndMonth: number.int().optional(),
}).strict();
export const manualFields = [
  { field: "mileage", label: "Current odometer", kind: "number" },
  { field: "tradeoffPicks", label: "Your priorities", kind: "tradeoffs", pairs: ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] },
  { field: "location", label: "Location", kind: "text" }, { field: "annualMiles", label: "Annual miles", kind: "number" },
  { field: "commuteMilesOneWay", label: "Commute miles each way", kind: "number" }, { field: "commuteDaysPerWeek", label: "Commute days per week", kind: "number" },
  { field: "householdSize", label: "Household size", kind: "number" }, { field: "children", label: "Children", kind: "number" }, { field: "carSeats", label: "Child seats", kind: "number" },
  { field: "cargoNeed", label: "Cargo need", kind: "chips", options: ["low", "medium", "high", "I'm not sure"] },
  { field: "monthlyBudget", label: "Monthly budget", kind: "number" }, { field: "fuelPricePerGal", label: "Fuel price per gallon", kind: "number" },
  { field: "financeType", label: "Finance type", kind: "chips", options: ["paid_off", "loan", "lease", "unknown", "I'm not sure"] },
  { field: "financePayment", label: "Monthly payment", kind: "number" }, { field: "financeEndMonth", label: "Months until lease ends", kind: "number" },
] as const;
/** UI omits skipped/I'm-not-sure fields. Output remains a draft until the explicit confirm gate. */
export function prepareManualDraft(input: unknown) {
  const parsed = ManualProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the manual form values" };
  const { mileage, ...raw } = parsed.data;
  const normalized = normalizeOnboarding(raw);
  return normalized.ok ? { ok: true as const, profile: applyDefaults(normalized.profile), mileage, financeInput: normalized.financeInput } : normalized;
}

export type ManualDraftResult = ReturnType<typeof prepareManualDraft>;
