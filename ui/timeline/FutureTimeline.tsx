"use client";

import { useMemo } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { IconButton } from "@/ui/shell/IconButton";
import { Marker, MilestoneTicks } from "./EventMarkers";
import { ROW_H, YEAR_TICKS, buildLanes, fanOffsets, laneEvents, lanePath, milestonesOf, monthToPct, pointAt, laneCenterY } from "./layout";
import { ScenarioNode } from "./ScenarioNode";
import { Scrubber } from "./Scrubber";
import { useElementWidth } from "./useElementWidth";

const AXIS_LABEL_H = 28;

/**
 * The futures timeline. Every lane is a real Scenario; a branch leaves its parent
 * at the exact month it was forked. The playhead crosses every lane and each lane
 * shows its own net cost at that month, so futures can be compared at a glance.
 *
 * With only the baseline it stays a quiet hairline. It grows lanes as you branch.
 */
export function FutureTimeline() {
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const month = useForkStore((s) => s.activeMonth);
  const expanded = useForkStore((s) => s.ui.timelineExpanded);
  const enabled = useForkStore((s) => s.phase === "workspace");
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const { setActiveScenario, setActiveMonth, moveEvent, setTimelineExpanded } = useForkStore((s) => s.actions);

  const [axisRef, width] = useElementWidth<HTMLDivElement>();

  const compact = scenarios.length <= 1;
  const lanes = useMemo(() => buildLanes(scenarios, activeId, expanded), [scenarios, activeId, expanded]);
  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);

  if (lanes.length === 0) return null;

  const rows = lanes.length;
  const lanesHeight = rows * ROW_H;
  const label = monthLabel(month);
  // Draw the active lane last so it sits on top where lines cross.
  const drawOrder = [...lanes].sort((a, b) => Number(a.active) - Number(b.active));

  const crossings = lanes
    .filter((l) => month >= l.startMonth)
    .map((l) => ({ id: l.id, y: laneCenterY(l.row), active: l.active }));

  const selectLane = (id: string, at?: number) => {
    if (id !== activeId) setActiveScenario(id);
    if (at !== undefined) setActiveMonth(at);
  };

  return (
    <section aria-label="Timeline" className="w-full">
      {!compact && (
        <header className="mb-1 grid grid-cols-[minmax(112px,176px)_1fr_minmax(88px,140px)] items-center">
          <h2 className="text-sm font-medium text-ink">Timeline</h2>
          <span />
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-ink/50">Net cost, {label}</span>
            <IconButton
              label={expanded ? "Focus on this future" : "Show all futures"}
              aria-expanded={expanded}
              onClick={() => setTimelineExpanded(!expanded)}
              className="size-7 [&_svg]:size-3.5"
            >
              {expanded ? <ChevronsDownUp /> : <ChevronsUpDown />}
            </IconButton>
          </div>
        </header>
      )}

      <div
        className={cn("grid", compact ? "grid-cols-1" : "grid-cols-[minmax(112px,176px)_1fr_minmax(88px,140px)]")}
        style={{ gridTemplateRows: `repeat(${rows}, ${ROW_H}px) ${AXIS_LABEL_H}px` }}
      >
        {!compact &&
          lanes.map((lane) => {
            const point = pointAt(results[lane.id], month);
            return (
              <ScenarioNode
                key={lane.id}
                lane={lane}
                netCost={point?.netEconomicCost}
                source={point ? metricSource("netEconomicCost", profile, specsFor(point.vehicleId)) : undefined}
                at={label}
                onSelect={(id) => selectLane(id)}
              />
            );
          })}

        <div
          ref={axisRef}
          className="relative"
          style={{ gridColumn: compact ? 1 : 2, gridRow: `1 / span ${rows + 1}` }}
        >
          <svg
            width={width}
            height={lanesHeight}
            viewBox={`0 0 ${width} ${lanesHeight}`}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
          >
            {YEAR_TICKS.map((t) => {
              const x = (monthToPct(t) / 100) * width;
              return <line key={t} x1={x} x2={x} y1={0} y2={lanesHeight} className="stroke-ink/10" />;
            })}
            {drawOrder.map((lane) => (
              <path
                key={lane.id}
                data-testid="lane-path"
                data-lane-id={lane.id}
                data-active={lane.active}
                d={lanePath(lane, width)}
                pathLength={1}
                strokeLinecap="round"
                strokeWidth={lane.active ? 2 : 1.5}
                className={cn("fork-draw fill-none", lane.active ? "stroke-ink" : "stroke-ink/30")}
              />
            ))}
          </svg>

          {lanes.map((lane) => (
            <MilestoneTicks key={`ms-${lane.id}`} lane={lane} milestones={milestonesOf(results[lane.id])} />
          ))}

          {lanes.map((lane) => {
            const scenario = byId.get(lane.id);
            if (!scenario) return null;
            const parent = scenario.parentId ? byId.get(scenario.parentId) : undefined;
            const inherited = new Set((parent?.events ?? []).map((e) => e.id));
            // With the parent lane on screen its events are drawn there; in focus mode they are shown here, locked.
            const events = laneEvents(scenario, lane.parentRow !== null ? parent : undefined);
            const offsets = fanOffsets(events);
            return events.map((event) => (
              <Marker
                key={`${lane.id}-${event.id}`}
                offsetPx={offsets.get(event.id) ?? 0}
                event={event}
                scenarioId={lane.id}
                row={lane.row}
                active={lane.active}
                locked={inherited.has(event.id)}
                axisRef={axisRef}
                onMove={moveEvent}
                onSelect={selectLane}
              />
            ));
          })}

          <Scrubber month={month} enabled={enabled} lanesHeight={lanesHeight} crossings={crossings} onMonth={setActiveMonth} />
        </div>
      </div>
    </section>
  );
}
