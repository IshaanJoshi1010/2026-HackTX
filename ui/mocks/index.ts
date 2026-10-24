/**
 * The one place Dev 2 chooses mock or real for each module.
 *
 * Flip a flag to false only after that module has landed AND its real export is
 * wired into the matching `real*` slot below. Until then the slot throws, so a
 * premature flip fails loudly instead of quietly using a stub.
 *
 * Signatures match /contracts/INTERFACES.md. The store imports from here only,
 * never from /data, /ai, /sim or /decision directly.
 */
import type { ComponentType } from "react";
import type {
  BreakEvenResult,
  DecisionEvaluation,
  DriverProfile,
  FieldKey,
  HistoryRecord,
  IdentifyResult,
  InterpretContext,
  InterpretResult,
  LifeEvent,
  NextAction,
  Question,
  RawProfileInput,
  ConnectionProvider,
  Scenario,
  SensitivityResult,
  SimContext,
  SimulationResult,
  SpecSheet,
  SuitabilityResult,
  TradeoffPick,
  VehicleConfig,
  VehicleTwin,
} from "@/contracts";
import { mockInterpret, mockQuestion, mockSpecs, mockTwin } from "@/contracts/mocks";
import { vehicleFixtures } from "@/data/fixtures/vehicles";
import { CarStageStub, preloadCarsStub, type CarStageProps } from "./CarStageStub";
import * as local from "./local";
import type { VinCheck } from "./local";

export type ModuleName = "car" | "data" | "ai" | "sim" | "decision";

export const USE_MOCKS: Record<ModuleName, boolean> = {
  car: true, // Kareem: real CarStage reveal h14 to 18
  data: true, // Paarth: buildTwin h6, gapCheck and history h8
  ai: true, // Paarth: interpret and explain h13
  sim: true, // Anirudh: simulate h5, fork h8
  decision: true, // Anirudh: evaluate h11, findBreakEven h14, nextAction h15
};

export const mockedModules = (): ModuleName[] =>
  (Object.keys(USE_MOCKS) as ModuleName[]).filter((m) => USE_MOCKS[m]);

/** Stable text for the persistence layer: saved state from another mock mix is discarded. */
export const mockFingerprint = (): string => mockedModules().join(",");

// ---------------------------------------------------------------------------
// Module shapes
// ---------------------------------------------------------------------------

export interface DataApi {
  validateVin(vin: string): VinCheck;
  identifyVehicle(vin: string, opts?: { offline?: boolean; timeoutMs?: number }): Promise<IdentifyResult>;
  buildTwin(a: {
    vehicle: VehicleConfig;
    mileage?: number;
    raw?: RawProfileInput;
    provider?: ConnectionProvider;
  }): Promise<{ ok: true; twin: VehicleTwin } | { ok: false; error: string }>;
  gapCheck(
    p: DriverProfile,
    ctx: { view: "keep" | "compare" },
  ): { missing: FieldKey[]; question: Question | null };
  mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"];
  getHistory(vehicleId: string): HistoryRecord[];
  getSpecs(vehicleId: string): SpecSheet;
  /**
   * NOT in INTERFACES.md. The two supported cars for the sample picker and the
   * replacement lookup. REQUEST to Paarth: export this from the registry.
   */
  listSampleVehicles(): VehicleConfig[];
}

export interface AiApi {
  interpret(prompt: string, ctx: InterpretContext): Promise<InterpretResult>;
  explain(e: DecisionEvaluation, r: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }>;
}

export interface SimApi {
  simulate(twin: VehicleTwin, scenario: Scenario, ctx: SimContext): SimulationResult;
  fork(parent: Scenario, month: number, newEvents: LifeEvent[], name: string): Scenario;
  moveEvent(s: Scenario, eventId: string, newMonth: number): Scenario;
  makeReplaceScenario(parent: Scenario, replacement: VehicleConfig, month?: number): Scenario;
}

export interface DecisionApi {
  assessSuitability(p: DriverProfile, v: VehicleConfig, s: SpecSheet, month: number): SuitabilityResult;
  evaluate(a: {
    twin: VehicleTwin;
    scenarios: Scenario[];
    results: SimulationResult[];
    priorities: DriverProfile["priorities"];
    maxMonthlyBudget?: number;
  }): DecisionEvaluation;
  findBreakEven(a: {
    twin: VehicleTwin;
    keep: Scenario;
    replace: Scenario;
    parameter: "annualMiles" | "fuelPricePerGal";
    ctx: SimContext;
    priorities: DriverProfile["priorities"];
  }): BreakEvenResult;
  sensitivity(a: {
    twin: VehicleTwin;
    scenarios: Scenario[];
    ctx: SimContext;
    priorities: DriverProfile["priorities"];
  }): SensitivityResult;
  nextAction(e: DecisionEvaluation, twin: VehicleTwin, be?: BreakEvenResult): NextAction;
}

export interface CarApi {
  CarStage: ComponentType<CarStageProps>;
  preloadCars(vehicles: VehicleConfig[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mock implementations
// ---------------------------------------------------------------------------

const mockData: DataApi = {
  validateVin: local.validateVin,
  identifyVehicle: local.identifyVehicle,
  buildTwin: mockTwin,
  gapCheck: mockQuestion,
  mapTradeoffs: local.mapTradeoffs,
  getHistory: local.getHistory,
  getSpecs: mockSpecs,
  listSampleVehicles: () => structuredClone(vehicleFixtures),
};

const mockAi: AiApi = {
  interpret: mockInterpret,
  explain: async () => ({ text: "MOCK: explanations are off until the AI module lands.", usedFallback: true }),
};

const mockSim: SimApi = {
  simulate: local.simulate,
  fork: local.fork,
  moveEvent: local.moveEvent,
  makeReplaceScenario: local.makeReplaceScenario,
};

const mockDecision: DecisionApi = {
  assessSuitability: local.assessSuitability,
  evaluate: local.evaluate,
  findBreakEven: local.findBreakEven,
  sensitivity: local.sensitivity,
  nextAction: local.nextAction,
};

const mockCar: CarApi = { CarStage: CarStageStub, preloadCars: preloadCarsStub };

// ---------------------------------------------------------------------------
// Real slots. Wire each export here when the module lands (task B6), one at a time.
// ---------------------------------------------------------------------------

function notLanded<T extends object>(module: ModuleName): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === "then") return undefined; // not a thenable
      const fail = () => {
        throw new Error(
          `Real ${module}.${String(prop)} has not landed. Keep USE_MOCKS.${module} = true until it does.`,
        );
      };
      return fail;
    },
  });
}

const realData = notLanded<DataApi>("data");
const realAi = notLanded<AiApi>("ai");
const realSim = notLanded<SimApi>("sim");
const realDecision = notLanded<DecisionApi>("decision");
const realCar = notLanded<CarApi>("car");

export const data: DataApi = USE_MOCKS.data ? mockData : realData;
export const ai: AiApi = USE_MOCKS.ai ? mockAi : realAi;
export const sim: SimApi = USE_MOCKS.sim ? mockSim : realSim;
export const decision: DecisionApi = USE_MOCKS.decision ? mockDecision : realDecision;
export const car: CarApi = USE_MOCKS.car ? mockCar : realCar;
