/**
 * The steps on the winding timeline, and the two ends of its fork. Pure: it only arranges what the store and the engine
 * already know. Nothing here is a number, and nothing is chosen by event type.
 */
import type { DecisionEvaluation, LifeEvent, VehicleConfig } from "@/contracts";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import type { DecisionEffect } from "./effects";

export type StepKind = "start" | "decision" | "fork";

export interface Step {
  key: string;
  kind: StepKind;
  /** 1 based, as shown ("01"). */
  number: number;
  title: string;
  /** "Now", "In 1 yr", "Your choice". */
  when: string;
  event?: LifeEvent;
  effect?: DecisionEffect;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const whenLabel = (month: number): string => (month <= 0 ? "Now" : `In ${monthLabel(month)}`);

/** Cost, in words with no number in them. Under a dollar is no change, like everywhere else. */
export function costWords(delta: number): string {
  const r = Math.round(delta);
  return r === 0 ? "No change to cost" : r > 0 ? "Adds to your cost" : "Lowers your cost";
}

export interface StepsInput {
  /** The confirmed decisions of the future, in the order they happen (decisionsOf). */
  decisions: LifeEvent[];
  effects: DecisionEffect[];
  /** "Your 2022 Camry": the start, when nothing happens right now. */
  startTitle: string;
}

/**
 * Every decision, in the order it happens, then the fork. When nothing happens right now (or nothing has been said yet)
 * there is a first step for where you are, so the path always starts at "Now".
 */
export function buildSteps({ decisions, effects, startTitle }: StepsInput): Step[] {
  const byId = new Map(effects.map((e) => [e.event.id, e]));
  const steps: Omit<Step, "number">[] = [];
  if (decisions.length === 0 || decisions[0].month > 0) steps.push({ key: "start", kind: "start", title: startTitle, when: "Now" });
  for (const event of decisions) {
    steps.push({ key: event.id, kind: "decision", title: eventTitle(event), when: whenLabel(event.month), event, effect: byId.get(event.id) });
  }
  steps.push({ key: "fork", kind: "fork", title: "A fork in the road", when: "Your choice" });
  return steps.map((s, i) => ({ ...s, number: i + 1 }));
}

export type ForkTag = "Recommended" | "Alternative" | "Close call";

export interface ForkOption {
  id: "keep" | "replace";
  title: string;
  /** The engine's word on it, once there is one. */
  tag: ForkTag | null;
  /** Drawn dashed: the way you have not chosen, or have not looked at yet. */
  dashed: boolean;
  /** The future it is, once it has been priced. Null for the car nobody has priced. */
  scenarioId: string | null;
}

export interface ForkInput {
  keepVehicle: Pick<VehicleConfig, "year" | "model">;
  other: Pick<VehicleConfig, "year" | "model" | "trim"> | undefined;
  comparison: { keepId: string; replaceId: string } | null;
  evaluation: DecisionEvaluation | null;
  /** The future being kept: the one you are looking at, or the one you compared. */
  keepScenarioId: string;
}

/** The two ways it can go. Before comparing, the other car is a dashed offer; after, the engine's pick is solid. */
export function buildForkOptions({ keepVehicle, other, comparison, evaluation, keepScenarioId }: ForkInput): ForkOption[] {
  const keep: ForkOption = {
    id: "keep",
    title: `Keep your ${keepVehicle.year} ${keepVehicle.model}`,
    tag: null,
    dashed: false,
    scenarioId: comparison?.keepId ?? keepScenarioId,
  };
  const replace: ForkOption | null = other
    ? {
        id: "replace",
        title: comparison ? `Switch to the ${other.year} ${other.model}` : `Explore the ${other.year} ${other.model} ${other.trim}`,
        tag: null,
        dashed: true,
        scenarioId: comparison?.replaceId ?? null,
      }
    : null;

  if (comparison && evaluation) {
    const preferred = evaluation.preferredScenarioId;
    if (preferred === "inconclusive") {
      keep.tag = "Close call";
      if (replace) {
        replace.tag = "Close call";
        replace.dashed = false;
      }
    } else {
      const picksKeep = preferred === comparison.keepId;
      keep.tag = picksKeep ? "Recommended" : "Alternative";
      keep.dashed = !picksKeep;
      if (replace) {
        replace.tag = picksKeep ? "Alternative" : "Recommended";
        replace.dashed = picksKeep;
      }
    }
  }
  return replace ? [keep, replace] : [keep];
}
