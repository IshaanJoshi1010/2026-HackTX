"use client";

import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { selectActivePoint, selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { MONTH_MAX, useForkStore } from "@/ui/store/useForkStore";
import { EVENT_ICON } from "@/ui/timeline/EventMarkers";
import { noCostMessage } from "@/ui/timeline/effects";
import { NoCostNote } from "@/ui/timeline/NoCostNote";
import { effectPhrase } from "@/ui/timeline/roadMath";
import { useDecisionEffects } from "@/ui/timeline/useDecisionEffects";

/**
 * What the person told Fork, as a plain list: each change, when it happens, and what it did to the cost. A change that
 * moves no dollar says so and says what it did change. Computed by running the future again without each one.
 */
export function DecisionList() {
  const explore = useForkStore((s) => s.explore);
  const month = useForkStore((s) => s.activeMonth);
  const scenario = useForkStore(selectActiveScenario);
  const point = useForkStore(selectActivePoint);

  const measureAt = month > 0 ? month : MONTH_MAX;
  const effects = useDecisionEffects(scenario, measureAt);
  const source = metricSource("netEconomicCost", explore.confirmedProfile, point ? specsFor(point.vehicleId) : null);

  return (
    <section aria-label="What you told Fork" data-testid="decision-list">
      <h2 className="text-base font-medium text-ink">What you told Fork</h2>
      <p className="text-sm text-ink/60">{effects.length > 0 ? `What each change did to your cost, by ${monthLabel(measureAt)}` : "Changes you confirm show up here."}</p>
      {effects.length === 0 ? (
        <p className="py-4 text-sm text-ink/60">Nothing yet, so nothing has changed. Tell Fork what&apos;s changing in the box below.</p>
      ) : (
        <ul className="mt-1">
          {effects.map((effect) => {
            const { event, title, month: at, costDelta, fitNote } = effect;
            const none = noCostMessage(effect);
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
                    {!none && fitNote ? `. ${fitNote}` : ""}
                  </p>
                  {none && <NoCostNote message={none} />}
                </div>
                {!none && (
                  <div className="flex flex-col items-end gap-0.5 text-right">
                    <p className="text-base font-medium tabular-nums text-ink">{effectPhrase(costDelta, usd)}</p>
                    <SourceBadge compact source={source} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
