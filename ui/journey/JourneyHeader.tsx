"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { customerText } from "@/ui/profile/customerText";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import type { Journey } from "./types";

export interface JourneyHeaderProps {
  journey: Journey;
  /** The engine's one next step, as a short line. Empty shows nothing. */
  nextActionLabel: string;
  /** The heading and the next step open the recommendation. */
  onOpenRecommendation(): void;
  onOpenCosts(): void;
  /** Before there is a comparison: price the switch. */
  onCompare(): void;
}

/** The recommendation as the heading, in the engine's own words. "Close call" when it could not pick. */
export function headingFor(journey: Journey): string | null {
  switch (journey.call) {
    case "close":
      return "Close call";
    case "keep":
      return journey.keep.title;
    case "switch":
      return journey.switch?.title ?? null;
    default:
      return null;
  }
}

const textButton =
  "inline-flex min-h-9 items-center text-base text-ink/70 underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * The top of the Future page: one heading that is the recommendation (and opens it), one sentence about the difference
 * over five years, and the one label every destination figure on the page shares. No cards and no pills.
 *
 * Before a comparison the heading is a plain "Your next five years" and a button prices the switch. The source label
 * appears here once, next to "Modeled net cost"; the figures beside the timeline's destinations do not repeat it.
 */
export function JourneyHeader({ journey, nextActionLabel, onOpenRecommendation, onOpenCosts, onCompare }: JourneyHeaderProps) {
  const heading = headingFor(journey);
  const other = journey.switch;
  const diff = journey.difference;
  const source = diff?.source ?? journey.keep.costSource ?? other?.costSource;
  const priced = journey.keep.fiveYearCost !== null || other?.priced === true;
  const offerModel = other?.endVehicle?.model;
  const next = nextActionLabel.trim() === "" ? null : customerText(nextActionLabel.trim());

  return (
    <header data-testid="journey-header" className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink/60">Life takes turns.</p>

        <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-1">
          <h1 className="m-0 text-[clamp(26px,4vh,38px)] leading-tight font-medium tracking-tight text-ink">
            {heading === null ? (
              "Your next five years"
            ) : (
              <button
                type="button"
                data-testid="journey-heading"
                onClick={onOpenRecommendation}
                aria-haspopup="dialog"
                className="group inline-flex items-center gap-2 text-left transition-colors hover:text-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {customerText(heading)}
                <ChevronRight aria-hidden="true" className="size-6 shrink-0 text-ink/50 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </button>
            )}
          </h1>
          {journey.call === null && other !== null && !other.priced && (
            <button type="button" onClick={onCompare} className={textButton}>
              {offerModel ? `Compare with the ${offerModel}` : "Compare the two cars"}
            </button>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <p data-testid="journey-difference" className="text-base text-ink/80">
            {diff ? `${customerText(diff.phrase)} over five years.` : "Compare to see what switching would change over five years."}
          </p>
          {priced && (
            <span data-testid="journey-source" className="inline-flex items-center gap-2">
              <SourceBadge compact source={source} />
              <span className="text-sm text-ink/60">Modeled net cost</span>
            </span>
          )}
        </div>

        {next && (
          <button
            type="button"
            data-testid="journey-next"
            title={next}
            onClick={onOpenRecommendation}
            className={cn(
              "mt-1 block min-h-6 max-w-full truncate text-left text-sm text-ink/60 transition-colors hover:text-ink",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            )}
          >
            {`Next: ${next}`}
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-5 sm:flex-col sm:items-end sm:gap-0">
        <button type="button" onClick={onOpenCosts} className={textButton}>
          Compare costs
        </button>
        <p role="status" aria-live="polite" data-testid="journey-updating" className="min-h-5 text-sm text-ink/60">
          {journey.updating ? "Updating" : ""}
        </p>
      </div>
    </header>
  );
}
