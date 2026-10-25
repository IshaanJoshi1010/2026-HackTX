"use client";

import { useEffect, useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { car, data } from "@/ui/mocks";
import { useForkStore } from "@/ui/store/useForkStore";

export interface SampleCarPickerProps {
  className?: string;
  onSelect?: (vehicleId: string) => void;
}

/** The two cars Fork knows. One tap each: no spec sheets here, those come once the car is on screen. */
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
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {samples.map((v, i) => (
        <button
          key={v.id}
          type="button"
          disabled={isBusy}
          onClick={() => void handlePick(v.id)}
          className={cn(
            "group flex items-center justify-between gap-4 rounded-xl border px-5 py-4 text-left transition-colors disabled:opacity-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            i === 0 ? "border-ink/40 bg-ink/[0.08] hover:border-ink/80 hover:bg-ink/[0.12]" : "border-line bg-ink/[0.03] hover:border-ink/40 hover:bg-ink/[0.06]",
          )}
        >
          <span>
            <span className="block text-base font-medium text-ink">
              {v.year} {v.model} {v.trim}
            </span>
            <span className="block text-sm text-ink/60">{i === 0 ? "Demo car" : v.powertrain === "hybrid" ? "Hybrid" : "Gas"}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink/60 transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  );
}
