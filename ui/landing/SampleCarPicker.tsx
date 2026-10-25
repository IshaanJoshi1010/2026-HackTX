"use client";

import { useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { car, data } from "@/ui/mocks";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

export interface SampleCarPickerProps {
  className?: string;
  onSelect?: (vehicleId: string) => void;
}

export function SampleCarPicker({ className, onSelect }: SampleCarPickerProps) {
  const samples = useMemo(() => data.listSampleVehicles(), []);
  const busy = useForkStore((s) => s.ui.busy);
  const startFromSample = useForkStore((s) => s.actions.startFromSample);

  useEffect(() => {
    void car.preloadCars(samples);
  }, [samples]);

  const handlePick = async (vehicleId: string) => {
    await startFromSample(vehicleId);
    onSelect?.(vehicleId);
  };

  const isBusy = busy !== "idle";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {samples.map((v, i) => {
          const spec = specsFor(v.id);
          const mpgSource = spec?.sources.mpgCombined ?? "sourced";
          const cargoSource = spec?.sources.cargoCuFt ?? "illustrative";
          const isPrimary = i === 0;

          return (
            <div
              key={v.id}
              className={cn(
                "group relative flex flex-col justify-between rounded-lg border p-4 text-left transition-all",
                isPrimary
                  ? "border-ink/40 bg-ink/[0.08] hover:border-ink/80 hover:bg-ink/[0.12]"
                  : "border-line bg-ink/[0.03] hover:border-ink/40 hover:bg-ink/[0.06]",
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wider uppercase text-ink/50">
                    {v.powertrain} &middot; {v.make}
                  </span>
                  {isPrimary && (
                    <span className="rounded bg-ink/20 px-1.5 py-0.5 text-xs font-medium uppercase text-ink">
                      Demo vehicle
                    </span>
                  )}
                </div>

                <h3 className="mt-1 text-base font-medium text-ink">
                  {v.year} {v.model} {v.trim}
                </h3>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink/70">
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums font-medium text-ink">{v.mpg}</span> mpg
                    <SourceBadge compact source={mpgSource} />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums font-medium text-ink">{v.cargoCuFt}</span> cu ft
                    <SourceBadge compact source={cargoSource} />
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handlePick(v.id)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded px-3 text-xs font-medium transition-colors disabled:opacity-50",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    isPrimary
                      ? "bg-ink text-canvas hover:bg-ink/85"
                      : "bg-ink/10 text-ink hover:bg-ink/20",
                  )}
                >
                  <span>Select {v.year} {v.model} {v.trim}</span>
                  <ArrowRight className="size-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
