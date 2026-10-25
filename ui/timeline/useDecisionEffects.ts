"use client";

import { useMemo } from "react";
import type { Scenario } from "@/contracts";
import { sim } from "@/ui/mocks";
import { MONTH_MAX } from "@/ui/store/months";
import { simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { decisionEffects, type DecisionEffect } from "./effects";

/** What each decision in a future changed by `month` (the end of the five years by default), from running it again without it. */
export function useDecisionEffects(scenario: Scenario | undefined, month: number = MONTH_MAX): DecisionEffect[] {
  const twin = useForkStore((s) => s.twin);
  const explore = useForkStore((s) => s.explore);
  const replacementVehicle = useForkStore((s) => s.replacementVehicle);
  const result = useForkStore((s) => (scenario ? s.results[scenario.id] : undefined));
  const inputs = useMemo(() => simulationInputs({ twin, explore, replacementVehicle }), [twin, explore, replacementVehicle]);
  return useMemo(
    () => (inputs && scenario ? decisionEffects({ scenario, result, month, simulate: (s) => sim.simulate(inputs.twin, s, inputs.ctx) }) : []),
    [inputs, scenario, result, month],
  );
}
