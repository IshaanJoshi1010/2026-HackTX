import type { NextAction, Source } from "@/contracts";
import { SourceBadge } from "@/ui/profile/SourceBadge";

export interface NextStepProps {
  action: Pick<NextAction, "label" | "detail" | "officialLink">;
  /** Where the numbers in the text come from. Undefined shows the gap. */
  source: Source | undefined;
}

/**
 * One concrete next step. The words come from the decision engine, which can say "keep your
 * car" as readily as anything else. It never says a booking, a quote or an approval happened.
 */
export function NextStep({ action, source }: NextStepProps) {
  return (
    <section aria-label="Next step" data-testid="next-step" className="mx-auto w-full max-w-2xl text-center">
      <p className="text-sm text-ink/50">Next step</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <p data-testid="next-step-label" className="text-xl font-medium text-ink">
          {action.label}
        </p>
        <SourceBadge compact source={source} />
      </div>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/60">{action.detail}</p>
      {action.officialLink && (
        <a
          href={action.officialLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block border-b border-ink/40 pb-0.5 text-sm text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          Open the official page
        </a>
      )}
    </section>
  );
}
