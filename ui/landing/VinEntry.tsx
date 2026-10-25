"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";
import { customerText } from "@/ui/profile/customerText";
import { useForkStore } from "@/ui/store/useForkStore";

export interface VinEntryProps {
  className?: string;
  onSuccess?: () => void;
  /** Offers a way in for someone with no VIN to hand. Without it there is no such link. */
  onChooseCar?: () => void;
}

const VIN_HINTS: Record<string, string> = {
  length: "A VIN has 17 characters.",
  chars: "VINs only use letters and numbers.",
  forbidden_letter: "VINs never use the letters I, O, or Q.",
  check_digit: "That VIN check digit does not add up.",
};

const link =
  "cursor-pointer text-ink/60 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-40 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * The first thing you see: one field for your VIN. A VIN names the model, not the paint or the driver, so nothing else is
 * asked here. The demo Camry's made-up VIN is one tap away, and so is picking a car with no VIN.
 */
export function VinEntry({ className, onSuccess, onChooseCar }: VinEntryProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = useForkStore((s) => s.ui.busy);
  const storeError = useForkStore((s) => s.error);
  const startFromVin = useForkStore((s) => s.actions.startFromVin);
  // The demo Camry's made-up VIN, from the same registry the app opens it from. No registry sample, no link.
  const sampleVin = useMemo(() => data.listSampleVehicles().find((v) => v.vin)?.vin, []);

  const clean = value.trim().toUpperCase().replace(/\s+/g, "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/\s+/g, "");
    setValue(raw);
    if (!raw) setLocalError(null);
    else if (/[IOQ]/.test(raw)) setLocalError(VIN_HINTS.forbidden_letter);
    else if (!/^[A-Z0-9]*$/.test(raw)) setLocalError(VIN_HINTS.chars);
    else setLocalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clean.length !== 17) {
      setLocalError(VIN_HINTS.length);
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
    inputRef.current?.focus();
  };

  const isComplete = clean.length === 17;
  const isBusy = busy !== "idle";
  const displayedError = localError || (storeError ? customerText(storeError) : null);

  return (
    <form onSubmit={handleSubmit} className={cn("flex w-full flex-col items-center gap-4", className)}>
      <label htmlFor={inputId} className="sr-only">
        Vehicle identification number
      </label>
      <div className="relative w-full">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={handleChange}
          maxLength={17}
          placeholder="Enter your VIN"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          disabled={isBusy}
          aria-invalid={displayedError ? true : undefined}
          className={cn(
            "h-14 w-full rounded-full border bg-ink/10 pl-6 pr-16 font-mono text-base tracking-[0.12em] text-ink uppercase",
            "placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-ink/50",
            "transition-colors focus:bg-ink/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            displayedError ? "border-ink/70" : "border-line",
          )}
        />
        <button
          type="submit"
          aria-label="Decode VIN"
          disabled={!isComplete || isBusy}
          className={cn(
            "absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            isComplete && !isBusy ? "cursor-pointer bg-ink text-canvas hover:bg-ink/85" : "cursor-not-allowed bg-ink/10 text-ink/50",
          )}
        >
          {isBusy ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
        </button>
      </div>

      {/* One line under the field: what is wrong, or how far along you are. */}
      <p role={displayedError ? "alert" : undefined} className={cn("h-5 text-sm tabular-nums", displayedError ? "font-medium text-ink/80" : "text-ink/55")}>
        {displayedError ?? (clean.length > 0 ? `${clean.length}/17` : " ")}
      </p>

      <div className="flex items-center gap-6 text-sm">
        {sampleVin && (
          <button type="button" onClick={useSampleVin} disabled={isBusy} className={link}>
            Use sample VIN
          </button>
        )}
        {onChooseCar && (
          <button type="button" onClick={onChooseCar} disabled={isBusy} className={link}>
            No VIN? Choose your car
          </button>
        )}
      </div>

      <p className="text-xs text-ink/55">Fork knows two cars: a 2022 Camry SE and a 2024 RAV4 Hybrid XLE.</p>
    </form>
  );
}
