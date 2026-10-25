"use client";

import { useId } from "react";
import { usd } from "@/ui/profile/format";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { CostsPanel } from "@/ui/shell/CostsPanel";
import { useForkStore } from "@/ui/store/useForkStore";
import type { Journey } from "./types";

const th = "pb-1.5 pr-3 text-left text-sm font-normal text-ink/60 last:pr-0";
const td = "pr-3 align-top last:pr-0";

/**
 * The body of the "Compare costs" drawer. First the five year totals as a small text table, with one source label for
 * the group, then the cost chart with its month slider, readout and breakdown (CostsPanel). The totals come from the
 * journey and do not move when you scrub; the readout under the chart is the cost through the month on the slider.
 * There is no road here: the page already has one.
 *
 * Before the switch is compared only keeping is priced, and it says so, with a button that compares.
 */
export function CostsContent({ journey }: { journey: Journey }) {
  const headingId = useId();
  const compare = useForkStore((s) => s.actions.openReplaceComparison);
  const busy = useForkStore((s) => s.ui.busy);

  const { keep, difference } = journey;
  const other = journey.switch;
  const compared = other !== null && other.priced;
  const source = difference?.source ?? keep.costSource ?? other?.costSource;
  const otherModel = other?.endVehicle?.model;

  return (
    <div data-testid="costs-content" className="flex flex-col gap-10">
      <section aria-labelledby={headingId}>
        <div className="flex items-center justify-between gap-3">
          <h3 id={headingId} className="text-base font-medium text-ink">
            Modeled net cost over five years
          </h3>
          <SourceBadge compact source={source} />
        </div>

        <table data-testid="five-year-table" className="mt-4 w-full table-fixed">
          <thead>
            <tr>
              <th scope="col" className={th}>
                Keep
              </th>
              {compared && (
                <>
                  <th scope="col" className={th}>
                    Switch
                  </th>
                  <th scope="col" className={th}>
                    Difference
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-testid="five-year-keep" className={`${td} text-2xl font-medium tabular-nums text-ink`}>
                {keep.fiveYearCost === null ? <span className="text-base font-normal text-ink/60">No figure yet</span> : usd(keep.fiveYearCost)}
              </td>
              {compared && (
                <>
                  <td data-testid="five-year-switch" className={`${td} text-2xl font-medium tabular-nums text-ink`}>
                    {other.fiveYearCost === null ? <span className="text-base font-normal text-ink/60">No figure yet</span> : usd(other.fiveYearCost)}
                  </td>
                  <td data-testid="five-year-difference" className={`${td} text-base leading-6 text-ink/80`}>
                    {difference ? difference.phrase : <span className="text-ink/60">Not worked out yet</span>}
                  </td>
                </>
              )}
            </tr>
          </tbody>
        </table>

        {!compared && other !== null && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <p data-testid="costs-unpriced" className="text-base text-ink/70">
              The switch isn&apos;t priced yet.
            </p>
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void compare()}
              className="h-10 rounded-full bg-ink px-5 text-base font-medium text-canvas transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              {otherModel ? `Compare with the ${otherModel}` : "Compare the two cars"}
            </button>
          </div>
        )}
      </section>

      <section aria-label="Month by month">
        <h3 className="mb-4 text-base font-medium text-ink">Month by month</h3>
        <CostsPanel />
      </section>
    </div>
  );
}
