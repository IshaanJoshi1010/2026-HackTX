"use client";

import { useMemo } from "react";
import { ai, sim } from "@/ui/mocks";
import { metricSource } from "@/ui/profile/metricSources";
import { specsFor } from "@/ui/store/selectors";
import { simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { AssumptionsReview } from "./AssumptionsReview";
import { annualMilesSource } from "./breakEvenMath";
import { BreakEvenViz } from "./BreakEvenViz";
import { currentTerms, termsOf } from "./termsMath";

/**
 * Everything the keep vs replace parts share, read once from the store. Null until you have
 * asked to compare, so each part can render nothing before then. The engine did the work.
 */
export function useComparison() {
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
export function TermsSection() {
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

/** "What could change": the break-even bar and the engine's reruns on either side of it. Nothing until it has been run. */
export function ComparisonChange() {
  const c = useComparison();
  const breakEven = useForkStore((s) => s.breakEven);
  const check = useForkStore((s) => s.breakEvenCheck);
  if (!c || !breakEven) return null;
  return (
    <div data-testid="change-panel">
      <BreakEvenViz
        breakEven={breakEven}
        check={check}
        source={c.source}
        currentSource={breakEven.parameter === "annualMiles" ? annualMilesSource(c.keep, c.profile) : c.profile.provenance.fuelPricePerGal}
        {...c.names}
      />
    </div>
  );
}
