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
import { z } from "zod";
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
import { InterpretResultSchema } from "@/contracts/schemas";
import { identifyVehicle as realIdentifyVehicle } from "@/data/decode";
import { buildDemoTwin as realBuildDemoTwin, demoBrainDump, demoTodayISO } from "@/data/demo";
import { vehicleFixtures } from "@/data/fixtures/vehicles";
import { gapCheck as realGapCheck } from "@/data/gapCheck";
import { getHistory as realGetHistory } from "@/data/history";
import { demoVins, getRegistryVehicles } from "@/data/registry";
import { getSpecs as realGetSpecs } from "@/data/specs";
import { mapTradeoffs as realMapTradeoffs } from "@/data/tradeoffs";
import { buildTwin as realBuildTwin } from "@/data/twin";
import { validateVin as realValidateVin } from "@/data/vin";
import {
  assessSuitability as realAssessSuitability,
  evaluate as realEvaluate,
  findBreakEven as realFindBreakEven,
  nextAction as realNextAction,
  reproduceBreakEven as realReproduceBreakEven,
  sensitivity as realSensitivity,
  withSensitivity as realWithSensitivity,
  type BreakEvenInput,
  type ReproductionSide,
} from "@/decision";
import {
  fork as realFork,
  makeReplaceScenario as realMakeReplaceScenario,
  moveEvent as realMoveEvent,
  simulate as realSimulate,
} from "@/sim";
import { CarStageStub, preloadCarsStub, type CarStageProps } from "./CarStageStub";
import * as local from "./local";
import type { VinCheck } from "./local";

export type ModuleName = "car" | "data" | "ai" | "sim" | "decision";

export const USE_MOCKS: Record<ModuleName, boolean> = {
  car: true, // Kareem: real CarStage reveal h14 to 18
  data: false, // Paarth: real since the first integration merge (e935e1f)
  ai: false, // Paarth: real through /api/interpret and /api/explain; offline rules take over when it is unavailable
  sim: false, // Anirudh: real since the first integration merge (e935e1f)
  decision: false, // Anirudh: real since the first integration merge (e935e1f)
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
  /**
   * NOT in INTERFACES.md. Paarth's explicit fictional demo (Alex): the only path that
   * applies the persona. Ordinary entry uses buildTwin and never does.
   */
  buildDemoTwin(vehicleId: string): Promise<{ ok: true; twin: VehicleTwin } | { ok: false; error: string }>;
  /** The demo sentence and the date its month offsets are measured from. */
  demo: { brainDump: string; todayISO: string };
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
  findBreakEven(a: BreakEvenInput): BreakEvenResult;
  /** Just below and just above a found threshold, so the flip can be checked by typing the numbers in. */
  reproduceBreakEven(a: BreakEvenInput, be: BreakEvenResult): { below: ReproductionSide; above: ReproductionSide } | null;
  sensitivity(a: {
    twin: VehicleTwin;
    scenarios: Scenario[];
    ctx: SimContext;
    priorities: DriverProfile["priorities"];
  }): SensitivityResult;
  /** Adds the "held in X of Y tested cases" line and the low, base, high runs. */
  withSensitivity(e: DecisionEvaluation, s: SensitivityResult): DecisionEvaluation;
  /**
   * Pass `results`: without them the rules for keep, replace and the threshold text cannot run.
   * INTERFACES.md still shows three arguments; Dev 4's code takes the fourth (optional).
   */
  nextAction(e: DecisionEvaluation, twin: VehicleTwin, be?: BreakEvenResult, results?: SimulationResult[]): NextAction;
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
  buildDemoTwin: async (vehicleId) => {
    const vehicle = vehicleFixtures.find((v) => v.id === vehicleId);
    return vehicle ? mockTwin({ vehicle: structuredClone(vehicle) }) : { ok: false, error: "Unsupported demo vehicle" };
  },
  demo: { brainDump: demoBrainDump, todayISO: demoTodayISO },
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
  reproduceBreakEven: () => null,
  sensitivity: local.sensitivity,
  withSensitivity: (e) => e,
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

/** The two sample cars, in picker order: primary registry entries for the Camry then the RAV4. */
function registrySamples(): VehicleConfig[] {
  const all = getRegistryVehicles();
  return [demoVins.camry.primary, demoVins.rav4.primary].map((vin) => structuredClone(all[vin]));
}

const DEMO_VEHICLE_IDS = ["camry-2022-se", "rav4-2024-hybrid-xle"] as const;

const realData: DataApi = {
  // The check digit is on: every North American VIN has one, and a typo should be caught here.
  validateVin: (vin) => realValidateVin(vin.trim(), { checkDigit: true }),
  identifyVehicle: realIdentifyVehicle,
  buildTwin: realBuildTwin,
  gapCheck: realGapCheck,
  mapTradeoffs: realMapTradeoffs,
  getHistory: realGetHistory,
  getSpecs: realGetSpecs,
  listSampleVehicles: registrySamples,
  buildDemoTwin: async (vehicleId) => {
    const id = DEMO_VEHICLE_IDS.find((v) => v === vehicleId);
    return id ? realBuildDemoTwin(id) : { ok: false, error: "Unsupported demo vehicle" };
  },
  demo: { brainDump: demoBrainDump, todayISO: demoTodayISO },
};
/**
 * Gemini stays on the server: both calls go through Paarth's routes. Anything that goes
 * wrong (offline, a timeout, a bad answer) comes back as "not available", never as an
 * error, so the offline rules in the store take over and the demo keeps running.
 */
async function postJson(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const ExplanationSchema = z.object({ text: z.string().min(1), usedFallback: z.boolean() });
const AI_TIMEOUT_MS = 15_000;

const realAi: AiApi = {
  async interpret(prompt, ctx) {
    const parsed = InterpretResultSchema.safeParse(await postJson("/api/interpret", { prompt, context: ctx }, AI_TIMEOUT_MS));
    return parsed.success ? parsed.data : { aiAvailable: false };
  },
  async explain(e, results) {
    const parsed = ExplanationSchema.safeParse(await postJson("/api/explain", { evaluation: e, results }, AI_TIMEOUT_MS));
    if (!parsed.success) throw new Error("No explanation is available right now.");
    return { text: parsed.data.text, usedFallback: parsed.data.usedFallback };
  },
};
const realSim: SimApi = {
  simulate: realSimulate,
  fork: realFork,
  moveEvent: realMoveEvent,
  makeReplaceScenario: realMakeReplaceScenario,
};
const realDecision: DecisionApi = {
  assessSuitability: realAssessSuitability,
  evaluate: realEvaluate,
  findBreakEven: realFindBreakEven,
  reproduceBreakEven: (a, be) => realReproduceBreakEven(a, be),
  sensitivity: realSensitivity,
  withSensitivity: realWithSensitivity,
  nextAction: realNextAction,
};
const realCar = notLanded<CarApi>("car");

export const data: DataApi = USE_MOCKS.data ? mockData : realData;
export const ai: AiApi = USE_MOCKS.ai ? mockAi : realAi;
export const sim: SimApi = USE_MOCKS.sim ? mockSim : realSim;
export const decision: DecisionApi = USE_MOCKS.decision ? mockDecision : realDecision;
export const car: CarApi = USE_MOCKS.car ? mockCar : realCar;
