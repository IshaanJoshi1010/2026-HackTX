"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import {
  Car,
  Fuel,
  Gauge,
  MapPin,
  Package,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { EventType, LifeEvent } from "@/contracts";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { clampMonth, laneCenterY, monthToPct, xToMonth, type Lane, type Milestone } from "./layout";

const ICON: Record<EventType, LucideIcon> = {
  relocation: MapPin,
  mileage_change: Gauge,
  family_change: Users,
  cargo_change: Package,
  budget_change: Wallet,
  fuel_price_change: Fuel,
  maintenance_decision: Wrench,
  vehicle_replacement: Car,
};

const CERTAINTY: Record<LifeEvent["certainty"], string> = {
  clear: "You said this clearly",
  inferred: "Inferred from what you said",
  vague: "A rough guess",
};

/** Pointer movement under this many px counts as a click, not a drag. */
const DRAG_THRESHOLD = 4;

export interface MarkerProps {
  event: LifeEvent;
  scenarioId: string;
  row: number;
  active: boolean;
  /** An event inherited from before this future's fork. It can be seen but only moved on the future that owns it. */
  locked?: boolean;
  /** Pixels to nudge sideways so events in the same month do not overlap. Ignored while dragging. */
  offsetPx?: number;
  axisRef: RefObject<HTMLElement | null>;
  onMove(scenarioId: string, eventId: string, month: number): void;
  onSelect(scenarioId: string, month: number): void;
}

/**
 * One life event on a lane. Drag it to a new month, or focus it and use the
 * arrow keys (Shift moves by six months). Click to jump the playhead to it.
 */
export function Marker({ event, scenarioId, row, active, locked = false, offsetPx = 0, axisRef, onMove, onSelect }: MarkerProps) {
  const Icon = ICON[event.type];
  const [dragMonth, setDragMonth] = useState<number | null>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const month = dragMonth ?? event.month;
  const title = eventTitle(event);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (locked) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, moved: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    const axis = axisRef.current;
    if (!s || !axis) return;
    if (!s.moved && Math.abs(e.clientX - s.x) < DRAG_THRESHOLD) return;
    s.moved = true;
    setDragMonth(xToMonth(e.clientX, axis.getBoundingClientRect()));
  };

  const finish = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (s?.moved) {
      suppressClick.current = true;
      if (dragMonth !== null && dragMonth !== event.month) onMove(scenarioId, event.id, dragMonth);
    }
    setDragMonth(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 6 : 1;
    if (!locked && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const next = clampMonth(event.month + (e.key === "ArrowRight" ? step : -step));
      if (next !== event.month) onMove(scenarioId, event.id, next);
    }
  };

  return (
    <div
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{
        left: dragMonth !== null ? `${monthToPct(month)}%` : `calc(${monthToPct(month)}% + ${offsetPx}px)`,
        top: laneCenterY(row),
      }}
    >
      <button
        type="button"
        data-testid="event-marker"
        data-event-id={event.id}
        aria-label={`${title}, month ${event.month}.${locked ? " Inherited, so it cannot be moved here." : " Arrow keys move it."}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onSelect(scenarioId, event.month);
        }}
        className={cn(
          "flex size-7 touch-none items-center justify-center rounded-full transition-transform duration-150",
          "hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          locked ? "cursor-pointer" : dragMonth !== null ? "scale-110 cursor-grabbing" : "cursor-grab",
          active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-ink/50",
          // a rough guess gets a dashed outline, so it reads as less certain
          event.certainty === "vague" && "outline-1 outline-offset-2 outline-dashed outline-ink/60",
        )}
      >
        <Icon className="size-3.5" />
      </button>

      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-xs text-canvas shadow-lg",
          "opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100",
          dragMonth !== null && "opacity-100",
        )}
      >
        <p className="font-medium">{title}</p>
        <p className="text-canvas/60">
          {monthLabel(month)}
          {dragMonth !== null && dragMonth !== event.month ? ", release to move" : ""}
        </p>
        {event.quote && <p className="mt-1 text-canvas/80 italic">&ldquo;{event.quote}&rdquo;</p>}
        <p className="mt-1 text-canvas/50">
          {locked ? "From an earlier future. Move it there." : CERTAINTY[event.certainty]}
        </p>
      </div>
    </div>
  );
}

export interface MilestoneTicksProps {
  lane: Lane;
  milestones: Milestone[];
}

/** Small hollow diamonds on a lane for things the projection says will happen. */
export function MilestoneTicks({ lane, milestones }: MilestoneTicksProps) {
  return (
    <>
      {milestones
        .filter((m) => lane.parentRow === null || m.month >= lane.startMonth)
        .map((m) => (
          <span
            key={`${m.month}-${m.text}`}
            data-testid="milestone"
            role="img"
            aria-label={`Month ${m.month}: ${m.text}`}
            title={`${monthLabel(m.month)}: ${m.text}`}
            className="absolute z-[4] size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-ink/70 bg-canvas"
            style={{ left: `${monthToPct(m.month)}%`, top: laneCenterY(lane.row) }}
          />
        ))}
    </>
  );
}

