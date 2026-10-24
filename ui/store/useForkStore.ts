/**
 * Fork store. The only place modules are wired together (Dev 2 owns it).
 * Call orders follow /ui/CLAUDE.md "Flows". Modules come from "@/ui/mocks" only.
 *
 * Rules enforced here:
 * - AI proposals land in explore.draftChanges as "proposed" and change nothing else.
 * - Only confirmDrafts creates a scenario. It never edits confirmedProfile.
 * - Scenarios are replaced, never mutated.
 * - Derived data (results, evaluation, break-even) is recomputed, not trusted from storage.
 */
import { create } from "zustand";
import type {
  BreakEvenResult,
  DecisionEvaluation,
  DriverProfile,
  ExploreState,
  FieldKey,
  InterpretContext,
  Intent,
  LifeEvent,
  ProfilePatch,
  Question,
  Scenario,
  SimContext,
  SimulationResult,
  TradeoffPick,
  VehicleConfig,
  VehicleTwin,
} from "@/contracts";
import { ai, data, decision, sim } from "@/ui/mocks";
import type { RevealStage } from "@/ui/mocks/CarStageStub";
import { eventTitle } from "./eventLabels";
import { MONTH_MAX, clampMonth } from "./months";
import {
  DEFAULT_PREFS,
  loadPersisted,
  savePersisted,
  type Persisted,
  type Session,
} from "./persistence";

export const BASE_ID = "base";
export { MONTH_MAX, clampMonth };

export type Phase = "landing" | "reveal" | "workspace";
export type StagePhase = "reveal" | "interactive" | "transition";
export type ViewMode = "solid" | "wireframe" | "points";
export type View = "car" | "future";
export type Riders = "solo" | "partner" | "kids" | "mixed";

export interface StageState {
  phase: StagePhase;
  viewMode: ViewMode;
  /** Set while phase is "transition": the car being morphed to. */
  transitionTo: VehicleConfig | null;
  /** Last reveal stage reported by CarStage, for the specs overlay. */
  revealStage: RevealStage | null;
  resetCameraSignal: number;
  skipSignal: number;
  replaySignal: number;
}

export interface Comparison {
  keepId: string;
  replaceId: string;
}

export interface UiState {
  reducedMotion: boolean;
  lowPerformance: boolean;
  aiAvailable: boolean;
  /** Which of the two pages is showing. Not saved: every session starts on the car. */
  view: View;
  /** The "Your details" sheet (profile, priorities, history, display). Not saved. */
  detailsOpen: boolean;
  /** Future page: show what each decision changed, and the supporting numbers. Off by default. Not saved. */
  futureDetails: boolean;
  /** Future page: draw every future on the road, not just the one you are looking at. Off by default. Not saved. */
  futureCompare: boolean;
  busy: "idle" | "interpreting" | "simulating";
}

export interface ForkActions {
  startFromVin(vin: string): Promise<void>;
  startFromSample(vehicleId: string): Promise<void>;
  startFromPicker(make: string, model: string, year: number, trim?: string): Promise<void>;
  answerRiders(choice: Riders): void;
  submitDump(text: string): Promise<void>;
  confirmDrafts(ids: string[]): void;
  editDraft(id: string, patch: Partial<LifeEvent>): void;
  rejectDraft(id: string): void;
  addDraft(event: Omit<LifeEvent, "status" | "id"> & { id?: string }): void;
  answerQuestion(field: FieldKey, value: number | string | "unsure"): void;
  pickTradeoff(pick: TradeoffPick): void;
  openReplaceComparison(): Promise<void>;
  setAssumption(key: string, value: number): void;
  runBreakEven(parameter: "annualMiles" | "fuelPricePerGal"): void;
  moveEvent(scenarioId: string, eventId: string, month: number): void;
  setActiveScenario(id: string): void;
  setActiveMonth(m: number): void;

  // UI and stage plumbing (not in the spec's action list, needed by its flows)
  hydrate(): void;
  resetAll(): void;
  clearError(): void;
  setView(view: View): void;
  setDetailsOpen(open: boolean): void;
  setFutureDetails(on: boolean): void;
  setFutureCompare(on: boolean): void;
  setLowPerformance(on: boolean): void;
  setReducedMotion(on: boolean): void;
  setViewMode(mode: ViewMode): void;
  resetCamera(): void;
  skip(): void;
  replayReveal(): void;
  onRevealStage(stage: RevealStage): void;
  onTransitionComplete(): void;
  onModelStatus(s: { vehicleId: string; ready: boolean; error?: string }): void;
}

export interface ForkState {
  /** False until persisted state has been read on the client. */
  hydrated: boolean;
  phase: Phase;
  twin: VehicleTwin | null;
  replacementVehicle: VehicleConfig | null;
  explore: ExploreState;
  results: Record<string, SimulationResult>;
  evaluation: DecisionEvaluation | null;
  breakEven: BreakEvenResult | null;
  activeScenarioId: string;
  activeMonth: number;
  activeVehicleId: string;
  stage: StageState;
  question: Question | null;

  // Additions the flows need (see summary)
  comparison: Comparison | null;
  draftPatches: ProfilePatch[];
  lastIntent: Intent | null;
  tradeoffPicks: TradeoffPick[];
  answeredFields: FieldKey[];
  /** The date month 0 is measured from. The demo pins it so its months and numbers never drift. */
  todayISO: string;
  modelStatus: Record<string, { ready: boolean; error?: string }>;
  error: string | null;

  ui: UiState;
  actions: ForkActions;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** Inert until a twin starts. Replaced by twin.driver and never displayed before then. */
const EMPTY_PROFILE: DriverProfile = {
  location: "",
  annualMiles: 0,
  householdSize: 1,
  children: 0,
  carSeats: 0,
  cargoNeed: "low",
  fuelPricePerGal: 0,
  financeType: "unknown",
  priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
  provenance: {},
};

const INITIAL_STAGE: StageState = {
  phase: "reveal",
  viewMode: "solid",
  transitionTo: null,
  revealStage: null,
  resetCameraSignal: 0,
  skipSignal: 0,
  replaySignal: 0,
};

type DataFields = Omit<ForkState, "actions" | "hydrated">;

const realToday = (): string => new Date().toISOString().slice(0, 10);

function initialData(): DataFields {
  return {
    phase: "landing",
    twin: null,
    replacementVehicle: null,
    explore: { confirmedProfile: EMPTY_PROFILE, draftChanges: [], scenarios: [] },
    results: {},
    evaluation: null,
    breakEven: null,
    activeScenarioId: BASE_ID,
    activeMonth: 0,
    activeVehicleId: "",
    stage: INITIAL_STAGE,
    question: null,
    comparison: null,
    draftPatches: [],
    lastIntent: null,
    tradeoffPicks: [],
    answeredFields: [],
    todayISO: realToday(),
    modelStatus: {},
    error: null,
    ui: {
      reducedMotion: false,
      lowPerformance: DEFAULT_PREFS.lowPerformance,
      aiAvailable: true,
      view: "car",
      detailsOpen: false,
      futureDetails: false,
      futureCompare: false,
      busy: "idle",
    },
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const VIN_MESSAGE: Record<string, string> = {
  length: "A VIN has 17 characters.",
  chars: "VINs only use letters and numbers.",
  forbidden_letter: "VINs never use the letters I, O, or Q.",
  check_digit: "That VIN's check digit does not add up.",
};

export function scenarioName(events: LifeEvent[]): string {
  const titles = [...new Set(events.map(eventTitle))];
  if (titles.length <= 1) return titles[0] ?? "New future";
  return `${titles[0]} + ${titles.length - 1} more`;
}

/** Quick-pick answers for the "Who rides with you most?" chip. Counts for kids and mixed are estimates. */
const RIDERS: Record<Riders, { householdSize: number; children: number; source: "user" | "estimated" }> = {
  solo: { householdSize: 1, children: 0, source: "user" },
  partner: { householdSize: 2, children: 0, source: "user" },
  kids: { householdSize: 3, children: 1, source: "estimated" },
  mixed: { householdSize: 4, children: 2, source: "estimated" },
};

const NUMERIC_PROFILE_FIELDS = [
  "householdSize",
  "children",
  "carSeats",
  "annualMiles",
  "commuteMilesOneWay",
  "commuteDaysPerWeek",
  "monthlyBudget",
  "fuelPricePerGal",
] as const;

const FINANCE_TYPE: Record<string, DriverProfile["financeType"]> = {
  paid_off: "paid_off",
  "paid off": "paid_off",
  loan: "loan",
  lease: "lease",
  unknown: "unknown",
  "not sure": "unknown",
};

const findScenario = (s: Pick<ForkState, "explore">, id: string): Scenario | undefined =>
  s.explore.scenarios.find((sc) => sc.id === id);

/** The car shown for a scenario: the replacement once it has a confirmed replacement event. */
function vehicleIdFor(scenario: Scenario | undefined, twin: VehicleTwin): string {
  const swap = scenario?.events.find((e) => e.type === "vehicle_replacement" && e.status === "confirmed");
  return swap ? String(swap.payload.vehicleId) : twin.vehicle.id;
}

export function vehicleById(
  s: Pick<ForkState, "twin" | "replacementVehicle">,
  id: string,
): VehicleConfig | null {
  if (s.twin?.vehicle.id === id) return s.twin.vehicle;
  if (s.replacementVehicle?.id === id) return s.replacementVehicle;
  return null;
}

/** Twin as the sim should see it: base twin plus the confirmed profile. */
const simTwin = (s: Pick<ForkState, "twin" | "explore">): VehicleTwin => ({
  ...s.twin!,
  driver: s.explore.confirmedProfile,
});

/** Vehicle configs and spec sheets passed to Dev 4 as arguments. He never imports /data. */
function buildCtx(twin: VehicleTwin, replacement: VehicleConfig | null): SimContext {
  const vehicles: Record<string, VehicleConfig> = { [twin.vehicle.id]: twin.vehicle };
  if (replacement) vehicles[replacement.id] = replacement;
  const specs = Object.fromEntries(Object.keys(vehicles).map((id) => [id, data.getSpecs(id)]));
  return { vehicles, specs };
}

/**
 * What the sim needs, as arguments: the twin (with the confirmed profile) and the
 * vehicle and spec context. The road uses it to re-run a future without one decision.
 */
export function simulationInputs(
  s: Pick<ForkState, "twin" | "explore" | "replacementVehicle">,
): { twin: VehicleTwin; ctx: SimContext } | null {
  if (!s.twin) return null;
  try {
    return { twin: simTwin(s), ctx: buildCtx(s.twin, s.replacementVehicle) };
  } catch {
    return null; // no spec sheet for a car: nothing to re-run
  }
}

function simulateAll(
  s: Pick<ForkState, "twin" | "explore" | "replacementVehicle">,
  scenarios: Scenario[],
): Record<string, SimulationResult> {
  const ctx = buildCtx(s.twin!, s.replacementVehicle);
  const twin = simTwin(s);
  return Object.fromEntries(scenarios.map((sc) => [sc.id, sim.simulate(twin, sc, ctx)]));
}

function evaluateComparison(
  s: Pick<ForkState, "twin" | "explore" | "replacementVehicle" | "results" | "comparison">,
): DecisionEvaluation | null {
  if (!s.comparison) return null;
  const keep = findScenario(s, s.comparison.keepId);
  const replace = findScenario(s, s.comparison.replaceId);
  if (!keep || !replace || !s.results[keep.id] || !s.results[replace.id]) return null;
  const profile = s.explore.confirmedProfile;
  return decision.evaluate({
    twin: simTwin(s),
    scenarios: [keep, replace],
    results: [s.results[keep.id], s.results[replace.id]],
    priorities: profile.priorities,
    maxMonthlyBudget: profile.monthlyBudget,
  });
}

/** At most one question, never one the user already answered or skipped. */
function nextQuestion(
  s: Pick<ForkState, "explore" | "comparison" | "answeredFields">,
  preferred?: Question | null,
): Question | null {
  const candidate =
    preferred ?? data.gapCheck(s.explore.confirmedProfile, { view: s.comparison ? "compare" : "keep" }).question;
  return candidate && !s.answeredFields.includes(candidate.field) ? candidate : null;
}

const upsert = (list: Scenario[], next: Scenario): Scenario[] =>
  list.some((sc) => sc.id === next.id) ? list.map((sc) => (sc.id === next.id ? next : sc)) : [...list, next];

function baselineScenario(twin: VehicleTwin): Scenario {
  return { id: BASE_ID, parentId: null, forkMonth: 0, name: `Keep the ${twin.vehicle.model}`, events: [], assumptions: {} };
}

/**
 * Point the app at a scenario. If its car differs from the one on stage, start a
 * morph; activeVehicleId flips when the stage reports onTransitionComplete.
 */
function activation(s: ForkState, scenarioId: string): Partial<ForkState> {
  const scenario = findScenario(s, scenarioId);
  if (!scenario || !s.twin) return {};
  const target = vehicleIdFor(scenario, s.twin);
  if (target === s.activeVehicleId) return { activeScenarioId: scenarioId };
  const to = vehicleById(s, target);
  if (!to) return { activeScenarioId: scenarioId };
  if (s.stage.phase === "reveal") return { activeScenarioId: scenarioId, activeVehicleId: target };
  return { activeScenarioId: scenarioId, stage: { ...s.stage, phase: "transition", transitionTo: to } };
}

function toSession(s: ForkState): Session | null {
  if (!s.twin) return null;
  return {
    phase: s.phase === "landing" ? "landing" : "workspace",
    twin: s.twin,
    replacementVehicle: s.replacementVehicle,
    explore: s.explore,
    comparison: s.comparison,
    activeScenarioId: s.activeScenarioId,
    activeMonth: s.activeMonth,
    activeVehicleId: s.activeVehicleId,
    draftPatches: s.draftPatches,
    tradeoffPicks: s.tradeoffPicks,
    answeredFields: s.answeredFields,
    todayISO: s.todayISO,
  };
}

const toPersisted = (s: ForkState): Persisted => ({
  prefs: { lowPerformance: s.ui.lowPerformance },
  session: toSession(s),
});

/** Apply one answered value. Returns null when the value is not usable. */
function applyAnswer(
  twin: VehicleTwin,
  profile: DriverProfile,
  field: FieldKey,
  value: number | string,
): { twin: VehicleTwin; profile: DriverProfile } | null {
  const withSource = (p: DriverProfile, key: string): DriverProfile => ({
    ...p,
    provenance: { ...p.provenance, [key]: "user" },
  });
  const num = typeof value === "number" ? value : Number(value);

  if (field === "mileage") {
    if (!Number.isFinite(num) || num < 0) return null;
    return { twin: { ...twin, mileage: num }, profile: withSource(profile, "mileage") };
  }
  if ((NUMERIC_PROFILE_FIELDS as readonly string[]).includes(field)) {
    if (!Number.isFinite(num) || num < 0) return null;
    if (field === "householdSize" && num < 1) return null;
    return { twin, profile: withSource({ ...profile, [field]: num }, field) };
  }
  if (field === "cargoNeed") {
    const v = String(value).toLowerCase();
    if (v !== "low" && v !== "medium" && v !== "high") return null;
    return { twin, profile: withSource({ ...profile, cargoNeed: v }, field) };
  }
  if (field === "financeType") {
    const v = FINANCE_TYPE[String(value).toLowerCase()];
    if (!v) return null;
    return {
      twin: { ...twin, finance: { ...twin.finance, financeType: v, provenance: { ...twin.finance.provenance, financeType: "user" } } },
      profile: withSource({ ...profile, financeType: v }, field),
    };
  }
  if (field === "financePayment" || field === "financeEndMonth") {
    if (!Number.isFinite(num) || num < 0) return null;
    const key = field === "financePayment" ? "monthlyPayment" : "leaseEndMonth";
    return {
      twin: {
        ...twin,
        finance: { ...twin.finance, [key]: num, provenance: { ...twin.finance.provenance, [key]: "user" } },
      },
      profile,
    };
  }
  return null; // priorities come from pickTradeoff
}

/** "I'm not sure": keep the value, relabel it as an estimate. */
function markEstimated(twin: VehicleTwin, profile: DriverProfile, field: FieldKey) {
  if (field === "financePayment" || field === "financeEndMonth") {
    const key = field === "financePayment" ? "monthlyPayment" : "leaseEndMonth";
    if (twin.finance[key] === undefined) return { twin, profile };
    return { twin: { ...twin, finance: { ...twin.finance, provenance: { ...twin.finance.provenance, [key]: "estimated" as const } } }, profile };
  }
  const known = field === "mileage" || profile[field as keyof DriverProfile] !== undefined;
  if (!known) return { twin, profile };
  return { twin, profile: { ...profile, provenance: { ...profile.provenance, [field]: "estimated" as const } } };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let detachPersistence: (() => void) | undefined;

export const useForkStore = create<ForkState>()((set, get) => {
  const setBusy = (busy: UiState["busy"]) => set((s) => ({ ui: { ...s.ui, busy } }));
  const fail = (e: unknown) =>
    set((s) => ({ error: e instanceof Error ? e.message : String(e), ui: { ...s.ui, busy: "idle" } }));

  /**
   * Common tail of every start path: build the twin, reset the session, begin the reveal.
   * Only the explicit demo applies the fictional Alex persona. Ordinary entry builds a
   * generic twin with labeled estimates.
   */
  async function begin(vehicle: VehicleConfig, mode: "demo" | "ordinary") {
    setBusy("simulating");
    try {
      const built = mode === "demo" ? await data.buildDemoTwin(vehicle.id) : await data.buildTwin({ vehicle });
      if (!built.ok) return fail(new Error(built.error));
      const twin = built.twin;
      set((s) => ({
        ...initialData(),
        phase: "reveal",
        todayISO: mode === "demo" ? data.demo.todayISO : realToday(),
        twin,
        explore: { confirmedProfile: structuredClone(twin.driver), draftChanges: [], scenarios: [] },
        activeVehicleId: twin.vehicle.id,
        stage: { ...INITIAL_STAGE, resetCameraSignal: s.stage.resetCameraSignal, skipSignal: s.stage.skipSignal, replaySignal: s.stage.replaySignal + 1 },
        ui: { ...s.ui, busy: "idle", view: "car", detailsOpen: false, futureDetails: false, futureCompare: false },
        modelStatus: s.modelStatus,
        hydrated: true,
      }));
    } catch (e) {
      fail(e);
    }
  }

  /** Create the baseline scenario and its projection. Safe to call twice. */
  function enterWorkspace() {
    const s = get();
    if (!s.twin) return;
    try {
      const scenarios = findScenario(s, BASE_ID) ? s.explore.scenarios : [baselineScenario(s.twin), ...s.explore.scenarios];
      const missing = scenarios.filter((sc) => !s.results[sc.id]);
      set({
        phase: "workspace",
        explore: { ...s.explore, scenarios },
        results: { ...s.results, ...simulateAll(s, missing) },
        stage: { ...s.stage, phase: "interactive", transitionTo: null, revealStage: "done" },
        ui: { ...s.ui, view: "car" },
      });
    } catch (e) {
      fail(e);
    }
  }

  /** Recompute every scenario, then the comparison, after an input changed. */
  function recompute(patch: Partial<ForkState>) {
    const merged = { ...get(), ...patch };
    const results = simulateAll(merged, merged.explore.scenarios);
    const next = { ...merged, results };
    set({ ...patch, results, evaluation: evaluateComparison(next), breakEven: null });
  }

  const actions: ForkActions = {
    // ---- start ----
    async startFromVin(vin) {
      set({ error: null });
      const check = data.validateVin(vin);
      if (!check.ok) return void set({ error: vinReason(check.reason) });
      setBusy("simulating");
      try {
        const id = await data.identifyVehicle(check.vin);
        if (id.status !== "ok") return fail(new Error(id.reason));
        // The sample VINs are fictional demo cars saved in the registry, so they open the demo.
        // A VIN decoded from NHTSA is a real car and gets an ordinary twin.
        await begin(id.vehicle, id.decodeState === "registry" ? "demo" : "ordinary");
      } catch (e) {
        fail(e);
      }
    },

    async startFromSample(vehicleId) {
      set({ error: null });
      const vehicle = data.listSampleVehicles().find((v) => v.id === vehicleId);
      if (!vehicle) return void set({ error: `No sample car with id ${vehicleId}.` });
      await begin(vehicle, "demo");
    },

    async startFromPicker(make, model, year, trim) {
      set({ error: null });
      const norm = (x: string) => x.trim().toLowerCase();
      const vehicle = data
        .listSampleVehicles()
        .find(
          (v) =>
            norm(v.make) === norm(make) &&
            norm(v.model) === norm(model) &&
            v.year === year &&
            (!trim || norm(v.trim) === norm(trim)),
        );
      if (!vehicle) {
        return void set({ error: "We only model the 2022 Camry SE and the 2024 RAV4 Hybrid XLE for now." });
      }
      await begin(vehicle, "ordinary");
    },

    answerRiders(choice) {
      const s = get();
      if (!s.twin) return;
      const { householdSize, children, source } = RIDERS[choice];
      const profile: DriverProfile = {
        ...s.explore.confirmedProfile,
        householdSize,
        children,
        provenance: { ...s.explore.confirmedProfile.provenance, householdSize: source, children: source },
      };
      const patch = { explore: { ...s.explore, confirmedProfile: profile } };
      if (s.phase === "workspace") recompute(patch);
      else set(patch);
    },

    // ---- dump ----
    async submitDump(text) {
      const s = get();
      const prompt = text.trim();
      if (!s.twin || !prompt) return;
      set((cur) => ({ error: null, ui: { ...cur.ui, busy: "interpreting" } }));
      try {
        const active = findScenario(s, s.activeScenarioId);
        const ctx: InterpretContext = {
          vehicle: { make: s.twin.vehicle.make, model: s.twin.vehicle.model, year: s.twin.vehicle.year, trim: s.twin.vehicle.trim },
          profile: s.explore.confirmedProfile,
          existingEvents: (active?.events ?? []).map((e) => ({ type: e.type, month: e.month })),
          todayISO: s.todayISO,
        };
        const result = await ai.interpret(prompt, ctx);
        if (!result.aiAvailable) {
          return void set((cur) => ({ ui: { ...cur.ui, aiAvailable: false, busy: "idle" } }));
        }
        // Proposals are drafts. Force "proposed" so nothing from the AI can arrive confirmed.
        const proposals = result.proposals.map((e): LifeEvent => ({ ...e, status: "proposed" }));
        set((cur) => {
          const withDrafts = {
            ...cur,
            explore: { ...cur.explore, draftChanges: [...cur.explore.draftChanges, ...proposals] },
          };
          return {
            explore: withDrafts.explore,
            draftPatches: [...cur.draftPatches, ...result.profilePatches],
            lastIntent: result.intent,
            question: nextQuestion(withDrafts, result.question),
            ui: { ...cur.ui, aiAvailable: true, busy: "idle" },
          };
        });
      } catch (e) {
        // A throwing interpret falls back to manual forms.
        set((cur) => ({
          error: e instanceof Error ? e.message : String(e),
          ui: { ...cur.ui, aiAvailable: false, busy: "idle" },
        }));
      }
    },

    // ---- confirm ----
    confirmDrafts(ids) {
      const s = get();
      if (!s.twin) return;
      const chosen = s.explore.draftChanges.filter((e) => ids.includes(e.id) && e.status === "proposed");
      if (chosen.length === 0) return;
      try {
        const events = chosen.map((e): LifeEvent => ({ ...e, status: "confirmed" }));
        const parent = findScenario(s, s.activeScenarioId) ?? findScenario(s, BASE_ID);
        if (!parent) return;
        const child = sim.fork(parent, Math.min(...events.map((e) => e.month)), events, scenarioName(events));
        const scenarios = upsert(s.explore.scenarios, child);
        const explore: ExploreState = {
          ...s.explore,
          draftChanges: s.explore.draftChanges.filter((e) => !ids.includes(e.id)),
          scenarios,
        };
        const withChild = { ...s, explore };
        const results = { ...s.results, ...simulateAll(withChild, [child]) };
        set({
          ...activation({ ...withChild, results }, child.id),
          explore,
          results,
          evaluation: s.comparison ? evaluateComparison({ ...withChild, results }) : s.evaluation,
          breakEven: null,
          question: nextQuestion(withChild),
        });
      } catch (e) {
        fail(e);
      }
    },

    editDraft(id, patch) {
      set((s) => ({
        explore: {
          ...s.explore,
          // A draft stays a draft: id and status cannot be edited here.
          draftChanges: s.explore.draftChanges.map((e) =>
            e.id === id ? { ...e, ...patch, id: e.id, status: "proposed" } : e,
          ),
        },
      }));
    },

    rejectDraft(id) {
      set((s) => ({ explore: { ...s.explore, draftChanges: s.explore.draftChanges.filter((e) => e.id !== id) } }));
    },

    addDraft(event) {
      const proposal: LifeEvent = {
        ...event,
        id: event.id ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: "proposed",
      };
      set((s) => ({
        explore: { ...s.explore, draftChanges: [...s.explore.draftChanges, proposal] },
      }));
    },

    // ---- questions and priorities ----
    answerQuestion(field, value) {
      const s = get();
      if (!s.twin) return;
      const answered = s.answeredFields.includes(field) ? s.answeredFields : [...s.answeredFields, field];
      const next =
        value === "unsure"
          ? markEstimated(s.twin, s.explore.confirmedProfile, field)
          : applyAnswer(s.twin, s.explore.confirmedProfile, field, value);
      if (!next) return void set({ error: "That answer didn't look like a usable value." });
      const patch: Partial<ForkState> = {
        twin: next.twin,
        explore: { ...s.explore, confirmedProfile: next.profile },
        answeredFields: answered,
        error: null,
      };
      if (s.phase === "workspace") recompute(patch);
      else set(patch);
      set((cur) => ({ question: nextQuestion(cur) }));
    },

    pickTradeoff(pick) {
      const s = get();
      const picks = [...s.tradeoffPicks.filter((p) => p.pairId !== pick.pairId), pick];
      const profile: DriverProfile = {
        ...s.explore.confirmedProfile,
        priorities: data.mapTradeoffs(picks),
        provenance: { ...s.explore.confirmedProfile.provenance, priorities: "user" },
      };
      const explore = { ...s.explore, confirmedProfile: profile };
      set({ tradeoffPicks: picks, explore, evaluation: evaluateComparison({ ...s, explore }) ?? s.evaluation });
    },

    // ---- replace ----
    async openReplaceComparison() {
      const s = get();
      if (!s.twin) return;
      set((cur) => ({ error: null, ui: { ...cur.ui, busy: "simulating" } }));
      try {
        const replacement = s.replacementVehicle ?? data.listSampleVehicles().find((v) => v.id !== s.twin!.vehicle.id);
        if (!replacement) return fail(new Error("There is no other car to compare with."));
        const keepId = s.comparison && s.activeScenarioId === s.comparison.replaceId ? s.comparison.keepId : s.activeScenarioId;
        const keep = findScenario(s, keepId);
        if (!keep) return fail(new Error("Nothing to compare yet."));

        const replace = sim.makeReplaceScenario(keep, replacement);
        const withReplacement = { ...s, replacementVehicle: replacement };
        const explore: ExploreState = { ...s.explore, scenarios: upsert(s.explore.scenarios, replace) };
        const results = { ...s.results, ...simulateAll({ ...withReplacement, explore }, [keep, replace]) };
        const comparison: Comparison = { keepId: keep.id, replaceId: replace.id };
        const next = { ...withReplacement, explore, results, comparison };
        set({
          ...activation(next, replace.id),
          replacementVehicle: replacement,
          explore,
          results,
          comparison,
          evaluation: evaluateComparison(next),
          breakEven: null,
          question: nextQuestion(next),
          // You asked to compare, so the other futures appear on the road.
          ui: { ...get().ui, busy: "idle", futureCompare: true },
        });
      } catch (e) {
        fail(e);
      }
    },

    setAssumption(key, value) {
      const s = get();
      if (!s.twin || !Number.isFinite(value)) return;
      // Assumptions apply to every scenario so keep and replace stay comparable.
      const scenarios = s.explore.scenarios.map((sc) => ({ ...sc, assumptions: { ...sc.assumptions, [key]: value } }));
      try {
        recompute({ explore: { ...s.explore, scenarios } });
      } catch (e) {
        fail(e);
      }
    },

    runBreakEven(parameter) {
      const s = get();
      const keep = s.comparison && findScenario(s, s.comparison.keepId);
      const replace = s.comparison && findScenario(s, s.comparison.replaceId);
      if (!s.twin || !keep || !replace) {
        return void set({ error: "Open the keep vs replace comparison first." });
      }
      try {
        const breakEven = decision.findBreakEven({
          twin: simTwin(s),
          keep,
          replace,
          parameter,
          ctx: buildCtx(s.twin, s.replacementVehicle),
          priorities: s.explore.confirmedProfile.priorities,
        });
        set({ breakEven, error: null });
      } catch (e) {
        fail(e);
      }
    },

    // ---- timeline ----
    moveEvent(scenarioId, eventId, month) {
      const s = get();
      const scenario = findScenario(s, scenarioId);
      if (!scenario) return;
      try {
        const moved = sim.moveEvent(scenario, eventId, clampMonth(month));
        recompute({ explore: { ...s.explore, scenarios: upsert(s.explore.scenarios, moved) } });
      } catch (e) {
        fail(e);
      }
    },

    setActiveScenario(id) {
      set((s) => activation(s, id));
    },

    setActiveMonth(m) {
      set({ activeMonth: clampMonth(m) });
    },

    // ---- stage and ui plumbing ----
    hydrate() {
      if (get().hydrated) return;
      const saved = loadPersisted();
      if (saved) set((s) => ({ ui: { ...s.ui, ...saved.prefs } }));
      if (saved?.session) {
        try {
          const ses = saved.session;
          const base = {
            ...get(),
            phase: "workspace" as const,
            twin: ses.twin,
            replacementVehicle: ses.replacementVehicle,
            explore: ses.explore,
            comparison: ses.comparison,
            activeScenarioId: ses.activeScenarioId,
            activeMonth: ses.activeMonth,
            activeVehicleId: ses.activeVehicleId,
            draftPatches: ses.draftPatches,
            tradeoffPicks: ses.tradeoffPicks,
            answeredFields: ses.answeredFields,
            todayISO: ses.todayISO ?? realToday(),
            stage: { ...INITIAL_STAGE, phase: "interactive" as const, revealStage: "done" as const },
          };
          const scenarios = base.explore.scenarios.some((sc) => sc.id === BASE_ID)
            ? base.explore.scenarios
            : [baselineScenario(ses.twin), ...base.explore.scenarios];
          const explore = { ...base.explore, scenarios };
          const results = simulateAll({ ...base, explore }, scenarios);
          set({
            ...base,
            explore,
            results,
            evaluation: evaluateComparison({ ...base, explore, results }),
          });
        } catch {
          // Saved session no longer fits the modules. Start clean.
          set({ ...initialData(), ui: get().ui });
        }
      }
      set({ hydrated: true });
      detachPersistence?.();
      detachPersistence = useForkStore.subscribe((state) => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => savePersisted(toPersisted(state)), 120);
      });
    },

    resetAll() {
      set((s) => ({ ...initialData(), ui: { ...initialData().ui, ...pickPrefs(s.ui), reducedMotion: s.ui.reducedMotion }, hydrated: true }));
    },

    clearError() {
      set({ error: null });
    },

    setView(view) {
      set((s) => {
        if (view === "future" && s.phase !== "workspace") return s; // nothing to look ahead at yet
        // The future page opens on the five year picture, not on a month with nothing in it.
        const activeMonth = view === "future" && s.activeMonth === 0 ? MONTH_MAX : s.activeMonth;
        return { activeMonth, ui: { ...s.ui, view, detailsOpen: false } };
      });
    },

    setDetailsOpen(open) {
      set((s) => ({ ui: { ...s.ui, detailsOpen: open } }));
    },

    setFutureDetails(on) {
      set((s) => ({ ui: { ...s.ui, futureDetails: on } }));
    },

    setFutureCompare(on) {
      set((s) => ({ ui: { ...s.ui, futureCompare: on } }));
    },

    setLowPerformance(on) {
      set((s) => ({ ui: { ...s.ui, lowPerformance: on } }));
    },

    setReducedMotion(on) {
      set((s) => (s.ui.reducedMotion === on ? s : { ui: { ...s.ui, reducedMotion: on } }));
    },

    setViewMode(mode) {
      set((s) => ({ stage: { ...s.stage, viewMode: mode } }));
    },

    resetCamera() {
      set((s) => ({ stage: { ...s.stage, resetCameraSignal: s.stage.resetCameraSignal + 1 } }));
    },

    skip() {
      set((s) => ({ stage: { ...s.stage, skipSignal: s.stage.skipSignal + 1 } }));
    },

    replayReveal() {
      set((s) =>
        s.twin
          ? { phase: "reveal", stage: { ...s.stage, phase: "reveal", transitionTo: null, revealStage: null, replaySignal: s.stage.replaySignal + 1 } }
          : s,
      );
    },

    onRevealStage(stage) {
      // Ignore late callbacks after a skip or once the reveal is over.
      if (get().stage.phase !== "reveal") return;
      if (stage === "done") return enterWorkspace();
      set((s) => ({ stage: { ...s.stage, revealStage: stage } }));
    },

    onTransitionComplete() {
      set((s) => {
        if (s.stage.phase !== "transition") return s;
        return {
          activeVehicleId: s.stage.transitionTo?.id ?? s.activeVehicleId,
          stage: { ...s.stage, phase: "interactive", transitionTo: null },
        };
      });
    },

    onModelStatus(status) {
      set((s) => ({
        modelStatus: { ...s.modelStatus, [status.vehicleId]: { ready: status.ready, error: status.error } },
      }));
    },
  };

  return { ...initialData(), hydrated: false, actions };
});

function vinReason(reason: string): string {
  return VIN_MESSAGE[reason] ?? "That doesn't look like a valid VIN.";
}

function pickPrefs(ui: UiState) {
  return { lowPerformance: ui.lowPerformance };
}

/** Test helper: back to a fresh, hydrated store. */
export function resetForkStoreForTests(): void {
  clearTimeout(saveTimer);
  detachPersistence?.();
  detachPersistence = undefined;
  useForkStore.setState({ ...initialData(), hydrated: false });
}
