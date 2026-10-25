# FORK Interfaces (canonical, frozen at hour 1)

This file is the single source for every boundary between developers. If code and this file disagree, this file wins until all four developers agree to change it. Copy to `/contracts/INTERFACES.md`.

## Who calls whom

| Caller | Calls | Owner of the callee |
| --- | --- | --- |
| Dev 2 store | `CarStage`, `preloadCars` | Dev 1 |
| Dev 2 store | `validateVin`, `identifyVehicle`, `buildTwin`, `interpret`, `explain`, `gapCheck`, `mapTradeoffs`, `getHistory`, `getSpecs` | Dev 3 |
| Dev 2 store | `simulate`, `fork`, `moveEvent`, `editEvent`, `deleteEvent`, `makeReplaceScenario`, `evaluate`, `findBreakEven`, `sensitivity`, `nextAction`, `assessSuitability` | Dev 4 |
| Dev 3 registry | `/public/models/manifest.json` | Dev 1 writes it |
| Dev 4 | Receives `VehicleConfig`, `DriverProfile`, `SpecSheet` as ARGUMENTS | Dev 2 passes them in |

Rules: Dev 4 never imports from `/data` or `/ai`. Dev 3 never imports from `/sim` or `/decision`. Dev 1 and Dev 2 only talk through `CarStage`. Dev 2 is the only one who wires modules together.

## Dev 1 to Dev 2: CarStage

```ts
interface CarStageProps {
  vehicle: VehicleConfig;
  phase: "reveal" | "interactive" | "transition";
  transitionTo?: VehicleConfig;            // required when phase = "transition"
  viewMode: "solid" | "wireframe" | "points";
  quality: "high" | "low";
  reducedMotion: boolean;
  resetCameraSignal: number;               // increment to reset camera
  skipSignal: number;                      // increment to skip reveal or transition
  replaySignal: number;                    // increment to replay reveal
  onRevealStage(stage: "converge" | "pointcloud" | "wireframe" | "solid" | "done"): void;
  onTransitionComplete(): void;
  onModelStatus(s: { vehicleId: string; ready: boolean; error?: string }): void;
}
export function CarStage(props: CarStageProps): JSX.Element;
export function preloadCars(vehicles: VehicleConfig[]): Promise<void>;
```

Dev 1 ships `CarStageStub` with these exact props by hour 2. The stub renders a grey box and fires the same callbacks on a timer.

### manifest.json (Dev 1 writes, Dev 3 reads)

```ts
type ManifestEntry = {
  vehicleId: string;          // e.g. "camry-2022-se"
  glb: string;                // "/models/camry-2022-se.glb"
  points: string;             // "/points/camry-2022-se.bin"
  bodyMaterialName: string;
  paintHex: string;           // "#B3122B"
  paintName: string;
  matchStatus: MatchStatus;
  license: string;
  credit?: string;
};
```

### Scene and timing constants

Car length 4.6 units along X, centered at origin, wheels at y = 0. Camera start [4.8, 1.6, 5.6], fov 35. Orbit damping 0.08, min distance 3.5, max 9, max polar angle 1.5 rad. Particles 32,768 (high) or 8,192 (low), same count for both cars. Reveal: converge 0 to 2.0 s, point cloud 2.0 to 2.5, wireframe 2.5 to 3.0, solid 3.0 to 4.0. Morph: 0.3 s solid to points, 1.2 s morph, 0.3 s RAV4 solid in.

## Dev 3 types and exports

```ts
type FieldKey = "mileage" | "householdSize" | "children" | "carSeats" | "cargoNeed" | "annualMiles"
  | "commuteMilesOneWay" | "commuteDaysPerWeek" | "monthlyBudget" | "fuelPricePerGal"
  | "financeType" | "financePayment" | "financeEndMonth" | "priorities";
interface Question { field: FieldKey; text: string; kind: "chips" | "number"; options?: string[]; impactNote: string }
// options always include "I'm not sure" when kind = "chips"

type TradeoffPick = { pairId: "cost_vs_cargo" | "longevity_vs_fuel" | "comfort_vs_cost"; choice: "A" | "B" };
interface ProfilePatch { field: FieldKey; value: number | string; certainty: "clear" | "inferred" | "vague"; quote: string }
type Intent = "CREATE_SCENARIO" | "COMPARE_SCENARIOS" | "EXPLAIN_RESULT" | "RECOMMEND_ACTION" | "FIND_BREAK_EVEN" | "CLARIFY";

interface InterpretContext {
  vehicle: Pick<VehicleConfig, "make" | "model" | "year" | "trim">;
  profile: Partial<DriverProfile>;
  existingEvents: { type: EventType; month: number }[];
  todayISO: string;
}
type InterpretResult =
  | { aiAvailable: false }
  | { aiAvailable: true; intent: Intent; proposals: LifeEvent[]; profilePatches: ProfilePatch[];
      question?: Question; unsupportedReason?: string };

type IdentifyResult =
  | { status: "ok"; vehicle: VehicleConfig; decodeState: "registry" | "nhtsa" | "offline_partial" }
  | { status: "invalid"; reason: string }
  | { status: "unsupported"; partial: Partial<VehicleConfig>; reason: string };

interface SpecSheet {
  vehicleId: string; seats: number; rearSeatWidthIn?: number; cargoCuFt: number; curbWeightLb: number;
  mpgCity: number; mpgHwy: number; mpgCombined: number; msrp: number; comfortScore?: number;
  maintenance: MaintenanceMilestone[]; depreciation: DepreciationAssumptions;
  verified: { carSeatFit: boolean; packingFit: boolean };
  sources: Record<string, Source>;
}
interface MaintenanceMilestone { atMiles: number; repeatEveryMiles?: number; label: string; costUsd: number }
interface DepreciationAssumptions { retainedByYear: number[]; mileageAdjPer10k: number } // retainedByYear[0] = after year 1

validateVin(vin: string):
  | { ok: true; vin: string }
  | { ok: false; reason: "length" | "chars" | "forbidden_letter" | "check_digit" };
identifyVehicle(vin: string, opts?: { offline?: boolean; timeoutMs?: number }): Promise<IdentifyResult>;
buildTwin(a: { vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }):
  Promise<{ ok: true; twin: VehicleTwin } | { ok: false; error: string }>;
normalizeProfile(raw: RawProfileInput): { ok: true; profile: Partial<DriverProfile> } | { ok: false; error: string };
applyDefaults(p: Partial<DriverProfile>): DriverProfile;
gapCheck(p: DriverProfile, ctx: { view: "keep" | "compare" }): { missing: FieldKey[]; question: Question | null };
mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"];
getHistory(vehicleId: string): HistoryRecord[];
getSpecs(vehicleId: string): SpecSheet;
interpret(prompt: string, ctx: InterpretContext): Promise<InterpretResult>;
explain(e: DecisionEvaluation, r: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }>;
```

## Dev 4 types and exports

```ts
type Fit = "good" | "tight" | "insufficient" | "needs_verification";
interface SuitabilityResult { passengerFit: Fit; cargoFit: Fit; tradeoffs: string[]; constraints: string[]; notes: string[] }
interface SimContext { vehicles: Record<string, VehicleConfig>; specs: Record<string, SpecSheet> }
interface MonthState { month: number; vehicleId: string; annualMiles: number; householdSize: number; children: number;
  cargoNeed: "low" | "medium" | "high"; fuelPricePerGal: number; monthlyBudget?: number }

type BreakEvenResult =
  | { found: true; parameter: string; threshold: number; unit: string; direction: "above" | "below";
      currentValue: number; testedBounds: [number, number] }
  | { found: false; parameter: string; reason: "no_threshold_within_bounds"; testedBounds: [number, number] };

interface SensitivityResult {
  runs: { label: "low" | "base" | "high"; depreciation: number; fuelPrice: number; netCost: Record<string, number> }[];
  heldCount: number; totalCount: number; heldScenarioId: string | "inconclusive";
}
interface NextAction { label: string; detail: string; officialLink?: string; factors: string[] }

simulate(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): SimulationResult;
applyEvents(twin: VehicleTwin, scenario: Scenario): { timeline: MonthState[]; warnings: string[] };
fork(parent: Scenario, month: number, newEvents: LifeEvent[], name: string): Scenario;
moveEvent(s: Scenario, eventId: string, newMonth: number): Scenario;
editEvent(s: Scenario, eventId: string, patch: Partial<LifeEvent>): Scenario;
deleteEvent(s: Scenario, eventId: string): Scenario;
makeReplaceScenario(parent: Scenario, replacement: VehicleConfig, month?: number): Scenario;
  // default month = first relocation or family_change month in parent, else 12
assessSuitability(p: DriverProfile, v: VehicleConfig, s: SpecSheet, month: number): SuitabilityResult;
evaluate(a: { twin: VehicleTwin; scenarios: Scenario[]; results: SimulationResult[];
  priorities: DriverProfile["priorities"]; maxMonthlyBudget?: number }): DecisionEvaluation;
findBreakEven(a: { twin: VehicleTwin; keep: Scenario; replace: Scenario; parameter: "annualMiles" | "fuelPricePerGal";
  ctx: SimContext; priorities: DriverProfile["priorities"] }): BreakEvenResult;
sensitivity(a: { twin: VehicleTwin; scenarios: Scenario[]; ctx: SimContext;
  priorities: DriverProfile["priorities"] }): SensitivityResult;
nextAction(e: DecisionEvaluation, twin: VehicleTwin, be?: BreakEvenResult, results?: SimulationResult[]): NextAction;
    // results: the evaluated simulations (default []). The keep and replace rules need them; evaluate() already passes them.
```

## Dev 2 store contract (what the others can rely on)

The store is `useForkStore` in `/ui/store/useForkStore.ts`. Shape and actions are specified in the PRD section 7. Other developers do not import it. Dev 2 calls your exports with exactly the signatures above.

## Mocks (published by hour 2)

| Mock | Owner | Location |
| --- | --- | --- |
| `CarStageStub`, `preloadCars` stub | Dev 1 | `/ui/3d` |
| `mockTwin`, `mockInterpret`, `mockQuestion`, `mockSpecs` | Dev 3 | `/contracts/mocks` |
| `mockSimulationResult` (baseline plus two branches), `mockEvaluation`, `mockBreakEven`, `mockSensitivity` | Dev 4 | `/contracts/mocks` |

Mock and real functions share a signature. Dev 2 flips one `USE_MOCKS` constant per module in `/ui/mocks/index.ts`.

## Handoff hours

| Hour | From | To | What |
| --- | --- | --- | --- |
| 1 | Dev 1 | Dev 3 | Model, year, trim, paint name, paint hex, match status per car |
| 1 | Dev 3 and Dev 4 | All | Frozen contracts |
| 2 | Dev 1 | Dev 2 | `CarStageStub` |
| 2 | Dev 3 | Dev 2, Dev 4 | Mocks, `SpecSheet` fixtures |
| 2 | Dev 4 | Dev 2 | Sim mocks |
| 5 | Dev 4 | Dev 2 | Real `simulate` |
| 6 | Dev 3 | Dev 2, Dev 4 | Real `buildTwin`, real `SpecSheet`s |
| 8 | Dev 4 | Dev 2 | Real `applyEvents`, `fork` (Gate 1) |
| 8 | Dev 3 | Dev 2 | Real `gapCheck`, `normalizeProfile`, history |
| 11 | Dev 4 | Dev 2 | Real `assessSuitability`, `evaluate` |
| 13 | Dev 3 | Dev 2 | Real `interpret`, `explain` (Gate 2) |
| 14 | Dev 4 | Dev 2 | Real `findBreakEven`, `sensitivity` |
| 15 | Dev 4 | Dev 2 | Real `nextAction` |
| 14 to 18 | Dev 1 | Dev 2 | Real reveal, then morph |

## Merge protocol

Branches: `dev1-3d`, `dev2-ui`, `dev3-data-ai`, `dev4-sim`. Merge to `main` at least every two hours, through Dev 2, right after the two-hour sync. `main` must build and pass `npm test`. Contract changes need all four developers and happen in one place. End each session with three lines in `/docs/HANDOFF.md`: what was built, what to call, what is still mock.
