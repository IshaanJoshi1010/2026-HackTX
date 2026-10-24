import { z } from "zod";
import type * as T from "./index";

const text = z.string().min(1);
const nonnegative = z.number().finite().nonnegative();
const count = nonnegative.int();
const month = count;
const sources = () => z.record(z.string(), SourceSchema);
export const MatchStatusSchema = z.enum(["exact", "representative", "unsupported"]);
export const SourceSchema = z.enum(["sourced", "listing", "user", "estimated", "illustrative", "synthetic"]);
const FinanceTypeSchema = z.enum(["paid_off", "loan", "lease", "unknown"]);
const CargoNeedSchema = z.enum(["low", "medium", "high"]);
const CertaintySchema = z.enum(["clear", "inferred", "vague"]);
const PrioritiesSchema = z.object({
  cost: nonnegative.max(1), family: nonnegative.max(1), longevity: nonnegative.max(1),
  fuel: nonnegative.max(1), comfort: nonnegative.max(1),
}).refine(p => Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) < 1e-6,
  "Priority weights must sum to 1");
const DriverProfileObject = z.object({
  location: text, annualMiles: nonnegative, commuteMilesOneWay: nonnegative.optional(),
  commuteDaysPerWeek: nonnegative.max(7).optional(), householdSize: count.min(1),
  children: count, carSeats: count, cargoNeed: CargoNeedSchema, monthlyBudget: nonnegative.optional(),
  fuelPricePerGal: nonnegative, financeType: FinanceTypeSchema, priorities: PrioritiesSchema,
  provenance: sources(),
});
export const DriverProfileSchema = DriverProfileObject.superRefine((profile, ctx) => {
  for (const key of Object.keys(profile).filter(k => k !== "provenance")) {
    if (profile[key as keyof typeof profile] !== undefined && !profile.provenance[key]) {
      ctx.addIssue({ code: "custom", path: ["provenance", key], message: `Missing source for ${key}` });
    }
  }
}) satisfies z.ZodType<T.DriverProfile>;
export const VehicleConfigSchema = z.object({
  id: text, vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional(), make: text, model: text,
  year: count, trim: text, powertrain: z.enum(["gas", "hybrid"]), paint: text, paintCode: text.optional(),
  mpg: nonnegative, seats: count.min(1), cargoCuFt: nonnegative, msrp: nonnegative,
  modelAsset: z.string(), matchStatus: MatchStatusSchema, specSources: z.array(text).min(1),
}) satisfies z.ZodType<T.VehicleConfig>;
export const HistoryRecordSchema = z.object({
  date: z.iso.date(), type: text, description: text, mileage: nonnegative,
  source: SourceSchema, provenance: text,
}) satisfies z.ZodType<T.HistoryRecord>;
export const FinanceStateSchema = z.object({
  financeType: FinanceTypeSchema, balance: nonnegative, monthlyPayment: nonnegative,
  remainingTermMonths: count, leaseEndMonth: month.optional(), provenance: sources(),
}).superRefine((finance, ctx) => {
  for (const key of Object.keys(finance).filter(k => k !== "provenance")) {
    if (finance[key as keyof typeof finance] !== undefined && !finance.provenance[key]) {
      ctx.addIssue({ code: "custom", path: ["provenance", key], message: `Missing source for ${key}` });
    }
  }
}) satisfies z.ZodType<T.FinanceState>;
export const AccountDataSchema = z.object({ finance: FinanceStateSchema, source: SourceSchema }) satisfies z.ZodType<T.AccountData>;
export const VehicleSignalsSchema = z.object({ mileage: nonnegative, source: SourceSchema }) satisfies z.ZodType<T.VehicleSignals>;
export const RawProfileInputSchema = z.record(z.string(), z.unknown()) satisfies z.ZodType<T.RawProfileInput>;
export const VehicleTwinSchema = z.object({
  vehicle: VehicleConfigSchema, mileage: nonnegative, history: z.array(HistoryRecordSchema),
  driver: DriverProfileSchema, finance: FinanceStateSchema,
}) satisfies z.ZodType<T.VehicleTwin>;
export const EventTypeSchema = z.enum(["relocation", "mileage_change", "family_change", "cargo_change",
  "budget_change", "fuel_price_change", "maintenance_decision", "vehicle_replacement"]);
export const LifeEventSchema = z.object({
  id: text, type: EventTypeSchema, month, payload: z.record(z.string(), z.union([z.number().finite(), z.string()])),
  source: z.enum(["user", "ai", "fixture"]), assumptions: z.array(z.string()), quote: z.string().optional(),
  certainty: CertaintySchema, status: z.enum(["confirmed", "proposed", "invalid"]),
}) satisfies z.ZodType<T.LifeEvent>;
export const ScenarioSchema = z.object({
  id: text, parentId: text.nullable(), forkMonth: month, name: text,
  events: z.array(LifeEventSchema), assumptions: z.record(z.string(), z.number().finite()),
}) satisfies z.ZodType<T.Scenario>;
export const FitSchema = z.enum(["good", "tight", "insufficient", "needs_verification"]);
export const SuitabilityResultSchema = z.object({
  passengerFit: FitSchema, cargoFit: FitSchema, tradeoffs: z.array(z.string()),
  constraints: z.array(z.string()), notes: z.array(z.string()),
}) satisfies z.ZodType<T.SuitabilityResult>;
export const ProjectionPointSchema = z.object({
  month, vehicleId: text, mileage: nonnegative, fuelSpend: nonnegative, maintenanceSpend: nonnegative,
  vehicleValue: nonnegative, loanBalance: nonnegative, cumulativeCash: z.number().finite(),
  netEconomicCost: z.number().finite(), suitability: SuitabilityResultSchema,
}) satisfies z.ZodType<T.ProjectionPoint>;
export const SimulationResultSchema = z.object({
  scenarioId: text, points: z.array(ProjectionPointSchema), milestones: z.array(z.string()),
  warnings: z.array(z.string()), summary: z.object({ totalCash: z.number().finite(), netCost: z.number().finite() }),
}) satisfies z.ZodType<T.SimulationResult>;
const ActionSchema = z.object({ label: text, detail: text, officialLink: z.url().optional() });
export const DecisionEvaluationSchema = z.object({
  scenarioIds: z.array(text), hardConstraints: z.array(z.string()), preferredScenarioId: text,
  rationale: z.array(z.string()), sensitivity: z.array(z.object({
    low: z.number().finite(), base: z.number().finite(), high: z.number().finite(),
  })), nextAction: ActionSchema,
}) satisfies z.ZodType<T.DecisionEvaluation>;
export const ExploreStateSchema = z.object({
  confirmedProfile: DriverProfileSchema,
  draftChanges: z.array(LifeEventSchema.refine(e => e.status === "proposed", "Draft events must be proposed")),
  scenarios: z.array(ScenarioSchema),
}) satisfies z.ZodType<T.ExploreState>;
// Checks the provider shape and validates asynchronous results when these methods are called.
export const ConnectionProviderSchema = z.object({
  getAccount: z.function({ input: [], output: z.promise(AccountDataSchema) }),
  getVehicleSignals: z.function({ input: [], output: z.promise(VehicleSignalsSchema) }),
}) satisfies z.ZodType<T.ConnectionProvider>;
export const FieldKeySchema = z.enum(["mileage", "householdSize", "children", "carSeats", "cargoNeed", "annualMiles",
  "commuteMilesOneWay", "commuteDaysPerWeek", "monthlyBudget", "fuelPricePerGal", "financeType",
  "financePayment", "financeEndMonth", "priorities"]);
export const QuestionSchema = z.object({
  field: FieldKeySchema, text, kind: z.enum(["chips", "number"]), options: z.array(text).optional(), impactNote: text,
}).refine(q => q.kind !== "chips" || q.options?.includes("I'm not sure") === true,
  "Chips questions must include I'm not sure") satisfies z.ZodType<T.Question>;
export const TradeoffPickSchema = z.object({
  pairId: z.enum(["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"]), choice: z.enum(["A", "B"]),
}) satisfies z.ZodType<T.TradeoffPick>;
export const ProfilePatchSchema = z.object({
  field: FieldKeySchema, value: z.union([z.number().finite(), z.string()]), certainty: CertaintySchema, quote: z.string(),
}) satisfies z.ZodType<T.ProfilePatch>;
export const IntentSchema = z.enum(["CREATE_SCENARIO", "COMPARE_SCENARIOS", "EXPLAIN_RESULT",
  "RECOMMEND_ACTION", "FIND_BREAK_EVEN", "CLARIFY"]);
export const InterpretContextSchema = z.object({
  vehicle: VehicleConfigSchema.pick({ make: true, model: true, year: true, trim: true }),
  profile: DriverProfileObject.partial(),
  existingEvents: z.array(z.object({ type: EventTypeSchema, month })), todayISO: z.iso.date(),
}) satisfies z.ZodType<T.InterpretContext>;
export const InterpretResultSchema = z.discriminatedUnion("aiAvailable", [
  z.object({ aiAvailable: z.literal(false) }),
  z.object({ aiAvailable: z.literal(true), intent: IntentSchema,
    proposals: z.array(LifeEventSchema.refine(e => e.status === "proposed", "AI events must be proposed")),
    profilePatches: z.array(ProfilePatchSchema), question: QuestionSchema.optional(), unsupportedReason: text.optional(),
  }),
]) satisfies z.ZodType<T.InterpretResult>;
export const IdentifyResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), vehicle: VehicleConfigSchema, decodeState: z.enum(["registry", "nhtsa", "offline_partial"]) }),
  z.object({ status: z.literal("invalid"), reason: text }),
  z.object({ status: z.literal("unsupported"), partial: VehicleConfigSchema.partial(), reason: text }),
]) satisfies z.ZodType<T.IdentifyResult>;
export const MaintenanceMilestoneSchema = z.object({
  atMiles: nonnegative, repeatEveryMiles: nonnegative.positive().optional(), label: text, costUsd: nonnegative,
}) satisfies z.ZodType<T.MaintenanceMilestone>;
export const DepreciationAssumptionsSchema = z.object({
  retainedByYear: z.array(nonnegative.max(1)).min(1), mileageAdjPer10k: nonnegative,
}) satisfies z.ZodType<T.DepreciationAssumptions>;
export const SpecSheetSchema = z.object({
  vehicleId: text, seats: count.min(1), rearSeatWidthIn: nonnegative.optional(), cargoCuFt: nonnegative,
  curbWeightLb: nonnegative, mpgCity: nonnegative, mpgHwy: nonnegative, mpgCombined: nonnegative,
  msrp: nonnegative, comfortScore: nonnegative.optional(), maintenance: z.array(MaintenanceMilestoneSchema),
  depreciation: DepreciationAssumptionsSchema, verified: z.object({ carSeatFit: z.boolean(), packingFit: z.boolean() }),
  sources: sources(),
}).superRefine((sheet, ctx) => {
  const fields = ["seats", "rearSeatWidthIn", "cargoCuFt", "curbWeightLb", "mpgCity", "mpgHwy", "mpgCombined", "msrp", "comfortScore", "maintenance", "depreciation"] as const;
  for (const key of fields) {
    if (sheet[key] !== undefined && !sheet.sources[key]) {
      ctx.addIssue({ code: "custom", path: ["sources", key], message: `Missing source for ${key}` });
    }
  }
}) satisfies z.ZodType<T.SpecSheet>;
export const SimContextSchema = z.object({ vehicles: z.record(z.string(), VehicleConfigSchema), specs: z.record(z.string(), SpecSheetSchema) }) satisfies z.ZodType<T.SimContext>;
export const MonthStateSchema = z.object({
  month, vehicleId: text, annualMiles: nonnegative, householdSize: count.min(1), children: count,
  cargoNeed: CargoNeedSchema, fuelPricePerGal: nonnegative, monthlyBudget: nonnegative.optional(),
}) satisfies z.ZodType<T.MonthState>;
export const BreakEvenResultSchema = z.discriminatedUnion("found", [
  z.object({ found: z.literal(true), parameter: text, threshold: z.number().finite(), unit: text,
    direction: z.enum(["above", "below"]), currentValue: z.number().finite(), testedBounds: z.tuple([z.number().finite(), z.number().finite()]) }),
  z.object({ found: z.literal(false), parameter: text, reason: z.literal("no_threshold_within_bounds"),
    testedBounds: z.tuple([z.number().finite(), z.number().finite()]) }),
]) satisfies z.ZodType<T.BreakEvenResult>;
export const SensitivityResultSchema = z.object({
  runs: z.array(z.object({ label: z.enum(["low", "base", "high"]), depreciation: z.number().finite(),
    fuelPrice: nonnegative, netCost: z.record(z.string(), z.number().finite()) })),
  heldCount: count, totalCount: count, heldScenarioId: text,
}) satisfies z.ZodType<T.SensitivityResult>;
export const NextActionSchema = ActionSchema.extend({ factors: z.array(z.string()) }) satisfies z.ZodType<T.NextAction>;

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string };
export function validate<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, data: result.data } : {
    ok: false, error: result.error.issues.map(i => `${i.path.join(".") || "value"}: ${i.message}`).join("; "),
  };
}
