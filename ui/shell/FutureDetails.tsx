"use client";

import { measuredMonth } from "@/ui/compare/costChartMath";
import { customerText } from "@/ui/profile/customerText";
import { miles, monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { Stat } from "@/ui/profile/Stat";
import { selectActiveResult, selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { EVENT_ICON } from "@/ui/timeline/EventMarkers";
import { totalThrough, pointAt } from "@/ui/timeline/layout";
import { effectPhrase } from "@/ui/timeline/roadMath";
import { useDecisionEffects } from "@/ui/timeline/useDecisionEffects";

/**
 * The breakdown under the cost chart: what each change did to cost, then the numbers behind the future you are
 * looking at, at the month on the slider. All of it is computed, none of it typed in.
 */
export function FutureDetails() {
  const activeMonth = useForkStore((s) => s.activeMonth);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const scenario = useForkStore(selectActiveScenario);
  const result = useForkStore(selectActiveResult);

  // The store keeps 0 for "not scrubbed yet", which reads as the end of the five years.
  const month = measuredMonth(activeMonth);
  const effects = useDecisionEffects(scenario, month);
  const point = pointAt(result, month);
  const spec = point ? specsFor(point.vehicleId) : null;
  const src = (m: Parameters<typeof metricSource>[0]) => metricSource(m, profile, spec);

  return (
    <section aria-label="Breakdown" data-testid="future-details" className="fork-page flex flex-col gap-12 pt-2">
      <div>
        <h2 className="text-lg font-medium text-ink">What each change did to cost, by {monthLabel(month)}</h2>
        {scenario && <p className="mt-1 text-sm text-ink/60">{customerText(scenario.name)}</p>}
        {effects.length === 0 ? (
          <p className="py-4 text-sm text-ink/60">No decisions yet, so nothing has changed.</p>
        ) : (
          <ul className="mt-2">
            {effects.map(({ event, title, month: at, costDelta, fitNote }) => {
              const Icon = EVENT_ICON[event.type];
              return (
                <li key={event.id} data-testid="decision-effect" className="flex items-start gap-4 border-b border-line py-4 last:border-b-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink/10">
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-ink">{title}</p>
                    <p className="text-sm text-ink/60">
                      {at === 0 ? "Now" : `In ${monthLabel(at)}`}
                      {fitNote ? `. ${fitNote}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <p className="text-base font-medium tabular-nums text-ink">{effectPhrase(costDelta, usd)}</p>
                    <SourceBadge compact source={src("netEconomicCost")} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {point && (
        <div>
          <h2 className="mb-6 text-lg font-medium text-ink">The numbers behind it, at {monthLabel(month)}</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            <Stat label="Odometer" value={miles(point.mileage)} source={src("mileage")} />
            <Stat label="Fuel so far" value={usd(totalThrough(result, month, "fuelSpend") ?? 0)} source={src("fuelSpend")} />
            <Stat label="Upkeep so far" value={usd(totalThrough(result, month, "maintenanceSpend") ?? 0)} source={src("maintenanceSpend")} />
            <Stat label="Resale value" value={usd(point.vehicleValue)} source={src("vehicleValue")} />
          </div>
        </div>
      )}

      {result && result.warnings.length > 0 && (
        <p className="mx-auto max-w-2xl text-center text-xs leading-5 text-ink/50">{customerText(result.warnings.join(" "))}</p>
      )}
    </section>
  );
}
