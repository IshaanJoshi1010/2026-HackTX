"use client";

import { useMemo, type ReactNode } from "react";
import type { Source, VehicleConfig } from "@/contracts";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { Stat } from "@/ui/profile/Stat";
import { selectActiveScenario, specsFor } from "@/ui/store/selectors";
import { MONTH_MAX, useForkStore } from "@/ui/store/useForkStore";
import { pointAt } from "@/ui/timeline/layout";
import { effectPhrase } from "@/ui/timeline/roadMath";

/** What "Net cost" means, in the words the accounting in sim/ECONOMICS.md uses, with no number in it. */
export const NET_COST_DEFINITION =
  "Net cost is what the car costs you from today: fuel, upkeep, insurance and financing costs, plus the value it loses, minus anything you get back from selling it.";

const carName = (v: Pick<VehicleConfig, "year" | "model" | "trim">) => `${v.year} ${v.model} ${v.trim}`;

interface CardProps {
  title: string;
  /** One quiet line under the title. */
  subtitle?: string;
  /** Marks the option the engine picked. */
  pick?: boolean;
  /** The future this card shows, when it can be looked at. Null for an option that has not been priced yet. */
  active?: boolean;
  onSelect?: () => void;
  testId: string;
  children: ReactNode;
}

function OptionCard({ title, subtitle, pick = false, active = false, onSelect, testId, children }: CardProps) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="text-lg font-medium text-ink">{title}</span>
        {pick && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-canvas">Fork&apos;s pick</span>}
      </span>
      {subtitle && <span className="mt-0.5 block text-sm text-ink/60">{subtitle}</span>}
    </>
  );
  return (
    <div
      data-testid={testId}
      className={cn("flex flex-col gap-5 rounded-2xl border p-6 text-left transition-colors", active ? "border-ink/60 bg-ink/[0.08]" : "border-line bg-ink/[0.03]")}
    >
      {onSelect ? (
        <button
          type="button"
          aria-pressed={active}
          onClick={onSelect}
          className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {body}
        </button>
      ) : (
        <div>{body}</div>
      )}
      {children}
    </div>
  );
}

/**
 * Your options, side by side: keep your car, or switch to the other one. Each shows what it costs over the time you are
 * looking at, and the other one says how much more or less than keeping. Before you compare, the second card is the
 * offer to. Every figure is the simulation's; the card only lays them next to each other.
 */
export function YourOptions() {
  const twin = useForkStore((s) => s.twin);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const results = useForkStore((s) => s.results);
  const month = useForkStore((s) => s.activeMonth);
  const comparison = useForkStore((s) => s.comparison);
  const evaluation = useForkStore((s) => s.evaluation);
  const replacement = useForkStore((s) => s.replacementVehicle);
  const busy = useForkStore((s) => s.ui.busy);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const active = useForkStore(selectActiveScenario);
  const { openReplaceComparison, setActiveScenario } = useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  if (!twin || !active) return null;

  const measureAt = month > 0 ? month : MONTH_MAX;
  const source = (id: string): Source | undefined => {
    const p = pointAt(results[id], measureAt);
    return p ? metricSource("netEconomicCost", profile, specsFor(p.vehicleId)) : undefined;
  };

  const keepId = comparison?.keepId ?? active.id;
  const keep = scenarios.find((s) => s.id === keepId) ?? active;
  const keepPoint = pointAt(results[keep.id], measureAt);
  const replace = comparison ? scenarios.find((s) => s.id === comparison.replaceId) : undefined;
  const replacePoint = replace ? pointAt(results[replace.id], measureAt) : undefined;
  const other = replacement ?? samples.find((v) => v.id !== twin.vehicle.id);
  const preferred = evaluation?.preferredScenarioId;

  const swap = replace?.events.find((e) => e.type === "vehicle_replacement");

  return (
    <section aria-label="Your options" data-testid="your-options">
      <h2 className="text-base font-medium text-ink">Your options</h2>
      <p data-testid="net-cost-definition" className="mt-1 max-w-2xl text-sm leading-5 text-ink/60">
        {NET_COST_DEFINITION}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <OptionCard
          testId="option-keep"
          title={`Keep your ${twin.vehicle.year} ${twin.vehicle.model}`}
          subtitle={keep.id === "base" ? "If nothing changes" : keep.name}
          pick={preferred === keep.id}
          active={replace ? active.id === keep.id : true}
          onSelect={replace ? () => setActiveScenario(keep.id) : undefined}
        >
          {keepPoint ? (
            <Stat size="lg" label={`Net cost, ${monthLabel(measureAt)}`} value={usd(keepPoint.netEconomicCost)} source={source(keep.id)} />
          ) : (
            <p className="text-sm text-ink/60">No projection for this month.</p>
          )}
        </OptionCard>

        {replace && other ? (
          <OptionCard
            testId="option-replace"
            title={`Switch to a ${carName(other)}`}
            subtitle={swap ? `${monthLabel(swap.month) === "Now" ? "Swap now" : `Swap in ${monthLabel(swap.month)}`}, trading in your ${twin.vehicle.model}` : undefined}
            pick={preferred === replace.id}
            active={active.id === replace.id}
            onSelect={() => setActiveScenario(replace.id)}
          >
            {replacePoint && keepPoint ? (
              <>
                <Stat size="lg" label={`Net cost, ${monthLabel(measureAt)}`} value={usd(replacePoint.netEconomicCost)} source={source(replace.id)} />
                <p data-testid="option-difference" className="flex items-center justify-center gap-2 text-sm text-ink/80">
                  {effectPhrase(replacePoint.netEconomicCost - keepPoint.netEconomicCost, usd)} vs keeping
                  <SourceBadge compact source={source(replace.id)} />
                </p>
              </>
            ) : (
              <p className="text-sm text-ink/60">No projection for this month.</p>
            )}
          </OptionCard>
        ) : other ? (
          <OptionCard testId="option-replace" title={`Switch to a ${carName(other)}`} subtitle="Not priced yet">
            <p className="text-sm leading-5 text-ink/60">
              See what it would cost to trade in your {twin.vehicle.model} and buy this one: fuel, upkeep, a loan, and what you would get for the {twin.vehicle.model}.
            </p>
            <button
              type="button"
              onClick={() => void openReplaceComparison()}
              disabled={busy !== "idle" || !results[active.id]}
              className="h-11 rounded bg-ink px-6 text-sm font-medium text-canvas transition-colors hover:bg-ink/85 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Compare with a {other.year} {other.model} {other.trim}
            </button>
          </OptionCard>
        ) : null}
      </div>
    </section>
  );
}
