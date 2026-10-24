"use client";

import { monthLabel } from "@/ui/profile/format";
import { MONTH_MAX, YEAR_TICKS, monthToPct, yearLabel } from "./layout";

export interface ScrubberProps {
  month: number;
  enabled: boolean;
  /** Height of the lanes above the tick labels, in px. */
  lanesHeight: number;
  /** Rows where the playhead crosses a lane: [{ row center y, active, visible }]. */
  crossings: Array<{ id: string; y: number; active: boolean }>;
  onMonth(m: number): void;
}

const LABEL_H = 28;

/**
 * The time axis: year labels, the playhead that crosses every lane, and an
 * invisible range input over the lanes so dragging, clicking, arrow keys and
 * screen readers all work. It writes the active month and nothing else.
 */
export function Scrubber({ month, enabled, lanesHeight, crossings, onMonth }: ScrubberProps) {
  const left = `${monthToPct(month)}%`;
  return (
    <>
      <input
        type="range"
        min={0}
        max={MONTH_MAX}
        step={1}
        value={month}
        disabled={!enabled}
        aria-label="Month"
        aria-valuetext={monthLabel(month)}
        onChange={(e) => onMonth(Number(e.target.value))}
        style={{ height: lanesHeight + LABEL_H }}
        className="absolute inset-x-0 top-0 z-10 w-full cursor-ew-resize appearance-none bg-transparent opacity-0 disabled:cursor-default [&::-moz-range-thumb]:h-0 [&::-moz-range-thumb]:w-0 [&::-moz-range-thumb]:border-0 [&::-webkit-slider-thumb]:h-0 [&::-webkit-slider-thumb]:w-0 [&::-webkit-slider-thumb]:appearance-none"
      />

      {/* Year labels */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ top: lanesHeight, height: LABEL_H }}>
        {YEAR_TICKS.map((t) => (
          <span
            key={t}
            className="absolute top-2 -translate-x-1/2 text-[11px] whitespace-nowrap text-ink/45 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${monthToPct(t)}%` }}
          >
            {yearLabel(t)}
          </span>
        ))}
      </div>

      {/* Playhead */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 z-[5] w-px -translate-x-1/2 bg-ink/70 transition-[left] duration-75"
        style={{ left, height: lanesHeight }}
      >
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-canvas">
          {monthLabel(month)}
        </span>
      </div>

      {/* Where the playhead meets each lane */}
      {crossings.map((c) => (
        <span
          key={c.id}
          aria-hidden="true"
          className={
            c.active
              ? "pointer-events-none absolute z-[6] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
              : "pointer-events-none absolute z-[6] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/60 bg-canvas"
          }
          style={{ left, top: c.y }}
        />
      ))}
    </>
  );
}
