/**
 * Pure timeline geometry and data shaping. No React, no store. The components draw
 * what this returns, and every branch it describes is a real Scenario.
 */
import type { LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { MONTH_MAX, clampMonth } from "@/ui/store/months";

export { MONTH_MAX, clampMonth };
export const ROW_H = 44;

/** Month to a 0..100 percentage along the axis. */
export const monthToPct = (m: number): number => (clampMonth(m) / MONTH_MAX) * 100;

/** A pointer x position to a month, given the axis rectangle. */
export function xToMonth(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return clampMonth(((clientX - rect.left) / rect.width) * MONTH_MAX);
}

export interface Lane {
  id: string;
  name: string;
  /** Row on screen, 0 at the top. */
  row: number;
  /** Row of the lane this one branches from, or null if it starts the picture. */
  parentRow: number | null;
  /** Month this lane starts being its own line. 0 when it has no visible parent. */
  startMonth: number;
  active: boolean;
}

/**
 * One lane per scenario, in creation order (parents always come before children).
 * Focus mode shows only the active scenario, drawn as a full line from month 0.
 */
export function buildLanes(scenarios: Scenario[], activeId: string, expanded: boolean): Lane[] {
  const all: Lane[] = scenarios.map((s, row) => {
    const parentRow = s.parentId ? scenarios.findIndex((p) => p.id === s.parentId) : -1;
    return {
      id: s.id,
      name: s.name,
      row,
      parentRow: parentRow >= 0 ? parentRow : null,
      startMonth: parentRow >= 0 ? s.forkMonth : 0,
      active: s.id === activeId,
    };
  });
  if (expanded) return all;
  const focus = all.find((l) => l.active) ?? all[0];
  return focus ? [{ ...focus, row: 0, parentRow: null, startMonth: 0 }] : [];
}

/**
 * Events to draw on a lane. A branch inherits its parent's events, so a lane only
 * shows the ones that are not already drawn on the parent. Only confirmed events
 * ever appear: a proposal is not part of any future yet.
 */
export function laneEvents(scenario: Scenario, parent: Scenario | undefined): LifeEvent[] {
  const inherited = new Set((parent?.events ?? []).map((e) => e.id));
  return scenario.events.filter((e) => e.status === "confirmed" && !inherited.has(e.id));
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

const laneY = (row: number) => row * ROW_H + ROW_H / 2;

/**
 * SVG path for a lane: a curve off the parent line at the fork month, then a
 * straight line to month 60. Lanes with no visible parent are just a line.
 * Coordinates are pixels for a given axis width.
 */
export function lanePath(lane: Lane, width: number): string {
  const x = (m: number) => (clampMonth(m) / MONTH_MAX) * width;
  const y = laneY(lane.row);
  if (lane.parentRow === null) return `M ${x(lane.startMonth)} ${y} L ${x(MONTH_MAX)} ${y}`;
  const x0 = x(lane.startMonth);
  const yp = laneY(lane.parentRow);
  const run = 18 + 6 * Math.abs(lane.row - lane.parentRow);
  const x1 = Math.min(x0 + run, x(MONTH_MAX));
  const c = (x1 - x0) / 2;
  return `M ${x0} ${yp} C ${x0 + c} ${yp}, ${x1 - c} ${y}, ${x1} ${y} L ${x(MONTH_MAX)} ${y}`;
}

export const laneCenterY = laneY;

/** $13,315 becomes $13.3k, $1,250,000 becomes $1.3M. For tight spaces. */
export function usdCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${sign}$${(a / 1000).toFixed(0)}k`;
  if (a >= 1_000) return `${sign}$${(a / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Axis ticks: every year, with a short label. */
export const YEAR_TICKS = [0, 12, 24, 36, 48, 60] as const;
export const yearLabel = (m: number): string => (m === 0 ? "Now" : `${m / 12} yr`);

/**
 * Events in the same month on one lane would sit on top of each other. Spread
 * them side by side, centered on the month. Returns a pixel offset by event id.
 */
export function fanOffsets(events: Array<Pick<LifeEvent, "id" | "month">>, gap = 26): Map<string, number> {
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
