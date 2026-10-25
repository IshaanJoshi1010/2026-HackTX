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
  InterpretResult,
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
import type { ReproductionSide, ScenarioScore } from "@/decision";
import { ai, data, decision, sim } from "@/ui/mocks";
import type { CarStageProps } from "@/ui/3d/types";
import { carryOver } from "./carryOver";
import { freshProposals, payloadProblem, withUniqueId } from "./eventRules";
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

/**
 * The purchase and insurance terms a person can enter (the keys Dev 4's sim reads from a scenario's assumptions).
 * Percent inputs have already been converted to fractions by code before they get here.
 */
export const TERM_KEYS = [
  "insurancePerMonth",
  "replacementPrice",
  "downPayment",
  "purchaseFees",
  "salesTaxRate",
  "newLoanApr",
  "newLoanTermMonths",
  "loanApr",
] as const;
export { MONTH_MAX, clampMonth };

export type Phase = "landing" | "reveal" | "workspace";
export type StagePhase = "reveal" | "interactive" | "transition";
export type ViewMode = "solid" | "wireframe" | "points";
export type View = "car" | "future";
export type RevealStage = Parameters<CarStageProps["onRevealStage"]>[0];
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

export type BreakEvenCheck = { below: ReproductionSide; above: ReproductionSide };

/** The engine's plain-language account of its own numbers. The AI writes words only; every number comes in. */
export interface Explanation {
  text: string;
  /** True when the deterministic template wrote it, because the AI was off or its answer was rejected. */
  usedFallback: boolean;
}

/**
 * What a typed sentence led to, so the command bar knows whether to clear itself.
 * `offline` means the AI was not available and the plain rules read it. The typed text is kept then,
 * so it can be retried with the AI or entered by hand.
 */
export type DumpOutcome =
  | { kind: "proposed"; offline?: boolean } // changes are waiting for a confirm
  | { kind: "asked"; offline?: boolean } // a question is waiting for an answer
  | { kind: "compared"; offline?: boolean } // opened the keep vs replace comparison
  | { kind: "break_even"; offline?: boolean } // ran the break-even
  | { kind: "nothing"; message?: string; offline?: boolean }
  | { kind: "stale" }; // the answer came back after the session, car, future or request changed, so it was dropped

/** The last sentence that was read without the AI, kept so the person can retry it or enter it by hand. */
export interface LastDump {
  text: string;
  /** Why nothing was proposed, in the reader's own words. */
  note?: string;
  /** The drafts this reading staged. A retry replaces them instead of adding duplicates. */
  draftIds: string[];
}

export interface UiState {
  reducedMotion: boolean;
  lowPerformance: boolean;
  aiAvailable: boolean;
  /** Which of the two pages is showing. Not saved: every session starts on the car. */
  view: View;
  /** The "Edit assumptions" sheet (profile, priorities, history, display). Not saved. */
  detailsOpen: boolean;
  /** Future page: the selected future is playing forward along the road. Never on at the start; any manual move stops it. Not saved. */
  playing: boolean;
  /** Future page: which drawer is open over the timeline, if any. Not saved. */
  drawer: DrawerId | null;
  busy: "idle" | "interpreting" | "simulating";
}

/** The drawers the Future page opens over the timeline. One at a time. */
export type DrawerId = "explain" | "costs" | "recommendation";

/** What the last change touched, so the page can briefly highlight it. Replaced (a new object) by every change. Not saved. */
export interface LastChange {
  kind: "confirm" | "move" | "answer" | "terms" | "compare" | "priorities";
  /** Events that were added or moved. Empty when an input changed instead (an answer, terms, priorities). */
  eventIds: string[];
  /** Monotonic, so two changes of the same kind are still two changes. */
  id: number;
  at: number;
}

export interface ForkActions {
  startFromVin(vin: string): Promise<void>;
  startFromSample(vehicleId: string): Promise<void>;
  startFromPicker(make: string, model: string, year: number, trim?: string): Promise<void>;
  answerRiders(choice: Riders): void;
  submitDump(text: string): Promise<DumpOutcome>;
  /** Ask the AI again about the last sentence that was read offline. Only ever on the person's request. */
  retryDump(): Promise<DumpOutcome>;
  /** Drop the offline notice without touching any draft. */
  dismissDumpNotice(): void;
  confirmDrafts(ids: string[]): void;
  editDraft(id: string, patch: Partial<LifeEvent>): void;
  rejectDraft(id: string): void;
  addDraft(event: Omit<LifeEvent, "status" | "id"> & { id?: string }): void;
  answerQuestion(field: FieldKey, value: number | string | "unsure"): void;
  pickTradeoff(pick: TradeoffPick): void;
  openReplaceComparison(): Promise<void>;
  setAssumption(key: string, value: number): void;
  /**
   * Apply terms the person has reviewed and confirmed (see ai.prepareScenarioTerms). They go to every future so keep
   * and replace stay comparable. confirmedProfile is never touched, and only the keys in TERM_KEYS are accepted.
   */
  applyScenarioTerms(assumptions: Record<string, number>): void;
  /** Go back to the estimates: removes the entered terms from every future. */
  resetScenarioTerms(): void;
  runBreakEven(parameter: "annualMiles" | "fuelPricePerGal"): void;
  moveEvent(scenarioId: string, eventId: string, month: number): void;
  setActiveScenario(id: string): void;
  /** Select an event on the timeline: the month moves to it and the selection is kept. null clears it. Stops playback. */
  selectEvent(id: string | null): void;
  /** Play the selected future forward from the selected month (from the start if it is at the end). Never starts by itself. */
  play(): void;
  pause(): void;
  /** For the player only: move the month without stopping playback. Reaching the end stops it. Anyone else uses setActiveMonth. */
  advanceMonth(m: number): void;
  openDrawer(id: DrawerId): void;
  closeDrawer(): void;
  /**
   * Look at a future (the selector beside the timeline). With a comparison open it moves the comparison to that life, so
   * the verdict, the costs and the path are always about the same future.
   */
  selectFuture(id: string): void;
  setActiveMonth(m: number): void;

  // UI and stage plumbing (not in the spec's action list, needed by its flows)
  hydrate(): void;
  resetAll(): void;
  clearError(): void;
  setView(view: View): void;
  setDetailsOpen(open: boolean): void;
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
  /** Why the next step is what it is, from the engine. Travels with the evaluation, never typed in. */
  nextActionFactors: string[];
  /** The engine's score for each compared future, broken down by priority. Why a close call is a close call. Derived, never saved. */
  scores: ScenarioScore[];
  /** Words for the current evaluation. Null until written, and cleared whenever the evaluation changes. */
  explanation: Explanation | null;
  /** Set only while the last sentence was read without the AI. Not saved. */
  lastDump: LastDump | null;
  breakEven: BreakEvenResult | null;
  /** The break-even checked just below and just above its threshold, so anyone can type the numbers in. */
  breakEvenCheck: BreakEvenCheck | null;
  activeScenarioId: string;
  /** The selected month, 0 (now) to 60. The one clock every part of the Future page reads. */
  activeMonth: number;
  /** The event selected on the timeline, or null. The month follows it when it is selected. Not saved. */
  selectedEventId: string | null;
  /**
   * Counts every recalculation (a new set of results). Anything that finishes later (words from the AI, a drawer's own
   * work) checks this was the revision it started from before it writes, so a late answer never replaces a newer one.
   */
  revision: number;
  lastChange: LastChange | null;
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
    nextActionFactors: [],
    scores: [],
    explanation: null,
    lastDump: null,
    breakEven: null,
    breakEvenCheck: null,
    activeScenarioId: BASE_ID,
    activeMonth: 0,
    selectedEventId: null,
    revision: 0,
    lastChange: null,
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
      playing: false,
      drawer: null,
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

/**
 * The car in a future at a given month: the one you own until a confirmed swap, the replacement from the swap month on.
 * Matches the simulation, which switches cars in the swap month itself.
 */
export function vehicleAtMonth(scenario: Scenario | undefined, twin: VehicleTwin, month: number): string {
  const swaps = (scenario?.events ?? [])
    .filter((e) => e.type === "vehicle_replacement" && e.status === "confirmed" && typeof e.payload.vehicleId === "string")
    .sort((a, b) => a.month - b.month);
  let id = twin.vehicle.id;
  for (const swap of swaps) if (swap.month <= month) id = String(swap.payload.vehicleId);
  return id;
}

/**
 * The confirmed events on the road: the future you are looking at and the two being compared. Futures that were replaced
 * by a newer comparison stay in the store but are not on the road, so their events are not selectable.
 */
function eventsOnTheRoad(s: Pick<ForkState, "explore" | "activeScenarioId" | "comparison">): LifeEvent[] {
  const ids = new Set([s.activeScenarioId, s.comparison?.keepId, s.comparison?.replaceId]);
  return s.explore.scenarios.filter((sc) => ids.has(sc.id)).flatMap((sc) => sc.events.filter((e) => e.status === "confirmed"));
}

/**
 * The stage change that puts the car at the selected month of the selected future on stage, or null when it is already
 * there (or on its way). Used wherever the month, the future or the swap month can move without the stage being asked.
 */
function stageFollowsMonth(s: ForkState): Partial<ForkState> | null {
  if (s.phase !== "workspace" || !s.twin || s.stage.phase === "reveal") return null;
  const target = vehicleAtMonth(findScenario(s, s.activeScenarioId), s.twin, s.activeMonth);
  const to = vehicleById(s, target);
  const heading = s.stage.phase === "transition" ? s.stage.transitionTo?.id : s.activeVehicleId;
  if (!to || target === heading) return null;
  return { stage: { ...s.stage, phase: "transition", transitionTo: to } };
}

/** The month of a confirmed event on the road, or null when there is no such event. */
function eventMonthOf(s: Pick<ForkState, "explore" | "activeScenarioId" | "comparison">, id: string): number | null {
  return eventsOnTheRoad(s).find((e) => e.id === id)?.month ?? null;
}

/** A selected event stays selected only while the clock is on its month: scrubbing off it puts the card back on the moment. */
function selectionAt(s: Pick<ForkState, "explore" | "activeScenarioId" | "comparison" | "selectedEventId">, month: number): { selectedEventId?: null } {
  if (s.selectedEventId === null) return {};
  const at = eventMonthOf(s, s.selectedEventId);
  return at !== null && clampMonth(at) === month ? {} : { selectedEventId: null };
}

/**
 * After a recalculation: a selected event follows its event, and the clock follows both. The swap is rebuilt with each
 * new comparison (its id comes from the future it belongs to), so a selected swap moves to the new one. An event that is
 * gone clears the selection. This keeps the rule "selected means the clock is on its month" true through chat changes.
 */
function reconcileSelection(prev: Pick<ForkState, "explore">, cur: ForkState): Partial<ForkState> {
  const id = cur.selectedEventId;
  if (id === null) return {};
  let now = id;
  let at = eventMonthOf(cur, id);
  if (at === null) {
    const old = prev.explore.scenarios.flatMap((sc) => sc.events).find((e) => e.id === id);
    const next =
      old?.type === "vehicle_replacement" && cur.comparison
        ? findScenario(cur, cur.comparison.replaceId)?.events.find((e) => e.type === "vehicle_replacement" && e.status === "confirmed")
        : undefined;
    if (!next) return { selectedEventId: null };
    now = next.id;
    at = next.month;
  }
  const month = clampMonth(at);
  return now === id && month === cur.activeMonth ? {} : { selectedEventId: now, activeMonth: month };
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

type ComparisonState = Pick<ForkState, "twin" | "explore" | "replacementVehicle" | "results" | "comparison">;

/** What the engine says about keep vs replace, plus why it says it. Null until both futures have a projection. */
interface Verdict {
  evaluation: DecisionEvaluation;
  nextActionFactors: string[];
  scores: ScenarioScore[];
}

/**
 * Dev 4's order: evaluate, then add the robustness count, then work out the next step with
 * the simulations (and the break-even when there is one). Every number is his.
 */
function evaluateComparison(s: ComparisonState, breakEven?: BreakEvenResult | null): Verdict | null {
  if (!s.comparison || !s.twin) return null;
  const keep = findScenario(s, s.comparison.keepId);
  const replace = findScenario(s, s.comparison.replaceId);
  if (!keep || !replace || !s.results[keep.id] || !s.results[replace.id]) return null;
  const profile = s.explore.confirmedProfile;
  const twin = simTwin(s);
  const scenarios = [keep, replace];
  const results = [s.results[keep.id], s.results[replace.id]];
  const { evaluation: evaluated, scores } = decision.evaluateDetailed({
    twin,
    scenarios,
    results,
    priorities: profile.priorities,
    maxMonthlyBudget: profile.monthlyBudget,
  });
  const withRobustness = decision.withSensitivity(
    evaluated,
    decision.sensitivity({ twin, scenarios, ctx: buildCtx(s.twin, s.replacementVehicle), priorities: profile.priorities }),
  );
  const action = decision.nextAction(withRobustness, twin, breakEven ?? undefined, results);
  return {
    evaluation: {
      ...withRobustness,
      nextAction: { label: action.label, detail: action.detail, ...(action.officialLink ? { officialLink: action.officialLink } : {}) },
    },
    nextActionFactors: action.factors,
    scores,
  };
}

/** The store fields that come from a verdict, or cleared ones when there is none. */
const verdictPatch = (v: Verdict | null): Pick<ForkState, "evaluation" | "nextActionFactors" | "scores" | "explanation"> => ({
  evaluation: v?.evaluation ?? null,
  nextActionFactors: v?.nextActionFactors ?? [],
  scores: v?.scores ?? [],
  explanation: null, // the words belong to the numbers they came with
});

/** Which number a "what would have to change" question is about: fuel price if it says so, otherwise miles. */
export function breakEvenParameterFor(prompt: string): "annualMiles" | "fuelPricePerGal" {
  return /\b(?:fuel|gas(?:oline)?|gallon|pump)\b/i.test(prompt) ? "fuelPricePerGal" : "annualMiles";
}

let draftSeq = 0;
const newDraftId = () => `draft-${Date.now()}-${(draftSeq += 1)}`;

/** At most one question, never one the user already answered or skipped. */
function nextQuestion(
  s: Pick<ForkState, "explore" | "comparison" | "answeredFields">,
  preferred?: Question | null,
): Question | null {
  const candidate =
    preferred ?? data.gapCheck(s.explore.confirmedProfile, { view: s.comparison ? "compare" : "keep" }).question;
  return candidate && !s.answeredFields.includes(candidate.field) ? candidate : null;
}

/**
 * The offline notice belongs to the drafts it staged. Once every one of them has been confirmed or discarded
 * there is nothing left to retry, so it goes. A notice with no drafts (only a note) stays until dismissed.
 */
const keepDump = (last: LastDump | null, drafts: LifeEvent[]): LastDump | null =>
  last && last.draftIds.length > 0 && last.draftIds.every((id) => !drafts.some((d) => d.id === id)) ? null : last;

const upsert = (list: Scenario[], next: Scenario): Scenario[] =>
  list.some((sc) => sc.id === next.id) ? list.map((sc) => (sc.id === next.id ? next : sc)) : [...list, next];

/**
 * A future is its parent's life up to where it forks, and a replace future is its parent's whole life plus the swap. So
 * when a change moves, every future that came from this one has to hear about it: it moves in the ones that hold it, and
 * is added to the ones it now falls before the fork of. Parents first, so each future reads an up to date parent.
 */
function reachDescendants(all: Scenario[], source: Scenario, eventId: string, month: number): Scenario[] {
  const event = source.events.find((e) => e.id === eventId);
  if (!event) return all;
  let out = all;
  const done = new Set([source.id]);
  let frontier = [source.id];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parentId of frontier) {
      for (const child of out.filter((sc) => sc.parentId === parentId && !done.has(sc.id))) {
        done.add(child.id);
        next.push(child.id);
        const has = child.events.some((e) => e.id === eventId);
        let events = child.events;
        if (has) events = child.events.map((e) => (e.id === eventId ? { ...e, month } : e));
        else if (month < child.forkMonth) events = [...child.events, structuredClone({ ...event, month })];
        if (events !== child.events) out = upsert(out, { ...child, events });
      }
    }
    frontier = next;
  }
  return out;
}

/** The future with no swap in it that this one is built on: itself, or the nearest one it came from. */
export function lifeOf(s: Pick<ForkState, "explore">, scenario: Scenario): Scenario {
  let cur = scenario;
  for (let guard = 0; guard < 50 && cur.events.some((e) => e.type === "vehicle_replacement"); guard++) {
    const parent = cur.parentId ? s.explore.scenarios.find((x) => x.id === cur.parentId) : undefined;
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

/** True once any future has been run. From then on an answer changes numbers that are already on screen, in any phase. */
const hasResults = (s: Pick<ForkState, "results">): boolean => Object.keys(s.results).length > 0;

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
  const target = vehicleAtMonth(scenario, s.twin, s.activeMonth);
  const to = vehicleById(s, target);
  // A morph that is still going when you pick the other future is pointed at the car you picked, so the stage never
  // finishes on a car that does not belong to the future you are looking at.
  if (s.stage.phase === "transition" && s.stage.transitionTo && s.stage.transitionTo.id !== target && to) {
    return { activeScenarioId: scenarioId, stage: { ...s.stage, transitionTo: to } };
  }
  if (target === s.activeVehicleId) return { activeScenarioId: scenarioId };
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
    const prov = { ...twin.finance.provenance, financeType: "user" as const };
    // Paid off means nothing is owed and nothing is paid. A lease owes no loan. Keeping the old balance and payment under
    // a new answer would make the numbers say something the person did not.
    const money =
      v === "paid_off"
        ? { balance: 0, monthlyPayment: 0, remainingTermMonths: 0, leaseEndMonth: undefined, provenance: { ...prov, balance: "user" as const, monthlyPayment: "user" as const } }
        : v === "lease"
          ? { balance: 0, provenance: { ...prov, balance: "user" as const } }
          : { provenance: prov };
    return {
      twin: { ...twin, finance: { ...twin.finance, financeType: v, ...money } },
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

export const useForkStore = create<ForkState>()((set, get, api) => {
  const setBusy = (busy: UiState["busy"]) => set((s) => ({ ui: { ...s.ui, busy } }));
  const fail = (e: unknown) =>
    set((s) => ({ error: e instanceof Error ? e.message : String(e), ui: { ...s.ui, busy: "idle" } }));

  /**
   * Ask for words about the current evaluation. A late answer about an older comparison is
   * dropped, so the page never shows an explanation for numbers that are no longer on it.
   */
  let explainSeq = 0;

  /**
   * Stale-answer guards for typed sentences. `dumpEpoch` moves whenever the session is replaced (a new car,
   * a reset, a restore); `dumpSeq` numbers each submission. An answer is only used if both still match and the
   * car and the future it was asked about are still the ones on screen.
   */
  let dumpSeq = 0;
  let dumpEpoch = 0;
  const invalidateDump = () => {
    dumpEpoch += 1;
  };
  async function requestExplanation() {
    const s = get();
    const evaluation = s.evaluation;
    if (!evaluation) return;
    const results = evaluation.scenarioIds.map((id) => s.results[id]).filter(Boolean);
    if (results.length !== evaluation.scenarioIds.length) return;
    const seq = (explainSeq += 1);
    try {
      const explanation = await ai.explain(evaluation, results);
      if (seq === explainSeq && get().evaluation === evaluation) set({ explanation });
    } catch {
      // The engine's own lines are already on the page.
    }
  }
  api.subscribe((state, prev) => {
    if (state.evaluation && state.evaluation !== prev.evaluation) void requestExplanation();
    // A new set of results is a new revision. (Only results: the same results with a new month is not a recalculation.)
    if (state.results !== prev.results) {
      set((cur) => {
        const selection = reconcileSelection(prev, cur);
        // A moved swap changes which car is in view at the selected month, so the stage follows the new results.
        return { revision: cur.revision + 1, ...selection, ...(stageFollowsMonth({ ...cur, ...selection }) ?? {}) };
      });
    }
  });

  let changeSeq = 0;
  /** The change to remember, and so to highlight. Spread into the same set that makes the change. */
  const changed = (kind: LastChange["kind"], eventIds: string[] = []): { lastChange: LastChange } => ({
    lastChange: { kind, eventIds, id: (changeSeq += 1), at: Date.now() },
  });

  /**
   * Common tail of every start path: build the twin, reset the session, begin the reveal.
   * Only the explicit demo applies the fictional Alex persona. Ordinary entry builds a
   * generic twin with labeled estimates.
   */
  async function begin(vehicle: VehicleConfig, mode: "demo" | "ordinary") {
    invalidateDump();
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
        ui: { ...s.ui, busy: "idle", view: "car", detailsOpen: false, playing: false, drawer: null },
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
      // Everything is run again, not only what is missing: an answer given while the reveal was replaying (who rides
      // with you, a finance choice) changed the inputs, and a result kept from before would show the old ones.
      const explore = { ...s.explore, scenarios };
      const results = simulateAll({ ...s, explore }, scenarios);
      set({
        phase: "workspace",
        explore,
        results,
        ...verdictPatch(evaluateComparison({ ...s, explore, results })),
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
    set({ ...patch, results, ...verdictPatch(evaluateComparison(next)), breakEven: null, breakEvenCheck: null });
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
      const patch = { explore: { ...s.explore, confirmedProfile: profile }, ...changed("answer") };
      if (hasResults(s)) recompute(patch);
      else set(patch);
    },

    // ---- dump ----
    async submitDump(text) {
      const s = get();
      const prompt = text.trim();
      if (!s.twin || !prompt) return { kind: "nothing" };

      // What this question was asked about. Checked again when the answer comes back.
      const seq = (dumpSeq += 1);
      const epoch = dumpEpoch;
      const vehicleId = s.twin.vehicle.id;
      const scenarioId = s.activeScenarioId;
      const todayISO = s.todayISO;
      const stale = () => {
        const cur = get();
        return seq !== dumpSeq || epoch !== dumpEpoch || cur.twin?.vehicle.id !== vehicleId || cur.activeScenarioId !== scenarioId;
      };

      set((cur) => ({ error: null, ui: { ...cur.ui, busy: "interpreting" } }));
      const active = findScenario(s, scenarioId);
      const ctx: InterpretContext = {
        vehicle: { make: s.twin.vehicle.make, model: s.twin.vehicle.model, year: s.twin.vehicle.year, trim: s.twin.vehicle.trim },
        profile: s.explore.confirmedProfile,
        existingEvents: (active?.events ?? []).map((e) => ({ type: e.type, month: e.month })),
        todayISO,
      };

      // A throw, a timeout, no key, a quota or cooldown on the server: all of them read as "not available".
      const answer = await ai.interpret(prompt, ctx).catch((): InterpretResult => ({ aiAvailable: false }));

      if (stale()) {
        // Never add an answer to a session it was not asked in. Only release the busy flag if nothing newer owns it.
        if (seq === dumpSeq) set((cur) => ({ ui: { ...cur.ui, busy: "idle" } }));
        return { kind: "stale" };
      }

      const offline = !answer.aiAvailable;
      let result: Extract<InterpretResult, { aiAvailable: true }>;
      let note: string | undefined;
      if (answer.aiAvailable) {
        result = answer;
      } else {
        // The shared plain-rules reader. It only extracts what was written; questions, negatives, odometer
        // readings and dates it cannot place come back as a note, never as a guessed change.
        let read: ReturnType<typeof ai.interpretOffline>;
        try {
          read = ai.interpretOffline(prompt, todayISO);
        } catch {
          read = { intent: "CLARIFY", events: [], note: "I couldn't read that. Try the manual form." };
        }
        note = read.note;
        result = {
          aiAvailable: true,
          intent: read.intent,
          proposals: read.events.map((e): LifeEvent => ({ ...e, id: newDraftId(), status: "proposed" })),
          profilePatches: [],
          ...(read.note ? { unsupportedReason: read.note } : {}),
        };
      }

      // Proposals are drafts. Force "proposed" so nothing from the AI can arrive confirmed.
      const forced = result.proposals.map((e): LifeEvent => ({ ...e, status: "proposed" }));
      // Numbers that cannot be real are left out, and a change that is already waiting or already part of this future is not added again.
      const outOfRange = forced.map(payloadProblem).find((p) => p !== null);
      const inRange = forced.filter((e) => payloadProblem(e) === null);
      const here = findScenario(get(), scenarioId);
      const proposals = freshProposals(inRange, get().explore.draftChanges, here?.events ?? []);
      const alreadyThere = inRange.length > 0 && proposals.length === 0;
      if (outOfRange) set({ error: outOfRange });
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
          lastDump: offline ? { text: prompt, ...(note ? { note } : {}), draftIds: proposals.map((e) => e.id) } : null,
          ui: { ...cur.ui, aiAvailable: !offline, busy: "idle" },
        };
      });
      const flag = offline ? { offline: true as const } : {};

      if (proposals.length > 0) return { kind: "proposed", ...flag };
      if (alreadyThere) return { kind: "nothing", message: "That is already on your timeline or waiting for you to confirm.", ...flag };
      if (get().question) return { kind: "asked", ...flag };

      // A question, not a change: show the answer. Nothing here edits the profile or a scenario.
      const ensureComparison = async () => {
        if (!get().comparison) await actions.openReplaceComparison();
        return get().comparison !== null;
      };
      switch (result.intent) {
        case "FIND_BREAK_EVEN":
          if (!(await ensureComparison())) break;
          actions.runBreakEven(breakEvenParameterFor(prompt));
          actions.setView("future");
          actions.openDrawer("recommendation"); // the answer is in the recommendation drawer, so it opens there
          return { kind: "break_even", ...flag };
        case "COMPARE_SCENARIOS":
        case "RECOMMEND_ACTION":
          if (!(await ensureComparison())) break;
          actions.setView("future");
          return { kind: "compared", ...flag };
        case "EXPLAIN_RESULT":
          if (!get().evaluation) break;
          actions.setView("future");
          actions.openDrawer("recommendation"); // the reasons live in the recommendation drawer
          return { kind: "compared", ...flag };
      }
      return { kind: "nothing", message: result.unsupportedReason, ...flag };
    },

    async retryDump() {
      const last = get().lastDump;
      if (!last) return { kind: "nothing" };
      // Replace what the last reading staged instead of piling a second copy on top of it.
      set((cur) => ({
        lastDump: null,
        explore: { ...cur.explore, draftChanges: cur.explore.draftChanges.filter((d) => !last.draftIds.includes(d.id)) },
      }));
      return actions.submitDump(last.text);
    },

    dismissDumpNotice() {
      set({ lastDump: null });
    },

    // ---- confirm ----
    confirmDrafts(ids) {
      const s = get();
      if (!s.twin) return;
      const chosen = s.explore.draftChanges.filter((e) => ids.includes(e.id) && e.status === "proposed");
      if (chosen.length === 0) return;
      // A number that cannot be real never reaches a simulation. The change stays waiting so it can be fixed or removed.
      const problem = chosen.map(payloadProblem).find((p) => p !== null);
      const usable = chosen.filter((e) => payloadProblem(e) === null);
      if (problem) set({ error: problem });
      if (usable.length === 0) return;
      try {
        const events = usable.map((e): LifeEvent => ({ ...e, status: "confirmed" }));
        const compared = s.comparison;
        // Your life belongs to the car you keep. Looking at the other car does not make a new change part of its future.
        const parent =
          (compared && s.activeScenarioId === compared.replaceId ? findScenario(s, compared.keepId) : findScenario(s, s.activeScenarioId)) ??
          findScenario(s, BASE_ID);
        if (!parent) return;
        // A later dump keeps what the active future already planned after the new events, unless they replace it.
        const forkMonth = Math.min(...events.map((e) => e.month));
        const child = withUniqueId(sim.fork(parent, forkMonth, carryOver(parent, forkMonth, events).events, scenarioName(events)), s.explore.scenarios);
        let scenarios = upsert(s.explore.scenarios, child);
        const built: Scenario[] = [child];
        let comparison = compared;
        // With a comparison open, it moves with you: the same new life, for both cars, and a verdict about that. That is
        // only when you were looking at the life being compared (or its swap). A change made from some other future,
        // say one that already ends in the other car, leaves the comparison alone.
        const onTheComparison = compared !== null && (s.activeScenarioId === compared.keepId || s.activeScenarioId === compared.replaceId);
        if (compared && onTheComparison && s.replacementVehicle) {
          const replace = withUniqueId(sim.makeReplaceScenario(child, s.replacementVehicle), scenarios);
          scenarios = upsert(scenarios, replace);
          built.push(replace);
          comparison = { keepId: child.id, replaceId: replace.id };
        }
        const explore: ExploreState = {
          ...s.explore,
          draftChanges: s.explore.draftChanges.filter((e) => !usable.some((u) => u.id === e.id)),
          scenarios,
        };
        const withChild = { ...s, explore, comparison };
        const results = { ...s.results, ...simulateAll(withChild, built) };
        // Looking at the switch future when you confirm a change keeps you on the switch future (the new one), and at the
        // same month: a change made through chat never throws away what you were looking at.
        const stayOnSwitch = compared !== null && s.activeScenarioId === compared.replaceId && comparison !== null && comparison.replaceId !== comparison.keepId;
        const lookAt = stayOnSwitch && comparison ? comparison.replaceId : child.id;
        set({
          ...activation({ ...withChild, results }, lookAt),
          explore,
          results,
          comparison,
          ...(comparison ? verdictPatch(evaluateComparison({ ...withChild, results })) : {}),
          breakEven: null,
          breakEvenCheck: null,
          lastDump: keepDump(s.lastDump, explore.draftChanges),
          question: nextQuestion(withChild),
          ...changed("confirm", events.map((e) => e.id)),
        });
      } catch (e) {
        fail(e);
      }
    },

    editDraft(id, patch) {
      const problem = patch.payload ? payloadProblem({ payload: patch.payload }) : null;
      if (problem) return void set({ error: problem });
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
      set((s) => {
        const draftChanges = s.explore.draftChanges.filter((e) => e.id !== id);
        return { explore: { ...s.explore, draftChanges }, lastDump: keepDump(s.lastDump, draftChanges) };
      });
    },

    addDraft(event) {
      const proposal: LifeEvent = {
        ...event,
        id: event.id ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: "proposed",
      };
      const problem = payloadProblem(proposal);
      if (problem) return void set({ error: problem });
      set((s) => {
        const active = s.explore.scenarios.find((sc) => sc.id === s.activeScenarioId);
        // The same change twice (Enter pressed again, the same sentence sent again) is still one change.
        if (freshProposals([proposal], s.explore.draftChanges, active?.events ?? []).length === 0) return s;
        return { explore: { ...s.explore, draftChanges: [...s.explore.draftChanges, proposal] } };
      });
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
        ...changed("answer"),
      };
      if (hasResults(s)) recompute(patch);
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
      const verdict = evaluateComparison({ ...s, explore });
      set({ tradeoffPicks: picks, explore, ...(verdict ? verdictPatch(verdict) : {}), breakEven: null, breakEvenCheck: null });
    },

    // ---- replace ----
    async openReplaceComparison() {
      const s = get();
      if (!s.twin) return;
      set((cur) => ({ error: null, ui: { ...cur.ui, busy: "simulating" } }));
      try {
        const replacement = s.replacementVehicle ?? data.listSampleVehicles().find((v) => v.id !== s.twin!.vehicle.id);
        if (!replacement) return fail(new Error("There is no other car to compare with."));
        // You keep a life, not a swap: looking at a future that already ends in the other car, you compare the life it came from.
        const looking = findScenario(s, s.activeScenarioId);
        const keep = looking ? lifeOf(s, looking) : undefined;
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
          ...verdictPatch(evaluateComparison(next)),
          breakEven: null,
          breakEvenCheck: null,
          question: nextQuestion(next),
          ui: { ...get().ui, busy: "idle" },
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

    applyScenarioTerms(assumptions) {
      const s = get();
      const entries = Object.entries(assumptions);
      if (!s.twin || entries.length === 0) return;
      const allowed = TERM_KEYS as readonly string[];
      if (entries.some(([key, value]) => !allowed.includes(key) || !Number.isFinite(value))) {
        return void set({ error: "Those terms didn't look usable, so nothing was changed." });
      }
      // Each future is replaced by a new one with the terms added. Nothing is edited in place.
      const scenarios = s.explore.scenarios.map((sc) => ({ ...sc, assumptions: { ...sc.assumptions, ...assumptions } }));
      try {
        recompute({ explore: { ...s.explore, scenarios }, error: null, ...changed("terms") });
      } catch (e) {
        fail(e);
      }
    },

    resetScenarioTerms() {
      const s = get();
      if (!s.twin) return;
      const scenarios = s.explore.scenarios.map((sc) => {
        const assumptions = Object.fromEntries(Object.entries(sc.assumptions).filter(([key]) => !(TERM_KEYS as readonly string[]).includes(key)));
        return { ...sc, assumptions };
      });
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
        const input = {
          twin: simTwin(s),
          keep,
          replace,
          parameter,
          ctx: buildCtx(s.twin, s.replacementVehicle),
          priorities: s.explore.confirmedProfile.priorities,
        };
        const breakEven = decision.findBreakEven(input);
        // With the threshold known, the next step can name it.
        set({
          breakEven,
          breakEvenCheck: decision.reproduceBreakEven(input, breakEven),
          ...verdictPatch(evaluateComparison(s, breakEven)),
          error: null,
        });
      } catch (e) {
        fail(e);
      }
    },

    // ---- timeline ----
    moveEvent(scenarioId, eventId, month) {
      const s = get();
      const picked = findScenario(s, scenarioId);
      if (!picked) return;
      try {
        // Looking at the other car, a change to your life is still a change to your life: it is made where the life is kept.
        const cmp = s.comparison;
        const isSwap = picked.events.find((e) => e.id === eventId)?.type === "vehicle_replacement";
        const home = cmp && scenarioId === cmp.replaceId && !isSwap ? (findScenario(s, cmp.keepId) ?? picked) : picked;
        const moved = sim.moveEvent(home, eventId, clampMonth(month));
        const at = moved.events.find((e) => e.id === eventId)?.month;
        let scenarios = upsert(s.explore.scenarios, moved);
        if (at !== undefined && !isSwap) scenarios = reachDescendants(scenarios, moved, eventId, at);
        recompute({ explore: { ...s.explore, scenarios }, ...changed("move", [eventId]) });
      } catch (e) {
        fail(e);
      }
    },

    setActiveScenario(id) {
      // Looking at another future is a manual move: it stops playback, and the selected month stays where it is. A selected
      // event that is not on the road of the future you moved to (it belonged to the life you left) is let go.
      set((s) => {
        const moved = activation(s, id);
        const gone = s.selectedEventId !== null && eventMonthOf({ ...s, ...moved }, s.selectedEventId) === null;
        return { ...moved, ...(gone ? { selectedEventId: null } : {}), ui: { ...s.ui, playing: false } };
      });
    },

    selectEvent(id) {
      set((s) => {
        if (id === null) return { selectedEventId: null, ui: { ...s.ui, playing: false } };
        // The event can be in the future you are looking at, or only in the other one (the swap).
        const found = eventsOnTheRoad(s).find((e) => e.id === id);
        if (!found) return s;
        return { selectedEventId: id, activeMonth: clampMonth(found.month), ui: { ...s.ui, playing: false } };
      });
    },

    play() {
      set((s) => {
        if (s.phase !== "workspace") return s;
        // At the end it plays again from the start, rather than doing nothing.
        return { activeMonth: s.activeMonth >= MONTH_MAX ? 0 : s.activeMonth, ui: { ...s.ui, playing: true, drawer: null } };
      });
    },

    pause() {
      set((s) => (s.ui.playing ? { ui: { ...s.ui, playing: false } } : s));
    },

    advanceMonth(m) {
      set((s) => {
        const month = clampMonth(m);
        return { activeMonth: month, ...selectionAt(s, month), ui: month >= MONTH_MAX && s.ui.playing ? { ...s.ui, playing: false } : s.ui };
      });
    },

    openDrawer(id) {
      set((s) => ({ ui: { ...s.ui, drawer: id, playing: false } }));
    },

    closeDrawer() {
      set((s) => (s.ui.drawer === null ? s : { ui: { ...s.ui, drawer: null } }));
    },

    selectFuture(id) {
      const s = get();
      const picked = findScenario(s, id);
      if (!picked || !s.twin) return;
      if (!s.comparison || !s.replacementVehicle) return actions.setActiveScenario(id);
      actions.pause();
      try {
        // The comparison follows the life you picked: that life, and the same life with the swap.
        const life = lifeOf(s, picked);
        const replace = sim.makeReplaceScenario(life, s.replacementVehicle);
        const explore: ExploreState = { ...s.explore, scenarios: upsert(upsert(s.explore.scenarios, life), replace) };
        const comparison: Comparison = { keepId: life.id, replaceId: replace.id };
        const next = { ...s, explore, comparison };
        const results = { ...s.results, ...simulateAll(next, [life, replace]) };
        set({
          ...activation({ ...next, results }, life.id),
          explore,
          results,
          comparison,
          ...verdictPatch(evaluateComparison({ ...next, results })),
          breakEven: null,
          breakEvenCheck: null,
        });
      } catch (e) {
        fail(e);
      }
    },

    setActiveMonth(m) {
      // A manual move of the clock stops playback. The player moves it with advanceMonth instead.
      set((s) => {
        const month = clampMonth(m);
        return { activeMonth: month, ...selectionAt(s, month), ui: s.ui.playing ? { ...s.ui, playing: false } : s.ui };
      });
    },

    // ---- stage and ui plumbing ----
    hydrate() {
      if (get().hydrated) return;
      invalidateDump();
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
            ...verdictPatch(evaluateComparison({ ...base, explore, results })),
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
      invalidateDump();
      set((s) => ({ ...initialData(), ui: { ...initialData().ui, ...pickPrefs(s.ui), reducedMotion: s.ui.reducedMotion }, hydrated: true }));
    },

    clearError() {
      set({ error: null });
    },

    setView(view) {
      set((s) => {
        if (view === "future" && s.phase !== "workspace") return s; // nothing to look ahead at yet
        // Changing page stops playback and closes any drawer.
        const ui = { ...s.ui, view, detailsOpen: false, playing: false, drawer: null };
        // The car on the car page is the car in the future you are looking at, at the month you are looking at.
        return { ui, ...(view === "car" ? stageFollowsMonth(s) ?? {} : {}) };
      });
    },

    setDetailsOpen(open) {
      set((s) => ({ ui: { ...s.ui, detailsOpen: open } }));
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
      set((s) => {
        if (!s.twin) return s;
        // The reveal replays the car of the future you are looking at, as it is at the month you are looking at (the owned
        // car before the swap, the replacement from it on). A morph still going is dropped, so the car it was heading for
        // is the one shown, not the one it had not yet left. Replaying stops playback and puts any drawer away.
        const scenario = findScenario(s, s.activeScenarioId);
        const target = scenario ? vehicleAtMonth(scenario, s.twin, s.activeMonth) : s.activeVehicleId;
        return {
          phase: "reveal",
          activeVehicleId: vehicleById(s, target) ? target : s.activeVehicleId,
          stage: { ...s.stage, phase: "reveal", transitionTo: null, revealStage: null, replaySignal: s.stage.replaySignal + 1 },
          ui: { ...s.ui, playing: false, drawer: null },
        };
      });
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
      if (status.ready || !status.error) return;
      // The stage cannot show this car (no model file, no WebGL). Never leave the app waiting on it:
      // the reveal is skipped and the morph is finished, and everything else keeps working.
      const s = get();
      if (s.phase === "reveal" && s.stage.phase === "reveal" && status.vehicleId === s.activeVehicleId) {
        enterWorkspace();
      } else if (s.stage.phase === "transition" && s.stage.transitionTo?.id === status.vehicleId) {
        actions.onTransitionComplete();
      }
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
