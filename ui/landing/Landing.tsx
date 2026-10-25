"use client";

import { useEffect, useState } from "react";
import { car, data } from "@/ui/mocks";
import { StageBackdrop } from "@/ui/shell/StageBackdrop";
import { ModelYearPicker } from "./ModelYearPicker";
import { VinEntry } from "./VinEntry";

const rise = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/**
 * The first screen is your VIN and nothing else. Someone with no VIN can choose a car instead, from one quiet link; that
 * is the only other way in.
 */
export function Landing() {
  const [choosing, setChoosing] = useState(false);

  // Both cars start loading now, so whichever one opens is ready sooner.
  useEffect(() => {
    void car.preloadCars(data.listSampleVehicles());
  }, []);

  return (
    <main className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-4 py-20 text-center">
      <StageBackdrop />

      <div className="fork-rise relative z-10 flex w-full max-w-md flex-col items-center gap-10" style={rise(0)}>
        <div>
          <h1 className="text-[56px] leading-none font-medium tracking-tight text-ink">Fork</h1>
          <p className="mt-3 text-lg text-ink/70">The future branches. Explore yours.</p>
        </div>

        {choosing ? (
          <div className="flex w-full flex-col items-center gap-5">
            <ModelYearPicker />
            <button
              type="button"
              onClick={() => setChoosing(false)}
              className="cursor-pointer text-sm text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Back to VIN
            </button>
          </div>
        ) : (
          <VinEntry onChooseCar={() => setChoosing(true)} />
        )}

      </div>
    </main>
  );
}
