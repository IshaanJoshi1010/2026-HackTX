"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { miles, monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { Stat } from "@/ui/profile/Stat";
import { selectActivePoint, selectActiveResult, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

const rise = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/**
 * The quiet readout under the car, like a spec row. Layers, in the order you meet them:
 * 1. a hint to drag the timeline,
 * 2. one headline number once you look ahead,
 * 3. four more numbers when you ask for them.
 * Everything else lives in the side panels.
 */
export function Hud() {
  const result = useForkStore(selectActiveResult);
  const point = useForkStore(selectActivePoint);
  const month = useForkStore((s) => s.activeMonth);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const expanded = useForkStore((s) => s.ui.metricsExpanded);
  // The Insights panel lists every number, so the HUD never repeats them while it is open.
  const insightsOpen = useForkStore((s) => s.ui.rightOpen);
  const setMetricsExpanded = useForkStore((s) => s.actions.setMetricsExpanded);

  if (!result) return null;

  if (month === 0) {
    return (
      <p data-testid="hud-hint" style={rise(1300)} className="fork-fade pb-3 text-center text-sm text-ink/50">
        Drag the timeline to look ahead
      </p>
    );
  }
  if (!point) return null;

  const spec = specsFor(point.vehicleId);
  const src = (m: Parameters<typeof metricSource>[0]) => metricSource(m, profile, spec);

  return (
    <div data-testid="hud" className="fork-rise flex flex-col items-center gap-4 pb-3">
      <Stat size="lg" label={`Net cost, ${monthLabel(month)}`} value={usd(point.netEconomicCost)} source={src("netEconomicCost")} />

      {!insightsOpen && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setMetricsExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-ink/60 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          {expanded ? "Less" : "More"}
          <ChevronDown className={cn("size-4 transition-transform duration-300", expanded && "rotate-180")} />
        </button>
      )}

      {expanded && !insightsOpen && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 @2xl:grid-cols-4">
          <div className="fork-rise" style={rise(0)}>
            <Stat label="Mileage" value={miles(point.mileage)} source={src("mileage")} />
          </div>
          <div className="fork-rise" style={rise(80)}>
            <Stat label="Fuel" value={usd(point.fuelSpend)} source={src("fuelSpend")} />
          </div>
          <div className="fork-rise" style={rise(160)}>
            <Stat label="Upkeep" value={usd(point.maintenanceSpend)} source={src("maintenanceSpend")} />
          </div>
          <div className="fork-rise" style={rise(240)}>
            <Stat label="Value" value={usd(point.vehicleValue)} source={src("vehicleValue")} />
          </div>
        </div>
      )}
    </div>
  );
}
