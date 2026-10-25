/**
 * The steps on the winding timeline, and the two ends of its fork. Pure: it only arranges what the store and the engine
 * already know. Nothing here is a number, and nothing is chosen by event type.
 */
import type { LifeEvent, Scenario, Source, VehicleConfig } from "@/contracts";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { MONTH_MAX } from "@/ui/store/months";
import type { DecisionEffect } from "./effects";

export type StepKind = "start" | "decision" | "fork";

export interface Step {
  key: string;
  kind: StepKind;
  /** 1 based, as shown ("01"). The fork has none: it is a choice, not something that happens at a date. */
  number: number | null;
  title: string;
  /** "Now", "In 1 yr", "Your choice". */
  when: string;
  event?: LifeEvent;
  effect?: DecisionEffect;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const whenLabel = (month: number): string => (month <= 0 ? "Now" : `In ${monthLabel(month)}`);

export interface StepsInput {
  /** The confirmed decisions of the future, in the order they happen (decisionsOf). */
  decisions: LifeEvent[];
  effects: DecisionEffect[];
  /** "Your 2022 Camry": the start, when nothing happens right now. */
  startTitle: string;
}

/**
 * Every decision, in the order it happens, then the fork. When nothing happens right now (or nothing has been said yet)
 * there is a first step for where you are, so the path always starts at "Now". Only those are numbered; the fork is last
 * and has no number.
 */
export function buildSteps({ decisions, effects, startTitle }: StepsInput): Step[] {
  const byId = new Map(effects.map((e) => [e.event.id, e]));
  const steps: Omit<Step, "number">[] = [];
  if (decisions.length === 0 || decisions[0].month > 0) steps.push({ key: "start", kind: "start", title: startTitle, when: "Now" });
  for (const event of decisions) {
    steps.push({ key: event.id, kind: "decision", title: eventTitle(event), when: whenLabel(event.month), event, effect: byId.get(event.id) });
  }
  const numbered: Step[] = steps.map((s, i) => ({ ...s, number: i + 1 }));
  return [...numbered, { key: "fork", kind: "fork", number: null, title: "A fork in the road", when: "Your choice" }];
}

/** How many steps carry a number (everything but the fork). */
export const numberedCount = (steps: Step[]): number => steps.filter((s) => s.number !== null).length;

/** The second line of the keep end: how long the model looks at it. */
export function keepTiming(horizonMonths: number = MONTH_MAX): string {
  return `Through year ${Math.round(horizonMonths / 12)}`;
}

/** The second line of the switch end: when the swap happens in the model. Null when that is not known. */
export function swapTiming(month: number | null | undefined): string | null {
  if (month === null || month === undefined || !Number.isFinite(month)) return null;
  return month <= 0 ? "Swap now" : `Swap in ${monthLabel(month)}`;
}

export interface Swap {
  month: number;
  /** Where the date comes from: yours if you moved it, otherwise a labeled default. */
  source: Source;
}

/** When the car is swapped in a future that swaps it, or null when that future has no swap. */
export function swapOf(replaceScenario: Scenario | undefined): Swap | null {
  const event = replaceScenario?.events.find((e) => e.type === "vehicle_replacement" && e.status === "confirmed");
  return event ? { month: event.month, source: event.source === "user" ? "user" : "estimated" } : null;
}

export interface ForkOption {
  id: "keep" | "replace";
  title: string;
  /** The line under the title: how long it is modeled, or when the swap happens. Null when that is not known. */
  timing: string | null;
  /** Drawn dashed only while it is an offer nobody has priced yet. */
  dashed: boolean;
  /** The future it is, once it has been priced. Null for the car nobody has priced. */
  scenarioId: string | null;
}

export interface ForkInput {
  keepVehicle: Pick<VehicleConfig, "year" | "model">;
  other: Pick<VehicleConfig, "year" | "model" | "trim"> | undefined;
  comparison: { keepId: string; replaceId: string } | null;
  /** The future being kept: the one you are looking at, or the one you compared. */
  keepScenarioId: string;
  /** The month of the swap in the switch future, once it is known. */
  swapMonth?: number | null;
}

/**
 * The two ways it can go, keep first. Before comparing, the other car is a dashed offer; after, both are solid. Nothing
 * here says which is better: that is the page header's job.
 */
export function buildForkOptions({ keepVehicle, other, comparison, keepScenarioId, swapMonth }: ForkInput): ForkOption[] {
  const keep: ForkOption = {
    id: "keep",
    title: `Keep your ${keepVehicle.year} ${keepVehicle.model}`,
    timing: keepTiming(),
    dashed: false,
    scenarioId: comparison?.keepId ?? keepScenarioId,
  };
  if (!other) return [keep];
  const replace: ForkOption = {
    id: "replace",
    title: comparison ? `Switch to the ${other.year} ${other.model}` : `Explore the ${other.year} ${other.model} ${other.trim}`,
    timing: swapTiming(swapMonth),
    dashed: !comparison,
    scenarioId: comparison?.replaceId ?? null,
  };
  return [keep, replace];
}
