import "server-only";
import type { DecisionEvaluation, SimulationResult } from "../contracts";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../contracts/schemas";
import { generateWithGemini, type Generator } from "./gemini";
import { numberCheck } from "./numberCheck";
import { explanationInstructions } from "./prompts/system";

const fitMessages: Record<string, string> = {
  every_seat_used: "Every seat is needed.",
  car_seats_fill_rear_row: "Car seats use all rear seating positions.",
  cargo_below_need: "Cargo volume is below the stated need.",
  cargo_well_below_need: "Cargo volume is well below the stated need.",
  seats_below_household: "There are fewer seats than household members.",
  car_seats_exceed_rear_positions: "Car seat demand exceeds rear seating positions.",
  "car_seat_fit=unverified": "Physical car seat fit still needs verification.",
  "packing_fit=unverified": "Packing fit still needs verification.",
  "cargo_volume=unreported": "Cargo volume is unreported; cargo fit needs verification.",
  "spec_sheet=missing": "The spec sheet is missing; vehicle fit needs verification.",
};

export function createExplainer(generate: Generator = generateWithGemini) {
  return async (evaluation: DecisionEvaluation, results: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }> => {
    const e = DecisionEvaluationSchema.parse(evaluation);
    const r = results.map(result => SimulationResultSchema.parse(result));
    // Supply computed summaries, not raw driver/account/profile data or the full monthly timeline.
    const input = { evaluation: e, results: r.map(result => ({ scenarioId: result.scenarioId, summary: result.summary,
      milestones: result.milestones, warnings: result.warnings, finalPoint: result.points.at(-1),
      // Keep earlier fit issues even when a later replacement resolves them.
      fitChecks: [...new Set(result.points.flatMap(point => [
        ...point.suitability.tradeoffs, ...point.suitability.constraints, ...point.suitability.notes,
      ]).filter(key => Object.hasOwn(fitMessages, key)))].map(key => fitMessages[key]),
    })) };
    const generic = e.preferredScenarioId === "inconclusive"
      ? "The supplied results do not establish a clear preferred scenario. Review the computed comparison and its assumptions before deciding."
      : "Review the preferred scenario in the computed comparison alongside its costs, fit checks and assumptions.";
    // Preserve the engine's verdict and arithmetic verbatim. Never derive a new amount or winner here.
    const fallback = () => ({ text: [
      ...(e.preferredScenarioId === "inconclusive" ? [generic] : []),
      ...(e.rationale.length ? e.rationale : e.preferredScenarioId === "inconclusive" ? [] : [generic]),
      ...e.hardConstraints,
      ...input.results.flatMap(result => [
        ...result.warnings.map(warning => `${result.scenarioId}: ${warning}`),
        ...result.fitChecks.map(check => `${result.scenarioId}: ${check}`),
      ]),
      `${e.nextAction.label}: ${e.nextAction.detail}`,
      "These demo results are not a financial quote.",
    ].join("\n"), usedFallback: true });
    try {
      const text = (await generate({ system: explanationInstructions, input })).trim();
      // Engine scores are fractions, not confidence percentages. Numeric membership alone cannot check units.
      if (!text || text.length > 6000 || !numberCheck(text, input).ok || /https?:\/\//i.test(text)
        || /%|\bpercent(?:age)?s?\b/i.test(text)) return fallback();
      return { text, usedFallback: false };
    } catch { return fallback(); }
  };
}
export const explain = createExplainer();
