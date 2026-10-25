"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
import { clampMonth, xToMonth, type Milestone } from "./layout";

export const EVENT_ICON: Record<EventType, LucideIcon> = {
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

export interface AxisRect {
  left: number;
  width: number;
}

export interface MarkerProps {
  event: LifeEvent;
  scenarioId: string;
  /** Pixel position of the signpost's center, in the road's own coordinates. */
  x: number;
  y: number;
  /** A decision inherited from before this future branched. It can be seen but only moved on the future that owns it. */
  locked?: boolean;
  /** The earliest month it can move to: the month its future starts. A future cannot rewrite what it inherited. */
  minMonth?: number;
  /** Where the road is on screen, for turning a drag into a month. */
  getAxis(): AxisRect | null;
  onMove(scenarioId: string, eventId: string, month: number): void;
  onSelect(month: number): void;
}

/**
 * One decision, as a signpost on the road. Drag it to a new month, or focus it and
 * use the arrow keys (Shift moves by six months). Click it to put the playhead there.
 */
export function Marker({ event, scenarioId, x, y, locked = false, minMonth = 0, getAxis, onMove, onSelect }: MarkerProps) {
  const Icon = EVENT_ICON[event.type];
  const [dragX, setDragX] = useState<number | null>(null);
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
    const axis = getAxis();
    if (!s || !axis) return;
    if (!s.moved && Math.abs(e.clientX - s.x) < DRAG_THRESHOLD) return;
    s.moved = true;
    const m = Math.max(minMonth, xToMonth(e.clientX, axis));
    setDragMonth(m);
    setDragX((m / 60) * axis.width);
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
    setDragX(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (locked) return;
    const step = e.shiftKey ? 6 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = Math.max(minMonth, clampMonth(event.month + (e.key === "ArrowRight" ? step : -step)));
      if (next !== event.month) onMove(scenarioId, event.id, next);
    }
  };

  return (
    <div
      className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={{ left: dragX ?? x, top: y }}
    >
      <button
        type="button"
        data-testid="event-marker"
        data-event-id={event.id}
        data-locked={locked}
        aria-label={`${title}, month ${event.month}.${locked ? " From an earlier future, so it cannot be moved here." : " Arrow keys move it."}`}
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
          onSelect(event.month);
        }}
        className={cn(
          "flex size-10 touch-none items-center justify-center rounded-full bg-canvas text-ink ring-2 ring-ink transition-transform duration-150",
          "hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
          locked ? "cursor-pointer" : dragMonth !== null ? "scale-110 cursor-grabbing" : "cursor-grab",
          // a rough guess gets a thinner ring, so it reads as less certain
          event.certainty === "vague" && "ring-1",
        )}
      >
        <Icon className="size-[18px]" />
      </button>

      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 mb-3 w-max max-w-[260px] -translate-x-1/2 rounded-md bg-ink px-3 py-2 text-sm text-canvas shadow-lg",
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
        <p className="mt-1 text-canvas/50">{locked ? "From an earlier future. Move it there." : CERTAINTY[event.certainty]}</p>
        {!locked && minMonth > 0 && month <= minMonth && (
          <p className="text-canvas/50">This future starts here, so it can only move later.</p>
        )}
      </div>
    </div>
  );
}

export interface MilestoneTickProps {
  milestone: Milestone;
  x: number;
  y: number;
}

/** A small hollow diamond on the road for something the projection says will happen. */
export function MilestoneTick({ milestone, x, y }: MilestoneTickProps) {
  return (
    <span
      data-testid="milestone"
      role="img"
      aria-label={`Month ${milestone.month}: ${milestone.text}`}
      title={`${monthLabel(milestone.month)}: ${milestone.text}`}
      className="absolute z-[4] size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-canvas bg-ink"
      style={{ left: x, top: y }}
    />
  );
}
