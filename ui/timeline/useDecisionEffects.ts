"use client";

import { useMemo } from "react";
import type { Scenario } from "@/contracts";
import { sim } from "@/ui/mocks";
import { MONTH_MAX } from "@/ui/store/months";
import { simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { decisionEffects, type DecisionEffect } from "./effects";

/**
 * What each decision in a future changed, measured by running the future again without it.
 * The cost effect is read at `month` (the end of the projection by default).
 */
export function useDecisionEffects(scenario: Scenario | undefined, month: number = MONTH_MAX): DecisionEffect[] {
  const twin = useForkStore((s) => s.twin);
  const explore = useForkStore((s) => s.explore);
  const replacementVehicle = useForkStore((s) => s.replacementVehicle);
  const result = useForkStore((s) => (scenario ? s.results[scenario.id] : undefined));

  const inputs = useMemo(() => simulationInputs({ twin, explore, replacementVehicle }), [twin, explore, replacementVehicle]);
  return useMemo(() => {
    if (!inputs || !scenario) return [];
    // One detailed run per future: the cost series and the month by month details come from the same run.
    const runs = new Map<Scenario, ReturnType<typeof sim.simulateDetailed>>();
    const run = (s: Scenario) => {
      let r = runs.get(s);
      if (!r) runs.set(s, (r = sim.simulateDetailed(inputs.twin, s, inputs.ctx)));
      return r;
    };
    return decisionEffects({ scenario, result, month, simulate: (s) => run(s).result, states: (s) => run(s).timeline });
  }, [inputs, scenario, result, month]);
}
