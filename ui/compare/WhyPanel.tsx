import type { Source } from "@/contracts";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import type { Explanation } from "@/ui/store/useForkStore";

export interface WhyPanelProps {
  /** Words about the numbers. Null until they arrive, or when they could not be written. */
  explanation: Explanation | null;
  /** The engine's own lines: verdict, costs, weights, scores. Always available. */
  rationale: string[];
  source: Source | undefined;
}

/**
 * The reasons behind the verdict. When AI is on, a plain-language summary written from the engine's
 * numbers leads. It is only ever given computed values, and a number it makes up is rejected before
 * it gets here. The engine's own lines are always underneath, so nothing depends on the summary.
 */
export function WhyPanel({ explanation, rationale, source }: WhyPanelProps) {
  // A template-written summary only repeats the engine's lines, so it is not shown twice.
  const aiSummary = explanation && !explanation.usedFallback ? explanation : null;
  return (
    <section aria-label="Why" data-testid="why" className="mx-auto w-full max-w-2xl">
      <p className="mb-1 text-sm text-ink/50">Why</p>
      {aiSummary ? (
        <>
          <p data-testid="why-summary" className="text-base leading-7 text-ink">
            {aiSummary.text}
          </p>
          <p data-testid="why-origin" className="mt-2 text-xs text-ink/40">
            Written by AI from the engine&apos;s numbers. It was given computed values only.
          </p>
        </>
      ) : (
        <p data-testid="why-origin" className="text-sm text-ink/50">
          No AI summary, so these are the engine&apos;s own lines.
        </p>
      )}
      <div className="mt-5 flex items-center gap-2 text-sm text-ink/50">
        <span>{"The engine's numbers"}</span>
        <SourceBadge compact source={source} />
      </div>
      <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink/60">
        {rationale.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
