"use client";

import { useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { DecisionSummary } from "@/ui/compare/DecisionSummary";
import { selectActiveScenario } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { WindingTimeline } from "@/ui/timeline/WindingTimeline";
import { DeepDive } from "./DeepDive";
import { FutureSelector } from "./FutureSelector";
import { IconButton } from "./IconButton";

/**
 * The second page. Each section has one job, in order of importance:
 *  1. the decision and what it costs, together at the top (DecisionSummary: the verdict, both costs, why, the next step);
 *  2. the journey: only events and choices, with the selected event's details under it;
 *  3. everything deeper (costs over time, why this result, what could change, the inputs), one deliberate click away.
 * Expanded gives the journey the whole page.
 */
export function FutureView({ bottomInset = 0 }: { bottomInset?: number }) {
  const evaluation = useForkStore((s) => s.evaluation);
  const expanded = useForkStore((s) => s.ui.futureExpanded);
  const detailsOpen = useForkStore((s) => s.ui.detailsOpen);
  const scenario = useForkStore(selectActiveScenario);
  const setFutureExpanded = useForkStore((s) => s.actions.setFutureExpanded);

  // Escape closes the expanded timeline, unless the assumptions drawer is up: that one takes Escape first.
  useEffect(() => {
    if (!expanded || detailsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFutureExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, detailsOpen, setFutureExpanded]);

  const expandButton = (
    <IconButton
      label={expanded ? "Collapse timeline" : "Expand timeline"}
      aria-expanded={expanded}
      data-testid="expand-timeline"
      onClick={() => setFutureExpanded(!expanded)}
    >
      {expanded ? <Minimize2 /> : <Maximize2 />}
    </IconButton>
  );

  return (
    <>
      {/* Content slides away under a soft fade, not under the header. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-20 bg-gradient-to-b from-black via-black/80 to-transparent" />
      <div
        data-testid="future-view"
        style={{ bottom: bottomInset }}
        className="fork-page absolute inset-x-0 top-0 z-10 overflow-y-auto px-[4%] pb-12 pt-[clamp(3.5rem,8vh,6rem)]"
      >
        <h1 className="sr-only">Your next five years</h1>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-[clamp(2rem,5vh,3.5rem)]">
          {/* Expanded puts the journey alone on the page. It is the same section in the same place either way, so the step you had open stays open. */}
          {!expanded && <DecisionSummary />}

          <section aria-label="Your journey" data-testid="journey">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              {expanded ? (
                <p data-testid="expanded-title" className="text-lg text-ink/60">
                  {evaluation ? "Your options over five years" : scenario?.name}
                </p>
              ) : (
                <h2 className="text-xl font-medium text-ink">Your journey</h2>
              )}
              <div className="flex items-center gap-3">
                <FutureSelector />
                {expandButton}
              </div>
            </div>
            <WindingTimeline expanded={expanded} />
          </section>

          {!expanded && <DeepDive />}
        </div>
      </div>
    </>
  );
}
