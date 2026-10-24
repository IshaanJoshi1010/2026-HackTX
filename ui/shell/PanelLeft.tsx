"use client";

import { useMemo } from "react";
import { Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { DataRow } from "@/ui/profile/DataRow";
import { miles } from "@/ui/profile/format";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";
import { Panel, PanelSection } from "./Panel";

/** Details about the car. Futures live on the timeline. B2 adds history and the profile card. */
export function PanelLeft() {
  const open = useForkStore((s) => s.ui.leftOpen);
  const busy = useForkStore((s) => s.ui.busy);
  const twin = useForkStore((s) => s.twin);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const { setPanel, startFromSample } = useForkStore((s) => s.actions);
  const samples = useMemo(() => data.listSampleVehicles(), []);

  const vehicle = twin?.vehicle;
  const spec = vehicle ? specsFor(vehicle.id) : null;

  return (
    <Panel side="left" title="Your car" icon={Car} open={open} onToggle={() => setPanel("left", !open)}>
      {vehicle && twin && (
        <PanelSection title="Details">
          <DataRow label="Mileage" value={miles(twin.mileage)} source={profile.provenance.mileage} />
          <DataRow label="Driving" value={`${miles(profile.annualMiles)}/yr`} source={profile.provenance.annualMiles} />
          <DataRow label="Fuel economy" value={`${vehicle.mpg} mpg`} source={spec?.sources.mpgCombined} />
        </PanelSection>
      )}

      <PanelSection title="Switch sample car">
        <ul className="mt-2 space-y-1.5">
          {samples.map((v) => {
            const current = v.id === vehicle?.id;
            return (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => void startFromSample(v.id)}
                  disabled={busy !== "idle"}
                  aria-current={current ? "true" : undefined}
                  className={cn(
                    "flex h-10 w-full items-center justify-between rounded px-3 text-sm transition-colors disabled:opacity-50",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    current ? "bg-ink font-medium text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20",
                  )}
                >
                  <span>
                    {v.year} {v.model} {v.trim}
                  </span>
                  {current && <span className="text-xs">Current</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-ink/50">Picking one restarts from the reveal.</p>
      </PanelSection>
    </Panel>
  );
}
