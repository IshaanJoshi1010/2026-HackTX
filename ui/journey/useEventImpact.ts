"use client";

import { useMemo } from "react";
import type { Scenario } from "@/contracts";
import { sim } from "@/ui/mocks";
import { simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { calendarLabel, computeImpact, type EventImpact } from "./impact";
import type { FutureKind } from "./types";

export interface UseEventImpactOptions {
  /** Which future to read the event in. Without it: the future you are looking at, then the keep future, then the switch future. */
  future?: FutureKind;
}

/**
 * What one event changes, from running the future that holds it again without it. A life event is read in the future
 * you are looking at (it is in both); the swap only exists in the switch future. Null with no event, with no car yet,
 * or when the event is not in a future that can be run.
 *
 * It runs against the store as it is right now and starts over whenever the numbers change (the revision, the
 * futures, the profile), so it never shows a result for older numbers.
 */
export function useEventImpact(eventId: string | null, options: UseEventImpactOptions = {}): EventImpact | null {
  const twin = useForkStore((s) => s.twin);
  const explore = useForkStore((s) => s.explore);
  const replacementVehicle = useForkStore((s) => s.replacementVehicle);
  const comparison = useForkStore((s) => s.comparison);
  const activeScenarioId = useForkStore((s) => s.activeScenarioId);
  const revision = useForkStore((s) => s.revision);
  const todayISO = useForkStore((s) => s.todayISO);
  const future = options.future;

  const inputs = useMemo(() => simulationInputs({ twin, explore, replacementVehicle }), [twin, explore, replacementVehicle]);

  return useMemo(() => {
    if (!eventId || !inputs) return null;
    const holds = (s: Scenario | undefined): s is Scenario => !!s && s.events.some((e) => e.id === eventId && e.status === "confirmed");
    const find = (id: string | undefined) => explore.scenarios.find((s) => s.id === id);
    const keepId = comparison?.keepId;
    const switchId = comparison?.replaceId;
    const order = future === "switch" ? [switchId, activeScenarioId, keepId] : future === "keep" ? [keepId, activeScenarioId, switchId] : [activeScenarioId, keepId, switchId];
    const scenario = order.map(find).find(holds) ?? explore.scenarios.find(holds);
    if (!scenario) return null;
    return computeImpact({
      scenario,
      eventId,
      simulate: (s) => sim.simulate(inputs.twin, s, inputs.ctx),
      dateLabel: (month) => calendarLabel(todayISO, month),
    });
    // `revision` is not read above on purpose: a new set of results is a new revision, and this starts over with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, inputs, explore.scenarios, comparison, activeScenarioId, future, todayISO, revision]);
}
