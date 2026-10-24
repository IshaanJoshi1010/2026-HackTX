/**
 * Selectors return existing references (never fresh objects), so they are safe
 * with zustand's useSyncExternalStore binding.
 */
import type { ProjectionPoint, Scenario, SimulationResult, SpecSheet, VehicleConfig } from "@/contracts";
import { data } from "@/ui/mocks";
import { pointAt } from "@/ui/timeline/layout";
import { vehicleById, type ForkState } from "./useForkStore";

export const selectActiveScenario = (s: ForkState): Scenario | undefined =>
  s.explore.scenarios.find((sc) => sc.id === s.activeScenarioId);

export const selectActiveResult = (s: ForkState): SimulationResult | undefined =>
  s.results[s.activeScenarioId];

/**
 * The projection at the scrubbed month. Found by month, not array index, so it
 * works whether the sim's points start at month 0 or month 1. Undefined at a
 * month with no point (for example month 0 with the real sim).
 */
export const selectActivePoint = (s: ForkState): ProjectionPoint | undefined =>
  pointAt(s.results[s.activeScenarioId], s.activeMonth);

/** The car CarStage should show right now. */
export const selectActiveVehicle = (s: ForkState): VehicleConfig | null =>
  vehicleById(s, s.activeVehicleId) ?? s.twin?.vehicle ?? null;

/** Spec sheet for a car. Fixtures are static, so this is cheap to call per render. */
export const specsFor = (vehicleId: string): SpecSheet | null => {
  try {
    return data.getSpecs(vehicleId);
  } catch {
    return null;
  }
};
