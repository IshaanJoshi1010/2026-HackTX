import type { VehicleConfig } from "@/contracts";

/** Frozen boundary from contracts/INTERFACES.md. */
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
  onRevealStage(stage: "converge" | "pointcloud" | "wireframe" | "solid" | "done"): void;
  onTransitionComplete(): void;
  onModelStatus(s: { vehicleId: string; ready: boolean; error?: string }): void;
}
