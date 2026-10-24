"use client";

/**
 * THROWAWAY local stub for Kareem's CarStageStub (due at h2). Same props as
 * /contracts/INTERFACES.md. Delete this file and import from "@/ui/3d" when
 * his stub lands, then flip USE_MOCKS.car off when the real stage ships.
 */
import { useEffect, useRef, useState } from "react";
import type { VehicleConfig } from "@/contracts";
import { cn } from "@/lib/utils";

export type RevealStage = "converge" | "pointcloud" | "wireframe" | "solid" | "done";

export interface CarStageProps {
  vehicle: VehicleConfig;
  phase: "reveal" | "interactive" | "transition";
  transitionTo?: VehicleConfig;
  viewMode: "solid" | "wireframe" | "points";
  quality: "high" | "low";
  reducedMotion: boolean;
  resetCameraSignal: number;
  skipSignal: number;
  replaySignal: number;
  onRevealStage(stage: RevealStage): void;
  onTransitionComplete(): void;
  onModelStatus(s: { vehicleId: string; ready: boolean; error?: string }): void;
}

/** Reveal timings from the scene constants, in ms. */
const REVEAL_STEPS: ReadonlyArray<readonly [RevealStage, number]> = [
  ["converge", 0],
  ["pointcloud", 2000],
  ["wireframe", 2500],
  ["solid", 3000],
  ["done", 4000],
];
const TRANSITION_MS = 1800; // 0.3 + 1.2 + 0.3 s

export function CarStageStub(props: CarStageProps) {
  const { vehicle, phase, transitionTo, viewMode, quality, reducedMotion } = props;
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const [stage, setStage] = useState<RevealStage | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Reveal sequence. Restarts on replay.
  useEffect(() => {
    if (phase !== "reveal") return;
    const scale = reducedMotion ? 0.1 : 1;
    for (const [name, at] of REVEAL_STEPS) {
      timers.current.push(
        setTimeout(() => {
          setStage(name);
          latest.current.onRevealStage(name);
        }, at * scale),
      );
    }
    return clearTimers;
  }, [phase, props.replaySignal, reducedMotion]);

  // Transition sequence.
  useEffect(() => {
    if (phase !== "transition") return;
    timers.current.push(
      setTimeout(() => latest.current.onTransitionComplete(), reducedMotion ? 100 : TRANSITION_MS),
    );
    return clearTimers;
  }, [phase, transitionTo?.id, reducedMotion]);

  // Skip jumps to the end of whatever is running. Ignore the first render.
  const firstSkip = useRef(props.skipSignal);
  useEffect(() => {
    if (props.skipSignal === firstSkip.current) return;
    firstSkip.current = props.skipSignal;
    clearTimers();
    if (latest.current.phase === "reveal") {
      setStage("done");
      latest.current.onRevealStage("solid");
      latest.current.onRevealStage("done");
    } else if (latest.current.phase === "transition") {
      latest.current.onTransitionComplete();
    }
  }, [props.skipSignal]);

  useEffect(() => {
    latest.current.onModelStatus({ vehicleId: vehicle.id, ready: true });
  }, [vehicle.id]);

  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`;
  return (
    <div
      data-testid="car-stage-stub"
      data-phase={phase}
      data-view-mode={viewMode}
      data-vehicle-id={vehicle.id}
      data-quality={quality}
      data-reduced-motion={reducedMotion}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <div
        className={cn(
          "-mt-[6%] flex aspect-[2.6/1] w-[min(52%,520px)] items-center justify-center rounded-3xl border transition-all duration-500",
          viewMode === "solid" && "border-ink/25 bg-ink/10",
          viewMode === "wireframe" && "border-dashed border-ink/60 bg-transparent",
          viewMode === "points" && "border-dotted border-ink/50 bg-ink/5",
          phase === "transition" && "scale-95 opacity-70",
        )}
      >
        <div className="text-center">
          <p className="text-xs text-ink/50">3D placeholder</p>
          <p className="mt-1 text-lg font-medium text-ink">{label}</p>
          {phase === "transition" && transitionTo && (
            <p className="mt-1 text-sm text-ink/60">morphing to {transitionTo.model}</p>
          )}
          {phase === "reveal" && stage && (
            <p className="mt-1 text-xs text-ink/60">reveal: {stage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function preloadCarsStub(_vehicles: VehicleConfig[]): Promise<void> {
  void _vehicles;
  return Promise.resolve();
}
