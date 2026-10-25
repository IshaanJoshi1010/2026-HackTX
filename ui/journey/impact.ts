import type { ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { usd } from "@/ui/profile/format";
import { MONTH_MAX } from "@/ui/store/months";
import { fitWord, plainConstraint, plainWarning } from "./explain";
import type { Journey, JourneyEvent } from "./types";

/**
 * What one event changes, from the simulation and nothing else: run the future again without it and compare, month by
 * month. If the model produced no difference, the result says "not modeled", never "no effect": the model leaving
 * something out is not the same as it not mattering. Pure; the caller passes the function that runs the simulation.
 */

export interface EventImpact {
  eventId: string;
  /** Net cost at month 60 with the event minus without it, in dollars. Positive adds cost. */
  costDelta: number;
  /** True when the net cost differs by at least a dollar in any month. */
  changesCost: boolean;
  /** Fuel spend over the five years, with minus without, in dollars. Null when it is the same to the dollar. */
  fuelDelta: number | null;
  /** The odometer at month 60, with minus without, in miles. Null when the same, or when the two runs end in different cars. */
  milesDelta: number | null;
  /** The first month the car in the future differs with and without the event (the swap). Null when it never does. */
  carChangeMonth: number | null;
  /** First change to passenger and cargo fit, in words: "Passenger fit goes from good to tight from Jun 2029". */
  fit: string[];
  /** Hard constraints the event brings, in words, with the month they start. */
  constraints: string[];
  /** True when anything above changed. False means the model put no number on this event. */
  modeled: boolean;
  /** The simulation's own note about this event (a value it ignored, a date past the horizon), in plain words. */
  warning: string | null;
}

export interface ComputeImpactInput {
  scenario: Scenario;
  eventId: string;
  /** Runs a future through the simulation. */
  simulate(scenario: Scenario): SimulationResult;
  /** The simulation of `scenario` as it is, when the caller already has it. */
  result?: SimulationResult;
  /** "Jun 2029" for a month. Defaults to "month 32". */
  dateLabel?: (month: number) => string;
}

const ONE_DOLLAR = 1;
const defaultDateLabel = (month: number) => (month <= 0 ? "now" : `month ${month}`);

const byMonth = (points: ProjectionPoint[]): Map<number, ProjectionPoint> => new Map(points.map((p) => [p.month, p]));
const lastPoint = (points: ProjectionPoint[]): ProjectionPoint | undefined => points.find((p) => p.month === MONTH_MAX) ?? points[points.length - 1];

/** True when a simulation note names this event (as "Event <id>: ..." or inside a "set by both" line), not just any id that contains the same letters. */
function mentions(warning: string, eventId: string): boolean {
  const id = eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\s:;])${id}(?=$|[\\s:;,])`).test(warning);
}

/** "Jun 2029" for a month counted from today's date (an ISO date). Month 0 is the month today falls in. */
export function calendarLabel(todayISO: string, month: number): string {
  const [year, mon] = todayISO.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = (mon - 1) + Math.max(0, Math.round(month));
  return `${names[index % 12]} ${year + Math.floor(index / 12)}`;
}

/**
 * Re-runs the future without one event and compares. Null when the event is not in the future, or the simulation cannot
 * run it: saying nothing beats guessing.
 */
export function computeImpact({ scenario, eventId, simulate, result, dateLabel = defaultDateLabel }: ComputeImpactInput): EventImpact | null {
  const event = scenario.events.find((e) => e.id === eventId && e.status === "confirmed");
  if (!event) return null;

  let withIt: SimulationResult;
  let without: SimulationResult;
  try {
    withIt = result ?? simulate(scenario);
    without = simulate({ ...scenario, events: scenario.events.filter((e) => e.id !== eventId) });
  } catch {
    return null;
  }

  const before = byMonth(without.points);
  const pairs = withIt.points.flatMap((p) => {
    const q = before.get(p.month);
    return q ? [{ month: p.month, a: p, b: q }] : [];
  });
  if (pairs.length === 0) return null;

  const endWith = lastPoint(withIt.points)!;
  const endWithout = lastPoint(without.points)!;
  const costDelta = endWith.netEconomicCost - endWithout.netEconomicCost;
  const changesCost = pairs.some(({ a, b }) => Math.abs(a.netEconomicCost - b.netEconomicCost) >= ONE_DOLLAR);

  const fuel = pairs.reduce((sum, { a, b }) => sum + a.fuelSpend - b.fuelSpend, 0);
  const fuelDelta = Math.abs(fuel) >= ONE_DOLLAR ? fuel : null;

  // An odometer only means something for one car. A swap ends in a different car, so its two odometers are not comparable.
  const sameCarAtEnd = endWith.vehicleId === endWithout.vehicleId;
  const miles = endWith.mileage - endWithout.mileage;
  const milesDelta = sameCarAtEnd && Math.abs(miles) >= ONE_DOLLAR ? miles : null;

  const carChange = pairs.find(({ a, b }) => a.vehicleId !== b.vehicleId);
  const carChangeMonth = carChange ? carChange.month : null;

  const fit: string[] = [];
  for (const [key, label] of [["passengerFit", "Passenger"], ["cargoFit", "Cargo"]] as const) {
    const first = pairs.find(({ a, b }) => a.suitability[key] !== b.suitability[key]);
    if (first) fit.push(`${label} fit goes from ${fitWord(first.b.suitability[key])} to ${fitWord(first.a.suitability[key])} from ${dateLabel(first.month)}`);
  }

  const constraints: string[] = [];
  const seen = new Set<string>();
  for (const { month, a, b } of pairs) {
    for (const c of a.suitability.constraints) {
      if (b.suitability.constraints.includes(c) || seen.has(c)) continue;
      seen.add(c);
      constraints.push(`${plainConstraint(c)}, from ${dateLabel(month)}`);
    }
  }

  // Only the simulation's notes about this event: one that names it and that the future without it does not raise.
  const raised = withIt.warnings.find((w) => mentions(w, eventId) && !without.warnings.includes(w));

  const modeled =
    changesCost || fuelDelta !== null || milesDelta !== null || carChangeMonth !== null || fit.length > 0 || constraints.length > 0;

  return {
    eventId,
    costDelta,
    changesCost,
    fuelDelta,
    milesDelta,
    carChangeMonth,
    fit,
    constraints,
    modeled,
    warning: raised ? plainWarning(raised) : null,
  };
}

// ---- sentences ----

export interface ImpactSentenceOptions {
  /** Not used to invent anything: only to choose between "working it out" and a saved result. */
  updating?: boolean;
}

/** Whole dollars, no sign: "$3,763". */
const dollars = (n: number): string => usd(Math.abs(Math.round(n)));

/** "8,000" for 7,963; "250" for 247. A distance said with "about" is rounded the way a person would say it. */
function aboutMiles(n: number): string {
  const abs = Math.abs(n);
  const step = abs >= 1000 ? 100 : abs >= 100 ? 10 : 1;
  return (Math.round(abs / step) * step).toLocaleString("en-US");
}

const NO_COST_MODELED = "No direct vehicle-cost change modeled";

/** The one line under the timeline for an event. Only says what the simulation produced. */
export function impactSentence(event: JourneyEvent, impact: EventImpact | null, opts: ImpactSentenceOptions = {}): string {
  if (!impact) return opts.updating ? "Updating what this changes." : "Working out what this changes.";

  const dollarsMoved = Math.round(impact.costDelta) !== 0;
  const adds = impact.costDelta > 0;

  if (event.kind === "swap" || event.type === "vehicle_replacement") {
    if (impact.modeled) {
      return dollarsMoved
        ? `Switching ${adds ? "adds" : "saves"} ${dollars(impact.costDelta)} over five years and changes your car in ${event.dateLabel}.`
        : `Switching changes your car in ${event.dateLabel} and leaves your five-year cost about the same.`;
    }
    return `${NO_COST_MODELED} for this yet.`;
  }

  if (event.type === "mileage_change" && impact.milesDelta !== null) {
    const clause = impact.changesCost && dollarsMoved ? (adds ? ", which raises your cost" : ", which lowers your cost") : "";
    return `${impact.milesDelta > 0 ? "Adds" : "Removes"} about ${aboutMiles(impact.milesDelta)} miles over five years${clause}.`;
  }

  if (impact.changesCost && dollarsMoved) {
    return adds ? `Adds ${dollars(impact.costDelta)} to your five-year cost.` : `Saves ${dollars(impact.costDelta)} on your five-year cost.`;
  }

  if (impact.modeled) {
    const other =
      impact.fit[0] ??
      impact.constraints[0] ??
      (impact.milesDelta !== null ? `${impact.milesDelta > 0 ? "Adds" : "Removes"} about ${aboutMiles(impact.milesDelta)} miles over five years` : null) ??
      (impact.changesCost ? "Costs shift along the way but end about the same over five years" : null);
    return other ? `${NO_COST_MODELED}. ${other}.` : `${NO_COST_MODELED}.`;
  }

  return `${NO_COST_MODELED} for this yet.`;
}

/** Where the selected month stands, without its date: "you are in the Camry, with 2 changes so far. The switch future changes cars this month." */
export function momentWhere(journey: Journey): string {
  const count = journey.events.filter((e) => e.kind === "life" && e.month <= journey.month && e.futures.includes(journey.selectedFuture)).length;
  const changes = count === 0 ? "with no changes yet" : count === 1 ? "with 1 change so far" : `with ${count} changes so far`;
  const head = `you are in the ${journey.vehicleNow.model}, ${changes}.`;

  const other = journey.switch;
  if (other && other.priced && other.splitMonth === journey.month) {
    return `${head} ${journey.selectedFuture === "switch" ? "You change cars this month." : "The switch future changes cars this month."}`;
  }
  return head;
}

/** The sentence for a month with nothing selected: its date, where you are, what has happened, whether the cars part ways now. */
export function momentSentence(journey: Journey): string {
  return `${journey.monthLabel}: ${momentWhere(journey)}`;
}
