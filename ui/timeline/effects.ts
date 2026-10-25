/**
 * What did each decision change? For every decision in a future, run that future
 * again without it and compare. Pure: the caller passes the function that runs the
 * simulation, so this never imports the sim.
 */
import type { Fit, LifeEvent, MonthState, ProjectionPoint, Scenario, SimulationResult, SuitabilityResult } from "@/contracts";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { MONTH_MAX } from "@/ui/store/months";
import { decisionsOf, pointAt } from "./layout";

export interface DecisionEffect {
  event: LifeEvent;
  title: string;
  month: number;
  /** Net cost with this decision minus net cost without it, at the month measured. Positive means it adds cost. */
  costDelta: number;
  /** A plain sentence when the decision changes how well the car fits, otherwise null. */
  fitNote: string | null;
  /** Net cost with this decision minus without it at the end of the projection. */
  costDeltaAtEnd: number;
  /** False when the net cost is the same, to the dollar, in every month with and without this decision. */
  changesCost: boolean;
  /** True when fit or a hard constraint differs in any month with and without it. */
  fitChanged: boolean;
  /**
   * What else it changed, read from the two runs and nothing else: the details it moved, the fit it changed, a
   * constraint it brought on, and any warning the simulation raised because of it.
   */
  changes: string[];
}

const FIT_WORDS: Record<Fit, string> = {
  good: "good",
  tight: "tight",
  insufficient: "not enough",
  needs_verification: "unverified",
};

/** Says what changed about fit, if anything. Passengers first, then cargo. */
export function fitNote(withIt: SuitabilityResult, without: SuitabilityResult): string | null {
  if (withIt.passengerFit !== without.passengerFit) {
    return `Passenger fit goes from ${FIT_WORDS[without.passengerFit]} to ${FIT_WORDS[withIt.passengerFit]}`;
  }
  if (withIt.cargoFit !== without.cargoFit) {
    return `Cargo fit goes from ${FIT_WORDS[without.cargoFit]} to ${FIT_WORDS[withIt.cargoFit]}`;
  }
  return null;
}

const CONSTRAINT_WORDS: Record<string, string> = {
  seats_below_household: "There are fewer seats than people in your household",
  car_seats_exceed_rear_positions: "There are fewer rear seat positions than car seats",
};

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The details that differ between two states, in words. */
function fieldChanges(before: MonthState, after: MonthState): string[] {
  const out: string[] = [];
  if (before.annualMiles !== after.annualMiles) out.push(`Driving goes from ${whole(before.annualMiles)} to ${whole(after.annualMiles)} miles a year`);
  if (before.householdSize !== after.householdSize) out.push(`Household goes from ${before.householdSize} to ${after.householdSize} people`);
  if (before.children !== after.children) out.push(`Children go from ${before.children} to ${after.children}`);
  if (before.cargoNeed !== after.cargoNeed) out.push(`Cargo need goes from ${before.cargoNeed} to ${after.cargoNeed}`);
  if (before.fuelPricePerGal !== after.fuelPricePerGal) out.push(`Fuel goes from $${before.fuelPricePerGal.toFixed(2)} to $${after.fuelPricePerGal.toFixed(2)} a gallon`);
  if (before.monthlyBudget !== after.monthlyBudget) {
    const budget = (m: MonthState) => (m.monthlyBudget === undefined ? "none set" : `$${whole(m.monthlyBudget)} a month`);
    out.push(`Budget goes from ${budget(before)} to ${budget(after)}`);
  }
  return out;
}

/** A simulation warning in words a person reads: the event id is dropped, "no modeled effect" says what it means. */
function plainWarning(w: string): string {
  const t = w.replace(/^Event \S+: /, "");
  const none = /^no modeled effect, (.+)$/.exec(t);
  const s = none ? `Not modeled: ${none[1]}` : capital(t);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** The first month each fit and constraint difference between two runs shows up, in words. */
function fitChanges(withIt: ProjectionPoint[], without: ProjectionPoint[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const fits = [["passengerFit", "Passenger"], ["cargoFit", "Cargo"]] as const;
  for (let i = 0; i < Math.min(withIt.length, without.length); i++) {
    const a = withIt[i], b = without[i];
    for (const [key, label] of fits) {
      if (a.suitability[key] === b.suitability[key] || seen.has(key)) continue;
      seen.add(key);
      out.push(`${label} fit goes from ${FIT_WORDS[b.suitability[key]]} to ${FIT_WORDS[a.suitability[key]]}, from ${monthLabel(a.month)}`);
    }
    for (const c of a.suitability.constraints) {
      if (b.suitability.constraints.includes(c) || seen.has(c)) continue;
      seen.add(c);
      out.push(`${CONSTRAINT_WORDS[c] ?? capital(c.replace(/_/g, " "))}, from ${monthLabel(a.month)}`);
    }
  }
  return out;
}

export interface EffectInput {
  scenario: Scenario;
  /** The simulation of `scenario` as it is. */
  result: SimulationResult | undefined;
  /** The month to measure at. */
  month: number;
  /** Runs a future through the simulation. */
  simulate(scenario: Scenario): SimulationResult;
  /** The month by month details of a future (months 1 to 60). Without it, no detail changes are listed. */
  states?(scenario: Scenario): MonthState[];
}

/** What to say about a decision that does not change cost. Null when it does, so the dollars speak instead. */
export interface NoCostMessage {
  headline: string;
  lines: string[];
}

export function noCostMessage(effect: Pick<DecisionEffect, "changesCost" | "fitChanged" | "changes">): NoCostMessage | null {
  if (effect.changesCost) return null;
  return {
    headline: effect.fitChanged ? "No change to cost. This changes fit, not dollars." : "No change to cost.",
    lines: effect.changes.length > 0 ? effect.changes : ["Nothing else the model tracks changes either."],
  };
}

export function decisionEffects({ scenario, result, month, simulate, states }: EffectInput): DecisionEffect[] {
  const withAll = pointAt(result, month);
  if (!withAll || !result) return [];
  const withStates = states?.(scenario);

  const out: DecisionEffect[] = [];
  for (const event of decisionsOf(scenario)) {
    const without: Scenario = { ...scenario, events: scenario.events.filter((e) => e.id !== event.id) };
    let rerun: SimulationResult;
    let withoutStates: MonthState[] | undefined;
    try {
      rerun = simulate(without);
      withoutStates = states?.(without);
    } catch {
      continue; // if it cannot be re-run, say nothing rather than guess
    }
    const alone = pointAt(rerun, month);
    if (!alone) continue;

    // The decision takes effect from its own month (month 0 acts in month 1).
    const at = Math.min(MONTH_MAX, Math.max(1, event.month)) - 1;
    const fromFields = withStates?.[at] && withoutStates?.[at] ? fieldChanges(withoutStates[at], withStates[at]) : [];
    const fromFit = fitChanges(result.points, rerun.points);
    const fromWarnings = result.warnings.filter((w) => !rerun.warnings.includes(w)).map(plainWarning);
    const endWith = pointAt(result, MONTH_MAX), endWithout = pointAt(rerun, MONTH_MAX);

    out.push({
      event,
      title: eventTitle(event),
      month: event.month,
      costDelta: withAll.netEconomicCost - alone.netEconomicCost,
      fitNote: fitNote(withAll.suitability, alone.suitability),
      costDeltaAtEnd: endWith && endWithout ? endWith.netEconomicCost - endWithout.netEconomicCost : withAll.netEconomicCost - alone.netEconomicCost,
      // Round to the dollar, as every phrase does: under half a dollar counts as no change.
      changesCost: result.points.some((p, i) => rerun.points[i] !== undefined && Math.round(p.netEconomicCost - rerun.points[i].netEconomicCost) !== 0),
      fitChanged: fromFit.length > 0,
      changes: [...fromFields, ...fromFit, ...fromWarnings],
    });
  }
  return out;
}
