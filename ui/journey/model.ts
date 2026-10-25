import type { DecisionEvaluation, DriverProfile, LifeEvent, Scenario, SimulationResult, Source, SpecSheet, VehicleConfig, VehicleTwin } from "@/contracts";
import { usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { eventTitle } from "@/ui/store/eventLabels";
import { clampMonth } from "@/ui/store/months";
import { dateLabel, whenLabel } from "./dates";
import { HORIZON, type FutureKind, type Journey, type JourneyBranch, type JourneyEvent, type VehicleSegment } from "./types";

/**
 * buildJourney: the one place the Future page's view of the scenario is worked out. Pure: it reads a plain snapshot of the
 * store (`JourneyInput`), calls nothing but the functions handed to it, never touches the store or the clock, and never
 * changes anything it was given. Every month is a modeled month, every dollar is the simulation's own figure.
 */

/** The keep and switch pair the store is comparing, by scenario id. */
export interface JourneyComparison {
  keepId: string;
  replaceId: string;
}

/** What the last change touched. `recent` is decided by the caller (the hook owns the clock): true while it should still be highlighted. */
export interface JourneyChange {
  eventIds: readonly string[];
  recent: boolean;
}

export interface JourneyInput {
  /** Your car. Only `vehicle` is read, and it is never replaced by a hypothetical one. */
  twin: Pick<VehicleTwin, "vehicle">;
  /** The car the comparison switches to, once one has been chosen. */
  replacementVehicle: VehicleConfig | null;
  /** The other car you could switch to (the replacement if there is one, else the other supported car), or null when there is none. */
  other: VehicleConfig | null;
  scenarios: readonly Scenario[];
  /** Simulation results by scenario id. */
  results: Readonly<Record<string, SimulationResult>>;
  comparison: JourneyComparison | null;
  /** The engine's verdict on the comparison. Only `preferredScenarioId` is read. */
  evaluation: Pick<DecisionEvaluation, "preferredScenarioId"> | null;
  activeScenarioId: string;
  activeMonth: number;
  selectedEventId: string | null;
  /** The date month 0 is measured from, like "2026-10-24". */
  todayISO: string;
  revision: number;
  busy: "idle" | "interpreting" | "simulating";
  lastChange: JourneyChange | null;
  /** For source labels: which inputs the cost figures were built from. */
  confirmedProfile: DriverProfile;
  /** Where the swap would land by default for a future that has none yet: the unpriced offer's split. Null when unknown. */
  defaultSwapMonth: (keep: Scenario) => number | null;
  /** Spec sheet for a car, for source labels. Left out, the label reads as missing rather than guessed. */
  specsFor?: (vehicleId: string) => SpecSheet | null;
}

/** A car as the road names it, before it has months. */
type CarRef = { vehicleId: string; name: string; model: string };

const fullName = (v: VehicleConfig): string => [v.year, v.model, v.trim].filter((part) => part !== "" && part !== undefined).join(" ");

const onRoad = (month: number): boolean => Number.isFinite(month) && month >= 0 && month <= HORIZON;

/** The future with no swap in it that this one is built on: itself, or the nearest ancestor with none. (The store's `lifeOf`, without the store.) */
function lifeOf(scenarios: readonly Scenario[], scenario: Scenario): Scenario {
  let cur = scenario;
  for (let guard = 0; guard < 50 && cur.events.some((e) => e.type === "vehicle_replacement"); guard++) {
    const parent = cur.parentId ? scenarios.find((x) => x.id === cur.parentId) : undefined;
    if (!parent) break;
    cur = parent;
  }
  return cur;
}

/** The confirmed swaps of a future that fall on the road, earliest first, with the car each one moves to. */
function swapsOf(scenario: Scenario | undefined): LifeEvent[] {
  return (scenario?.events ?? [])
    .filter((e) => e.type === "vehicle_replacement" && e.status === "confirmed" && onRoad(e.month))
    .sort((a, b) => a.month - b.month);
}

/**
 * The cars along a future: the one you own until the first swap, then each replacement from its swap month on (the
 * replacement applies in the swap month itself, as in the simulation). A car with no months in it is left out.
 */
function chain(owned: CarRef, swaps: ReadonlyArray<{ month: number; car: CarRef }>): VehicleSegment[] {
  const segments: VehicleSegment[] = [];
  let car = owned;
  let from = 0;
  for (const swap of [...swaps].sort((a, b) => a.month - b.month)) {
    if (swap.month > from) segments.push({ ...car, fromMonth: from, toMonth: swap.month });
    car = swap.car;
    from = swap.month;
  }
  segments.push({ ...car, fromMonth: from, toMonth: HORIZON });
  return segments;
}

/** The car in force at a month: the last segment that has started. */
const segmentAt = (segments: readonly VehicleSegment[], month: number): VehicleSegment | undefined => {
  let found: VehicleSegment | undefined;
  for (const s of segments) if (s.fromMonth <= month) found = s;
  return found;
};

function last<T>(list: readonly T[]): T | null {
  return list.length > 0 ? list[list.length - 1] : null;
}

/** The simulation's net cost at a month, or null when it has no figure there. */
function costAt(result: SimulationResult | undefined, month: number): number | null {
  const point = result?.points.find((p) => p.month === month);
  return point && Number.isFinite(point.netEconomicCost) ? point.netEconomicCost : null;
}

function verdictOf(call: Journey["call"], kind: FutureKind): JourneyBranch["verdict"] {
  if (call === null) return null;
  if (call === "close") return "close";
  return call === kind ? "recommended" : "alternative";
}

export function buildJourney(input: JourneyInput): Journey {
  const owned = input.twin.vehicle;
  const month = clampMonth(input.activeMonth);
  const cars = [owned, input.replacementVehicle, input.other];
  const describe = (id: string): CarRef => {
    const v = cars.find((c) => c?.id === id);
    // A car this snapshot has no details for is still a car on the road; its id is never shown as its name.
    return v ? { vehicleId: v.id, name: fullName(v), model: v.model } : { vehicleId: id, name: "Another car", model: "other car" };
  };
  const ownedCar = describe(owned.id);
  const specs = (vehicleId: string): SpecSheet | null => {
    try {
      return input.specsFor?.(vehicleId) ?? null;
    } catch {
      return null;
    }
  };

  // Which scenarios this is about. A comparison names both; otherwise it is the life you are looking at, with no other side yet.
  const find = (id: string | undefined): Scenario | undefined => (id === undefined ? undefined : input.scenarios.find((s) => s.id === id));
  const cmpKeep = find(input.comparison?.keepId);
  const cmpReplace = find(input.comparison?.replaceId);
  const compared = input.comparison !== null && cmpKeep !== undefined && cmpReplace !== undefined;
  const looking = find(input.activeScenarioId) ?? input.scenarios.find((s) => s.parentId === null) ?? input.scenarios[0];
  const keepScenario: Scenario | undefined = compared ? cmpKeep : looking ? lifeOf(input.scenarios, looking) : undefined;
  const replaceScenario: Scenario | undefined = compared ? cmpReplace : undefined;

  // Selecting a branch only moves this; nothing below reads it except which branch is marked selected and the car shown.
  const selectedFuture: FutureKind = compared && input.activeScenarioId === input.comparison?.replaceId ? "switch" : "keep";

  // The engine's call, from its verdict alone.
  const preferred = input.evaluation?.preferredScenarioId;
  const call: Journey["call"] =
    preferred === undefined
      ? null
      : preferred === "inconclusive"
        ? "close"
        : input.comparison && preferred === input.comparison.keepId
          ? "keep"
          : input.comparison && preferred === input.comparison.replaceId
            ? "switch"
            : null;

  /** What a future costs: its own five year total, the same series through the selected month, and where that number comes from. */
  const price = (scenarioId: string | null, endVehicleId: string) => {
    const result = scenarioId === null ? undefined : input.results[scenarioId];
    const fiveYearCost = costAt(result, HORIZON);
    if (fiveYearCost === null) return { priced: false, fiveYearCost: null, costThroughMonth: null, costSource: undefined as Source | undefined };
    // The simulation's months run 1 to 60; month 0 is "now", before anything has been spent.
    const costThroughMonth = costAt(result, month) ?? (month === 0 ? 0 : null);
    return { priced: true, fiveYearCost, costThroughMonth, costSource: metricSource("netEconomicCost", input.confirmedProfile, specs(endVehicleId)) };
  };

  // Keep: your car, all the way.
  const keepSegments = chain(ownedCar, []);
  const keepEnd = last(keepSegments);
  const keep: JourneyBranch = {
    kind: "keep",
    scenarioId: keepScenario?.id ?? null,
    title: `Keep your ${owned.model}`,
    splitMonth: null,
    segments: keepSegments,
    endVehicle: keepEnd,
    ...price(keepScenario?.id ?? null, keepEnd ? keepEnd.vehicleId : owned.id),
    selected: selectedFuture === "keep",
    verdict: compared ? verdictOf(call, "keep") : null,
  };

  // Switch: the compared future, or an unpriced offer to compare, or nothing when there is no other car.
  const swaps = swapsOf(replaceScenario);
  let switchBranch: JourneyBranch | null = null;
  if (replaceScenario) {
    const plan = swaps.filter((e) => typeof e.payload.vehicleId === "string").map((e) => ({ month: e.month, car: describe(String(e.payload.vehicleId)) }));
    const segments = chain(ownedCar, plan);
    const end = last(segments);
    const target = plan.length > 0 ? plan[0].car.model : (input.replacementVehicle ?? input.other)?.model;
    switchBranch = {
      kind: "switch",
      scenarioId: replaceScenario.id,
      title: target ? `Switch to the ${target}` : "Switch cars",
      splitMonth: plan.length > 0 ? plan[0].month : null,
      segments,
      endVehicle: end,
      ...price(replaceScenario.id, end ? end.vehicleId : owned.id),
      selected: selectedFuture === "switch",
      verdict: verdictOf(call, "switch"),
    };
  } else if (input.other) {
    let at: number | null = null;
    try {
      at = keepScenario ? input.defaultSwapMonth(keepScenario) : null;
    } catch {
      at = null;
    }
    const splitMonth = typeof at === "number" && onRoad(at) ? Math.round(at) : null;
    // With no known month there is no honest road to draw, so there are no segments rather than a guessed one.
    const segments = splitMonth === null ? [] : chain(ownedCar, [{ month: splitMonth, car: describe(input.other.id) }]);
    switchBranch = {
      kind: "switch",
      scenarioId: null,
      title: `Switch to the ${input.other.model}`,
      priced: false,
      splitMonth,
      segments,
      endVehicle: last(segments),
      fiveYearCost: null,
      costSource: undefined,
      costThroughMonth: null,
      selected: false,
      verdict: null,
    };
  }

  // Events: what you told Fork, once, at its own month (the same in both futures), and the swap, only in the switch.
  const change = input.lastChange;
  const flagged = (id: string): boolean => change !== null && change.recent && change.eventIds.includes(id);
  const lifeEvents: JourneyEvent[] = (keepScenario?.events ?? [])
    .filter((e) => e.status === "confirmed" && e.type !== "vehicle_replacement" && onRoad(e.month))
    .map((e) => ({
      id: e.id, type: e.type, kind: "life" as const, month: e.month, title: eventTitle(e),
      dateLabel: dateLabel(input.todayISO, e.month), whenLabel: whenLabel(e.month), futures: ["keep", "switch"] as FutureKind[],
      certainty: e.certainty, ...(e.quote !== undefined ? { quote: e.quote } : {}), assumptions: e.assumptions, payload: e.payload, changed: flagged(e.id),
    }));
  const swapEvents: JourneyEvent[] = swaps.map((e) => {
    const model = typeof e.payload.vehicleId === "string" ? describe(e.payload.vehicleId).model : undefined;
    return {
      id: e.id, type: e.type, kind: "swap" as const, month: e.month, title: model ? `Switch to the ${model}` : "Switch cars",
      dateLabel: dateLabel(input.todayISO, e.month), whenLabel: whenLabel(e.month), futures: ["switch"] as FutureKind[],
      certainty: e.certainty, ...(e.quote !== undefined ? { quote: e.quote } : {}), assumptions: e.assumptions, payload: e.payload, changed: flagged(e.id),
    };
  });
  // Array.prototype.sort is stable: events in the same month keep the order they were made in (life first, then the swap).
  const events = [...lifeEvents, ...swapEvents].sort((a, b) => a.month - b.month);

  const stops = [...new Set([...events.map((e) => e.month), ...(typeof switchBranch?.splitMonth === "number" ? [switchBranch.splitMonth] : [])])]
    .filter(onRoad)
    .sort((a, b) => a - b);

  // The difference between the two rounded figures people see, so the sentence and the numbers can never disagree.
  let difference: Journey["difference"] = null;
  if (keep.priced && switchBranch?.priced && keep.fiveYearCost !== null && switchBranch.fiveYearCost !== null) {
    const amount = Math.round(switchBranch.fiveYearCost) - Math.round(keep.fiveYearCost) || 0;
    const phrase = amount > 0 ? `Switching adds ${usd(amount)}` : amount < 0 ? `Switching saves ${usd(-amount)}` : "No difference between the two";
    difference = { amount, phrase, source: switchBranch.costSource };
  }

  // The car you would be in: the selected future's car at the selected month. Your own car is only ever the owned segment.
  const shown = selectedFuture === "switch" && switchBranch ? switchBranch : keep;
  const vehicleNow = segmentAt(shown.segments, month) ?? keep.segments[0];

  return {
    revision: input.revision,
    updating: input.busy !== "idle",
    horizon: HORIZON,
    month,
    monthLabel: dateLabel(input.todayISO, month),
    selectedFuture,
    selectedEventId: input.selectedEventId !== null && events.some((e) => e.id === input.selectedEventId) ? input.selectedEventId : null,
    events,
    keep,
    switch: switchBranch,
    vehicleNow,
    difference,
    stops,
    call,
  };
}
