import type { DecisionEvaluation } from "@/contracts";

export interface VerdictProps {
  evaluation: DecisionEvaluation;
  keepId: string;
  replaceId: string;
  /** "Camry": the car you have. */
  keepModel: string;
  /** "RAV4": the car it is compared with. */
  replaceModel: string;
}

/** The engine's pick as a headline. "inconclusive" is a close call, said plainly. */
export function verdictHeadline(p: VerdictProps): {
  headline: string;
  line: string;
} {
  const preferred = p.evaluation.preferredScenarioId;
  if (preferred === "inconclusive") return { headline: "Close call", line: "Neither car clearly leads on your priorities." };
  if (preferred === p.keepId) return { headline: `Keep your ${p.keepModel}`, line: "Keeping it fits your priorities best." };
  if (preferred === p.replaceId) return { headline: `Switch to the ${p.replaceModel}`, line: `The ${p.replaceModel} fits your priorities best.` };
  return { headline: "No clear answer yet", line: "The comparison did not settle on a car." };
}

/** "Held in 9 of 9 tested cases", when the engine ran the robustness check. A count, never a probability. */
export function robustnessLine(evaluation: DecisionEvaluation): string | null {
  return evaluation.rationale.find((line) => /^Held in \d+ of \d+ tested cases$/.test(line)) ?? null;
}
