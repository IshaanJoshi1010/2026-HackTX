"use client";

import { useMemo } from "react";
import { useForkStore } from "@/ui/store/useForkStore";
import { buildTradeoff, type Tradeoff } from "./tradeoff";

/** The tradeoff for the comparison on screen, or null before there is one. */
export function useTradeoff(): Tradeoff | null {
  const twin = useForkStore((s) => s.twin);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const scores = useForkStore((s) => s.scores);
  const priorities = useForkStore((s) => s.explore.confirmedProfile.priorities);
  return useMemo(
    () =>
      twin && replacement && comparison && evaluation
        ? buildTradeoff({
            scores,
            evaluation,
            keepId: comparison.keepId,
            replaceId: comparison.replaceId,
            keepName: `the ${twin.vehicle.model}`,
            switchName: `the ${replacement.model}`,
            priorities,
          })
        : null,
    [twin, replacement, comparison, evaluation, scores, priorities],
  );
}
