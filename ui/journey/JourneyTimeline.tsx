"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { monthLabel, usd } from "@/ui/profile/format";
import { useElementSize } from "@/ui/timeline/useElementSize";
import { DEFAULT_SIZE, HIT_WIDTH, buildRoad, calendarLabeler, monthFromX, pointOnRoad, type MarkerLayout, type PlacedLabel, type Road, type RoadEvent } from "./roadGeometry";
import type { FutureKind, Journey, JourneyBranch, JourneyEvent } from "./types";

export interface JourneyTimelineProps {
  journey: Journey;
  /** The month under the pointer while dragging along the road: a whole month, 0 to 60. */
  onScrub(month: number): void;
  onSelectEvent(id: string): void;
  onSelectFuture(kind: FutureKind): void;
  /** The switch has no cost yet: its path and its destination ask for the comparison. */
  onCompare(): void;
  reducedMotion?: boolean;
  className?: string;
}

/** One quick ring when an event was just changed. It runs once. Only written to the page when something needs it. */
const RING_CSS = "@keyframes jt-ring{from{transform:scale(.6);opacity:.8}to{transform:scale(2.4);opacity:0}}.jt-ring{animation:jt-ring 1200ms ease-out 1 both}";

const MOVE = "transition-transform duration-[250ms] ease-out";

/**
 * The Future page's road: one large drawing of the next five years, and nothing else. It takes a `Journey` and calls back,
 * so it can be built and tested with no store.
 *
 * Time is a straight line. The month under the marker, an event's place and the split are all `timePos(month)` and
 * nothing moves them. The bends of the road are decoration (see roadGeometry: they depend on the month alone), so a path
 * going up or down means nothing. The five-year cost beside each destination is the model's month 60 figure and never the
 * month-dependent one, so scrubbing cannot change it.
 */
export function JourneyTimeline({ journey, onScrub, onSelectEvent, onSelectFuture, onCompare, reducedMotion = false, className }: JourneyTimelineProps) {
  const [setNode, size] = useElementSize<HTMLDivElement>(DEFAULT_SIZE);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const { keep, switch: sw } = journey;
  const swap = journey.events.find((e) => e.kind === "swap");
  const splitMonth = sw ? (sw.splitMonth ?? swap?.month ?? null) : null;

  // Only what shapes the road: so costs, the month and the selected event can change without redrawing it.
  const eventsKey = JSON.stringify(journey.events.map(({ id, month, kind, futures, title, dateLabel }) => ({ id, month, kind, futures, title, dateLabel })));
  const roadEvents = useMemo(() => JSON.parse(eventsKey) as RoadEvent[], [eventsKey]);
  const road = useMemo(
    () => buildRoad({ width: size.width, events: roadEvents, splitMonth, selectedFuture: journey.selectedFuture }),
    [size.width, roadEvents, splitMonth, journey.selectedFuture],
  );

  const frame = road.frame;
  const horizontal = road.orientation === "horizontal";
  const still = reducedMotion;
  const glide = !still && !dragging;
  const byId = new Map(journey.events.map((e) => [e.id, e]));
  const dateOf = calendarLabeler(journey.monthLabel, journey.month);
  const dateName = (m: number): string => dateOf?.(m) ?? monthLabel(m);
  const marker = pointOnRoad(road, road.selectedFuture, journey.month);
  const keepSelected = road.selectedFuture === "keep";
  const needsRing = !still && journey.events.some((e) => e.changed);

  const alongRoad = (e: PointerEvent<SVGPathElement>): number => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return 0;
    return horizontal ? (e.clientX - box.left) * (box.width > 0 ? frame.width / box.width : 1) : (e.clientY - box.top) * (box.height > 0 ? frame.height / box.height : 1);
  };
  const scrub = (e: PointerEvent<SVGPathElement>) => onScrub(monthFromX(frame, alongRoad(e)));
  const release = (e: PointerEvent<SVGPathElement>) => {
    draggingRef.current = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      // nothing was captured
    }
  };
  const press = (e: PointerEvent<SVGPathElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    draggingRef.current = true;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // a pointer that cannot be captured still scrubs on move
    }
    scrub(e);
  };
  const drag = (e: PointerEvent<SVGPathElement>) => {
    if (draggingRef.current) scrub(e);
  };

  // The path that is not selected: tap it to look at it, or to compare when it is the offer with no cost yet.
  const pickOther = () => (keepSelected && sw && !sw.priced ? onCompare() : onSelectFuture(keepSelected ? "switch" : "keep"));

  return (
    <div
      ref={setNode}
      role="group"
      aria-label="Your next five years"
      data-testid="journey-timeline"
      data-orientation={road.orientation}
      data-month={journey.month}
      className={cn("relative isolate w-full select-none", className)}
      style={{ height: frame.height }}
    >
      {needsRing && <style>{RING_CSS}</style>}
      <p className="sr-only">{summary(journey, dateName)}</p>

      <svg ref={svgRef} aria-hidden="true" data-testid="journey-road" width={frame.width} height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0">
        <line x1={road.axis.line.x1} y1={road.axis.line.y1} x2={road.axis.line.x2} y2={road.axis.line.y2} className="stroke-ink/20" strokeWidth={1} />
        {road.axis.ticks.map((t) => (
          <g key={t.month} data-testid="road-axis-tick" data-month={t.month}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} className="stroke-ink/30" strokeWidth={1} />
            <text x={t.text.x} y={t.text.y1} textAnchor={t.text.anchor} className="fill-ink/70 text-xs">
              {monthLabel(t.month)}
            </text>
            <text x={t.text.x} y={t.text.y2} textAnchor={t.text.anchor} className="fill-ink/45 text-xs">
              {dateName(t.month)}
            </text>
          </g>
        ))}

        {road.paths.switch && sw && (
          <path
            d={road.paths.switch}
            data-testid="road-path-switch"
            data-dashed={!sw.priced}
            data-selected={!keepSelected}
            data-split-month={road.splitMonth ?? undefined}
            data-split-x={road.split ? road.split.x : undefined}
            data-split-y={road.split ? road.split.y : undefined}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={sw.priced ? undefined : "5 7"}
            className={cn(keepSelected ? "stroke-ink/35" : "stroke-ink", glide && "transition-[stroke,stroke-width] duration-[250ms]")}
            style={{ strokeWidth: keepSelected ? 1.5 : 2 }}
          />
        )}
        <path
          d={road.paths.keep}
          data-testid="road-path-keep"
          data-dashed={false}
          data-selected={keepSelected}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(keepSelected ? "stroke-ink" : "stroke-ink/35", glide && "transition-[stroke,stroke-width] duration-[250ms]")}
          style={{ strokeWidth: keepSelected ? 2 : 1.5 }}
        />
        {road.paths.trunk && <path d={road.paths.trunk} data-testid="road-path-trunk" fill="none" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" strokeWidth={2} />}

        {Object.values(road.labels).map((l) =>
          l?.leader ? <line key={l.id} data-testid="label-leader" x1={l.leader.x1} y1={l.leader.y1} x2={l.leader.x2} y2={l.leader.y2} className="stroke-ink/25" strokeWidth={1} /> : null,
        )}

        {/* The other future: tap it to look at it (or to compare, when it has no cost yet). */}
        {road.paths.other && (
          <path
            d={road.paths.other}
            data-testid="road-hit-other"
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ cursor: "pointer" }}
            onClick={pickOther}
          />
        )}
        {/* The selected future: press and drag anywhere along it to move through time. */}
        <path
          d={road.paths.scrub}
          data-testid="road-hit"
          fill="none"
          stroke="transparent"
          strokeWidth={HIT_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={press}
          onPointerMove={drag}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        />
      </svg>

      {road.markers.map((m) => {
        const event = byId.get(m.id);
        const label = road.labels[m.id];
        return event && label ? <EventLabel key={m.id} event={event} label={label} selected={journey.selectedEventId === m.id} glide={glide} onSelect={() => onSelectEvent(m.id)} /> : null;
      })}

      {road.markers.map((m) => {
        const event = byId.get(m.id);
        return event ? <EventMarker key={m.id} event={event} layout={m} horizontal={horizontal} selected={journey.selectedEventId === m.id} glide={glide} still={still} onSelect={() => onSelectEvent(m.id)} /> : null;
      })}

      <div
        aria-hidden="true"
        data-testid="time-marker"
        data-month={journey.month}
        data-future={road.selectedFuture}
        data-dragging={dragging}
        data-x={marker.x}
        data-y={marker.y}
        className={cn("pointer-events-none absolute top-0 left-0 z-30 size-6", glide && MOVE)}
        style={{ transform: `translate(${marker.x - 12}px, ${marker.y - 12}px)` }}
      >
        <span className={cn("absolute bg-ink/60", horizontal ? "top-0 left-1/2 h-6 w-px -translate-x-1/2" : "top-1/2 left-0 h-px w-6 -translate-y-1/2")} />
        <span className="absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
      </div>

      <Destination branch={keep} rect={road.destinations.keep} glide={glide} onPick={() => onSelectFuture("keep")} />
      {sw && road.destinations.switch && <Destination branch={sw} rect={road.destinations.switch} glide={glide} onPick={() => (sw.priced ? onSelectFuture("switch") : onCompare())} />}
    </div>
  );
}

/** What a screen reader gets in place of the drawing. */
function summary(journey: Journey, dateName: (m: number) => string): string {
  const route = (b: JourneyBranch): string => {
    const [first, ...rest] = b.segments;
    if (!first) return b.title;
    if (rest.length === 0) return `${first.model} for five years`;
    return `${first.model} until ${dateName(first.toMonth)}, then ${rest.map((s) => s.model).join(", then ")}`;
  };
  const life = journey.events.filter((e) => e.kind === "life").length;
  const events = life === 0 ? "No events yet." : life === 1 ? "1 event." : `${life} events.`;
  const parts = [`Keep: ${route(journey.keep)}.`];
  if (journey.switch) parts.push(`Switch: ${route(journey.switch)}${journey.switch.priced ? "" : ", not compared yet"}.`);
  return [...parts, events].join(" ");
}

function EventMarker({ event, layout, horizontal, selected, glide, still, onSelect }: { event: JourneyEvent; layout: MarkerLayout; horizontal: boolean; selected: boolean; glide: boolean; still: boolean; onSelect(): void }) {
  const { rect, dots } = layout;
  const swap = layout.kind === "swap";
  const at = (d: { x: number; y: number }) => ({ x: d.x - rect.x, y: d.y - rect.y });
  const [a, b] = dots.map(at);
  return (
    <button
      type="button"
      data-testid="event-marker"
      data-event-id={event.id}
      data-month={event.month}
      data-shape={layout.shape}
      data-on={layout.on}
      data-changed={event.changed}
      aria-pressed={selected}
      aria-label={`${event.title}, ${event.dateLabel}`}
      onClick={onSelect}
      className={cn(
        "group absolute top-0 left-0 z-20 cursor-pointer rounded-md",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        glide && MOVE,
      )}
      style={{ width: rect.w, height: rect.h, transform: `translate(${rect.x}px, ${rect.y}px)` }}
    >
      {b && (
        <span
          aria-hidden="true"
          className={cn("absolute", selected ? "bg-ink" : "bg-ink/35")}
          style={horizontal ? { left: a.x - 0.5, top: a.y, width: 1, height: b.y - a.y } : { left: a.x, top: a.y - 0.5, width: b.x - a.x, height: 1 }}
        />
      )}
      {[a, b].map((d, i) =>
        d ? (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "absolute border-[1.5px] border-ink group-hover:bg-ink/30",
              !still && "transition-colors duration-[250ms]",
              swap ? "size-2.5 rotate-45 rounded-[1px]" : "size-2.5 rounded-full",
              selected ? "bg-ink shadow-[0_0_0_3px_#000,0_0_0_4.5px_rgb(255_255_255/0.8)] group-hover:bg-ink" : "bg-canvas",
            )}
            style={{ left: d.x - 5, top: d.y - 5 }}
          >
            {event.changed && !still && i === 0 && <span className="jt-ring pointer-events-none absolute -inset-1 rounded-full border border-ink" />}
          </span>
        ) : null,
      )}
    </button>
  );
}

function EventLabel({ event, label, selected, glide, onSelect }: { event: JourneyEvent; label: PlacedLabel; selected: boolean; glide: boolean; onSelect(): void }) {
  const { rect } = label;
  const tone = selected ? "text-ink" : "text-ink/75";
  return (
    <div
      aria-hidden="true"
      data-testid="event-label"
      data-event-id={event.id}
      data-compact={label.compact}
      onClick={onSelect}
      className={cn("absolute top-0 left-0 z-10 cursor-pointer overflow-hidden", label.align === "end" ? "text-right" : "text-left", glide && MOVE)}
      style={{ width: rect.w, height: rect.h, transform: `translate(${rect.x}px, ${rect.y}px)` }}
    >
      {label.compact ? (
        <span className="block truncate text-sm leading-5">
          <span className="text-xs text-ink/60">{event.dateLabel}</span> <span className={cn(tone, selected && "font-medium")}>{event.title}</span>
        </span>
      ) : (
        <>
          <span className="block text-xs leading-4 text-ink/60">{event.dateLabel}</span>
          <span className={cn("line-clamp-2 block text-sm leading-[18px]", tone, selected && "font-medium")}>{event.title}</span>
        </>
      )}
    </div>
  );
}

function Destination({ branch, rect, glide, onPick }: { branch: JourneyBranch; rect: Road["destinations"]["keep"]; glide: boolean; onPick(): void }) {
  const small = rect.w < 150; // two side by side on a phone
  return (
    <button
      type="button"
      data-testid="destination"
      data-future={branch.kind}
      aria-pressed={branch.selected}
      onClick={onPick}
      className={cn(
        "absolute z-20 flex cursor-pointer flex-col justify-center overflow-hidden rounded-lg border px-3 py-2 text-left",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        branch.selected ? "border-ink text-ink" : "border-ink/20 text-ink/65 hover:border-ink/50 hover:text-ink",
        glide && "transition-colors duration-[250ms]",
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <span className="line-clamp-2 text-sm leading-[18px] font-medium">{branch.title}</span>
      {branch.priced && branch.fiveYearCost !== null ? (
        <>
          <span className={cn("font-bold tracking-tight tabular-nums", small ? "text-[22px] leading-[28px]" : "text-[26px] leading-[30px]")}>{usd(branch.fiveYearCost)}</span>
          <span className="truncate text-xs leading-4 text-ink/60">over five years</span>
        </>
      ) : (
        <>
          <span className={cn("font-bold tracking-tight", small ? "text-[22px] leading-[28px]" : "text-[26px] leading-[30px]")}>Compare</span>
          <span className="truncate text-xs leading-4 text-ink/60">five-year cost</span>
        </>
      )}
      {branch.endVehicle && <span className="truncate text-xs leading-4 text-ink/60">{branch.endVehicle.name}</span>}
    </button>
  );
}
