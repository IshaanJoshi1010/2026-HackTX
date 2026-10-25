"use client";

import { useMemo } from "react";
import { sim } from "@/ui/mocks";
import { miles, monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { Stat } from "@/ui/profile/Stat";
import { selectActivePoint, selectActiveResult, selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { MONTH_MAX, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { EVENT_ICON } from "@/ui/timeline/EventMarkers";
import { decisionEffects } from "@/ui/timeline/effects";
import { totalThrough } from "@/ui/timeline/layout";
import { effectPhrase } from "@/ui/timeline/roadMath";

/**
 * Opt-in detail under the road: what each decision changed, the numbers at the
 * playhead, and notes about the projection. All of it is computed, none of it typed in.
 */
export function FutureDetails() {
  const twin = useForkStore((s) => s.twin);
  const explore = useForkStore((s) => s.explore);
  const replacementVehicle = useForkStore((s) => s.replacementVehicle);
  const month = useForkStore((s) => s.activeMonth);
  const scenario = useForkStore(selectActiveScenario);
  const result = useForkStore(selectActiveResult);
  const point = useForkStore(selectActivePoint);

  const measureAt = month > 0 ? month : MONTH_MAX;
  const inputs = useMemo(() => simulationInputs({ twin, explore, replacementVehicle }), [twin, explore, replacementVehicle]);
  const effects = useMemo(
    () =>
      inputs && scenario
        ? decisionEffects({ scenario, result, month: measureAt, simulate: (s) => sim.simulate(inputs.twin, s, inputs.ctx) })
        : [],
    [inputs, scenario, result, measureAt],
  );

  const profile = explore.confirmedProfile;
  const spec = point ? specsFor(point.vehicleId) : null;
  const src = (m: Parameters<typeof metricSource>[0]) => metricSource(m, profile, spec);

  return (
    <section aria-label="Details" data-testid="future-details" className="fork-page flex flex-col gap-14 pt-2">
      <div>
        <h2 className="mb-1 text-sm text-ink/50">What changed, by {monthLabel(measureAt)}</h2>
        {effects.length === 0 ? (
          <p className="py-4 text-sm text-ink/50">No decisions yet, so nothing has changed.</p>
        ) : (
          <ul>
            {effects.map(({ event, title, month: at, costDelta, fitNote }) => {
              const Icon = EVENT_ICON[event.type];
              return (
                <li key={event.id} data-testid="decision-effect" className="flex items-start gap-4 border-b border-line py-4 last:border-b-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink/10">
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-ink">{title}</p>
                    <p className="text-sm text-ink/50">
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
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          <Stat label="Odometer" value={miles(point.mileage)} source={src("mileage")} />
          <Stat label="Fuel so far" value={usd(totalThrough(result, month, "fuelSpend") ?? 0)} source={src("fuelSpend")} />
          <Stat label="Upkeep so far" value={usd(totalThrough(result, month, "maintenanceSpend") ?? 0)} source={src("maintenanceSpend")} />
          <Stat label="Resale value" value={usd(point.vehicleValue)} source={src("vehicleValue")} />
        </div>
      )}

      {result && result.warnings.length > 0 && (
        <p className="mx-auto max-w-2xl text-center text-xs leading-5 text-ink/40">{result.warnings.join(" ")}</p>
      )}
    </section>
  );
}
