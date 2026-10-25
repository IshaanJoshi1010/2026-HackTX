"use client";

import { SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { usd } from "@/ui/profile/format";
import { Stat } from "@/ui/profile/Stat";
import { selectActiveVehicle, specsFor } from "@/ui/store/selectors";
import { useForkStore, type Riders } from "@/ui/store/useForkStore";

const RIDER_CHOICES: Array<{ id: Riders; label: string; detail: string }> = [
  { id: "solo", label: "Just me", detail: "1 person" },
  { id: "partner", label: "Partner", detail: "2 people" },
  { id: "kids", label: "Kids", detail: "Family with a child" },
  { id: "mixed", label: "Mixed", detail: "4 or more people" },
];

const STAGE_LABELS: Record<string, string> = {
  converge: "Assembling",
  pointcloud: "Building the point cloud",
  wireframe: "Drawing the frame",
  solid: "Almost there",
  done: "Ready",
};

/** Which rider chip matches the profile right now, if any. */
function activeRider(householdSize: number, children: number): Riders | null {
  if (householdSize === 1 && children === 0) return "solo";
  if (householdSize === 2 && children === 0) return "partner";
  if (householdSize === 3 && children === 1) return "kids";
  if (householdSize === 4 && children === 2) return "mixed";
  return null;
}

/**
 * While the car assembles: a quiet progress line, the spec row once the car is solid,
 * one question, and Skip. No boxes. The name is shown by Identity above the car.
 */
export function RevealOverlay() {
  const vehicle = useForkStore(selectActiveVehicle);
  const stage = useForkStore((s) => s.stage);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const { answerRiders, skip } = useForkStore((s) => s.actions);

  if (!vehicle) return null;

  const spec = specsFor(vehicle.id);
  const revealStage = stage.revealStage ?? "converge";
  const showSpecs = revealStage === "solid" || revealStage === "done";
  const selected = activeRider(profile.householdSize, profile.children);

  return (
    <div
      data-testid="reveal-overlay"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-8 px-4 pb-8"
    >
      <p data-testid="reveal-stage-pill" className="text-sm text-ink/55">
        {STAGE_LABELS[revealStage] ?? "Assembling"}
      </p>

      {showSpecs && (
        <div data-testid="reveal-specs" className="fork-rise pointer-events-auto flex flex-wrap items-start justify-center gap-x-14 gap-y-6">
          <Stat label="Combined" value={`${vehicle.mpg} mpg`} source={spec?.sources.mpgCombined ?? "sourced"} />
          <Stat label="Seating" value={`${vehicle.seats} seats`} source={spec?.sources.seats ?? "illustrative"} />
          <Stat label="Cargo" value={`${vehicle.cargoCuFt} cu ft`} source={spec?.sources.cargoCuFt ?? "illustrative"} />
          <Stat label="Est. MSRP" value={usd(vehicle.msrp)} source={spec?.sources.msrp ?? "illustrative"} />
        </div>
      )}

      <div data-testid="reveal-riders" className="fork-fade pointer-events-auto flex flex-col items-center gap-3">
        <span className="text-sm text-ink/60">Who rides with you most?</span>
        <div className="flex flex-wrap justify-center gap-2">
          {RIDER_CHOICES.map(({ id, label, detail }) => (
            <button
              key={id}
              type="button"
              onClick={() => answerRiders(id)}
              title={detail}
              aria-pressed={selected === id}
              className={cn(
                "h-9 rounded px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                selected === id ? "bg-ink text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={skip}
        className="pointer-events-auto flex h-9 items-center gap-2 rounded-full bg-ink/10 px-5 text-sm font-medium text-ink backdrop-blur-md transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span>Skip</span>
        <SkipForward className="size-4" />
      </button>
    </div>
  );
}
