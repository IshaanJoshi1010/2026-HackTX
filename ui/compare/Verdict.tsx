import type { DecisionEvaluation, Source } from "@/contracts";
import { SourceBadge } from "@/ui/profile/SourceBadge";

export interface VerdictProps {
  evaluation: DecisionEvaluation;
  keepId: string;
  replaceId: string;
  /** "Camry": the car you have. */
  keepModel: string;
  /** "RAV4": the car it is compared with. */
  replaceModel: string;
  source: Source | undefined;
}

/** The engine's pick as a headline. "inconclusive" is a close call, said plainly. */
export function verdictHeadline(p: Pick<VerdictProps, "evaluation" | "keepId" | "replaceId" | "keepModel" | "replaceModel">): {
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

export function Verdict(p: VerdictProps) {
  const { headline, line } = verdictHeadline(p);
  const robust = robustnessLine(p.evaluation);
  return (
    <section aria-label="Keep or replace" data-testid="verdict" className="text-center">
      <p className="text-sm text-ink/50">Keep or replace</p>
      <p data-testid="verdict-headline" className="mt-1 text-[clamp(34px,6vh,52px)] leading-tight font-medium tracking-tight text-ink">
        {headline}
      </p>
      <p className="mt-2 text-base text-ink/60">{line}</p>
      {robust && (
        <p data-testid="verdict-robustness" className="mt-2 flex items-center justify-center gap-2 text-sm text-ink/50">
          {robust}
          <SourceBadge compact source={p.source} />
        </p>
      )}
    </section>
  );
}
