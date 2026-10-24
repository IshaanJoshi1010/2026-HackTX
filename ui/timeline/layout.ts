/**
 * Pure timeline helpers shared by the road. No React, no store.
 * Time runs 0 to 60 months, left to right.
 */
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { MONTH_MAX, clampMonth } from "@/ui/store/months";

export { MONTH_MAX, clampMonth };

/** Month to a 0..100 percentage along the axis. */
export const monthToPct = (m: number): number => (clampMonth(m) / MONTH_MAX) * 100;

/** A pointer x position to a month, given the axis rectangle. */
export function xToMonth(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return clampMonth(((clientX - rect.left) / rect.width) * MONTH_MAX);
}

/** Every confirmed decision of a future, in the order it happens. A proposal is not part of any future yet. */
export function decisionsOf(scenario: Scenario): LifeEvent[] {
  return scenario.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.status === "confirmed")
    .sort((a, b) => a.e.month - b.e.month || a.i - b.i)
    .map(({ e }) => e);
}

/** Ids of decisions a future inherited from its parent. They belong to the parent, so they are read-only here. */
export function inheritedIds(parent: Scenario | undefined): Set<string> {
  return new Set((parent?.events ?? []).map((e) => e.id));
}

export interface Milestone {
  month: number;
  text: string;
}

/** Reads "Month 36: loan paid off" lines. Lines without a month are skipped. */
export function milestonesOf(result: SimulationResult | undefined): Milestone[] {
  if (!result) return [];
  const out: Milestone[] = [];
  for (const line of result.milestones) {
    const m = /^Month (\d+):\s*(.+)$/.exec(line);
    if (!m) continue;
    const month = Number(m[1]);
    if (month >= 0 && month <= MONTH_MAX) out.push({ month, text: m[2] });
  }
  return out;
}

/** The projection at a month. Looks up by month, not index, so it works whether points start at 0 or 1. */
export function pointAt(result: SimulationResult | undefined, month: number): ProjectionPoint | undefined {
  return result?.points.find((p) => p.month === month);
}

/**
 * Decisions in the same month would sit on top of each other. Spread them side by
 * side, centered on the month. Returns a pixel offset by decision id.
 */
export function fanOffsets(events: Array<Pick<LifeEvent, "id" | "month">>, gap = 40): Map<string, number> {
  const total = new Map<number, number>();
  for (const e of events) total.set(e.month, (total.get(e.month) ?? 0) + 1);
  const seen = new Map<number, number>();
  const out = new Map<string, number>();
  for (const e of events) {
    const n = total.get(e.month) ?? 1;
    const i = seen.get(e.month) ?? 0;
    seen.set(e.month, i + 1);
    out.set(e.id, (i - (n - 1) / 2) * gap);
  }
  return out;
}

/** Axis ticks: every year, with a short label. */
export const YEAR_TICKS = [0, 12, 24, 36, 48, 60] as const;
export const yearLabel = (m: number): string => (m === 0 ? "Now" : `${m / 12} yr`);
