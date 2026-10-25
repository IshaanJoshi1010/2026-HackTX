"use client";

import { useId, useMemo, type ReactNode } from "react";
import type { SimulationResult, Source } from "@/contracts";
import { data } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { weakestSource } from "@/ui/profile/sources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { specsFor } from "@/ui/store/selectors";
import { MONTH_MAX, useForkStore } from "@/ui/store/useForkStore";
import { pointAt } from "@/ui/timeline/layout";
import { ComparisonNextStep } from "./ComparisonSection";
import { useTradeoff } from "./useTradeoff";
import { verdictHeadline } from "./Verdict";

/** The big numbers: about 36 to 48px, tabular, so the three columns line up digit for digit. */
const FIGURE = "text-[clamp(36px,4.2vw,48px)] leading-none font-medium tabular-nums tracking-tight whitespace-nowrap text-ink";

function Column({ testId, label, children }: { testId: string; label: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="flex min-w-0 flex-col gap-3">
      <p className="text-lg text-ink/80">{label}</p>
      {children}
    </div>
  );
}

/** One row for the figure so the three columns share a baseline, and one for where it comes from. */
function FigureRow({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[3rem] flex-wrap items-baseline gap-x-3 gap-y-2">{children}</div>;
}

const badge = (source: Source | undefined) => <SourceBadge compact source={source} className="text-xs!" />;

/**
 * The top of the Future page: the verdict, the three numbers behind it, why, and the next step, in that order. One job:
 * say whether to keep or switch and what that costs. Everything is read from the store; the numbers are the sim's, the
 * pick is the engine's, and the words are built from the engine's own scores.
 */
export function DecisionSummary() {
  const twin = useForkStore((s) => s.twin);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const busy = useForkStore((s) => s.ui.busy);
  const { openReplaceComparison } = useForkStore((s) => s.actions);
  const tradeoff = useTradeoff();
  const samples = useMemo(() => data.listSampleVehicles(), []);
  const labelId = useId();

  if (!twin) return null;

  // Before you compare, the other car is the one Fork would compare with: the same pick the store makes.
  const other = replacement ?? samples.find((v) => v.id !== twin.vehicle.id);
  const keepResult: SimulationResult | undefined = comparison ? results[comparison.keepId] : results[activeId];
  const replaceResult: SimulationResult | undefined = comparison ? results[comparison.replaceId] : undefined;

  /** Net cost at the end of the five years, with where it comes from. */
  const netAtEnd = (result: SimulationResult | undefined) => {
    const point = pointAt(result, MONTH_MAX);
    return point ? { value: Math.round(point.netEconomicCost), source: metricSource("netEconomicCost", profile, specsFor(point.vehicleId)) } : null;
  };
  const keep = netAtEnd(keepResult);
  const swap = netAtEnd(replaceResult);
  const compared = comparison !== null && keep !== null && swap !== null;

  const keepModel = twin.vehicle.model;
  const swapModel = other?.model;
  const verdict =
    comparison && evaluation && swapModel
      ? verdictHeadline({ evaluation, keepId: comparison.keepId, replaceId: comparison.replaceId, keepModel, replaceModel: swapModel })
      : null;

  // The difference is taken between the two numbers on the page, so the three always agree.
  const gap = compared ? swap.value - keep.value : 0;
  const diffSource = compared ? weakestSource([keep.source, swap.source]) : undefined;

  const canCompare = busy === "idle" && results[activeId] !== undefined;
  const explanation =
    (compared ? (tradeoff?.sentence ?? verdict?.line) : null) ??
    (!comparison && swapModel ? `Compare with the ${swapModel} to see whether switching makes sense.` : null);

  return (
    <section aria-label="Keep or replace" data-testid="verdict" className="flex flex-col gap-[clamp(1.75rem,4.5vh,3.5rem)] text-left">
      <header className="flex flex-col gap-3">
        <p className="text-base text-ink/60">Life takes turns.</p>
        <h2 data-testid="verdict-headline" className="text-[clamp(44px,7vh,72px)] leading-none font-medium tracking-tight text-ink">
          {verdict?.headline ?? "Your next five years"}
        </h2>
      </header>

      <div role="group" aria-labelledby={labelId}>
        <p id={labelId} className="mb-5 text-sm text-ink/50">
          Modeled net cost over five years
        </p>
        <div className="grid gap-x-12 gap-y-9 sm:grid-cols-3">
          <Column testId="cost-keep" label={`Keep your ${keepModel}`}>
            {keep ? (
              <>
                <FigureRow>
                  <span className={FIGURE}>{usd(keep.value)}</span>
                </FigureRow>
                {badge(keep.source)}
              </>
            ) : (
              <FigureRow>
                <span className="text-lg text-ink/50">Not available yet</span>
              </FigureRow>
            )}
          </Column>

          <Column testId="cost-switch" label={swapModel ? `Switch to the ${swapModel}` : "Switch cars"}>
            {compared ? (
              <>
                <FigureRow>
                  <span className={FIGURE}>{usd(swap.value)}</span>
                </FigureRow>
                {badge(swap.source)}
              </>
            ) : other ? (
              <FigureRow>
                <button
                  type="button"
                  disabled={!canCompare}
                  onClick={() => void openReplaceComparison()}
                  className="border-b border-ink/40 pb-0.5 text-left text-lg text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink/40"
                >
                  Compare with the {other.year} {other.model} {other.trim}
                </button>
              </FigureRow>
            ) : (
              <FigureRow>
                <span className="text-lg text-ink/50">No other car to compare with</span>
              </FigureRow>
            )}
          </Column>

          <Column testId="cost-difference" label="Difference">
            {compared ? (
              <>
                <FigureRow>
                  {gap === 0 ? (
                    <span className="text-[clamp(28px,3.2vw,36px)] leading-none font-medium tracking-tight text-ink">No difference</span>
                  ) : (
                    <>
                      <span className="text-lg text-ink/80">{gap > 0 ? "Switching adds" : "Switching saves"}</span>{" "}
                      <span className={FIGURE}>{usd(Math.abs(gap))}</span>
                    </>
                  )}
                </FigureRow>
                {badge(diffSource)}
              </>
            ) : (
              <FigureRow>
                <span className="text-lg text-ink/50">Not compared yet</span>
              </FigureRow>
            )}
          </Column>
        </div>
      </div>

      {explanation && (
        <p data-testid="why-sentence" className="max-w-3xl text-lg leading-8 text-ink/80">
          {explanation}
        </p>
      )}

      {/* Self-hides until there is an evaluation. Left aligned here to match everything above it. */}
      <div className="[&_[data-testid=next-step]]:mx-0 [&_[data-testid=next-step]]:max-w-3xl [&_[data-testid=next-step]]:text-left [&_[data-testid=next-step]_div]:justify-start [&_[data-testid=next-step]_p]:mx-0">
        <ComparisonNextStep />
      </div>
    </section>
  );
}
