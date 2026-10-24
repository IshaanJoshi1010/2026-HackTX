"use client";

import { Gauge, RotateCcw } from "lucide-react";
import { useForkStore } from "@/ui/store/useForkStore";
import { IconButton } from "./IconButton";

/** A wordmark and two icon controls. Nothing else competes with the car. */
export function AppHeader() {
  const hasTwin = useForkStore((s) => s.twin !== null);
  const low = useForkStore((s) => s.ui.lowPerformance);
  const { setLowPerformance, resetAll } = useForkStore((s) => s.actions);

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-6">
      <span className="text-[13px] font-semibold tracking-[0.4em] text-ink">FORK</span>
      <div className="flex items-center gap-2">
        <IconButton label="Low performance" role="switch" aria-checked={low} active={low} onClick={() => setLowPerformance(!low)}>
          <Gauge />
        </IconButton>
        {hasTwin && (
          <IconButton label="Start over" onClick={resetAll}>
            <RotateCcw />
          </IconButton>
        )}
      </div>
    </header>
  );
}
