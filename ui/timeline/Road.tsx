"use client";

import { useMemo } from "react";
import type { LifeEvent } from "@/contracts";
import { cn } from "@/lib/utils";
import { monthLabel, signedUsd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { eventTitle } from "@/ui/store/eventLabels";
import { specsFor } from "@/ui/store/selectors";
import { BASE_ID, useForkStore } from "@/ui/store/useForkStore";
import { MONTH_MAX, YEAR_TICKS, decisionsOf, fanOffsets, inheritedIds, milestonesOf, pointAt, yearLabel } from "./layout";
import { MilestoneTick, Marker } from "./EventMarkers";
import {
  assignLevels,
  deltaAt,
  deltaSeries,
  drawnRange,
  levelOffset,
  roadMid,
  roadPath,
  roadX,
  roadY,
  smoothSeries,
  spreadLabels,
  type Frame,
} from "./roadMath";
import { useElementSize } from "./useElementSize";

const AXIS_H = 36;
/** Room on the right for the names of the other futures, only when they are shown. */
const GUTTER = 220;
/** Labels closer than this (sideways) go on different levels. */
const LABEL_MIN_DX = 170;
const LABEL_H = 44;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Your road. The straight line is "if nothing changes". The road bends away from it by
 * how much your decisions changed your net cost: down costs more, up saves money.
 * Each decision is a signpost you can drag. The other futures only appear if asked for.
 */
export function Road() {
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const month = useForkStore((s) => s.activeMonth);
  const compare = useForkStore((s) => s.ui.futureCompare);
  const enabled = useForkStore((s) => s.phase === "workspace");
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const { setActiveScenario, setActiveMonth, moveEvent } = useForkStore((s) => s.actions);

  const [setNode, size, node] = useElementSize<HTMLDivElement>();

  const byId = useMemo(() => new Map(scenarios.map((s) => [s.id, s])), [scenarios]);
  const baseline = results[BASE_ID];
  const seriesById = useMemo(
    () => new Map(scenarios.map((s) => [s.id, deltaSeries(results[s.id], baseline)])),
    [scenarios, results, baseline],
  );

  // Smoothed copies are only for drawing. Every number on screen comes from the raw series.
  const drawById = useMemo(() => new Map([...seriesById].map(([id, series]) => [id, smoothSeries(series)])), [seriesById]);

  const active = byId.get(activeId) ?? scenarios[0];
  if (!active) return null;

  const isBase = active.id === BASE_ID;
  const showAll = compare && scenarios.length > 1;
  const drawn = showAll ? scenarios : [active];
  const activeSeries = seriesById.get(active.id) ?? [];
  const activeDraw = drawById.get(active.id) ?? [];

  // Geometry. The road area is the full width, minus the name column when other futures show.
  const roadW = Math.max(240, size.width - (showAll ? GUTTER : 0));
  const frame: Frame = {
    width: roadW,
    height: Math.max(220, size.height - AXIS_H),
    padTop: clamp(size.height * 0.3, 112, 150),
    padBottom: clamp(size.height * 0.2, 56, 90),
  };
  const range = drawnRange(drawn.map((s) => seriesById.get(s.id) ?? []));
  const yOf = (delta: number) => roadY(delta, range, frame);
  const mid = roadMid(frame);
  const hasDrift = drawn.some((s) => (seriesById.get(s.id) ?? []).some((p) => Math.abs(p.delta) >= 1));

  // The playhead and what the decisions have done by then.
  const delta = deltaAt(activeSeries, month) ?? 0;
  const px = roadX(month, roadW);
  const py = yOf(deltaAt(activeDraw, month) ?? 0); // where the road is, for the dot
  const point = pointAt(results[active.id], month);
  const source = point ? metricSource("netEconomicCost", profile, specsFor(point.vehicleId)) : undefined;

  // Signposts: every decision in this future, with labels kept from overlapping.
  const decisions = decisionsOf(active);
  const parent = active.parentId ? byId.get(active.parentId) : undefined;
  const inherited = inheritedIds(parent);
  const offsets = fanOffsets(decisions);
  const posts = decisions.map((e) => ({
    e,
    x: roadX(e.month, roadW) + (offsets.get(e.id) ?? 0),
    y: yOf(deltaAt(activeDraw, e.month) ?? 0),
  }));
  const levels = assignLevels(posts.map((p) => ({ id: p.e.id, x: p.x })), LABEL_MIN_DX);

  const milestones = milestonesOf(results[active.id]);
  const getAxis = () => (node ? { left: node.getBoundingClientRect().left, width: roadW } : null);

  // Where each future's road ends, for the name column.
  const ends = showAll
    ? scenarios.map((s) => {
        const series = seriesById.get(s.id) ?? [];
        const last = deltaAt(series, MONTH_MAX) ?? series.at(-1)?.delta ?? 0;
        return { s, delta: last, y: yOf(last) };
      })
    : [];
  const spread = spreadLabels(ends.map((e) => e.y), 50, 24, frame.height - 24);

  const endDelta = deltaAt(activeSeries, MONTH_MAX) ?? 0;
  const summary = isBase
    ? "Your road is straight: nothing has changed."
    : `Your road at ${monthLabel(month)} costs ${signedUsd(delta)} compared with if nothing changes.`;

  return (
    <div
      ref={setNode}
      data-testid="road"
      className="relative w-full select-none"
      style={{ height: "clamp(320px, 44vh, 460px)" }}
    >
      <p className="sr-only">{summary}</p>

      <svg
        width={roadW}
        height={frame.height}
        viewBox={`0 0 ${roadW} ${frame.height}`}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
      >
        {YEAR_TICKS.map((t) => (
          <line key={t} x1={roadX(t, roadW)} x2={roadX(t, roadW)} y1={0} y2={frame.height} className="stroke-ink/[0.07]" />
        ))}

        {!isBase && (
          <line
            data-testid="road-baseline"
            x1={0}
            x2={roadW}
            y1={mid}
            y2={mid}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="1 9"
            className="stroke-ink/45"
          />
        )}

        {showAll &&
          scenarios
            .filter((s) => s.id !== active.id && s.id !== BASE_ID)
            .map((s) => (
              <path
                key={s.id}
                data-testid="road-other"
                data-scenario-id={s.id}
                d={roadPath(drawById.get(s.id) ?? [], range, frame)}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-ink/35"
              />
            ))}

        {/* the road you are looking at: a wide white road with a dark center line */}
        <g key={active.id}>
          <path
            data-testid="road-active"
            d={roadPath(activeDraw, range, frame)}
            pathLength={1}
            fill="none"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="fork-draw stroke-ink"
          />
          <path
            d={roadPath(activeDraw, range, frame)}
            fill="none"
            strokeWidth={2}
            strokeDasharray="10 14"
            style={{ "--d": "700ms" } as React.CSSProperties}
            className="fork-fade stroke-canvas"
          />
        </g>

        {/* the playhead, and the gap between your road and "if nothing changes" */}
        <line x1={px} x2={px} y1={isBase ? 34 : 100} y2={frame.height - frame.padBottom + 36} strokeWidth={1} className="stroke-ink/40" />
        {!isBase && Math.abs(py - mid) > 3 && (
          <line x1={px} x2={px} y1={mid} y2={py} strokeWidth={2} strokeDasharray="3 5" className="stroke-ink/70" />
        )}
      </svg>

      <input
        type="range"
        min={0}
        max={MONTH_MAX}
        step={1}
        value={month}
        disabled={!enabled}
        aria-label="Month"
        aria-valuetext={monthLabel(month)}
        onChange={(e) => setActiveMonth(Number(e.target.value))}
        style={{ width: roadW, height: frame.height }}
        className="absolute left-0 top-0 z-10 cursor-ew-resize appearance-none bg-transparent opacity-0 disabled:cursor-default [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:appearance-none"
      />

      {hasDrift && (
        <>
          <span className="pointer-events-none absolute left-0 text-[11px] text-ink/35" style={{ top: frame.padTop - 28 }}>
            Saves money
          </span>
          <span className="pointer-events-none absolute left-0 text-[11px] text-ink/35" style={{ top: frame.height - frame.padBottom + 14 }}>
            Costs more
          </span>
        </>
      )}

      {milestones.map((m) => (
        <MilestoneTick key={`${m.month}-${m.text}`} milestone={m} x={roadX(m.month, roadW)} y={yOf(deltaAt(activeDraw, m.month) ?? 0)} />
      ))}

      {posts.map(({ e, x, y }) => {
        let off = levelOffset(levels.get(e.id) ?? 0);
        // never let a label run off the top or the bottom: flip it to the other side
        if (off < 0 && y + off - LABEL_H < 0) off = -off;
        else if (off > 0 && y + off + LABEL_H > frame.height + 16) off = -off;
        return (
          <div key={e.id}>
            <Marker
              event={e}
              scenarioId={active.id}
              x={x}
              y={y}
              locked={inherited.has(e.id)}
              minMonth={active.parentId ? active.forkMonth : 0}
              getAxis={getAxis}
              onMove={moveEvent}
              onSelect={setActiveMonth}
            />
            <DecisionLabel event={e} x={x} y={y + off} above={off < 0} />
          </div>
        );
      })}

      {/* you are here, on the road */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-[6] size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-[5px] ring-canvas"
        style={{ left: px, top: py }}
      />
      {/* the month, and what your decisions have done to the road by then, above everything else */}
      <div
        data-testid="road-readout"
        className="pointer-events-none absolute z-[7] -translate-x-1/2 text-center"
        style={{ left: clamp(px, 96, roadW - 96), top: 0 }}
      >
        <span className="inline-block rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-canvas">
          {monthLabel(month)}
        </span>
        {!isBase && (
          <div data-testid="road-effect" className="mt-2">
            <p className="text-[26px] leading-none font-medium tabular-nums text-ink">{signedUsd(delta)}</p>
            <p className="mt-1 text-xs whitespace-nowrap text-ink/60">{Math.round(delta) === 0 ? "same as if nothing changed" : "vs. if nothing changes"}</p>
            <SourceBadge compact source={source} className="justify-center" />
          </div>
        )}
      </div>

      {!isBase && !showAll && hasDrift && (
        <span
          className="pointer-events-none absolute text-xs text-ink/45"
          style={{ right: 0, top: mid + (endDelta > 0 ? -26 : 14) }}
        >
          If nothing changes
        </span>
      )}

      {scenarios.length <= 1 && (
        <p data-testid="road-empty" className="pointer-events-none absolute inset-x-0 text-center text-sm text-ink/50" style={{ top: mid + 56 }}>
          Your road is straight because nothing has changed yet.
          <br />
          Tell Fork what is coming and watch it bend.
        </p>
      )}

      {/* year labels */}
      <div aria-hidden="true" className="pointer-events-none absolute left-0" style={{ top: frame.height, width: roadW, height: AXIS_H }}>
        {YEAR_TICKS.map((t) => (
          <span
            key={t}
            className="absolute top-2 -translate-x-1/2 text-xs whitespace-nowrap text-ink/45 first:translate-x-0 last:-translate-x-full"
            style={{ left: roadX(t, roadW) }}
          >
            {yearLabel(t)}
          </span>
        ))}
      </div>

      {/* the other futures, by name, where each road ends */}
      {showAll &&
        ends.map(({ s, delta: end }, i) => {
          const isActive = s.id === active.id;
          return (
            <button
              key={s.id}
              type="button"
              data-testid="road-future"
              aria-current={isActive ? "true" : undefined}
              onClick={() => setActiveScenario(s.id)}
              className={cn(
                "absolute z-20 -translate-y-1/2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                isActive ? "text-ink" : "text-ink/55 hover:text-ink",
              )}
              style={{ left: roadW + 18, top: spread[i], width: GUTTER - 28 }}
            >
              <span className={cn("block truncate text-[15px]", isActive && "font-medium")}>{s.name}</span>
              <span className="block text-xs tabular-nums text-ink/50">{s.id === BASE_ID ? "if nothing changes" : `${signedUsd(end)} by 5 yr`}</span>
            </button>
          );
        })}
    </div>
  );
}

function DecisionLabel({ event, x, y, above }: { event: LifeEvent; x: number; y: number; above: boolean }) {
  return (
    <div
      data-testid="decision-label"
      className="pointer-events-none absolute z-10 rounded bg-canvas px-2 py-0.5 text-center"
      style={{ left: x, top: y, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}
    >
      <DecisionText event={event} />
    </div>
  );
}

function DecisionText({ event }: { event: LifeEvent }) {
  return (
    <>
      <p className="text-[15px] leading-tight font-medium whitespace-nowrap text-ink">{eventTitle(event)}</p>
      <p className="mt-0.5 text-xs whitespace-nowrap text-ink/50">{`in ${monthLabel(event.month)}`.replace("in Now", "now")}</p>
    </>
  );
}
