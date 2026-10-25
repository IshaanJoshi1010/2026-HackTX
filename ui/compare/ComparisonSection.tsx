"use client";

import { useEffect, useMemo, useRef } from "react";
import { ai, sim } from "@/ui/mocks";
import { metricSource } from "@/ui/profile/metricSources";
import { specsFor } from "@/ui/store/selectors";
import { simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { AssumptionsReview } from "./AssumptionsReview";
import { annualMilesSource } from "./breakEvenMath";
import { BreakEvenViz } from "./BreakEvenViz";
import { NextStep } from "./NextStep";
import { currentTerms, termsOf } from "./termsMath";
import { Toggle } from "./Toggle";
import { Verdict } from "./Verdict";
import { WhyPanel } from "./WhyPanel";

/**
 * Everything the keep vs replace parts share, read once from the store. Null until you have
 * asked to compare, so each part can render nothing before then. The engine did the work.
 */
function useComparison() {
  const twin = useForkStore((s) => s.twin);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  if (!twin || !replacement || !comparison || !evaluation) return null;
  // Everything shown is built from the same inputs as the net cost, so it carries that label.
  const source = metricSource("netEconomicCost", profile, specsFor(twin.vehicle.id));
  return {
    twin,
    replacement,
    comparison,
    evaluation,
    profile,
    source,
    keep: scenarios.find((sc) => sc.id === comparison.keepId),
    names: {
      keepId: comparison.keepId,
      replaceId: comparison.replaceId,
      keepName: `the ${twin.vehicle.model}`,
      replaceName: `the ${replacement.model}`,
    },
  };
}

/**
 * The purchase and insurance terms. "Now" is what the sim reports using for the car being compared, with its own
 * source labels. Confirming applies the terms to every future; resetting goes back to the estimates.
 */
function TermsSection() {
  const twin = useForkStore((s) => s.twin);
  const explore = useForkStore((s) => s.explore);
  const replacementVehicle = useForkStore((s) => s.replacementVehicle);
  const comparison = useForkStore((s) => s.comparison);
  const { applyScenarioTerms, resetScenarioTerms } = useForkStore((s) => s.actions);

  const replace = explore.scenarios.find((sc) => sc.id === comparison?.replaceId);
  const keep = explore.scenarios.find((sc) => sc.id === comparison?.keepId);
  const reported = useMemo(() => {
    const inputs = simulationInputs({ twin, explore, replacementVehicle });
    if (!inputs || !replace) return [];
    try {
      return sim.simulateDetailed(inputs.twin, replace, inputs.ctx).assumptions;
    } catch {
      return []; // nothing to show as "now"; the form still works
    }
  }, [twin, explore, replacementVehicle, replace]);

  return (
    <AssumptionsReview
      fields={ai.scenarioTermFields}
      current={currentTerms(reported, ai.scenarioTermFields)}
      applied={termsOf(keep?.assumptions ?? {})}
      prepare={ai.prepareScenarioTerms}
      onConfirm={applyScenarioTerms}
      onReset={resetScenarioTerms}
    />
  );
}

/** The headline of the Future page once you compare: the engine's pick, in plain words. */
export function ComparisonVerdict() {
  const c = useComparison();
  if (!c) return null;
  return (
    <Verdict
      evaluation={c.evaluation}
      keepId={c.comparison.keepId}
      replaceId={c.comparison.replaceId}
      keepModel={c.twin.vehicle.model}
      replaceModel={c.replacement.model}
      source={c.source}
    />
  );
}

/** One concrete next step, from the engine. */
export function ComparisonNextStep() {
  const c = useComparison();
  if (!c) return null;
  return <NextStep action={c.evaluation.nextAction} source={c.source} />;
}

/** The two opt-ins that belong to a comparison. Inline, so the page can put them in its own row. */
export function ComparisonToggles() {
  const c = useComparison();
  const breakEven = useForkStore((s) => s.breakEven);
  const why = useForkStore((s) => s.ui.futureWhy);
  const terms = useForkStore((s) => s.ui.futureTerms);
  const breakEvenOn = useForkStore((s) => s.ui.futureBreakEven);
  const { setFutureWhy, setFutureTerms, setFutureBreakEven } = useForkStore((s) => s.actions);
  if (!c) return null;
  const showBreakEven = breakEvenOn && breakEven !== null;
  return (
    <>
      <Toggle pressed={showBreakEven} onClick={() => setFutureBreakEven(!showBreakEven)}>
        What would change it
      </Toggle>
      <Toggle pressed={terms} onClick={() => setFutureTerms(!terms)}>
        Edit terms
      </Toggle>
      <Toggle pressed={why} onClick={() => setFutureWhy(!why)}>
        Why
      </Toggle>
    </>
  );
}

/** What was opted into: the break-even, and the reasons. Each scrolls into view when it opens. */
export function ComparisonMore() {
  const c = useComparison();
  const breakEven = useForkStore((s) => s.breakEven);
  const check = useForkStore((s) => s.breakEvenCheck);
  const explanation = useForkStore((s) => s.explanation);
  const why = useForkStore((s) => s.ui.futureWhy);
  const terms = useForkStore((s) => s.ui.futureTerms);
  const breakEvenOn = useForkStore((s) => s.ui.futureBreakEven);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const showBreakEven = c !== null && breakEvenOn && breakEven !== null;
  const showWhy = c !== null && why;
  const showTerms = c !== null && terms;

  // What you just asked for should not open out of sight under the road.
  const breakRef = useRef<HTMLDivElement>(null);
  const whyRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const wasShown = useRef({ breakEven: false, why: false, terms: false });
  useEffect(() => {
    const behavior = reducedMotion ? "auto" : "smooth";
    if (showBreakEven && !wasShown.current.breakEven) breakRef.current?.scrollIntoView?.({ behavior, block: "start" });
    if (showTerms && !wasShown.current.terms) termsRef.current?.scrollIntoView?.({ behavior, block: "start" });
    if (showWhy && !wasShown.current.why) whyRef.current?.scrollIntoView?.({ behavior, block: "start" });
    wasShown.current = { breakEven: showBreakEven, why: showWhy, terms: showTerms };
  }, [showBreakEven, showWhy, showTerms, reducedMotion]);

  if (!c || (!showBreakEven && !showWhy && !showTerms)) return null;
  return (
    <div className="flex flex-col gap-[clamp(1.5rem,4vh,2.75rem)]">
      {showBreakEven && (
        <div ref={breakRef} className="scroll-mt-24">
          <BreakEvenViz
            breakEven={breakEven}
            check={check}
            source={c.source}
            currentSource={
              breakEven.parameter === "annualMiles" ? annualMilesSource(c.keep, c.profile) : c.profile.provenance.fuelPricePerGal
            }
            {...c.names}
          />
        </div>
      )}
      {showTerms && (
        <div ref={termsRef} className="scroll-mt-24">
          <TermsSection />
        </div>
      )}
      {showWhy && (
        <div ref={whyRef} className="scroll-mt-24">
          <WhyPanel explanation={explanation} rationale={c.evaluation.rationale} source={c.source} />
        </div>
      )}
    </div>
  );
}

/** All of it in one place, in reading order. The Future page splits it up around the road. */
export function ComparisonSection() {
  const c = useComparison();
  if (!c) return null;
  return (
    <div data-testid="comparison" className="flex flex-col gap-[clamp(1.5rem,4vh,2.75rem)] pt-4">
      <ComparisonVerdict />
      <ComparisonNextStep />
      <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-2">
        <ComparisonToggles />
      </div>
      <ComparisonMore />
    </div>
  );
}
