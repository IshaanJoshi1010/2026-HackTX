import "server-only";
import type { DecisionEvaluation, SimulationResult } from "../contracts";
import { DecisionEvaluationSchema, SimulationResultSchema } from "../contracts/schemas";
import { generateWithGemini, type Generator } from "./gemini";
import { numberCheck } from "./numberCheck";
import { explanationInstructions } from "./prompts/system";

export function createExplainer(generate: Generator = generateWithGemini) {
  return async (evaluation: DecisionEvaluation, results: SimulationResult[]): Promise<{ text: string; usedFallback: boolean }> => {
    const e = DecisionEvaluationSchema.parse(evaluation);
    const r = results.map(result => SimulationResultSchema.parse(result));
    // Supply computed summaries, not raw driver/account/profile data or the full monthly timeline.
    const input = { evaluation: e, results: r.map(result => ({ scenarioId: result.scenarioId, summary: result.summary,
      milestones: result.milestones, warnings: result.warnings, finalPoint: result.points.at(-1) })) };
    const fallback = () => ({ text: e.preferredScenarioId === "inconclusive"
      ? "The supplied results do not establish a clear preferred scenario. Review the computed comparison and its assumptions before deciding."
      : "Review the preferred scenario in the computed comparison alongside its costs, fit checks and assumptions. These demo results are not a financial quote.", usedFallback: true });
    try {
      const text = (await generate({ system: explanationInstructions, input })).trim();
      if (!text || text.length > 6000 || !numberCheck(text, input).ok || /https?:\/\//i.test(text)) return fallback();
      return { text, usedFallback: false };
    } catch { return fallback(); }
  };
}
export const explain = createExplainer();
