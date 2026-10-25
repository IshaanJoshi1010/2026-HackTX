"use client";

import { CostChart, LineSample, useCostLines, useNetCostSource } from "@/ui/compare/CostChart";
import { MONTH_MAX, measuredMonth, pointOf } from "@/ui/compare/costChartMath";
import { monthLabel, usd } from "@/ui/profile/format";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { useForkStore } from "@/ui/store/useForkStore";
import { FutureDetails } from "./FutureDetails";

/**
 * The Costs tab: net cost over five years as a chart, a month slider, what each line costs at that month, and under
 * it what each change did to cost. Reads the store; takes no props.
 */
export function CostsPanel() {
  const lines = useCostLines();
  const activeMonth = useForkStore((s) => s.activeMonth);
  const setActiveMonth = useForkStore((s) => s.actions.setActiveMonth);
  const netCostSource = useNetCostSource();

  const month = measuredMonth(activeMonth);
  const empty = lines.length === 0;

  return (
    <section aria-label="Costs" data-testid="costs-panel" className="flex flex-col gap-10">
      <CostChart />

      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="w-14 shrink-0 text-sm text-ink/60">
            Month
          </span>
          {/* 1 to 60: the store's 0 means "not scrubbed yet" and shows month 60, so the slider starts at the first month. */}
          <input
            type="range"
            min={1}
            max={MONTH_MAX}
            step={1}
            value={month}
            disabled={empty}
            aria-label="Month"
            aria-valuetext={monthLabel(month)}
            onChange={(e) => setActiveMonth(Number(e.target.value))}
            className="h-8 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:h-0.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-ink/25 [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-ink/25 [&::-webkit-slider-thumb]:-mt-[7px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink"
          />
        </div>

        {!empty && (
          <div data-testid="cost-readout">
            <h2 className="text-sm text-ink/60">Net cost at {monthLabel(month)}</h2>
            <ul className="mt-2">
              {lines.map((line) => {
                const point = pointOf(line, month);
                return (
                  <li
                    key={line.kind}
                    data-testid="cost-readout-line"
                    data-line={line.kind}
                    className="flex items-center gap-4 border-b border-line py-3 last:border-b-0"
                  >
                    <LineSample kind={line.kind} />
                    <span className="min-w-0 flex-1 text-base text-ink">{line.label}</span>
                    {point ? (
                      <>
                        <span className="text-xl font-medium tabular-nums text-ink">{usd(point.value)}</span>
                        <SourceBadge compact source={netCostSource(point.vehicleId)} className="w-24 justify-end" />
                      </>
                    ) : (
                      <span className="text-sm text-ink/60">No figure for this month</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <FutureDetails />
    </section>
  );
}
