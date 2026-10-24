# FORK: Root Context (read first, every session)

Fork is an AI digital twin for Toyota owners (HackTX 2026, Toyota Financial Services "What's Your Next Move?" challenge). A user enters a VIN, a 3D model of their car assembles from particles, and they type a "brain dump" about what is changing in their life. Fork extracts structured events, the user confirms, the timeline splits into branches, and deterministic code simulates keep vs replace futures. It ends with one concrete Toyota next step, which can be "keep your car."

Tagline: "The future branches. Explore yours."

## The team (4 developers, each with a folder)

| Developer | Owns | Folders |
| --- | --- | --- |
| Dev 1 | 3D experience: viewer, paint, particle reveal, Camry to RAV4 morph, asset prep | `/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d` |
| Dev 2 | Product UI and integration: shell, store, timeline, command box, comparison, merging | `/app` (except `/app/api`), `/ui` (except `/ui/3d`) |
| Dev 3 | Data and AI: VIN, registry, specs, history, normalizer, providers, Gemini | `/data`, `/ai`, `/app/api` |
| Dev 4 | Simulation and decisions: sim, branching, suitability, evaluate, break-even | `/sim`, `/decision` |
| Dev 3 + Dev 4 | Types, Zod schemas, mocks (Dev 1 and 2 review) | `/contracts` |

All boundaries, signatures, and mock/handoff hours are in `/contracts/INTERFACES.md`. That file wins any disagreement.

Never edit a folder you do not own. If you need a change in someone else's module, write it down as a request and stop.

## Non-negotiable rules

1. **AI interprets, code calculates.** The LLM turns words into structured events and explains numbers it was handed. It never produces a number. Every displayed value comes from deterministic TypeScript.
2. **Extract, never invent.** If the user did not say it, the field stays empty and gets a labeled default or one question.
3. **Nothing counts until confirmed.** AI output is saved as `draftChanges` with status `proposed`. Only confirmed data reaches the profile or a scenario.
4. **Exploring is not changing.** Scenarios never edit `confirmedProfile`.
5. **Every number carries a source label:** `sourced`, `listing`, `user`, `estimated`, `illustrative`, `synthetic`.
6. **Honest vehicle matching.** `exact` only if model, year, trim, paint, and geometry are all verified. Otherwise `representative` or `unsupported`. Never claim exact when it is not.
7. **Customer before upsell.** The decision engine must be able to return "keep" or "inconclusive."
8. **Works offline.** The full demo must run with Gemini and NHTSA unavailable, using seeded data.
9. **No decorative controls.** Every button changes real state.
10. **No fake results.** No hardcoded outcomes presented as computed.
11. **Pure, immutable sim.** Simulation functions are pure. Scenarios and events are immutable. Events apply in chronological order. A branch inherits parent state through its fork month and never mutates parent or siblings.
12. **Scope lock.** Two supported cars: 2022 Toyota Camry SE and 2024 Toyota RAV4 Hybrid XLE. No CARFAX, no TFS data (unless a sponsor gives sandbox access), no booking, no diagnostics, no universal 3D.

## Supported vehicles

- Vehicle A: 2022 Camry SE (current car in the demo)
- Vehicle B: 2024 RAV4 Hybrid XLE (replacement)
- Real sample VINs come from public listings, snapshotted to JSON offline. Paint, trim, and mileage come from the listing snapshot, not from the VIN. Never scrape live.
- Demo persona: Alex (fictional), Austin TX, 48,000 miles, 12,000 mi/yr. All driver and finance data is `synthetic`.
- A VIN gives make, model, year, usually trim, engine, fuel type. It does NOT give paint, mileage, history, finance, or anything about the driver.

## Stack

Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, Three.js, React Three Fiber, Drei, React Flow, Motion, Recharts, Zod, Gemini API (server-side only), NHTSA vPIC decode, EPA fuel economy data. Simulation is plain TypeScript pure functions. Persistence is browser storage only.

## Onboarding model (everyone must understand this)

Brain dump loop: dump, extract to fixed schema (value + certainty + quoted phrase), Zod validate, show on live profile card, user confirms, gap check, simulate on confirmed data. Ask at most one follow-up, only if it changes a visible number, always with "I'm not sure." Data tiers: Tier 1 (vehicle, mileage, household size, one priority) gates the first result; Tier 2 and 3 default to labeled estimates. Priorities come from A vs B trade-off picks mapped to weights by deterministic code, not sliders and not the LLM.

## Frozen contract (`/contracts/index.ts`)

Do not change without all three people agreeing. Every type also has a Zod schema.

```ts
type MatchStatus = "exact" | "representative" | "unsupported";
type Source = "sourced" | "listing" | "user" | "estimated" | "illustrative" | "synthetic";

interface VehicleConfig {
  id: string; vin?: string; make: string; model: string; year: number;
  trim: string; powertrain: "gas" | "hybrid"; paint: string; paintCode?: string;
  mpg: number; seats: number; cargoCuFt: number; msrp: number;
  modelAsset: string; matchStatus: MatchStatus; specSources: string[];
}

interface DriverProfile {
  location: string; annualMiles: number; commuteMilesOneWay?: number;
  commuteDaysPerWeek?: number; householdSize: number; children: number;
  carSeats: number; cargoNeed: "low" | "medium" | "high";
  monthlyBudget?: number; fuelPricePerGal: number;
  financeType: "paid_off" | "loan" | "lease" | "unknown";
  priorities: { cost: number; family: number; longevity: number;
                fuel: number; comfort: number }; // weights sum to 1
  provenance: Record<string, Source>;
}

interface VehicleTwin {
  vehicle: VehicleConfig; mileage: number; history: HistoryRecord[];
  driver: DriverProfile; finance: FinanceState;
}

type EventType = "relocation" | "mileage_change" | "family_change" |
  "cargo_change" | "budget_change" | "fuel_price_change" |
  "maintenance_decision" | "vehicle_replacement";

interface LifeEvent {
  id: string; type: EventType; month: number;
  payload: Record<string, number | string>;
  source: "user" | "ai" | "fixture"; assumptions: string[];
  quote?: string;
  certainty: "clear" | "inferred" | "vague";
  status: "confirmed" | "proposed" | "invalid";
}

interface Scenario {
  id: string; parentId: string | null; forkMonth: number; name: string;
  events: LifeEvent[]; assumptions: Record<string, number>;
}

interface ProjectionPoint {
  month: number; vehicleId: string; mileage: number; fuelSpend: number;
  maintenanceSpend: number; vehicleValue: number; loanBalance: number;
  cumulativeCash: number; netEconomicCost: number;
  suitability: SuitabilityResult;
}

interface SimulationResult {
  scenarioId: string; points: ProjectionPoint[]; milestones: string[];
  warnings: string[]; summary: { totalCash: number; netCost: number };
}

interface DecisionEvaluation {
  scenarioIds: string[]; hardConstraints: string[];
  preferredScenarioId: string | "inconclusive"; rationale: string[];
  sensitivity: { low: number; base: number; high: number }[];
  nextAction: { label: string; detail: string; officialLink?: string };
}

interface ExploreState {
  confirmedProfile: DriverProfile; // changes only on explicit confirm
  draftChanges: LifeEvent[];       // AI proposals, not yet confirmed
  scenarios: Scenario[];
}

interface ConnectionProvider {
  getAccount(): Promise<AccountData>;
  getVehicleSignals(): Promise<VehicleSignals>;
}
```

## Module exports (the integration surface)

| Owner | Exports |
| --- | --- |
| Dev 1 | `CarStage`, `preloadCars`, `CarStageStub` |
| Dev 3 | `validateVin`, `identifyVehicle`, `buildTwin`, `normalizeProfile`, `applyDefaults`, `gapCheck`, `mapTradeoffs`, `getHistory`, `getSpecs`, `interpret`, `explain`, `ConnectionProvider` impls |
| Dev 4 | `simulate`, `applyEvents`, `fork`, `moveEvent`, `editEvent`, `deleteEvent`, `makeReplaceScenario`, `assessSuitability`, `evaluate`, `findBreakEven`, `sensitivity`, `nextAction` |
| Dev 2 | Imports all of the above and wires them in `useForkStore`. Exports nothing others depend on. |

Dev 4 never imports from `/data` or `/ai`. Dev 3 never imports from `/sim` or `/decision`. Dev 1 and Dev 2 only talk through `CarStage`. Dev 2 passes data between modules.

## Working rules for Claude sessions

- Work only in the folder you own. Read your developer-level CLAUDE.md for your task list.
- Build against the mocks in `/contracts/mocks` (and `CarStageStub`) until the real module lands.
- Write tests with the code. A feature is not done until its test command passes.
- End every session by printing: files created, exported functions with signatures, and the test command. The human pastes this into the next session that depends on it.
- If a shared type must change, stop and say so. Do not fork the type.
- Style: casual, brief, no em dashes in UI copy or docs.

## Build timeline (24h, adjust to the real deadline)

Gate 0 (h1): contracts frozen, assets confirmed or labeled representative. Gate 1 (h8): sample VIN to twin to simulate to timeline to CarStage works with mock AI. Gate 2 (h13): brain dump to confirm to branch works with the real interpret. Gate 3 (h18): full 90-second demo runs, feature freeze. Gate 4 (h21+): deploy, fallback video, rehearse. Branches: dev1-3d, dev2-ui, dev3-data-ai, dev4-sim. Merge to main every two hours through Dev 2.

## The 90-second demo (everything serves this)

1. Enter Camry sample VIN, particles assemble, rotate it.
2. Show Camry state and 5-year timeline, scrub time.
3. Dump: "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029." Card fills, one tap confirms, timeline splits.
4. "Would switching to a RAV4 Hybrid make more sense?" Car morphs to RAV4, keep vs replace appears.
5. "What would have to change for keeping the Camry to be the better option?" Break-even visual.
6. Clear recommendation and a concrete next step.
