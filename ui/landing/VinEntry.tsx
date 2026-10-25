"use client";

import { useId, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { useForkStore } from "@/ui/store/useForkStore";

export interface VinEntryProps {
  className?: string;
  onSuccess?: () => void;
}

const VIN_HINTS: Record<string, string> = {
  length: "A VIN has 17 characters.",
  chars: "VINs only use letters and numbers.",
  forbidden_letter: "VINs never use the letters I, O, or Q.",
  check_digit: "That VIN check digit does not add up.",
};

export function VinEntry({ className, onSuccess }: VinEntryProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = useForkStore((s) => s.ui.busy);
  const storeError = useForkStore((s) => s.error);
  const startFromVin = useForkStore((s) => s.actions.startFromVin);

  const clean = value.trim().toUpperCase().replace(/\s+/g, "");
  // The made-up VIN of the demo Camry, from the same registry the sample cars use. No registry sample, no button.
  const sampleVin = useMemo(() => data.listSampleVehicles().find((v) => v.vin)?.vin, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/\s+/g, "");
    setValue(raw);

    if (!raw) {
      setLocalError(null);
      return;
    }

    if (/[IOQ]/.test(raw)) {
      setLocalError("VINs never use the letters I, O, or Q.");
    } else if (!/^[A-Z0-9]*$/.test(raw)) {
      setLocalError("VINs only use letters and numbers.");
    } else {
      setLocalError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clean.length !== 17) {
      setLocalError("A VIN has 17 characters.");
      return;
    }

    const check = data.validateVin(clean);
    if (!check.ok) {
      setLocalError(VIN_HINTS[check.reason] ?? "Invalid VIN.");
      return;
    }

    setLocalError(null);
    await startFromVin(clean);
    onSuccess?.();
  };

  const useSampleVin = () => {
    if (!sampleVin) return;
    setValue(sampleVin);
    setLocalError(null);
  };

  const isComplete = clean.length === 17;
  const isBusy = busy !== "idle";
  const displayedError = localError || storeError;

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-1.5 text-left">
        <label htmlFor={inputId} className="text-sm font-medium text-ink/70">
          Vehicle identification number
        </label>
        <div className="relative flex items-center">
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={handleChange}
            maxLength={17}
            placeholder="17-character VIN"
            autoComplete="off"
            spellCheck="false"
            disabled={isBusy}
            className={cn(
              "h-12 w-full rounded border border-line bg-ink/5 px-4 font-mono text-sm tracking-wider uppercase text-ink placeholder:text-ink/50",
              "transition-colors focus:border-ink focus:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              displayedError && "border-ink/80",
            )}
          />
          <span className="absolute right-3 text-xs tabular-nums text-ink/55">
            {clean.length}/17
          </span>
        </div>
      </div>

      {sampleVin && (
        <p className="text-left text-xs leading-5 text-ink/60">
          No VIN handy?{" "}
          <button
            type="button"
            onClick={useSampleVin}
            disabled={isBusy}
            className="cursor-pointer text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
          >
            Use sample VIN
          </button>
          . It is made up for the demo and opens a 2022 Camry SE with Alex, a fictional driver. Fork only knows two cars: that Camry and a 2024 RAV4 Hybrid XLE.
        </p>
      )}

      {displayedError && (
        <p role="alert" className="text-left text-xs font-medium text-ink/80">
          {displayedError}
        </p>
      )}

      <button
        type="submit"
        disabled={!isComplete || isBusy}
        className={cn(
          "flex h-11 items-center justify-center gap-2 rounded px-6 text-sm font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          isComplete && !isBusy
            ? "bg-ink text-canvas hover:bg-ink/85 cursor-pointer"
            : "bg-ink/10 text-ink/40 cursor-not-allowed",
        )}
      >
        {isBusy ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            <span>Decoding VIN</span>
          </>
        ) : (
          <>
            <span>Decode VIN</span>
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
