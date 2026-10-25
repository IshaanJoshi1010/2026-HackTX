"use client";

import { SkipForward } from "lucide-react";
import { selectActiveVehicle } from "@/ui/store/selectors";
import { useForkStore } from "@/ui/store/useForkStore";

const STAGE_LABELS: Record<string, string> = {
  converge: "Assembling",
  pointcloud: "Building the point cloud",
  wireframe: "Drawing the frame",
};

/**
 * While the car assembles: a quiet progress line and Skip. No boxes. The name is shown by Identity above the car, the
 * specs by SpecReadout and the rider question by RiderDock, all of which stay after this goes away. The gap between the
 * line and Skip is where the dock's row sits. Once the car is solid the specs are showing, so the line goes: two things
 * saying where we are is one too many.
 */
export function RevealOverlay() {
  const vehicle = useForkStore(selectActiveVehicle);
  const stage = useForkStore((s) => s.stage);
  const skip = useForkStore((s) => s.actions.skip);

  if (!vehicle) return null;

  const revealStage = stage.revealStage ?? "converge";
  // From "solid" on, the specs (SpecReadout) are on screen and the car is ready to turn.
  const specsShowing = revealStage === "solid" || revealStage === "done";

  return (
    <div
      data-testid="reveal-overlay"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-8 px-4 pb-8"
    >
      {!specsShowing && (
        <p data-testid="reveal-stage-pill" className="text-sm text-ink/40">
          {STAGE_LABELS[revealStage] ?? "Assembling"}
        </p>
      )}

      {/* Room for the rider chips, which are drawn by RiderDock so they can fly to the side panel afterwards. */}
      <div aria-hidden="true" className="h-[68px]" />

      <button
        type="button"
        onClick={skip}
        className="pointer-events-auto flex h-9 items-center gap-2 rounded-full bg-ink/10 px-5 text-sm font-medium text-ink transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span>Skip</span>
        <SkipForward className="size-4" />
      </button>
    </div>
  );
}
