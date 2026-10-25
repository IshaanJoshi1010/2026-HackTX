"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { eventTitle } from "@/ui/store/eventLabels";
import { MONTH_MAX } from "@/ui/store/months";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { noCostMessage } from "@/ui/timeline/effects";
import { NoCostNote } from "@/ui/timeline/NoCostNote";
import { effectPhrase } from "@/ui/timeline/roadMath";
import { useDecisionEffects } from "@/ui/timeline/useDecisionEffects";

/**
 * Shown once after Branch timeline: what each confirmed change did to the cost, from running the future again without
 * it. A change that moves no dollar says so, plus whatever it did change. Dismiss it, or it goes on the next dump.
 */
export function ConfirmedCard({ className }: { className?: string }) {
  const receipt = useForkStore((s) => s.receipt);
  const scenario = useForkStore((s) => (s.receipt ? s.explore.scenarios.find((x) => x.id === s.receipt!.scenarioId) : undefined));
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const vehicleId = useForkStore((s) => s.twin?.vehicle.id);
  const { dismissReceipt } = useForkStore((s) => s.actions);
  const effects = useDecisionEffects(scenario);

  if (!receipt || !scenario) return null;

  const spec = vehicleId ? specsFor(vehicleId) : null;
  const rows = receipt.eventIds.flatMap((id) => {
    const event = scenario.events.find((e) => e.id === id);
    return event ? [{ event, effect: effects.find((e) => e.event.id === id) }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <div
      role="status"
      data-testid="confirmed-card"
      className={cn("fork-rise rounded-xl border border-line bg-canvas/95 p-4 text-left shadow-2xl backdrop-blur-md", className)}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line pb-2.5">
        <div>
          <h3 className="text-sm font-medium text-ink">
            {rows.length} {rows.length === 1 ? "change" : "changes"} added to your road
          </h3>
          <p className="text-xs text-ink/55">What each one did to your cost, over {monthLabel(MONTH_MAX)}</p>
        </div>
        <button
          type="button"
          onClick={dismissReceipt}
          title="Dismiss"
          aria-label="Dismiss"
          className="flex size-6 shrink-0 items-center justify-center rounded text-ink/55 transition-colors hover:bg-ink/10 hover:text-ink cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <ul className="mt-1">
        {rows.map(({ event, effect }) => {
          const none = effect ? noCostMessage(effect) : null;
          return (
            <li key={event.id} data-testid={`confirmed-row-${event.id}`} className="flex items-start justify-between gap-3 border-b border-line py-2.5 text-xs last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{eventTitle(event)}</p>
                <p className="text-ink/50">{event.month === 0 ? "Now" : `In ${monthLabel(event.month)}`}</p>
                {none && <NoCostNote message={none} className="mt-1.5 text-xs" />}
              </div>
              {effect && !none && (
                <div data-testid="confirmed-cost" className="flex flex-col items-end gap-0.5 text-right">
                  <p className="font-medium tabular-nums text-ink">{effectPhrase(effect.costDeltaAtEnd, usd)}</p>
                  <SourceBadge compact source={metricSource("netEconomicCost", profile, spec)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
