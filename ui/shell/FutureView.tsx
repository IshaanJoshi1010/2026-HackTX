"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { Stat } from "@/ui/profile/Stat";
import { selectActivePoint, selectActiveResult, selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { Road } from "@/ui/timeline/Road";
import { FutureDetails } from "./FutureDetails";

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "border-b pb-0.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
        pressed ? "border-ink text-ink" : "border-transparent text-ink/55 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

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
  const scenario = useForkStore(selectActiveScenario);
  const result = useForkStore(selectActiveResult);
  const point = useForkStore(selectActivePoint);
  const { openReplaceComparison, setFutureDetails, setFutureCompare } = useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  const other = twin ? samples.find((v) => v.id !== twin.vehicle.id) : undefined;
  const spec = point ? specsFor(point.vehicleId) : null;
  const futuresCount = scenarios.length - 1;

  const preferred =
    evaluation?.preferredScenarioId === "inconclusive"
      ? "Inconclusive"
      : scenarios.find((sc) => sc.id === evaluation?.preferredScenarioId)?.name;

  return (
    <>
      {/* Content slides away under a soft fade, not under the header and the mock-mode pill. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-20 bg-gradient-to-b from-black via-black/80 to-transparent" />
      <div
        data-testid="future-view"
        style={{ bottom: bottomInset }}
        className="fork-page absolute inset-x-0 top-0 z-10 overflow-y-auto px-[5%] pb-10 pt-[clamp(4rem,9vh,6rem)]"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-[clamp(1.25rem,3.5vh,2.5rem)]">
          <header className="text-center">
            <p data-testid="future-name" className="mb-2 text-base text-ink/60">
              {scenario?.name}
            </p>
            {point ? (
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

          <Road />

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
          </div>

          {details && <FutureDetails />}

          {evaluation && (
            <section aria-label="Keep or replace" className="pt-4 text-center">
              <p className="text-sm text-ink/50">Keep or replace</p>
              <p className="mt-1 text-3xl font-medium text-ink">{preferred ?? "Inconclusive"}</p>
              <ul className="mx-auto mt-3 max-w-xl space-y-1.5 text-sm text-ink/60">
                {evaluation.rationale.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
