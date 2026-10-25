"use client";

import { miles, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { Stat } from "@/ui/profile/Stat";
import { selectActivePoint, selectActiveResult, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { isNoEffectNote } from "@/ui/timeline/effects";
import { totalThrough } from "@/ui/timeline/layout";

/**
 * Opt-in detail: the numbers at the playhead and notes about the projection. All of it is computed, none of it
 * typed in. What each decision changed is on the page itself (DecisionList).
 */
export function FutureDetails() {
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const month = useForkStore((s) => s.activeMonth);
  const result = useForkStore(selectActiveResult);
  const point = useForkStore(selectActivePoint);

  const spec = point ? specsFor(point.vehicleId) : null;
  const src = (m: Parameters<typeof metricSource>[0]) => metricSource(m, profile, spec);
  // The "changes no number" notes are said in words beside each decision, so they are not repeated here.
  const warnings = (result?.warnings ?? []).filter((w) => !isNoEffectNote(w));

  return (
    <section aria-label="Details" data-testid="future-details" className="fork-page flex flex-col gap-14 pt-2">
      {point ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          <Stat label="Odometer" value={miles(point.mileage)} source={src("mileage")} />
          <Stat label="Fuel so far" value={usd(totalThrough(result, month, "fuelSpend") ?? 0)} source={src("fuelSpend")} />
          <Stat label="Upkeep so far" value={usd(totalThrough(result, month, "maintenanceSpend") ?? 0)} source={src("maintenanceSpend")} />
          <Stat label="Resale value" value={usd(point.vehicleValue)} source={src("vehicleValue")} />
        </div>
      ) : (
        <p className="text-center text-sm text-ink/60">Pick a month on the road to see the numbers behind it.</p>
      )}

      {warnings.length > 0 && <p className="mx-auto max-w-2xl text-center text-xs leading-5 text-ink/55">{warnings.join(" ")}</p>}
    </section>
  );
}
