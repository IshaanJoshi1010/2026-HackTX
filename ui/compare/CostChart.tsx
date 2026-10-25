"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { specsFor } from "@/ui/store/selectors";
import { BASE_ID, useForkStore } from "@/ui/store/useForkStore";
import { useElementSize } from "@/ui/timeline/useElementSize";
import {
  X_AXIS_TITLE,
  X_TICKS,
  Y_AXIS_TITLE,
  buildLines,
  chartFrame,
  linePath,
  measuredMonth,
  plotHeight,
  plotWidth,
  pointOf,
  showEndLabels,
  spreadLabels,
  xOf,
  yDomain,
  yOf,
  yTickLabel,
  type ChartLine,
  type LineKind,
} from "./costChartMath";

/** Where the chart sits when nothing has been measured (tests, first paint). */
const FALLBACK = { width: 960, height: 340 };
/** Height for a chart this wide. Narrow screens get a little less. */
const heightFor = (width: number) => (width < 520 ? 280 : 340);

/** The lines to draw for the current store: the comparison if there is one, else the future you are looking at. */
export function useCostLines(): ChartLine[] {
  const results = useForkStore((s) => s.results);
  const comparison = useForkStore((s) => s.comparison);
  const activeScenarioId = useForkStore((s) => s.activeScenarioId);
  const twin = useForkStore((s) => s.twin);
  const replacement = useForkStore((s) => s.replacementVehicle);
  return useMemo(
    () =>
      buildLines({
        results,
        comparison,
        activeScenarioId,
        baseId: BASE_ID,
        ownVehicleId: twin?.vehicle.id,
        switchVehicleId: replacement?.id,
        modelName: (id) => (id === twin?.vehicle.id ? twin.vehicle.model : id === replacement?.id ? replacement.model : undefined),
      }),
    [results, comparison, activeScenarioId, twin, replacement],
  );
}

/** The label under a net cost number: where the figure comes from, for the car on the road at that month. */
export function useNetCostSource() {
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  return (vehicleId: string | undefined) => metricSource("netEconomicCost", profile, vehicleId ? specsFor(vehicleId) : null);
}

/** How each kind of line is drawn. Black and white only: solid, dashed, and thin and gray. */
const LINE_STYLE: Record<LineKind, { stroke: string; width: number; dash?: string; label: string }> = {
  keep: { stroke: "stroke-ink", width: 2, label: "fill-ink" },
  switch: { stroke: "stroke-ink", width: 2, dash: "7 6", label: "fill-ink/80" },
  baseline: { stroke: "stroke-ink/40", width: 1, label: "fill-ink/50" },
};

/** A short sample of a line, for the legend. */
export function LineSample({ kind, className }: { kind: LineKind; className?: string }) {
  const s = LINE_STYLE[kind];
  return (
    <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className={cn("shrink-0 overflow-visible", className)}>
      <line x1="0" x2="28" y1="4" y2="4" strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="butt" className={s.stroke} />
    </svg>
  );
}

/**
 * Net cost over five years as a plain line chart. Time across (ticks in years), dollars up. The future you keep is a
 * solid white line, the switch a dashed one, and "if nothing changes" a thin gray one. Every point is a number the
 * simulation produced, month 1 to 60, with $0 at the start.
 */
export function CostChart({ className }: { className?: string }) {
  const lines = useCostLines();
  const activeMonth = useForkStore((s) => s.activeMonth);
  const netCostSource = useNetCostSource();
  const [setNode, measured] = useElementSize<HTMLDivElement>(FALLBACK);

  const width = Math.max(320, measured.width);
  const height = heightFor(width);
  const frame = useMemo(() => chartFrame(width, height), [width, height]);
  const domain = useMemo(() => yDomain(lines), [lines]);
  const month = measuredMonth(activeMonth);

  if (lines.length === 0) {
    return (
      <p data-testid="cost-chart-empty" className="py-10 text-center text-base text-ink/60">
        Nothing to chart yet. Add a change and the cost over five years shows up here.
      </p>
    );
  }

  const plotBottom = frame.top + plotHeight(frame);
  const plotRight = frame.left + plotWidth(frame);
  const keep = lines.find((l) => l.kind === "keep");
  const labelYs = spreadLabels(
    lines.map((l) => yOf(l.points[l.points.length - 1].value, domain, frame)),
    16,
    frame.top + 6,
    plotBottom - 6,
  );
  const summary = `Net cost over five years for ${lines.map((l) => l.label).join(", ")}. Use the month slider to read the amounts.`;

  return (
    <figure data-testid="cost-chart" className={cn("w-full", className)}>
      <div ref={setNode} className="w-full">
        <svg
          role="img"
          aria-label={summary}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full max-w-full overflow-visible select-none"
        >
          {/* light gridlines: one per dollar tick, one per year */}
          <g data-testid="cost-chart-grid" aria-hidden="true">
            {domain.ticks.map((t) => (
              <line key={`h${t}`} x1={frame.left} x2={plotRight} y1={yOf(t, domain, frame)} y2={yOf(t, domain, frame)} className="stroke-ink/10" />
            ))}
            {X_TICKS.map((t) => (
              <line key={`v${t.month}`} x1={xOf(t.month, frame)} x2={xOf(t.month, frame)} y1={frame.top} y2={plotBottom} className="stroke-ink/10" />
            ))}
          </g>

          {/* dollar axis */}
          <g aria-hidden="true">
            {domain.ticks.map((t) => (
              <text
                key={t}
                data-testid="cost-chart-ytick"
                x={frame.left - 10}
                y={yOf(t, domain, frame)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink/60 text-xs tabular-nums"
              >
                {yTickLabel(t)}
              </text>
            ))}
            <text
              data-testid="cost-chart-ytitle"
              transform={`translate(14 ${frame.top + plotHeight(frame) / 2}) rotate(-90)`}
              textAnchor="middle"
              className="fill-ink/60 text-xs"
            >
              {Y_AXIS_TITLE}
            </text>
          </g>

          {/* time axis */}
          <g aria-hidden="true">
            {X_TICKS.map((t) => (
              <text
                key={t.month}
                data-testid="cost-chart-xtick"
                x={xOf(t.month, frame)}
                y={plotBottom + 20}
                textAnchor="middle"
                className="fill-ink/60 text-xs tabular-nums"
              >
                {t.label}
              </text>
            ))}
            <text
              data-testid="cost-chart-xtitle"
              x={frame.left + plotWidth(frame) / 2}
              y={plotBottom + 46}
              textAnchor="middle"
              className="fill-ink/60 text-xs"
            >
              {X_AXIS_TITLE}
            </text>
          </g>

          {/* baseline first so the lines you care about sit on top */}
          {[...lines].reverse().map((line) => {
            const style = LINE_STYLE[line.kind];
            const end = line.points[line.points.length - 1];
            return (
              <path
                key={line.kind}
                data-testid="cost-chart-line"
                data-line={line.kind}
                data-scenario={line.scenarioId}
                data-end-value={end.value}
                data-end-month={end.month}
                d={linePath(line.points, domain, frame)}
                fill="none"
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                strokeLinejoin="round"
                strokeLinecap="round"
                className={style.stroke}
              />
            );
          })}

          {/* where you are looking: a vertical marker, and a dot on each line */}
          <line
            data-testid="cost-chart-marker"
            data-month={month}
            x1={xOf(month, frame)}
            x2={xOf(month, frame)}
            y1={frame.top}
            y2={plotBottom}
            strokeWidth={1}
            className="stroke-ink/40"
          />
          {[...lines].reverse().map((line) => {
            const p = pointOf(line, month);
            if (!p) return null;
            return (
              <circle
                key={line.kind}
                data-testid="cost-chart-dot"
                data-line={line.kind}
                cx={xOf(month, frame)}
                cy={yOf(p.value, domain, frame)}
                r={line.kind === "baseline" ? 3 : 4.5}
                strokeWidth={2}
                className={cn(line.kind === "switch" ? "fill-canvas stroke-ink" : line.kind === "keep" ? "fill-ink stroke-canvas" : "fill-ink/50 stroke-canvas")}
              />
            );
          })}

          {/* the name of each line, right where it ends */}
          {showEndLabels(frame) &&
            lines.map((line, i) => (
              <text
                key={line.kind}
                data-testid="cost-chart-endlabel"
                data-line={line.kind}
                x={xOf(line.points[line.points.length - 1].month, frame) + 10}
                y={labelYs[i]}
                dy="0.32em"
                className={cn("text-xs", LINE_STYLE[line.kind].label)}
              >
                {line.label}
              </text>
            ))}
        </svg>
      </div>

      <figcaption data-testid="cost-chart-legend" className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink/70">
        {lines.map((line) => (
          <span key={line.kind} data-line={line.kind} className="inline-flex items-center gap-2">
            <LineSample kind={line.kind} />
            {line.label}
          </span>
        ))}
        {keep && <SourceBadge compact source={netCostSource(keep.points[keep.points.length - 1].vehicleId)} className="ml-auto" />}
      </figcaption>
    </figure>
  );
}
