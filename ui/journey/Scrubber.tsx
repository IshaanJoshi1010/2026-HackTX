"use client";

import type { KeyboardEvent } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel, usd } from "@/ui/profile/format";
import { IconButton } from "@/ui/shell/IconButton";
import { isSwapMonth, monthForKey, monthPercent, monthValueText, nextMilestone, selectedBranch } from "./playback";
import { HORIZON, type Journey } from "./types";

export interface ScrubberProps {
  journey: Journey;
  playing: boolean;
  /** Called at once, with a whole month from 0 to 60, for every drag step and key press. */
  onScrub(month: number): void;
  onTogglePlay(): void;
  className?: string;
}

const YEAR_MONTHS = [0, 12, 24, 36, 48, 60];

const RANGE_CLASS = [
  "absolute inset-0 size-full cursor-pointer appearance-none rounded-full bg-transparent",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
  // Webkit: a clear 44px track so the whole row takes a touch, and a 24px white thumb centred in it.
  "[&::-webkit-slider-runnable-track]:h-11 [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:mt-2.5 [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none",
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-ink",
  // Firefox.
  "[&::-moz-range-track]:h-11 [&::-moz-range-track]:bg-transparent",
  "[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink",
].join(" ");

/**
 * The control row under the road: play or pause, a month slider with a tick for every stop and a label for every year,
 * and one readout of where you are (the date, the car, the next milestone, the cost through this month).
 *
 * Presentational: everything comes from the Journey. It shows cost through the selected month and never the five year
 * totals, which live beside each branch's destination.
 */
export function Scrubber({ journey, playing, onScrub, onTogglePlay, className }: ScrubberProps) {
  const month = journey.month;
  const branch = selectedBranch(journey);
  const next = nextMilestone(journey);
  const through = branch.costThroughMonth;
  const swapNow = isSwapMonth(journey);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = monthForKey(e.key, month, HORIZON);
    if (target === null) return;
    // Every key is handled here so arrows, pages and the ends all behave the same in every browser.
    e.preventDefault();
    onScrub(target);
  };

  return (
    <section aria-label="Time scrubber" data-slot="scrubber" className={cn("flex flex-col gap-3 md:flex-row md:items-start md:gap-6", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconButton
          label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
          active={playing}
          onClick={onTogglePlay}
          className="size-11"
        >
          {playing ? <Pause className="fill-current" aria-hidden="true" /> : <Play className="fill-current" aria-hidden="true" />}
        </IconButton>

        <div className="min-w-0 flex-1">
          <div className="relative h-11">
            {/* The track and the played part, inset by half the 24px thumb so a month's percentage lands on the thumb's
                centre. No transition anywhere: scrubbing answers at once. */}
            <div aria-hidden="true" className="absolute inset-x-3 inset-y-0">
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink/20" />
              <div
                data-slot="played"
                className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent-ink"
                style={{ width: `${monthPercent(month)}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={HORIZON}
              step={1}
              value={month}
              aria-label="Selected month"
              aria-valuetext={monthValueText(journey.monthLabel, month)}
              onChange={(e) => onScrub(Math.min(HORIZON, Math.max(0, Math.round(Number(e.currentTarget.value)))))}
              onKeyDown={onKeyDown}
              className={RANGE_CLASS}
            />
          </div>

          <div aria-hidden="true" className="relative mx-3 h-7">
            {journey.stops.map((stop) => (
              <span
                key={stop}
                data-slot="tick"
                data-month={stop}
                className={cn("absolute top-0 h-2 w-px -translate-x-1/2", stop === month ? "bg-ink" : "bg-ink/50")}
                style={{ left: `${monthPercent(stop)}%` }}
              />
            ))}
            {YEAR_MONTHS.map((m) => (
              <span
                key={m}
                data-slot="year"
                data-month={m}
                className="absolute top-2.5 -translate-x-1/2 text-xs leading-4 text-ink/60"
                style={{ left: `${monthPercent(m)}%` }}
              >
                {monthLabel(m)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* One element that changes as one unit. Not a live region: the thumb's value text speaks for it. */}
      <div data-slot="scrubber-readout" aria-live="off" className="min-h-15 text-sm text-ink/70 md:w-80 md:shrink-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span data-slot="date" className="text-base font-medium tabular-nums text-ink">
            {journey.monthLabel}
          </span>
          <span data-slot="vehicle">{journey.vehicleNow.name}</span>
          {swapNow && (
            <span data-slot="swap-note" className="text-ink/60">
              <span aria-hidden="true">· </span>Swap this month
            </span>
          )}
        </p>
        {next && <p data-slot="next">{`Next: ${next.title}, in ${next.inLabel}`}</p>}
        {through !== null && (
          <p data-slot="through" data-source={branch.costSource} className={cn(journey.updating && "opacity-60")}>
            {`Through ${journey.monthLabel}: ${usd(through)}${journey.updating ? ", updating" : ""}`}
          </p>
        )}
      </div>
    </section>
  );
}
