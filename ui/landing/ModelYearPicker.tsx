"use client";

import { useId, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ModelYearPickerProps {
  className?: string;
  onSuccess?: () => void;
}

interface ModelOption {
  year: number;
  make: string;
  model: string;
  trim: string;
  powertrain: string;
}

const SUPPORTED_OPTIONS: ModelOption[] = [
  { year: 2022, make: "Toyota", model: "Camry", trim: "SE", powertrain: "Gas" },
  { year: 2024, make: "Toyota", model: "RAV4", trim: "Hybrid XLE", powertrain: "Hybrid" },
];

export function ModelYearPicker({ className, onSuccess }: ModelYearPickerProps) {
  const selectId = useId();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const busy = useForkStore((s) => s.ui.busy);
  const storeError = useForkStore((s) => s.error);
  const startFromPicker = useForkStore((s) => s.actions.startFromPicker);

  const selected = SUPPORTED_OPTIONS[selectedIndex];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;

    await startFromPicker(selected.make, selected.model, selected.year, selected.trim);
    onSuccess?.();
  };

  const isBusy = busy !== "idle";

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-4 text-left", className)}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-sm font-medium text-ink/70">
          Select vehicle model
        </label>
        <select
          id={selectId}
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          disabled={isBusy}
          className={cn(
            "h-12 w-full appearance-none rounded border border-line bg-ink/5 px-4 text-sm text-ink",
            "transition-colors focus:border-ink focus:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer",
          )}
        >
          {SUPPORTED_OPTIONS.map((opt, idx) => (
            <option key={`${opt.year}-${opt.model}`} value={idx} className="bg-canvas text-ink">
              {opt.year} {opt.make} {opt.model} {opt.trim} ({opt.powertrain})
            </option>
          ))}
        </select>
      </div>

      <div className="rounded border border-line/60 bg-ink/[0.02] p-3 text-xs text-ink/60">
        <p className="leading-relaxed">
          The 3D particle reveal currently models the 2022 Camry SE and 2024 RAV4 Hybrid XLE with representative geometry.
        </p>
      </div>

      {storeError && (
        <p role="alert" className="text-xs font-medium text-ink/80">
          {storeError}
        </p>
      )}

      <button
        type="submit"
        disabled={isBusy}
        className={cn(
          "flex h-11 items-center justify-center gap-2 rounded px-6 text-sm font-medium transition-colors cursor-pointer",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          "bg-ink text-canvas hover:bg-ink/85 disabled:opacity-50",
        )}
      >
        {isBusy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Loading model</span>
          </>
        ) : (
          <>
            <span>Explore {selected.year} {selected.model} {selected.trim}</span>
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
