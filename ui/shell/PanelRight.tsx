"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import { data } from "@/ui/mocks";
import { DataRow } from "@/ui/profile/DataRow";
import { miles, monthLabel, usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { selectActivePoint, selectActiveResult, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { Panel, PanelSection } from "./Panel";

/** Every number at the scrubbed month, plus notes and the keep or replace action. */
export function PanelRight() {
  const open = useForkStore((s) => s.ui.rightOpen);
  const busy = useForkStore((s) => s.ui.busy);
  const twin = useForkStore((s) => s.twin);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const month = useForkStore((s) => s.activeMonth);
  const point = useForkStore(selectActivePoint);
  const result = useForkStore(selectActiveResult);
  const evaluation = useForkStore((s) => s.evaluation);
  const { setPanel, openReplaceComparison } = useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  const other = twin ? samples.find((v) => v.id !== twin.vehicle.id) : undefined;
  const spec = point ? specsFor(point.vehicleId) : null;
  const src = (m: Parameters<typeof metricSource>[0]) => metricSource(m, profile, spec);

  const preferred =
    evaluation?.preferredScenarioId === "inconclusive"
      ? "Inconclusive"
      : scenarios.find((sc) => sc.id === evaluation?.preferredScenarioId)?.name;

  return (
    <Panel side="right" title="Insights" icon={Activity} open={open} onToggle={() => setPanel("right", !open)}>
      <PanelSection title={month === 0 ? "Now" : `At ${monthLabel(month)}`}>
        {point ? (
          <>
            <DataRow label="Mileage" value={miles(point.mileage)} source={src("mileage")} />
            <DataRow label="Fuel spend" value={usd(point.fuelSpend)} source={src("fuelSpend")} />
            <DataRow label="Maintenance" value={usd(point.maintenanceSpend)} source={src("maintenanceSpend")} />
            <DataRow label="Vehicle value" value={usd(point.vehicleValue)} source={src("vehicleValue")} />
            <DataRow label="Net cost" value={usd(point.netEconomicCost)} source={src("netEconomicCost")} />
          </>
        ) : (
          <p className="mt-2 text-sm text-ink/60">
            {month === 0 ? "Drag the timeline to see a future month." : "No projection for this month."}
          </p>
        )}
      </PanelSection>

      {result && result.milestones.length > 0 && (
        <PanelSection title="Milestones">
          <ul className="mt-2 space-y-1.5 text-sm text-ink/80">
            {result.milestones.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </PanelSection>
      )}

      <PanelSection title="Keep or replace">
        {other && (
          <button
            type="button"
            onClick={() => void openReplaceComparison()}
            disabled={busy !== "idle" || !result}
            className="mt-2 h-10 w-full rounded bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-ink/85 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Compare with a {other.year} {other.model}
          </button>
        )}
        {evaluation && (
          <div className="mt-4 text-sm">
            <p className="text-ink">
              Verdict: <span className="font-medium">{preferred ?? "Inconclusive"}</span>
            </p>
            <ul className="mt-1.5 space-y-1.5 text-xs text-ink/60">
              {evaluation.rationale.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </PanelSection>

      {result && result.warnings.length > 0 && (
        <PanelSection title="Notes">
          <ul className="mt-2 space-y-1.5 text-xs leading-4 text-ink/50">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </PanelSection>
      )}
    </Panel>
  );
}
