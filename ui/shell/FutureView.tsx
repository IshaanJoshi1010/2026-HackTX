"use client";

import { useEffect, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { Stat } from "@/ui/profile/Stat";
import { selectActivePoint, selectActiveResult, selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { Road } from "@/ui/timeline/Road";
import { ComparisonMore, ComparisonNextStep, ComparisonToggles, ComparisonVerdict } from "@/ui/compare/ComparisonSection";
import { Toggle } from "@/ui/compare/Toggle";
import { FutureDetails } from "./FutureDetails";
import { IconButton } from "./IconButton";

/**
 * The second page: your road. One headline number, the road itself, and three quiet
 * options. Details and the other futures are there when you want them, not before.
 */
export function FutureView({ bottomInset = 0 }: { bottomInset?: number }) {
  const twin = useForkStore((s) => s.twin);
  const month = useForkStore((s) => s.activeMonth);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const evaluation = useForkStore((s) => s.evaluation);
  const busy = useForkStore((s) => s.ui.busy);
  const details = useForkStore((s) => s.ui.futureDetails);
  const compare = useForkStore((s) => s.ui.futureCompare);
  const expanded = useForkStore((s) => s.ui.futureExpanded);
  const detailsOpen = useForkStore((s) => s.ui.detailsOpen);
  const scenario = useForkStore(selectActiveScenario);
  const result = useForkStore(selectActiveResult);
  const point = useForkStore(selectActivePoint);
  const { openReplaceComparison, setFutureDetails, setFutureCompare, setFutureExpanded } = useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  const other = twin ? samples.find((v) => v.id !== twin.vehicle.id) : undefined;
  const spec = point ? specsFor(point.vehicleId) : null;
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
      {/* Content slides away under a soft fade, not under the header and the mock-mode pill. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-20 bg-gradient-to-b from-black via-black/80 to-transparent" />
      <div
        data-testid="future-view"
        style={{ bottom: bottomInset }}
        className="fork-page absolute inset-x-0 top-0 z-10 overflow-y-auto px-[5%] pb-10 pt-[clamp(3.5rem,8vh,6rem)]"
      >
        <div className={cn("mx-auto flex w-full flex-col gap-[clamp(1rem,3vh,2.5rem)]", expanded ? "max-w-[1500px]" : "max-w-6xl")}>
          {/* Expanded: the timeline and nothing else around it. The cost at the playhead is on the road itself. */}
          {expanded && (
            <div className="flex items-center justify-between gap-4">
              <p data-testid="expanded-title" className="text-base text-ink/60">
                {evaluation ? "Your options over five years" : scenario?.name}
              </p>
              <div className="flex items-center gap-6">
                {futuresCount > 0 && (
                  <Toggle pressed={compare} onClick={() => setFutureCompare(!compare)}>
                    Other futures ({futuresCount})
                  </Toggle>
                )}
                {expandButton}
              </div>
            </div>
          )}

          {!expanded && (
          <header className="text-center">
            {/* Once you compare, the road names each future itself, so the name is not said twice. */}
            {!evaluation && (
              <p data-testid="future-name" className="mb-2 text-base text-ink/60">
                {scenario?.name}
              </p>
            )}
            {evaluation ? (
              // Once you compare, the answer is the headline. The road still carries the cost at the playhead.
              <ComparisonVerdict />
            ) : point ? (
              <Stat
                size="lg"
                label={`Net cost, ${monthLabel(month)}`}
                value={usd(point.netEconomicCost)}
                source={metricSource("netEconomicCost", profile, spec)}
              />
            ) : (
              <p className="text-lg text-ink/50">{month === 0 ? "Today. Net cost counts from here." : "No projection for this month"}</p>
            )}
          </header>
          )}

          {!expanded && <div className="-mb-4 flex justify-end">{expandButton}</div>}
          <Road compact={evaluation !== null} expanded={expanded} />

          {!expanded && <ComparisonNextStep />}

          {!expanded && (
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-2">
            <Toggle pressed={details} onClick={() => setFutureDetails(!details)}>
              Details
            </Toggle>
            {futuresCount > 0 && (
              <Toggle pressed={compare} onClick={() => setFutureCompare(!compare)}>
                Other futures ({futuresCount})
              </Toggle>
            )}
            {!evaluation && other && (
              <button
                type="button"
                onClick={() => void openReplaceComparison()}
                disabled={busy !== "idle" || !result}
                className="border-b border-transparent pb-0.5 text-sm text-ink/55 transition-colors hover:text-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
              >
                Compare with a {other.year} {other.model}
              </button>
            )}
            <ComparisonToggles />
          </div>
          )}

          {!expanded && details && <FutureDetails />}

          {!expanded && <ComparisonMore />}
        </div>
      </div>
    </>
  );
}
