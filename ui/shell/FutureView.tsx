"use client";

import { ComparisonMore, ComparisonNextStep, ComparisonToggles, ComparisonVerdict, TermsToggle } from "@/ui/compare/ComparisonSection";
import { Toggle } from "@/ui/compare/Toggle";
import { FutureField } from "@/ui/future/FutureField";
import { useForkStore } from "@/ui/store/useForkStore";
import { Road } from "@/ui/timeline/Road";
import { DecisionList } from "./DecisionList";
import { FutureDetails } from "./FutureDetails";
import { YourOptions } from "./YourOptions";

/**
 * The second page: your future, as particles. Each stream is a possible future; it splits where something you told
 * Fork pulls it away. The verdict and the one next step sit with it. The numbers are one button away: what you told
 * Fork, your options side by side, and the road month by month.
 */
export function FutureView({ bottomInset = 0 }: { bottomInset?: number }) {
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const evaluation = useForkStore((s) => s.evaluation);
  const numbers = useForkStore((s) => s.ui.futureDetails);
  const showAll = useForkStore((s) => s.ui.futureCompare);
  const { setFutureDetails, setFutureCompare } = useForkStore((s) => s.actions);

  const futuresCount = scenarios.length - 1;

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
          <header className="text-center">
            {evaluation ? (
              // Once you compare, the answer is the headline.
              <ComparisonVerdict />
            ) : (
              <>
                <h1 data-testid="future-heading" className="text-[clamp(30px,5vh,44px)] leading-tight font-medium tracking-tight text-ink">
                  Your next 5 years
                </h1>
                <p data-testid="future-subline" className="mt-2 text-base text-ink/60">
                  {futuresCount > 0 ? "Tap a name to look at that future." : "This is where you are headed if nothing changes."}
                </p>
              </>
            )}
          </header>

          <FutureField />

          <ComparisonNextStep />

          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-2">
            <Toggle pressed={numbers} onClick={() => setFutureDetails(!numbers)}>
              See the numbers
            </Toggle>
            <ComparisonToggles terms={false} />
          </div>

          {numbers && (
            <div data-testid="the-numbers" className="fork-page flex flex-col gap-[clamp(1.75rem,4vh,3rem)]">
              <DecisionList />
              <YourOptions />
              <div className="flex justify-center">
                <TermsToggle />
              </div>
              <FutureDetails />
              <section aria-label="Over time" data-testid="over-time">
                <h2 className="text-base font-medium text-ink">Over time</h2>
                <p className="mb-2 max-w-2xl text-sm leading-5 text-ink/60">
                  Your cost month by month. The straight line is what happens if nothing changes. Your road bends away from it by how much your
                  changes moved your cost: lower costs more, higher saves.
                </p>
                {futuresCount > 0 && (
                  <div className="mb-2 flex justify-start">
                    <Toggle pressed={showAll} onClick={() => setFutureCompare(!showAll)}>
                      Other futures ({futuresCount})
                    </Toggle>
                  </div>
                )}
                <Road compact={evaluation !== null} />
              </section>
            </div>
          )}

          <ComparisonMore />
        </div>
      </div>
    </>
  );
}
