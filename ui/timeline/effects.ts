/**
 * What did each decision change? For every decision in a future, run that future
 * again without it and compare. Pure: the caller passes the function that runs the
 * simulation, so this never imports the sim.
 */
import type { Fit, LifeEvent, Scenario, SimulationResult, SuitabilityResult } from "@/contracts";
import { eventTitle } from "@/ui/store/eventLabels";
import { decisionsOf, pointAt } from "./layout";

export interface DecisionEffect {
  event: LifeEvent;
  title: string;
  month: number;
  /** Net cost with this decision minus net cost without it, at the month measured. Positive means it adds cost. */
  costDelta: number;
  /** A plain sentence when the decision changes how well the car fits, otherwise null. */
  fitNote: string | null;
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

export interface EffectInput {
  scenario: Scenario;
  /** The simulation of `scenario` as it is. */
  result: SimulationResult | undefined;
  /** The month to measure at. */
  month: number;
  /** Runs a future through the simulation. */
  simulate(scenario: Scenario): SimulationResult;
}

export function decisionEffects({ scenario, result, month, simulate }: EffectInput): DecisionEffect[] {
  const withAll = pointAt(result, month);
  if (!withAll) return [];

  const out: DecisionEffect[] = [];
  for (const event of decisionsOf(scenario)) {
    const without: Scenario = { ...scenario, events: scenario.events.filter((e) => e.id !== event.id) };
    let rerun: SimulationResult;
    try {
      rerun = simulate(without);
    } catch {
      continue; // if it cannot be re-run, say nothing rather than guess
    }
    const alone = pointAt(rerun, month);
    if (!alone) continue;
    out.push({
      event,
      title: eventTitle(event),
      month: event.month,
      costDelta: withAll.netEconomicCost - alone.netEconomicCost,
      fitNote: fitNote(withAll.suitability, alone.suitability),
    });
  }
  return out;
}
