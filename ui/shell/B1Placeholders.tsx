"use client";

/**
 * Throwaway landing so B1 runs end to end. B2 replaces it with ui/landing
 * (VinEntry, SampleCarPicker, ModelYearPicker). Delete this file in B2.
 */
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { car, data } from "@/ui/mocks";
import { useForkStore } from "@/ui/store/useForkStore";
import { StageBackdrop } from "./StageBackdrop";

const rise = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function LandingPlaceholder() {
  const samples = useMemo(() => data.listSampleVehicles(), []);
  const busy = useForkStore((s) => s.ui.busy);
  const error = useForkStore((s) => s.error);
  const startFromSample = useForkStore((s) => s.actions.startFromSample);

  useEffect(() => {
    void car.preloadCars(samples);
  }, [samples]);

  return (
    <main className="absolute inset-0 flex flex-col items-center justify-between px-4 pb-16 pt-24 text-center">
      <StageBackdrop />

      <div className="fork-rise relative z-10" style={rise(0)}>
        <h1 className="text-[56px] leading-none font-medium tracking-tight text-ink">Fork</h1>
        <p className="mt-3 text-lg text-ink/70">The future branches. Explore yours.</p>
      </div>

      <div className="fork-rise relative z-10 flex flex-col items-center gap-4" style={rise(350)}>
        <p className="text-sm text-ink/50">Start with a sample car</p>
        <div className="flex flex-wrap justify-center gap-3">
          {samples.map((v, i) => (
            <button
              key={v.id}
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void startFromSample(v.id)}
              className={cn(
                "h-10 min-w-48 rounded px-8 text-sm font-medium transition-colors disabled:opacity-50",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                i === 0 ? "bg-ink text-canvas hover:bg-ink/85" : "bg-ink/10 text-ink backdrop-blur-md hover:bg-ink/20",
              )}
            >
              {v.year} {v.model} {v.trim}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="max-w-sm rounded bg-ink px-3 py-1.5 text-sm font-medium text-canvas">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
