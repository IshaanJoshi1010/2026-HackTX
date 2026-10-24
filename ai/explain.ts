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
    // A stale UI evaluation must not be explained alongside a different set of scenario results.
    const scenarioIds = new Set(e.scenarioIds);
    const resultIds = new Set(r.map(result => result.scenarioId));
    if (!scenarioIds.size || scenarioIds.size !== e.scenarioIds.length || resultIds.size !== r.length
      || scenarioIds.size !== resultIds.size || [...scenarioIds].some(id => !resultIds.has(id))
      || (e.preferredScenarioId !== "inconclusive" && !scenarioIds.has(e.preferredScenarioId))
      || (e.sensitivity.length !== 0 && e.sensitivity.length !== e.scenarioIds.length)) {
      throw new Error("Evaluation and results must describe the same scenarios");
    }
    // Supply computed summaries, not raw driver/account/profile data or the full monthly timeline.
    const input = { evaluation: e, results: r.map(result => ({ scenarioId: result.scenarioId, summary: result.summary,
      milestones: result.milestones, warnings: result.warnings, finalPoint: result.points.at(-1),
      // Keep earlier fit issues even when a later replacement resolves them.
      fitChecks: [...new Set(result.points.flatMap(point => [
        ...point.suitability.tradeoffs, ...point.suitability.constraints, ...point.suitability.notes,
      ]).filter(key => Object.hasOwn(fitMessages, key)))].map(key => fitMessages[key]),
    })) };
    const generic = e.preferredScenarioId === "inconclusive"
      ? "No option clearly leads on your priorities yet."
      : "Compare the modeled costs and fit checks before deciding.";
    // Preserve the engine's verdict and arithmetic verbatim. Never derive a new amount or winner here.
    const fallback = () => ({ text: [
      ...(e.preferredScenarioId === "inconclusive" ? [generic] : []),
      `Next step: ${e.nextAction.label}\n${e.nextAction.detail}`,
      ...(e.rationale.length ? [`What drives this comparison:\n${e.rationale.join("\n")}`]
        : e.preferredScenarioId === "inconclusive" ? [] : [generic]),
      ...[...new Set([...e.hardConstraints, ...input.results.flatMap(result => [
        ...result.warnings.map(warning => `${result.scenarioId}: ${warning}`),
        ...result.fitChecks.map(check => `${result.scenarioId}: ${check}`),
      ])])],
      "These demo results are not a financial quote.",
    ].join("\n\n"), usedFallback: true });
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
