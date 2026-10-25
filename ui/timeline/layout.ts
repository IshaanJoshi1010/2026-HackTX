/**
 * Pure helpers for reading a future's decisions and projection by month. No React, no store.
 * Time runs 0 to 60 months.
 */
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";

/** Every confirmed decision of a future, in the order it happens. A proposal is not part of any future yet. */
export function decisionsOf(scenario: Scenario): LifeEvent[] {
  return scenario.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === "confirmed")
    .sort((a, b) => a.e.month - b.e.month || a.i - b.i)
    .map(({ e }) => e);
}

/** The projection at a month. Looks up by month, not index, so it works whether points start at 0 or 1. */
export function pointAt(result: SimulationResult | undefined, month: number): ProjectionPoint | undefined {
  return result?.points.find((p) => p.month === month);
}

/**
 * A per-month amount added up from month 1 through `month`. The sim reports fuel and
 * upkeep for each month, not as running totals. Undefined when there is nothing to add.
 */
export function totalThrough(
  result: SimulationResult | undefined,
  month: number,
  key: "fuelSpend" | "maintenanceSpend",
): number | undefined {
  const upTo = result?.points.filter((p) => p.month >= 1 && p.month <= month) ?? [];
  return upTo.length === 0 ? undefined : upTo.reduce((sum, p) => sum + p[key], 0);
}
