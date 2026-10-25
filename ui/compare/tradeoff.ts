import type { DecisionEvaluation, DriverProfile } from "@/contracts";
import type { ScenarioScore } from "@/decision";

/**
 * Why a comparison comes out the way it does, from the engine's own per-priority scores. Pure: words about what the engine
 * already calculated, never a number the engine did not produce. SHARED CONTRACT: the types below are fixed. Whoever owns
 * `buildTradeoff` fills in the body; the page and the timeline read `Tradeoff` through `useTradeoff`.
 */
export type FactorKey = "cost" | "fuel" | "longevity" | "family" | "comfort";

/** Who is ahead on one priority, after weighting it by how much you said it matters. */
export type Leader = "keep" | "switch" | "level";

export interface TradeoffRow {
  key: FactorKey;
  /** "Cost", "Fuel use", "Life left", "Family fit", "Comfort". */
  label: string;
  leader: Leader;
}

export interface Tradeoff {
  /** All five priorities, in this order: cost, fuel, longevity, family, comfort. */
  rows: TradeoffRow[];
  /**
   * One or two sentences for under the totals: what each car is ahead on, and why that does or does not settle it. Words
   * only, no dollar figures and no scores, since the totals are already on the page.
   */
  sentence: string;
  /** True when the engine called it a close call (inconclusive). */
  closeCall: boolean;
}

export interface TradeoffInput {
  scores: ScenarioScore[];
  evaluation: DecisionEvaluation;
  keepId: string;
  replaceId: string;
  /** "the Camry" */
  keepName: string;
  /** "the RAV4" */
  switchName: string;
  priorities: DriverProfile["priorities"];
}

/** Null when there is nothing to explain (no scores for both futures). */
export function buildTradeoff(input: TradeoffInput): Tradeoff | null {
  void input; // STUB: replaced by the real implementation
  return null;
}
