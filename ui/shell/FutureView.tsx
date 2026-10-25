"use client";

import { useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ComparisonMore, ComparisonNextStep, ComparisonToggles, ComparisonVerdict } from "@/ui/compare/ComparisonSection";
import { Toggle } from "@/ui/compare/Toggle";
import { selectActiveScenario } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { Road } from "@/ui/timeline/Road";
import { WindingTimeline } from "@/ui/timeline/WindingTimeline";
import { FutureDetails } from "./FutureDetails";
import { IconButton } from "./IconButton";

/**
 * The second page: your next five years as a winding path. One step for each thing you told Fork, then a fork where you
 * choose; tap a step for what it does. The recommendation sits beside the heading once you compare. The month by month
 * cost, the other futures and the supporting numbers are one option away, not on the page until asked.
 */
export function FutureView({ bottomInset = 0 }: { bottomInset?: number }) {
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const evaluation = useForkStore((s) => s.evaluation);
  const details = useForkStore((s) => s.ui.futureDetails);
  const compare = useForkStore((s) => s.ui.futureCompare);
  const expanded = useForkStore((s) => s.ui.futureExpanded);
  const detailsOpen = useForkStore((s) => s.ui.detailsOpen);
  const scenario = useForkStore(selectActiveScenario);
  const { setFutureDetails, setFutureCompare, setFutureExpanded } = useForkStore((s) => s.actions);

  const futuresCount = scenarios.length - 1;

  // Escape closes the expanded timeline, unless the details sheet is up: that one takes Escape first.
  useEffect(() => {
    if (!expanded || detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFutureExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, detailsOpen, setFutureExpanded]);

  return (
    <>
      {/* Content slides away under a soft fade, not under the header and the mock-mode pill. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-20 bg-gradient-to-b from-black via-black/80 to-transparent" />
      <div
        data-testid="future-view"
        style={{ bottom: bottomInset }}
        className="fork-page absolute inset-x-0 top-0 z-10 overflow-y-auto px-[5%] pb-10 pt-[clamp(3.5rem,8vh,6rem)]"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-[clamp(1.25rem,3vh,2.25rem)]">
          <div className="flex items-center justify-between gap-4">
            {expanded ? (
              <p data-testid="expanded-title" className="text-base text-ink/60">
                {evaluation ? "Your options over five years" : scenario?.name}
              </p>
            ) : (
              <p data-testid="future-kicker" className="text-sm text-ink/60">
                Your next five years
              </p>
            )}
            <IconButton
              label={expanded ? "Collapse timeline" : "Expand timeline"}
              aria-expanded={expanded}
              data-testid="expand-timeline"
              onClick={() => setFutureExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          </div>

          {!expanded && (
            <header className="grid gap-x-10 gap-y-6 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h1 data-testid="future-heading" className="text-[clamp(34px,6vh,56px)] leading-none font-medium tracking-tight text-ink">
                  Life takes turns.
                </h1>
                <p data-testid="future-subline" className="mt-3 text-base text-ink/60">
                  Tap a step to see what it does.
                </p>
              </div>
              {evaluation && <ComparisonVerdict compact />}
            </header>
          )}

          <WindingTimeline expanded={expanded} />

          {!expanded && <ComparisonNextStep />}

          {!expanded && (
            <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-2">
              <Toggle pressed={details} onClick={() => setFutureDetails(!details)}>
                Details
              </Toggle>
              <ComparisonToggles />
            </div>
          )}

          {!expanded && details && (
            <div data-testid="details-section" className="flex flex-col gap-[clamp(1.75rem,4vh,3rem)]">
              <section aria-label="Month by month" data-testid="month-by-month">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <h2 className="text-base font-medium text-ink">Cost month by month</h2>
                  {futuresCount > 0 && (
                    <Toggle pressed={compare} onClick={() => setFutureCompare(!compare)}>
                      Other futures ({futuresCount})
                    </Toggle>
                  )}
                </div>
                <Road compact={evaluation !== null} />
              </section>
              <FutureDetails />
            </div>
          )}

          {!expanded && <ComparisonMore />}
        </div>
      </div>
    </>
  );
}
