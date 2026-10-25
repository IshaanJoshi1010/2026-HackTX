// Shared contracts. Existing fields copied unchanged from CLAUDE.md and INTERFACES.md.
export type MatchStatus = "exact" | "representative" | "unsupported";
export type Source = "sourced" | "listing" | "user" | "estimated" | "illustrative" | "synthetic";

export interface VehicleConfig {
  id: string; vin?: string; make: string; model: string; year: number;
  trim: string; powertrain: "gas" | "hybrid"; paint: string; paintCode?: string;
  mpg: number; seats: number; cargoCuFt: number; msrp: number;
  modelAsset: string; matchStatus: MatchStatus; specSources: string[];
}

export interface DriverProfile {
  location: string; annualMiles: number; commuteMilesOneWay?: number;
  commuteDaysPerWeek?: number; householdSize: number; children: number;
  carSeats: number; cargoNeed: "low" | "medium" | "high";
  monthlyBudget?: number; fuelPricePerGal: number;
  financeType: "paid_off" | "loan" | "lease" | "unknown";
  priorities: { cost: number; family: number; longevity: number;
                fuel: number; comfort: number }; // weights sum to 1
  provenance: Record<string, Source>;
}

export interface VehicleTwin {
  // The odometer source is driver.provenance["mileage"], without adding a profile mileage value.
  vehicle: VehicleConfig; mileage: number; history: HistoryRecord[];
  driver: DriverProfile; finance: FinanceState;
}

export type EventType = "relocation" | "mileage_change" | "family_change" |
  "cargo_change" | "budget_change" | "fuel_price_change" |
  "maintenance_decision" | "vehicle_replacement";

export interface LifeEvent {
  id: string; type: EventType; month: number;
  payload: Record<string, number | string>;
  source: "user" | "ai" | "fixture"; assumptions: string[];
  quote?: string;
  certainty: "clear" | "inferred" | "vague";
  status: "confirmed" | "proposed" | "invalid";
}

export interface Scenario {
  id: string; parentId: string | null; forkMonth: number; name: string;
  events: LifeEvent[]; assumptions: Record<string, number>;
}

export interface ProjectionPoint {
  month: number; vehicleId: string; mileage: number; fuelSpend: number;
  maintenanceSpend: number; vehicleValue: number; loanBalance: number;
  cumulativeCash: number; netEconomicCost: number;
  suitability: SuitabilityResult;
}

export interface SimulationResult {
  scenarioId: string; points: ProjectionPoint[]; milestones: string[];
  warnings: string[]; summary: { totalCash: number; netCost: number };
}

export interface DecisionEvaluation {
  scenarioIds: string[]; hardConstraints: string[];
  preferredScenarioId: string | "inconclusive"; rationale: string[];
  sensitivity: { low: number; base: number; high: number }[];
  nextAction: { label: string; detail: string; officialLink?: string };
}

export interface ExploreState {
  confirmedProfile: DriverProfile; // changes only on explicit confirm
  draftChanges: LifeEvent[];       // AI proposals, not yet confirmed
  scenarios: Scenario[];
}

export interface ConnectionProvider {
  getAccount(): Promise<AccountData>;
  getVehicleSignals(): Promise<VehicleSignals>;
}


export type FieldKey = "mileage" | "householdSize" | "children" | "carSeats" | "cargoNeed" | "annualMiles"
  | "commuteMilesOneWay" | "commuteDaysPerWeek" | "monthlyBudget" | "fuelPricePerGal"
  | "financeType" | "financePayment" | "financeEndMonth" | "priorities";

export interface Question { field: FieldKey; text: string; kind: "chips" | "number"; options?: string[]; impactNote: string }

export type TradeoffPick = { pairId: "cost_vs_cargo" | "longevity_vs_fuel" | "comfort_vs_cost"; choice: "A" | "B" };

export interface ProfilePatch { field: FieldKey; value: number | string; certainty: "clear" | "inferred" | "vague"; quote: string }

export type Intent = "CREATE_SCENARIO" | "COMPARE_SCENARIOS" | "EXPLAIN_RESULT" | "RECOMMEND_ACTION" | "FIND_BREAK_EVEN" | "CLARIFY";

export interface InterpretContext {
  vehicle: Pick<VehicleConfig, "make" | "model" | "year" | "trim">;
  profile: Partial<DriverProfile>;
  existingEvents: { type: EventType; month: number }[];
  todayISO: string;
}

export type InterpretResult =
  | { aiAvailable: false }
  | { aiAvailable: true; intent: Intent; proposals: LifeEvent[]; profilePatches: ProfilePatch[];
      question?: Question; unsupportedReason?: string };

export type IdentifyResult =
  | { status: "ok"; vehicle: VehicleConfig; decodeState: "registry" | "nhtsa" | "offline_partial" }
  | { status: "invalid"; reason: string }
  | { status: "unsupported"; partial: Partial<VehicleConfig>; reason: string };

export interface SpecSheet {
  vehicleId: string; seats: number; rearSeatWidthIn?: number; cargoCuFt: number; curbWeightLb: number;
  mpgCity: number; mpgHwy: number; mpgCombined: number; msrp: number; comfortScore?: number;
  maintenance: MaintenanceMilestone[]; depreciation: DepreciationAssumptions;
  verified: { carSeatFit: boolean; packingFit: boolean };
  sources: Record<string, Source>;
}

export interface MaintenanceMilestone { atMiles: number; repeatEveryMiles?: number; label: string; costUsd: number }

export interface DepreciationAssumptions { retainedByYear: number[]; mileageAdjPer10k: number }

export type Fit = "good" | "tight" | "insufficient" | "needs_verification";

export interface SuitabilityResult { passengerFit: Fit; cargoFit: Fit; tradeoffs: string[]; constraints: string[]; notes: string[] }

export interface SimContext { vehicles: Record<string, VehicleConfig>; specs: Record<string, SpecSheet> }

export interface MonthState { month: number; vehicleId: string; annualMiles: number; householdSize: number; children: number;
  cargoNeed: "low" | "medium" | "high"; fuelPricePerGal: number; monthlyBudget?: number }

export type BreakEvenResult =
  | { found: true; parameter: string; threshold: number; unit: string; direction: "above" | "below";
      currentValue: number; testedBounds: [number, number] }
  | { found: false; parameter: string; reason: "no_threshold_within_bounds"; testedBounds: [number, number] };

export interface SensitivityResult {
  runs: { label: "low" | "base" | "high"; depreciation: number; fuelPrice: number; netCost: Record<string, number> }[];
  heldCount: number; totalCount: number; heldScenarioId: string | "inconclusive";
}

export interface NextAction { label: string; detail: string; officialLink?: string; factors: string[] }

// Proposed missing shapes for Dev 4 review; see REVIEW.md before freezing.
export interface HistoryRecord {
  date: string; type: string; description: string; mileage: number;
  source: Source; provenance: string;
}
export interface FinanceState {
  financeType: DriverProfile["financeType"];
  balance: number; monthlyPayment: number; remainingTermMonths: number;
  leaseEndMonth?: number; provenance: Record<string, Source>;
}
export interface AccountData { finance: FinanceState; source: Source }
export interface VehicleSignals { mileage: number; source: Source }
export type RawProfileInput = Record<string, unknown>;
