"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Credits } from "@/ui/shell/Credits";
import { StageBackdrop } from "@/ui/shell/StageBackdrop";
import { useForkStore } from "@/ui/store/useForkStore";
import { ModelYearPicker } from "./ModelYearPicker";
import { SampleCarPicker } from "./SampleCarPicker";
import { VinEntry } from "./VinEntry";

const rise = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

type EntryMode = "samples" | "vin" | "model";

const TABS: Array<{ id: EntryMode; label: string }> = [
  { id: "samples", label: "Sample Cars" },
  { id: "vin", label: "Enter VIN" },
  { id: "model", label: "Select Model" },
];

export function Landing() {
  const [mode, setMode] = useState<EntryMode>("samples");
  const error = useForkStore((s) => s.error);

  return (
    <main className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-4 py-20 text-center">
      <StageBackdrop />

      <div className="fork-rise relative z-10 flex w-full max-w-xl flex-col items-center gap-9" style={rise(0)}>
        <div>
          <h1 className="text-[56px] leading-none font-medium tracking-tight text-ink">Fork</h1>
          <p className="mt-3 text-lg text-ink/70">The future branches. Explore yours.</p>
          <p data-testid="landing-explainer" className="mx-auto mt-5 max-w-md text-sm leading-6 text-ink/60">
            Fork is a digital twin of your Toyota. Tell it what is changing in your life and it shows how keeping your car compares with
            replacing it. The numbers come from code, not the AI, and each one says where it came from.
          </p>
        </div>

        {/* Three ways in. Quiet text tabs. */}
        <div role="tablist" aria-label="Vehicle entry options" className="flex gap-7 text-sm">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "border-b-2 pb-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink",
                mode === id ? "border-ink text-ink" : "border-transparent text-ink/50 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mode content */}
        <div className="w-full">
          {mode === "samples" && (
            <>
              <SampleCarPicker />
              <p data-testid="alex-note" className="mt-3 text-xs leading-5 text-ink/60">
                Both sample cars come with Alex, a made-up driver in Austin with 48,000 miles on a 2022 Camry. Everything about Alex is synthetic.
              </p>
            </>
          )}
          {mode === "vin" && <VinEntry />}
          {mode === "model" && <ModelYearPicker />}
        </div>

        {error && (
          <p role="alert" className="max-w-md rounded bg-ink px-3 py-1.5 text-xs font-medium text-canvas">
            {error}
          </p>
        )}
      </div>

      <Credits defaultOpen className="relative z-10 mt-12 w-full" />

    </main>
  );
}
