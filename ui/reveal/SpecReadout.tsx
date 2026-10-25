"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { usd } from "@/ui/profile/format";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { selectActiveVehicle, specsFor } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

/** How long the specs stay up once the car is solid, and how slowly they then fade. */
export const SPEC_HOLD_MS = 30_000;
export const SPEC_FADE_MS = 4_000;
/** How long the row glides when the bar under it changes height (small screens only). */
export const SPEC_GLIDE_MS = 500;

type Phase = "waiting" | "holding" | "fading" | "gone";

/**
 * The car's configuration (mileage, seats, cargo, price), kept on screen after the car forms so there is time to read
 * it and to start turning the car, then faded out slowly. It outlives the reveal: it is not part of the reveal overlay,
 * which goes away the moment the car can be rotated. A new car, or a replayed reveal, shows it again.
 *
 * On a wide screen it is a quiet column at the left edge, centered vertically, the mirror of the rider panel on the right.
 * On a small one it is a row above the command bar, `bottom` px up from the edge.
 *
 * It sits over the live 3D canvas, so it is cheap by construction: only opacity (the fade) and transform (the glide) ever
 * animate. Where it sits is set with plain, untransitioned position, never an animated bottom, top, left or width.
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
  const box = useRef<HTMLDivElement>(null);
  const lastBottom = useRef(bottom);

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

  // The row sits at a fixed spot, so when the bar under it changes height it jumps there at once (a layout change). Play
  // the difference back as a transform instead, from where it was to where it is, so it still glides and nothing relayouts.
  useLayoutEffect(() => {
    const was = lastBottom.current;
    lastBottom.current = bottom;
    const el = box.current;
    if (was === bottom || !el || reducedMotion || typeof el.animate !== "function") return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches) return; // the column ignores bottom
    el.animate([{ transform: `translateY(${bottom - was}px)` }, { transform: "translateY(0)" }], { duration: SPEC_GLIDE_MS, easing: "ease-out" });
  }, [bottom, reducedMotion]);

  // Only while the car is on screen. The countdown carries on if you look at the future and come back.
  const carVisible = appPhase === "reveal" || view === "car";
  if (!vehicle || !carVisible || phase === "waiting" || phase === "gone") return null;

  const spec = specsFor(vehicle.id);
  const fading = phase === "fading";

  return (
    <div
      ref={box}
      data-testid="reveal-specs"
      data-state={phase}
      // It never blocks turning the car: only the figures themselves can be pointed at, for their source.
      className={cn(
        "pointer-events-none absolute z-[15] px-4",
        // Small screens: a row above the command bar. Wide screens: a column at the left edge, centered vertically.
        "inset-x-0 bottom-[var(--spec-bottom)] md:inset-x-auto md:top-1/2 md:bottom-auto md:left-6 md:-translate-y-1/2 md:px-0",
        fading ? "opacity-0" : "opacity-100",
      )}
      style={
        {
          "--spec-bottom": `${bottom}px`,
          // Opacity is the only thing that ever fades. Never a position, size or margin.
          transitionProperty: "opacity",
          transitionDuration: `${fading ? SPEC_FADE_MS : 400}ms`,
          transitionTimingFunction: "ease-in-out",
        } as CSSProperties
      }
    >
      <div className="fork-rise flex flex-wrap items-start justify-center gap-x-14 gap-y-6 md:flex-col md:flex-nowrap md:items-start md:justify-start md:gap-5">
        <Spec label="Combined" value={`${vehicle.mpg} mpg`} source={spec?.sources.mpgCombined ?? "sourced"} />
        <Spec label="Seating" value={`${vehicle.seats} seats`} source={spec?.sources.seats ?? "illustrative"} />
        <Spec label="Cargo" value={`${vehicle.cargoCuFt} cu ft`} source={spec?.sources.cargoCuFt ?? "illustrative"} />
        <Spec label="Est. MSRP" value={usd(vehicle.msrp)} source={spec?.sources.msrp ?? "illustrative"} />
      </div>
    </div>
  );
}

/** One figure: the number with its unit, a small label, and where it came from. Stacked and centered in the row, left-aligned in the column. */
function Spec({ label, value, source }: { label: string; value: string; source: Source | undefined }) {
  return (
    <div data-slot="stat" className="pointer-events-auto flex flex-col items-center gap-1 text-center md:items-start md:text-left">
      <span className="text-[28px] leading-none font-medium tracking-tight whitespace-nowrap text-ink tabular-nums md:text-2xl">{value}</span>
      <span className="flex flex-col items-center gap-1 md:flex-row md:gap-2">
        <span className="text-xs text-ink/60">{label}</span>
        <SourceBadge compact source={source} className="text-xs" />
      </span>
    </div>
  );
}
