"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usd } from "@/ui/profile/format";
import { Stat } from "@/ui/profile/Stat";
import { selectActiveVehicle, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

/** How long the specs stay up once the car is solid, and how slowly they then fade. */
export const SPEC_HOLD_MS = 30_000;
export const SPEC_FADE_MS = 4_000;

type Phase = "waiting" | "holding" | "fading" | "gone";

/**
 * The car's configuration (mileage, seats, cargo, price), kept on screen after the car forms so there is time to read
 * it and to start turning the car, then faded out slowly. It outlives the reveal: it is not part of the reveal overlay,
 * which goes away the moment the car can be rotated. A new car, or a replayed reveal, shows it again.
 */
export function SpecReadout({ bottom }: { bottom: number }) {
  const vehicleId = useForkStore((s) => s.twin?.vehicle.id ?? null);
  const replay = useForkStore((s) => s.stage.replaySignal);
  // Keyed, so a different car or a replay starts the countdown over.
  return <Readout key={`${vehicleId}:${replay}`} bottom={bottom} />;
}

function Readout({ bottom }: { bottom: number }) {
  const vehicle = useForkStore(selectActiveVehicle);
  const appPhase = useForkStore((s) => s.phase);
  const revealStage = useForkStore((s) => s.stage.revealStage);
  const view = useForkStore((s) => s.ui.view);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  // What the timers have done so far. Until they act, the specs are waiting (car not solid yet) or holding.
  const [late, setLate] = useState<"fading" | "gone" | null>(null);

  // The car is solid (or the reveal was skipped, or it is already done): time to read it.
  const ready = revealStage === "solid" || revealStage === "done" || appPhase === "workspace";
  const phase: Phase = !ready ? "waiting" : (late ?? "holding");

  useEffect(() => {
    if (!ready) return;
    const toFade = setTimeout(() => setLate(reducedMotion ? "gone" : "fading"), SPEC_HOLD_MS);
    const toGone = reducedMotion ? undefined : setTimeout(() => setLate("gone"), SPEC_HOLD_MS + SPEC_FADE_MS);
    return () => {
      clearTimeout(toFade);
      if (toGone) clearTimeout(toGone);
    };
  }, [ready, reducedMotion]);

  // Only while the car is on screen. The countdown carries on if you look at the future and come back.
  const carVisible = appPhase === "reveal" || view === "car";
  if (!vehicle || !carVisible || phase === "waiting" || phase === "gone") return null;

  const spec = specsFor(vehicle.id);
  const fading = phase === "fading";

  return (
    <div
      data-testid="reveal-specs"
      data-state={phase}
      // It never blocks turning the car: only the figures themselves can be pointed at, for their source.
      className={cn("pointer-events-none absolute inset-x-0 z-[15] flex flex-wrap items-start justify-center gap-x-14 gap-y-6 px-4", !fading && "fork-rise", fading ? "opacity-0" : "opacity-100")}
      style={{ bottom, transitionProperty: "bottom, opacity", transitionDuration: `500ms, ${fading ? SPEC_FADE_MS : 400}ms`, transitionTimingFunction: "ease-out, ease-in-out" }}
    >
      <div className="pointer-events-auto">
        <Stat label="Combined" value={`${vehicle.mpg} mpg`} source={spec?.sources.mpgCombined ?? "sourced"} />
      </div>
      <div className="pointer-events-auto">
        <Stat label="Seating" value={`${vehicle.seats} seats`} source={spec?.sources.seats ?? "illustrative"} />
      </div>
      <div className="pointer-events-auto">
        <Stat label="Cargo" value={`${vehicle.cargoCuFt} cu ft`} source={spec?.sources.cargoCuFt ?? "illustrative"} />
      </div>
      <div className="pointer-events-auto">
        <Stat label="Est. MSRP" value={usd(vehicle.msrp)} source={spec?.sources.msrp ?? "illustrative"} />
      </div>
    </div>
  );
}
